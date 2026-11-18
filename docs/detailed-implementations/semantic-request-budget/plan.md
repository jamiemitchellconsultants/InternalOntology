# Configurable semantic reviewer request budget — detailed implementation plan

Execute after the [task plan](../../superpowers/plans/semantic-request-budget/plan.md) has merged.
Read the [behaviours and architecture](../../features/semantic-request-budget/feature.md) and ADRs
0016, 0017 and 0018 first. Work on `feature/semantic-request-budget/build`. Each task is a separate
test-first commit and push; before each commit run its focused test,
`node scripts/check-ontology-terms.mjs`, and `npm test` **checking the exit status**, staging only that
task's files and reviewing `git diff --cached`.

Code fragments are contracts and complete minimal tests, not implementation bodies. Keep test names.
`docs/ontology.md` already carries `SemanticOutcome` (with `too-large`), the `RequestBudget`
relationships and invariants; do not change it unless wording becomes stale.

## Task 1 — shared budget module, drift re-exports, installer

**Files:** `templates/scripts/request-budget.mjs`, `templates/scripts/request-budget.test.mjs`,
`templates/scripts/review-ontology-drift.mjs`, `bin/install-ontology.mjs`, `tests/install-ontology.test.mjs`.

**Interface:** `request-budget.mjs` exports `MAX_REQUEST_CHARS = 200_000`, `MODEL_TIMEOUT_MS = 300_000`,
`readPositiveInteger(env, name, fallback)` and `resolveRequestBudget(env = process.env)` with exactly
the behaviour and error text now in `review-ontology-drift.mjs` (move the code, keep its comments).
`review-ontology-drift.mjs` imports them and re-exports all four names
(`export { MAX_REQUEST_CHARS, MODEL_TIMEOUT_MS, readPositiveInteger, resolveRequestBudget } from ...`
plus a local import for its own use), so the existing drift tests stay valid. In
`bin/install-ontology.mjs`, in the block that already adds `llm-auth.mjs`, add
`scripts/request-budget.mjs` and `scripts/request-budget.test.mjs` for `withDriftReview ||
withSemanticReview`.

**Tests:** `request-budget.test.mjs` is self-contained (imports only `./request-budget.mjs`): the five
settings tests now in the drift test file (default values; unset, empty and whitespace; valid override;
junk list `abc 0 -5 1.5 2e5 200_000 "1000 chars" 9007199254740993` naming the variable and, for the
budget, the value). Leave the drift tests in place (they prove the re-export). In the installer test
file add: for `{withDriftReview}`, `{withSemanticReview}` and both, `scripts/request-budget.mjs` and
`.test.mjs` each appear exactly once with `ownedBy: "kit"`, and not for `{}`.

**Commit:** `feat: share the request budget settings between the reviewers (#111)`.

## Task 2 — ledger

**Files:** `templates/scripts/semantic-review-ledger.mjs`, `templates/scripts/semantic-review-ledger.test.mjs`.

**Interface:** in `statusFor`, add
`case "too-large": return { state: "success", description: "Semantic match not reviewed: ontology too large for the configured budget (raise ONTOLOGY_MAX_REQUEST_CHARS)" };`
(keep the description within GitHub's 140-character limit; check its length in the test). In the run
comment, treat `too-large` like `unavailable` for the closing line but with its own text: "Semantic
matching did not run because the ontology is too large for the configured budget; this result permits
merge. Raise the ONTOLOGY_MAX_REQUEST_CHARS repository variable." Unknown outcomes still throw.

**Tests:** `statusFor({ outcome: "too-large", findings: [], ... })` returns `success` and a description
that contains `ontology too large` and `ONTOLOGY_MAX_REQUEST_CHARS`, is at most 140 characters, and does
not contain "service or configuration unavailable"; an active finding still wins (`failure`); the run
comment for a too-large run contains the closing sentence and lists each unreviewed file with its reason.

**Commit:** `feat: ledger reports a too-large ontology (#111)`.

## Task 3 — model module

**Files:** `templates/scripts/semantic-review-model.mjs`, `templates/scripts/semantic-review-model.test.mjs`.

**Interface:** import `MAX_REQUEST_CHARS, MODEL_TIMEOUT_MS` from `./request-budget.mjs` and keep
`export { MAX_REQUEST_CHARS }` (the model test file imports it). `reviewFiles({ ..., maxRequestChars =
MAX_REQUEST_CHARS, timeoutMs = MODEL_TIMEOUT_MS })` passes `maxRequestChars` to `chunkFiles`.
Unreviewed entries gain an optional `code`: `chunkFiles` sets `code: "too-large"` and the reason
`ontology too large for the configured budget (projection <n> characters, budget <m>)` when capacity is
below one character; the persistent-413 path (the 413 on a chunk `splitChunk` cannot split) returns
`reason: "ontology too large: the model rejected the smallest request"` and `code: "too-large"`, and
`reviewFiles` copies the code into its `unreviewed` list. Nothing else in the 413 split changes.

**Tests (add):**

```js
test("a 60,000-character ontology is reviewed with the default budget", async () => {
  const rows = Array.from({ length: 600 }, (_, i) => `| \`Entity${i}\` | A canonical entity number ${i} with a long description of its role. |`);
  const big = ["## Entities", "", "| Name | Description |", "| --- | --- |", ...rows, ""].join("\n");
  const seen = [];
  const fetchImpl = async (_url, request) => { seen.push(request.body.length);
    return completion(JSON.stringify({ findings: [] })); };
  const result = await reviewFiles({ ...options([{ path: "docs/a.md", text: "plain prose" }], fetchImpl), ontologyText: big });
  assert.deepEqual(result.reviewed, ["docs/a.md"]);
  assert.ok(seen.length >= 1 && seen.every((size) => size <= 200_000));
});

test("a budget the projection cannot fit makes no request and codes the file too-large", async () => {
  let called = false;
  const result = await reviewFiles({ ...options([{ path: "docs/a.md", text: "prose" }], async () => { called = true; return completion("{}"); }),
    maxRequestChars: 1_200 });
  assert.equal(called, false);
  assert.deepEqual(result.reviewed, []);
  assert.equal(result.unreviewed[0].code, "too-large");
  assert.match(result.unreviewed[0].reason, /ontology too large for the configured budget/);
});

test("a persistent 413 on the smallest chunk is coded too-large", async () => {
  const result = await reviewFiles(options([{ path: "docs/a.md", text: "x" }], async () => ({ ok: false, status: 413 })));
  assert.equal(result.unreviewed[0].code, "too-large");
});

test("the configured timeout aborts a hung request", async () => {
  const hang = (_url, request) => new Promise((_resolve, reject) => {
    const keepAlive = setTimeout(() => {}, 60_000);   // AbortSignal timers do not keep Node 20 and 22 alive
    request.signal.addEventListener("abort", () => { clearTimeout(keepAlive); reject(Object.assign(new Error("aborted"), { name: "AbortError" })); });
  });
  const result = await reviewFiles({ ...options([{ path: "docs/a.md", text: "prose" }], hang), timeoutMs: 20 });
  assert.match(result.unreviewed[0].reason, /timed out/);
  assert.equal(result.unreviewed[0].code, undefined);
});
```

(Keep the existing 413 split test passing unchanged. The `options` helper in that file builds the common arguments; the existing assertions about
`MAX_REQUEST_CHARS` and `REQUEST_OVERHEAD` must still pass. The 24,000 literal appears in older tests
as an explicit argument; leave those.)

**Commit:** `feat: semantic reviewer takes a request budget and timeout (#111)`.

## Task 4 — worker

**Files:** `templates/scripts/semantic-review-worker.mjs`, `templates/scripts/semantic-review-worker.test.mjs`.

**Interface:** `runSemanticReview({ ..., env = process.env })`. Immediately before the `reviewFiles`
call (after the credential check, so disabled or out-of-scope pull requests never fail on a typo):

```js
let budget;
try { budget = resolveRequestBudget(env); }
catch (error) {
  run.unreviewed.push({ path: "<configuration>", reason: error.message });
  await finish();       // publishes an unavailable run naming the variable and value (ADR 0017)
  throw error;
}
```

Pass `maxRequestChars: budget.maxRequestChars, timeoutMs: budget.modelTimeoutMs` to `reviewFiles`.
After the call: set `run.outcome = "too-large"` when `result.reviewed.length === 0`,
`result.findings.length === 0`, `run.unreviewed.length > 0` and every unreviewed item has
`code === "too-large"`; otherwise the existing partial/unavailable/reviewed logic. `finalizeSemanticReview`
is unchanged. Import `resolveRequestBudget` from `./request-budget.mjs`.

**Tests (add):** (1) with `deps.reviewFiles` returning one unreviewed `{ path, reason, code: "too-large" }`,
the run outcome is `too-large` and the published status (use the existing fake client and `publishRun`
dependency as the other tests do) is `success` with a description containing `ontology too large`;
(2) a mixture of a too-large file and a reviewed file is `partial`; (3) `env: { ONTOLOGY_MAX_REQUEST_CHARS:
"abc" }` makes `runSemanticReview` reject with a message naming the variable and `abc`, after publishing a
run whose outcome is `unavailable` and whose unreviewed reason contains the same message, and
`deps.reviewFiles` is never called; (4) the same junk value with a disabled configuration does not throw;
(5) valid settings reach `reviewFiles` as `maxRequestChars` and `timeoutMs`; (6) existing tests keep
passing unchanged (non-regression, B11).

**Commit:** `feat: semantic worker resolves the request budget and reports too-large (#111)`.

## Task 5 — workflow

**Files:** `templates/github/workflows/ontology-semantic-review.yml`, `tests/templates.test.mjs`.

Add `ONTOLOGY_MAX_REQUEST_CHARS: ${{ vars.ONTOLOGY_MAX_REQUEST_CHARS }}` and
`ONTOLOGY_MODEL_TIMEOUT_MS: ${{ vars.ONTOLOGY_MODEL_TIMEOUT_MS }}` to the "Review changed Markdown in
full" step env only (the credential stays in the environment). Test: both lines present, no digit
after either name, and the other jobs (request, identify, finalize, dismiss) still carry no model secret.

**Commit:** `ci: semantic review workflow passes the request budget variables (#111)`.

## Task 6 — documentation

**Files:** `templates/docs/ontology-semantic-review.md`, `README.md`, `templates/docs/ontology-drift-review.md`
(one sentence that the settings are shared with the semantic reviewer).

Runbook: a "Request budget" section with the 200,000-character default, the two optional repository
variables, the validation rule, what a too-large ontology looks like (status "Semantic match not
reviewed: ontology too large for the configured budget (raise ONTOLOGY_MAX_REQUEST_CHARS)", a
non-blocking result with a pull request record listing each file), what a junk value looks like (job
red, explained unavailable record), the 413 split, and the timeout: the default is now 300,000 ms
(it was 30,000 ms), unmeasured near the budget, and the semantic request sets no output cap of its
own. README: one sentence beside the semantic pilot paragraph. Keep backticks in README to ontology
terms and environment variable names.

**Commit:** `docs: document the semantic reviewer request budget (#111)`.

## Task 7 — large-ontology acceptance

**Files:** `tests/semantic-budget-acceptance.test.mjs`.

Using `withTempRepo` and `install({ withSemanticReview: true })`, import the INSTALLED
`scripts/semantic-review-model.mjs`, `semantic-review-worker.mjs` and `request-budget.mjs` and run
against a local `node:http` stand-in for the model endpoint (as `tests/oidc-acceptance.test.mjs` does for
its servers). Tests: (1) a roughly 60 KB ontology with default settings reaches the stand-in and the file
is reviewed (B1, B15); (2) `maxRequestChars: 2000` makes no request and codes the file `too-large` (B7);
(3) through `runSemanticReview` with fake GitHub client dependencies as in `tests/acceptance.test.mjs`, a
too-large run publishes `success` with the budget description and never "service or configuration
unavailable" (B7, B8); (4) a junk setting rejects and publishes an explained unavailable run (B5);
(5) installed `request-budget.mjs` equals the template byte for byte and both reviewers' scripts import
the same file (B17); (6) the installed semantic runbook and workflow carry the variables (B6, B16). Run
(1) and (2) first against the unmodified main to show they fail (the gap this feature closes).

**Commit:** `test: large-ontology acceptance for the semantic reviewer (#111)`.

## Task 8 — wrap-up

Confirm `docs/ontology.md` still matches the code. Run `npm test` and check its exit status, then run the
shipped reviewer test files alone on Node 20, 22 and 24 in Docker as `.github/workflows/test.yml` does.
Open the build PR with the `narrative-required` label and the three Narrative headings, linking ADRs 0016
to 0018, the per-consumer follow-up (re-run the installer with `--force --with-semantic-review`, optionally
set the two variables, note the changed timeout default), and what was not verified against the live
gateway (the 200,000 default and the 300,000 ms timeout for semantic prompts).
