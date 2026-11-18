# Configurable drift request budget — detailed implementation plan

Execute after the [task plan](../../superpowers/plans/drift-request-budget/plan.md) has merged. Read
the [behaviours and architecture](../../features/drift-request-budget/feature.md) and ADRs 0014 and
0015 first. Work on `feature/drift-request-budget/build`. Each task is a separate test-first commit
and push; before each commit run its focused test, `node scripts/check-ontology-terms.mjs`, and
`npm test` (check the exit status), staging only that task's files and reviewing `git diff --cached`.

Code fragments are contracts and complete minimal tests, not implementation bodies. Keep test names.
Baseline tests that must keep passing: `templates/scripts/review-ontology-drift.test.mjs` lines that
match `leave no useful diff budget` and `token limit persists for one added line in a\.md` (keep
those messages as the start of the new error messages).

## Task 1 — setting parser

**Files:** `templates/scripts/review-ontology-drift.mjs`, `templates/scripts/review-ontology-drift.test.mjs`.

**Interface**

```js
export const MAX_REQUEST_CHARS = 200_000;          // was 24_000
export const MODEL_TIMEOUT_MS = 300_000;
export function readPositiveInteger(env, name, fallback) // number
export function resolveRequestBudget(env = process.env)  // { maxRequestChars, modelTimeoutMs }
```

`readPositiveInteger`: `env[name]` undefined, empty or only whitespace gives `fallback`; after
`trim()`, it must match `/^[1-9][0-9]*$/` and `Number.isSafeInteger`; otherwise throw
`Error(`${name} must be a positive integer, got "${value}"`)`. `resolveRequestBudget` reads
`ONTOLOGY_MAX_REQUEST_CHARS` and `ONTOLOGY_MODEL_TIMEOUT_MS` with their defaults.

Add these tests:

```js
test("the default request budget is 200,000 characters and the default timeout 300,000 ms", () => {
  assert.equal(MAX_REQUEST_CHARS, 200_000);
  assert.deepEqual(resolveRequestBudget({}), { maxRequestChars: 200_000, modelTimeoutMs: 300_000 });
});

test("unset, empty and whitespace settings fall back to the defaults", () => {
  for (const value of [undefined, "", "   "]) {
    assert.deepEqual(resolveRequestBudget({ ONTOLOGY_MAX_REQUEST_CHARS: value, ONTOLOGY_MODEL_TIMEOUT_MS: value }),
      { maxRequestChars: 200_000, modelTimeoutMs: 300_000 });
  }
});

test("valid settings override the defaults", () => {
  assert.deepEqual(resolveRequestBudget({ ONTOLOGY_MAX_REQUEST_CHARS: " 500000 ", ONTOLOGY_MODEL_TIMEOUT_MS: "900000" }),
    { maxRequestChars: 500_000, modelTimeoutMs: 900_000 });
});

test("junk settings are rejected naming the variable and the value", () => {
  for (const junk of ["abc", "0", "-5", "1.5", "2e5", "200_000", "1000 chars", "9007199254740993"]) {
    assert.throws(() => resolveRequestBudget({ ONTOLOGY_MAX_REQUEST_CHARS: junk }),
      (error) => error.message.includes("ONTOLOGY_MAX_REQUEST_CHARS") && error.message.includes(junk), junk);
    assert.throws(() => resolveRequestBudget({ ONTOLOGY_MODEL_TIMEOUT_MS: junk }),
      (error) => error.message.includes("ONTOLOGY_MODEL_TIMEOUT_MS"), junk);
  }
});

test("a 60,000-character projection plans batches with the default budget", () => {
  const batches = buildBatches([{ file: "a.md", lines: [{ line: 1, text: "some added prose" }] }], "x".repeat(60_000));
  assert.equal(batches.length, 1);
});
```

(Check the AddedLine shape used by the existing tests at line 120 and copy it.)

**Commit:** `feat: configurable request budget settings and a 200,000 character default (#100)`.

## Task 2 — typed budget error

**Files:** same two.

**Interface:** `export class BudgetExceededError extends Error { constructor(message, { projectionChars, maxRequestChars }) }`
with those two numeric fields. `buildBatches` throws it (message starts
"ontology projection and system prompt leave no useful diff budget") with
`projectionChars = ontologyProjection.length`, `maxRequestChars`. `reviewResilient`'s single-line
error becomes a BudgetExceededError (message starts "token limit persists for one added line in
<file>"; `projectionChars` and `maxRequestChars` may be `undefined` there, so make them optional).

Tests: the two existing message assertions keep passing; add

```js
test("the budget error is typed and carries the sizes", () => {
  try { buildBatches([], "x".repeat(5_000), 5_100); assert.fail("must throw"); } catch (error) {
    assert.ok(error instanceof BudgetExceededError);
    assert.equal(error.projectionChars, 5_000);
    assert.equal(error.maxRequestChars, 5_100);
  }
});

test("a persistent single-line token limit throws the typed error", async () => {
  const batch = [{ file: "a.md", lines: [{ line: 1, text: "x" }] }];
  const review = async () => { throw new HttpError(413, "", "too big"); };
  await assert.rejects(reviewResilient(batch, review), (error) => error instanceof BudgetExceededError);
});

test("the 413 split still halves a multi-line chunk before giving up", async () => {
  const lines = [1, 2, 3, 4].map((line) => ({ line, text: "t" }));
  const sizes = [];
  const review = async (batch) => { sizes.push(batch[0].lines.length);
    if (batch[0].lines.length > 2) throw new HttpError(413, "", "too big"); return "NO_DRIFT"; };
  await reviewResilient([{ file: "a.md", lines }], review);
  assert.deepEqual(sizes, [4, 2, 2]);
});
```

**Commit:** `feat: typed BudgetExceededError for an oversized ontology (#100)`.

## Task 3 — timeout and skip path

**Files:** same two.

- `reviewBatch(baseUrl, model, projection, batch, fetchImpl = fetch, timeoutMs = MODEL_TIMEOUT_MS)`
  passes `timeoutMs` as modelJson's fourth argument. Update the comment above `modelJson` to say the
  prompt budget, timeout and `max_tokens` are raised together.
- `export function skippedBody(error, { maxRequestChars }, model)` returns the marker comment body:
  `COMMENT_MARKER`, the heading used elsewhere, then "**Skipped: ontology too large for the
  configured budget.**", the projection size (when known), the budget, the reason
  (`error.message`), and "Raise the `ONTOLOGY_MAX_REQUEST_CHARS` repository variable (see
  docs/ontology-drift-review.md)." plus the usual footer.
- `main`: first line `const budget = resolveRequestBudget();` (a throw here is the red exit 1). Wrap
  `buildBatches` and the review loop in one `try`; on BudgetExceededError: print
  `::notice::drift review skipped: ontology too large for the configured budget (<reason>)`; if
  `DRY_RUN`, print the sizes and return; else upsert the marker comment with `skippedBody` (create
  when none exists, patch when one does) and return. Share the existing comment upsert code by
  extracting `upsertComment(token, repo, prNumber, body, { createWhenEmpty })`; behaviour for
  normal runs must not change (no-drift still stays silent).
- `DRY_RUN` normal output is unchanged except that the budget used is printed.

Tests:

```js
test("skippedBody explains the skip, names the variable and keeps the marker", () => {
  const error = new BudgetExceededError("ontology projection and system prompt leave no useful diff budget",
    { projectionChars: 73_517, maxRequestChars: 24_000 });
  const body = skippedBody(error, { maxRequestChars: 24_000 }, "m");
  assert.ok(body.startsWith(COMMENT_MARKER));
  assert.match(body, /Skipped: ontology too large for the configured budget/);
  assert.match(body, /73,?517/);
  assert.match(body, /ONTOLOGY_MAX_REQUEST_CHARS/);
});

test("reviewBatch hands the configured timeout to the model call", async () => {
  let aborted = false;
  const hanging = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); }); });
  await assert.rejects(reviewBatch("http://x", "m", "p", [{ file: "a.md", lines: [{ line: 1, text: "t" }] }], hanging, 10));
  assert.equal(aborted, true);
});
```

Also add a child-process test that runs the script in a scratch git repository (see Task 6 helper)
with `DRY_RUN=1`, `ONTOLOGY_MAX_REQUEST_CHARS=2000` and a larger ontology and expects exit 0 and the
notice line; and with `ONTOLOGY_MAX_REQUEST_CHARS=abc` expects exit 1 and the variable name on
stderr. (Put these two in Task 6's file if the scratch-repo helper is not available to the template
test, which depends on nothing outside `templates/scripts/`.)

**Commit:** `feat: configurable model timeout and a neutral skipped outcome (#100)`.

## Task 4 — workflow template

**Files:** `templates/github/workflows/ontology-drift-review.yml`, `tests/templates.test.mjs`.

In the "Review drift and upsert PR comment" step env add
`ONTOLOGY_MAX_REQUEST_CHARS: ${{ vars.ONTOLOGY_MAX_REQUEST_CHARS }}` and
`ONTOLOGY_MODEL_TIMEOUT_MS: ${{ vars.ONTOLOGY_MODEL_TIMEOUT_MS }}`; list both as optional variables in
the header comment. Test: both lines are present in the template and no digits follow either name.
(Remember the template test forbids personal infrastructure names; keep values out of the YAML.)

**Commit:** `ci: drift workflow passes the request budget variables (#100)`.

## Task 5 — documentation

**Files:** `templates/docs/ontology-drift-review.md`, `README.md`.

Runbook: a "Request budget" subsection with the default 200,000 characters (about 50,000 to 67,000
tokens), the two optional variables, the rule (positive integer, junk fails the job), the skipped
outcome and how to resolve it, the 413 split fallback, and the timeout caveat: the 300,000 ms
default is unmeasured with prompts near 200,000 characters; raise the timeout and `max_tokens`
together (`max_tokens` is 8,192 in the script and is not configurable). README: one sentence on the
default and override beside the `--with-drift-review` row. Keep README backticks to existing
ontology terms; env var names are fine.

**Commit:** `docs: document the drift request budget (#100)`.

## Task 6 — large-ontology acceptance

**Files:** `tests/drift-budget-acceptance.test.mjs`.

Using `withTempRepo` and `install({ withDriftReview: true })`: write a roughly 60,000 byte ontology
(generate about 600 entity rows `| \`Entity<n>\` | one-line description |` under a configured required
section), commit it, branch, add a prose Markdown file on a new commit, then run the INSTALLED
`scripts/review-ontology-drift.mjs <file>` with `BASE_REF` set to the base branch and `DRY_RUN=1`
through `execFileSync`. Tests:

1. default settings: exit 0, output contains "batch" and no "no useful diff budget" (B1, B13).
2. `ONTOLOGY_MAX_REQUEST_CHARS=2000`: exit 0, output contains
   "drift review skipped: ontology too large for the configured budget" (B7 B10).
3. `ONTOLOGY_MAX_REQUEST_CHARS=abc`: exit 1, stderr names the variable and `abc` (B5).
4. the installed script equals `templates/scripts/review-ontology-drift.mjs` byte for byte (B15).

Run these against the old code first to prove test 1 fails with the budget error (the gap this
feature closes), then pass.

**Commit:** `test: large-ontology acceptance for the drift reviewer (#100)`.

## Task 7 — wrap-up

Confirm `docs/ontology.md` still matches the code (`RequestBudget`, relationship, invariant). Run
`npm test` and check its exit status. Open the build PR with the `narrative-required` label and the
three Narrative headings, linking ADRs 0014 and 0015, the per-consumer follow-up (re-run the
installer with `--force`; optionally set the two variables), and what was not verified against the
live gateway (default budget, default timeout).
