# Semantic ontology matching — detailed implementation plan

Execute this after the [task plan](../../superpowers/plans/semantic-ontology-matching/plan.md)
has merged. Read the [vision](../../features/semantic-ontology-matching/01-vision.md),
[behaviours](../../features/semantic-ontology-matching/02-behaviours.md),
[architecture](../../features/semantic-ontology-matching/03-architecture.md), and ADRs before
starting. Work on `feature/semantic-ontology-matching/dev-build`. Each numbered task is a separate
test-first commit and push. Run its focused test, `node scripts/check-ontology-terms.mjs`, and
`npm test` before every commit; stage only that task's intended files and review the cached diff.
The installed files must remain byte-identical across adopting repositories.

The code fragments below are contracts and complete minimal tests, not implementation bodies.
Keep test names and assertions; add cases named in the task plan where a fixture exposes a further
boundary. `node --test` discovers tests in `templates/scripts/` as well as `tests/`.

## Task 1 — configuration

**Files:** `templates/scripts/ontology-config.mjs`, `templates/ontology.config.json`,
`tests/ontology-config.test.mjs`.

**Interface:** `validateConfig(raw, deps)` adds `semanticReview: { enabled: boolean, model:
string, baseUrl: string }`. Absence is `{enabled:false,model:"",baseUrl:""}`. `enabled:true` needs
non-empty model and a parseable HTTP(S) endpoint URL with no username or password. `null`, unknown
keys, and malformed values are errors. Do not change the old fields or their defaults.

Append these complete test cases to the existing `tests/ontology-config.test.mjs`:

```js
test("semantic review is disabled when the section is absent", () => {
  const value = validateConfig(minimal, { ontologyExists: () => true });
  assert.deepEqual(value.semanticReview, { enabled: false, model: "", baseUrl: "" });
});

test("enabled semantic review accepts a maintainer endpoint and model", () => {
  const value = validateConfig({ ...minimal, semanticReview: {
    enabled: true, model: "review-model", baseUrl: "https://model.example/v1",
  } }, { ontologyExists: () => true });
  assert.deepEqual(value.semanticReview, {
    enabled: true, model: "review-model", baseUrl: "https://model.example/v1",
  });
});

test("enabled semantic review rejects missing settings and an embedded credential", () => {
  const check = (semanticReview, pattern) => assert.throws(
    () => validateConfig({ ...minimal, semanticReview }, { ontologyExists: () => true }), pattern,
  );
  check({ enabled: true, model: "", baseUrl: "https://model.example/v1" }, /semanticReview.model/);
  check({ enabled: true, model: "m", baseUrl: "" }, /semanticReview.baseUrl/);
  check({ enabled: true, model: "m", baseUrl: "https://user:pass@model.example/v1" }, /credential/);
  check({ enabled: true, model: "m", baseUrl: "not a URL" }, /semanticReview.baseUrl/);
});

test("semantic review rejects unknown or null fields", () => {
  for (const semanticReview of [null, { enabled: null }, { enabled: false, endpoint: "x" }]) {
    assert.throws(
      () => validateConfig({ ...minimal, semanticReview }, { ontologyExists: () => true }),
      /semanticReview/,
    );
  }
});
```

Update the existing minimal-config deep-equality test for the new disabled value. Add
`"semanticReview": {"enabled": false}` to the template; this is inert unless the optional
workflows are installed. Test failure first with `node --test tests/ontology-config.test.mjs`.
Then implement, rerun, run global checks, commit `feat: validate semantic review settings`, and
push.

## Task 2 — GitHub PR input adapter

**Files:** new `templates/scripts/semantic-review-github.mjs` and
`templates/scripts/semantic-review-github.test.mjs`.

**Interfaces:**

```js
createGitHubClient({ token, repository, fetchImpl = fetch })
// -> { get(path), post(path, body), patch(path, body), getAll(path) }
resolvePulls(client, workflowRun) // -> Promise<Pull[]>
isEligiblePull(client, pull) // -> Promise<boolean>
collectReviewInput(client, pull, config)
// -> Promise<{ headSha, mergeSha, files: [{path,text}], unreviewed: [{path,reason}], ontologyText }>
```

`getAll` follows GitHub's HTTP Link next-page relation; it must not assume the first 100 files are
all files. Resolve PRs from `workflowRun.pull_requests`; if empty, query open PRs for the run's
head repository/branch and verify head SHA. Treat ambiguity as unavailable coverage for each
resolved PR, never select an arbitrary PR. Eligibility requires head and base repository IDs to
match and the author's current permission to be `write` or `admin` (GitHub maps maintain to
`write`). Use `pulls/{number}/files` and each current blob SHA; use the PR-head ontology path even
when the PR changes it. Apply default-branch config `ignorePaths` with the same matcher as the
deterministic checker. For a deleted file, record no current content. On any page/blob failure or
GitHub's changed-file cap, include a reason in `unreviewed`.

Create this test file, adding the pagination, malformed blob, count mismatch, and odd-filename
fixtures named in the task plan:

```js
// templates/scripts/semantic-review-github.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { isEligiblePull, collectReviewInput } from "./semantic-review-github.mjs";

const sha = "a".repeat(40);
const pull = {
  number: 7, user: { login: "author" }, changed_files: 3,
  head: { sha, repo: { id: 1 } }, base: { sha: "b".repeat(40), repo: { id: 1 } },
};

test("only a same-repository author with write access is eligible", async () => {
  const client = { get: async () => ({ permission: "write" }) };
  assert.equal(await isEligiblePull(client, pull), true);
  assert.equal(await isEligiblePull(client, {
    ...pull, head: { ...pull.head, repo: { id: 2 } },
  }), false);
  assert.equal(await isEligiblePull({ get: async () => ({ permission: "read" }) }, pull), false);
});

test("collector reads changed Markdown blobs and proposed ontology, not diff lines", async () => {
  const pages = [{ filename: "docs/a file.md", status: "modified", sha: "blob-a" },
    { filename: "docs/old.md", status: "removed", sha: "blob-old" },
    { filename: "src/app.js", status: "modified", sha: "blob-js" }];
  const client = {
    getAll: async () => pages,
    get: async (path) => {
      if (path.endsWith("/git/blobs/blob-a")) return {
        encoding: "base64", content: Buffer.from("old and new lines\n").toString("base64"),
      };
      if (path.includes("/contents/docs/ontology.md")) return {
        encoding: "base64", content: Buffer.from("# proposed ontology").toString("base64"),
      };
      throw new Error(`unexpected ${path}`);
    },
  };
  const input = await collectReviewInput(client, pull, {
    ontologyPath: "docs/ontology.md", ignorePaths: [],
  });
  assert.deepEqual(input.files, [{ path: "docs/a file.md", text: "old and new lines\n" }]);
  assert.equal(input.ontologyText, "# proposed ontology");
  assert.equal(input.unreviewed.length, 0);
});
```

The fixture's `changed_files` includes the deleted and non-Markdown entries. Keep selection based
on `filename` and `status`, not `patch`. Run the test red/green, global checks, commit
`feat: collect semantic review PR data`, and push.

## Task 3 — ontology evidence and lossless chunks

**Files:** new `templates/scripts/semantic-review-model.mjs` and
`templates/scripts/semantic-review-model.test.mjs`.

**Interfaces:**

```js
catalogOntology(markdown, sections)
// -> { projection: string, evidenceKeys: Set<string> }
chunkFiles(files, catalog, maxRequestChars)
// -> { chunks: [{path, offset, text}], unreviewed: [{path, reason}] }
```

The catalog preserves configured ontology tables and invariants, with stable evidence keys such
as `Entities:Invoice`. The chunker's request budget includes prompt and catalog. It splits at
paragraph or line boundaries where possible, then by character when one line cannot fit. Offsets
are indexes into the original file string, and sorting chunks by offset reconstructs the original
exactly. An empty file is reviewed as empty; an ontology projection too large for any content is
an unavailable result.

Create this initial complete test file (Task 4 extends it):

```js
// templates/scripts/semantic-review-model.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogOntology, chunkFiles } from "./semantic-review-model.mjs";

const ontology = "# Ontology\n\n## Entities\n\n| Name | Description |\n| --- | --- |\n| `Invoice` | canonical bill |\n";
const sections = { required: ["Entities"], optional: [] };

test("catalog contains the canonical row as evidence", () => {
  const catalog = catalogOntology(ontology, sections);
  assert.ok(catalog.evidenceKeys.has("Entities:Invoice"));
  assert.match(catalog.projection, /canonical bill/);
});

test("chunks cover all text, including an unchanged line and one oversized line", () => {
  const content = `first paragraph\n\n${"x".repeat(5000)}\nunchanged tail\n`;
  const catalog = catalogOntology(ontology, sections);
  const result = chunkFiles([{ path: "docs/a.md", text: content }], catalog, 2000);
  const chunks = result.chunks.filter((item) => item.path === "docs/a.md");
  assert.ok(chunks.length > 1);
  assert.equal(chunks.map((item) => item.text).join(""), content);
  assert.equal(chunks[0].offset, 0);
  assert.deepEqual(result.unreviewed, []);
});

test("an oversized ontology is unavailable rather than a clean review", () => {
  const catalog = { projection: "x".repeat(5000), evidenceKeys: new Set() };
  const result = chunkFiles([{ path: "docs/a.md", text: "text" }], catalog, 1000);
  assert.equal(result.chunks.length, 0);
  assert.deepEqual(result.unreviewed.map((item) => item.path), ["docs/a.md"]);
});
```

Do not depend on the old optional `review-ontology-drift.mjs` because core installations do not
ship it. Run the test red/green, global checks, commit `feat: prepare full-file semantic review`,
and push.

## Task 4 — grounded model assessment

**Files:** extend `templates/scripts/semantic-review-model.mjs` and its test file.

**Interface:**

```js
reviewFiles({ files, ontologyText, sections, model, baseUrl, apiKey, headSha, fetchImpl = fetch })
// -> Promise<{ reviewed: string[], unreviewed: [{path,reason}], findings:
//   [{id,path,quote,evidenceKey,reason,suggestion}] }>
```

The request is an OpenAI-compatible `POST <baseUrl>/chat/completions` carrying a strict
system prompt, catalog, file chunks, model ID, and no sampling override. Require a JSON response
with `findings: []` or grounded records. Validate each quote as an exact substring of the chunk
and each evidence key against the catalog, and require non-empty reason/suggestion. Deduplicate by
SHA-256 of `headSha`, path, quote, and evidence key, joined with NUL separators. A timeout,
non-2xx response, 413 at the minimum chunk, invalid JSON, empty completion, or invalid record
marks only the affected file/chunk unreviewed. A 413 above the minimum recursively splits without
losing coverage. Never print the prompt, file text, secret, or raw model response to Actions logs.

Append these tests to the Task 3 test file, plus a mock 413 and partial-file fixture:

```js
import { reviewFiles } from "./semantic-review-model.mjs";

const completion = (content) => ({ ok: true, json: async () => ({
  choices: [{ message: { content } }],
}) });

test("a grounded finding has a stable ID and a correction", async () => {
  const fetchImpl = async (_url, request) => {
    assert.equal(request.headers.Authorization, "Bearer test-key");
    assert.doesNotMatch(request.body, /GITHUB_TOKEN/);
    return completion(JSON.stringify({ findings: [{ quote: "wrong term", evidenceKey: "Entities:Invoice",
      reason: "conflicts with Invoice", suggestion: "use Invoice" }] }));
  };
  const options = { files: [{ path: "docs/a.md", text: "wrong term" }], ontologyText: ontology,
    sections, model: "test-model", baseUrl: "https://model.example/v1", apiKey: "test-key",
    headSha: "a".repeat(40), fetchImpl };
  const first = await reviewFiles(options);
  const second = await reviewFiles(options);
  assert.equal(first.findings.length, 1);
  assert.equal(first.findings[0].id, second.findings[0].id);
  assert.deepEqual(first.reviewed, ["docs/a.md"]);
  assert.deepEqual(first.unreviewed, []);
});

test("a fabricated quote is unreviewed, not clean", async () => {
  const result = await reviewFiles({ files: [{ path: "docs/a.md", text: "actual text" }],
    ontologyText: ontology, sections, model: "m", baseUrl: "https://model.example/v1",
    apiKey: "test-key", headSha: "a".repeat(40),
    fetchImpl: async () => completion(JSON.stringify({ findings: [{ quote: "made up",
      evidenceKey: "Entities:Invoice", reason: "wrong", suggestion: "change" }] })) });
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.unreviewed.map((item) => item.path), ["docs/a.md"]);
});
```

Run focused tests red/green, global checks, commit
`feat: assess semantic matching with grounded findings`, and push.

## Task 5 — run ledger and statuses

**Files:** new `templates/scripts/semantic-review-ledger.mjs` and
`templates/scripts/semantic-review-ledger.test.mjs`.

**Interfaces:**

```js
export const STATUS_CONTEXT = "ontology/semantic-match";
statusFor(run, dismissals) // -> { state: "success" | "failure", description: string }
publishPending(client, pull, run) // -> Promise<void>
publishRun(client, pull, run, dismissals = []) // -> Promise<void>
readLatestRun(client, pull) // -> Promise<SemanticReviewRun | null>
reconcileStatus(client, pull, run, dismissals) // -> Promise<void>
```

`SemanticReviewRun` has `{schema:1, prNumber, headSha, mergeSha, triggerRunId, outcome, eligible,
reviewed, unreviewed, findings}`. Outcomes are `reviewed`, `partial`, `unavailable`, `disabled`,
`out-of-scope`, and `no-eligible`. Active findings fail even during a partial run. A later
unavailable run succeeds even if an earlier comment has findings. The ledger appends one immutable
bot-authored run record per run; if a record exceeds GitHub's comment size, split it into numbered
bot-authored parts with the same run ID and reconstruct it on read. A run's status `target_url`
points to its first comment. Read every comment page and trust a machine marker only from the
workflow bot. Re-fetch the PR before final status posts, verify its current head, and verify the
test-merge SHA before posting there. Do not mutate the PR branch.

Create the complete initial test file below; add fixtures for comment splitting, pagination,
forged markers, and stale head as named in the task plan:

```js
// templates/scripts/semantic-review-ledger.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { STATUS_CONTEXT, statusFor, publishRun } from "./semantic-review-ledger.mjs";

const sha = "a".repeat(40);
const finding = { id: "f".repeat(64), path: "docs/a.md", quote: "wrong term",
  evidenceKey: "Entities:Invoice", reason: "wrong", suggestion: "use Invoice" };
const run = { schema: 1, prNumber: 7, headSha: sha, mergeSha: "b".repeat(40),
  triggerRunId: 81, outcome: "reviewed", eligible: ["docs/a.md"],
  reviewed: ["docs/a.md"], unreviewed: [], findings: [finding] };

test("an active finding fails; dismissing only that finding succeeds", () => {
  assert.equal(statusFor(run, []).state, "failure");
  assert.equal(statusFor(run, [{ findingId: finding.id, headSha: sha }]).state, "success");
});

test("a later unavailable run succeeds with a not-reviewed description", () => {
  const later = { ...run, triggerRunId: 82, outcome: "unavailable", reviewed: [],
    unreviewed: [{ path: "docs/a.md", reason: "model offline" }], findings: [] };
  assert.equal(statusFor(later, []).state, "success");
  assert.match(statusFor(later, []).description, /not reviewed/i);
});

test("publication writes the fixed context on current head and verified merge SHA", async () => {
  const posts = [];
  const client = {
    get: async (path) => {
      if (path.endsWith("/pulls/7")) return { head: { sha }, merge_commit_sha: run.mergeSha };
      throw new Error(`unexpected ${path}`);
    },
    post: async (path, body) => {
      posts.push({ path, body });
      return { html_url: "https://github.example/run-comment" };
    },
  };
  await publishRun(client, { number: 7, head: { sha } }, run);
  const statuses = posts.filter((item) => item.path.includes("/statuses/"));
  assert.deepEqual(statuses.map((item) => item.body.context), [STATUS_CONTEXT, STATUS_CONTEXT]);
  assert.deepEqual(statuses.map((item) => item.body.state), ["failure", "failure"]);
  assert.ok(posts.some((item) => item.path.endsWith("/issues/7/comments")));
});
```

`publishPending` posts `pending` to the same verified SHA set before model work. The body of
`publishRun` includes the affected passage, ontology evidence, correction, coverage, and explicit
outcome. A stale run is not published. Run focused tests red/green, global checks, commit
`feat: publish semantic review outcomes`, and push.

## Task 6 — dismissal handler

**Files:** new `templates/scripts/semantic-review-dismissal.mjs` and
`templates/scripts/semantic-review-dismissal.test.mjs`.

**Interfaces:**

```js
parseDismissal(text)
// -> { findingId: string, headSha: string, reason: string } | null
readDismissals(client, pull, run) // -> Promise<Array<{findingId,headSha,reason,author}>>
handleDismissal({ client, event }) // -> Promise<{ handled: boolean, reason: string }>
```

The documented command is `/ontology-dismiss <64-hex-finding-id> <40-hex-head-sha> <reason>`.
Match the whole comment after trimming, so an ordinary correction proposal or quoted command
cannot dismiss anything. The handler uses GitHub's collaborator permission response and requires
`role_name` owner/admin/maintain; custom roles are accepted only when the maintainer explicitly
grants an equivalent role, which must be documented rather than inferred from `write`. Reload the
current PR and comment pages on `created`, `edited`, or `deleted`; deleted commands no longer
count. Require the run's current SHA and finding ID. A valid dismissal's author and reason remain
visible in the maintainer's comment. Call Task 5's `reconcileStatus`, never the model.

Create this complete minimal test file, then add edited/deleted, spoofed bot, same-SHA rerun,
new-SHA, and two-finding fixtures:

```js
// templates/scripts/semantic-review-dismissal.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDismissal, readDismissals } from "./semantic-review-dismissal.mjs";

const id = "f".repeat(64);
const sha = "a".repeat(40);
const command = `/ontology-dismiss ${id} ${sha} False positive: historical quotation`;

test("the dismissal command requires an ID, revision, and reason", () => {
  assert.deepEqual(parseDismissal(command), {
    findingId: id, headSha: sha, reason: "False positive: historical quotation",
  });
  assert.equal(parseDismissal(`/ontology-dismiss ${id} ${sha}`), null);
  assert.equal(parseDismissal(`I suggest ${command}`), null);
});

test("only a current maintainer comment dismisses the current finding", async () => {
  const comments = [
    { user: { login: "maintainer" }, body: command },
    { user: { login: "author" }, body: command },
  ];
  const client = {
    getAll: async () => comments,
    get: async (path) => ({ role_name: path.includes("maintainer") ? "maintain" : "write" }),
  };
  const run = { headSha: sha, findings: [{ id }] };
  const result = await readDismissals(client, { number: 7 }, run);
  assert.deepEqual(result.map((item) => item.author), ["maintainer"]);
});
```

Run focused tests red/green, global checks, commit `feat: process semantic finding dismissals`,
and push.

## Task 7 — worker and workflow wiring

**Files:** new `templates/scripts/semantic-review-worker.mjs` and
`templates/scripts/semantic-review-worker.test.mjs`; new
`templates/github/workflows/ontology-semantic-request.yml`,
`ontology-semantic-review.yml`, `ontology-semantic-dismiss.yml`; modify
`tests/templates.test.mjs`.

**Interface:**

```js
runSemanticReview({ client, pull, config, modelFetch, secret, deps = {} })
// -> Promise<SemanticReviewRun>
```

The worker CLI resolves PR numbers from the `workflow_run` payload before validating
`OntologyConfig`, so invalid configuration can still publish *not reviewed*. The secretless
identification job posts `pending` before model work and fans out one per-PR job with a shared
concurrency group `ontology-semantic-<PR number>`. The secretless request workflow has no path
filter, artifact upload, dependency install, or PR checkout. The model job uses an Actions
environment restricted to the default branch, with `deployment: false`; only it reads
`ONTOLOGY_SEMANTIC_LLM_API_KEY`. A secretless finalizer with `always()` reports *not reviewed* if
the model job fails to start or produces no usable result, but first reads the current run ledger
and preserves any partial finding already published. The dismissal workflow uses
`issue_comment` and the same per-PR concurrency group; it never receives the model secret. Any
event-derived string enters a process through environment variables or JSON, never interpolated
into shell source. Reruns on an unchanged SHA post a new pending and final status.

Create the complete minimal worker test file, using dependency injection to pin orchestration:

```js
// templates/scripts/semantic-review-worker.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { runSemanticReview } from "./semantic-review-worker.mjs";

const pull = { number: 7, head: { sha: "a".repeat(40) }, base: { repo: { id: 1 } } };
const config = { ontologyPath: "docs/ontology.md", ignorePaths: [],
  semanticReview: { enabled: false, model: "", baseUrl: "" } };

test("disabled review emits a visible result without invoking the model", async () => {
  let modelCalls = 0;
  const result = await runSemanticReview({ client: {}, pull, config, secret: "",
    modelFetch: async () => { modelCalls++; throw new Error("must not call model"); },
    deps: { publishPending: async () => {}, publishRun: async () => {} } });
  assert.equal(result.outcome, "disabled");
  assert.equal(modelCalls, 0);
});

test("an unavailable later run has no active findings", async () => {
  const result = await runSemanticReview({ client: {}, pull,
    config: { ...config, semanticReview: { enabled: true, model: "m",
      baseUrl: "https://model.example/v1" } }, secret: "test",
    modelFetch: async () => { throw new Error("model offline"); },
    deps: { collectReviewInput: async () => ({ files: [{ path: "docs/a.md", text: "x" }],
      ontologyText: "# ontology", unreviewed: [] }),
      publishPending: async () => {}, publishRun: async () => {} } });
  assert.equal(result.outcome, "unavailable");
  assert.deepEqual(result.findings, []);
});
```

The full worker test also covers no eligible files, a finding, partial with and without findings,
proposed ontology, missing config, ineligible author, and a new SHA after correction. Static
workflow tests assert exact triggers, permissions, environment secret scope, no PR checkout, no
path filters, and no secret in the request or dismissal workflows. Run focused tests red/green,
global checks, commit `feat: run trusted semantic review workflows`, and push.

## Task 8 — installer, docs, and end-to-end proof

**Files:** `bin/install-ontology.mjs`, `README.md`, `docs/ai-agent-install.md`,
`docs/ontology.md`, `tests/install-ontology.test.mjs`, `tests/acceptance.test.mjs`,
`tests/templates.test.mjs`; new `templates/docs/ontology-semantic-review.md`.

**Interface:** `buildPlan({ withSemanticReview: true })` includes the new scripts, shipped tests,
three workflows, and runbook as kit-owned entries, while the config stays adopter-owned. Add
`--with-semantic-review` to CLI parsing and help. Preserve `--with-drift-review` unchanged. The
runbook specifies: default-branch-only environment, exact secret name, `semanticReview` fields,
required context, how a maintainer dismisses by ID and reason, how an author's agent corrects,
how another agent proposes, how to disable, and the fork approval/manual path in #21.

Append these tests to existing files (their imports and `withTempRepo` helper already exist):

```js
// tests/install-ontology.test.mjs
test("semantic review opt-in installs its scripts, tests, workflows and runbook", () => {
  const destinations = buildPlan({ withSemanticReview: true }).map((entry) => entry.dest);
  for (const path of [
    "scripts/semantic-review-github.mjs", "scripts/semantic-review-model.mjs",
    "scripts/semantic-review-ledger.mjs", "scripts/semantic-review-worker.mjs",
    "scripts/semantic-review-dismissal.mjs", ".github/workflows/ontology-semantic-request.yml",
    ".github/workflows/ontology-semantic-review.yml",
    ".github/workflows/ontology-semantic-dismiss.yml", "docs/ontology-semantic-review.md",
  ]) assert.ok(destinations.includes(path), `missing ${path}`);
  assert.equal(buildPlan({}).some((entry) => entry.dest.includes("semantic-review")), false);
});

test("the old advisory install remains a separate option", () => {
  const destinations = buildPlan({ withDriftReview: true }).map((entry) => entry.dest);
  assert.ok(destinations.includes("scripts/review-ontology-drift.mjs"));
  assert.equal(destinations.includes("scripts/semantic-review-worker.mjs"), false);
});
```

Add an acceptance test that installs into `withTempRepo`, compares every installed `.mjs` byte
for byte with its template, runs the shipped Node tests, and confirms the default disabled
configuration does not call a model. Use a mock GitHub client and mock model response to assert a
finding yields `failure` and a later unavailable run yields `success` with *not reviewed*. No
network call is needed for this automated test.

In a disposable GitHub repository, install the pilot on the default branch, run a PR with no
eligible files, and inspect both the head and test-merge commit status via GitHub API. Then use a
test endpoint or configured pilot model to show a finding blocks and a later unavailable run
supersedes it on the same SHA. Keep the trial PR links and API evidence in the build PR; if a
GitHub permission or environment gate prevents this proof, state the exact limitation and leave
the live branch-protection claim unverified for user acceptance. Do not alter this repository's
branch protection merely to run the trial.

Run focused tests red/green and global checks, commit `feat: install semantic matching pilot`,
and push. The build PR closes [Dev] Build after all eight commits have passed their checks.
