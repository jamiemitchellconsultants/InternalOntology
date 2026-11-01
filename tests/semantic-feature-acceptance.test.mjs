import { test } from "node:test";
import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Set this to an adopter checkout's scripts directory to exercise the installed copy.
const scriptRoot = process.env.ONTOLOGY_ACCEPTANCE_SCRIPT_ROOT
  ? resolve(process.env.ONTOLOGY_ACCEPTANCE_SCRIPT_ROOT)
  : fileURLToPath(new URL("../templates/scripts/", import.meta.url));
const github = await import(pathToFileURL(join(scriptRoot, "semantic-review-github.mjs")).href);
const model = await import(pathToFileURL(join(scriptRoot, "semantic-review-model.mjs")).href);
const ledger = await import(pathToFileURL(join(scriptRoot, "semantic-review-ledger.mjs")).href);
const worker = await import(pathToFileURL(join(scriptRoot, "semantic-review-worker.mjs")).href);
const dismissal = await import(pathToFileURL(join(scriptRoot, "semantic-review-dismissal.mjs")).href);
const termChecker = await import(pathToFileURL(join(scriptRoot, "check-ontology-terms.mjs")).href);

const head = "a".repeat(40);
const nextHead = "c".repeat(40);
const merge = "b".repeat(40);
const ontology = "## Entities\n\n| Name | Description |\n| --- | --- |\n| `Invoice` | A bill sent to a customer. |\n";
const config = { ontologyPath: "docs/ontology.md", ignorePaths: ["docs/ignored/**"],
  sections: { required: ["Entities"], optional: [] },
  semanticReview: { enabled: true, model: "maintainer-model", baseUrl: "https://maintainer.example/v1" } };
const finding = { id: "f".repeat(64), path: "docs/spec.md", quote: "Use a payment request for the bill.",
  evidenceKey: "Entities:Invoice", reason: "The bill is called an Invoice.", suggestion: "Use an Invoice for the bill." };
const pull = { number: 7, state: "open", changed_files: 5, user: { login: "author" },
  head: { sha: head, repo: { id: 1 } }, base: { repo: { id: 1 } }, merge_commit_sha: merge };
const input = { files: [{ path: "docs/spec.md", text: "Use a payment request for the bill.\n" }],
  ontologyText: ontology, unreviewed: [] };

function blob(text) { return { encoding: "base64", content: Buffer.from(text).toString("base64") }; }

function makeClient({ current = pull, files = [], texts = {}, sourceOntology = ontology,
  permissions = { author: "write", maintainer: "maintain" } } = {}) {
  const comments = [];
  const statuses = [];
  const calls = [];
  const client = {
    comments, statuses, calls,
    get: async (path) => {
      calls.push(path);
      if (path === `/pulls/${current.number}`) return current;
      if (path.startsWith("/collaborators/")) {
        const role = permissions[decodeURIComponent(path.split("/")[2])];
        if (!role) throw new Error("GitHub API GET returned 404");
        return { permission: role, role_name: role };
      }
      if (path.startsWith("/contents/docs/ontology.md?ref=")) return blob(sourceOntology);
      if (path.startsWith("/git/blobs/")) {
        const sha = decodeURIComponent(path.slice("/git/blobs/".length));
        if (!(sha in texts)) throw new Error("missing blob");
        return blob(texts[sha]);
      }
      throw new Error(`Unexpected GET ${path}`);
    },
    getAll: async (path) => {
      calls.push(path);
      if (path.startsWith(`/pulls/${current.number}/files?`)) return files;
      if (path.startsWith(`/issues/${current.number}/comments?`)) return comments;
      throw new Error(`Unexpected list ${path}`);
    },
    post: async (path, body) => {
      calls.push(path);
      if (path.startsWith("/statuses/")) { statuses.push({ path, ...body }); return {}; }
      if (path === `/issues/${current.number}/comments`) {
        const comment = { body: body.body, user: { login: "github-actions[bot]" },
          html_url: `https://example.test/comment/${comments.length + 1}` };
        comments.push(comment);
        return comment;
      }
      throw new Error(`Unexpected POST ${path}`);
    },
  };
  return client;
}

function runRecord({ headSha = head, triggerRunId = "81:1", outcome = "reviewed",
  eligible = [finding.path], reviewed = [finding.path], unreviewed = [], findings = [finding] } = {}) {
  return { schema: 1, prNumber: 7, headSha, mergeSha: merge, triggerRunId,
    outcome, eligible, reviewed, unreviewed, findings };
}

function modelResponse(findings = []) {
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ findings }) } }] }) };
}

test("B1 selects only changed eligible Markdown from a trusted same-repository author", async () => {
  const current = { ...pull, changed_files: 5 };
  const client = makeClient({ current, files: [
    { filename: "docs/spec.md", status: "modified", sha: "1" },
    { filename: "docs/ignored/notes.md", status: "modified", sha: "2" },
    { filename: "src/app.ts", status: "modified", sha: "3" },
    { filename: "docs/gone.md", status: "removed", sha: "4" },
    { filename: "ontology.config.json", status: "modified", sha: "5" },
  ], texts: { 1: "current prose", 2: "ignored" } });
  assert.equal(await github.isEligiblePull(client, current), true);
  const selected = await github.collectReviewInput(client, current, config);
  assert.deepEqual(selected.files, [{ path: "docs/spec.md", text: "current prose" }]);
  assert.equal(selected.unreviewed.length, 0);
  assert.equal(client.calls.some((path) => path.includes("unchanged.md")), false);
});

test("B2 sends unchanged lines within a changed Markdown file to the model", async () => {
  const fullText = "An unchanged line with the wrong description.\nA newly edited line.\n";
  let request;
  const result = await model.reviewFiles({ files: [{ path: "docs/spec.md", text: fullText }],
    ontologyText: ontology, sections: config.sections, model: config.semanticReview.model,
    baseUrl: config.semanticReview.baseUrl, apiKey: "test-key", headSha: head,
    fetchImpl: async (_url, options) => { request = JSON.parse(options.body); return modelResponse(); } });
  assert.deepEqual(result.reviewed, ["docs/spec.md"]);
  assert.match(request.messages[1].content, /An unchanged line with the wrong description/);
  assert.match(request.messages[1].content, /A newly edited line/);
});

test("B3 assesses changed Markdown against the PR's proposed ontology", async () => {
  const proposed = ontology.replace("A bill sent to a customer.", "A receipt for a customer.");
  const client = makeClient({ current: { ...pull, changed_files: 1 },
    files: [{ filename: "docs/spec.md", status: "modified", sha: "1" }],
    texts: { 1: "A receipt is issued." }, sourceOntology: proposed });
  const selected = await github.collectReviewInput(client, { ...pull, changed_files: 1 }, config);
  let prompt;
  await model.reviewFiles({ files: selected.files, ontologyText: selected.ontologyText,
    sections: config.sections, model: config.semanticReview.model, baseUrl: config.semanticReview.baseUrl,
    apiKey: "test-key", headSha: head, fetchImpl: async (_url, options) => {
      prompt = JSON.parse(options.body).messages[0].content;
      return modelResponse();
    } });
  assert.match(client.calls.find((path) => path.startsWith("/contents/")), new RegExp(`ref=${head}`));
  assert.match(prompt, /A receipt for a customer/);
  assert.doesNotMatch(prompt, /A bill sent to a customer/);
});

test("B4 an active finding fails the check and is explained on the PR", async () => {
  const client = makeClient();
  await ledger.publishRun(client, pull, runRecord());
  assert.equal(client.statuses.at(-1).state, "failure");
  assert.equal(client.statuses.at(-1).context, ledger.STATUS_CONTEXT);
  assert.match(client.comments[0].body, /docs\/spec\.md/);
  assert.match(client.comments[0].body, /Use a payment request for the bill/);
  assert.match(client.comments[0].body, /Entities:Invoice/);
  assert.match(client.comments[0].body, /Use an Invoice for the bill/);
});

test("B5 a complete clean review and a no-eligible run pass with distinct reports", async () => {
  const client = makeClient();
  const clean = runRecord({ findings: [] });
  await ledger.publishRun(client, pull, clean);
  assert.equal(client.statuses.at(-1).state, "success");
  assert.match(client.statuses.at(-1).description, /reviewed 1 file/);
  const none = runRecord({ triggerRunId: "82:1", outcome: "no-eligible", eligible: [], reviewed: [], findings: [] });
  await ledger.publishRun(client, pull, none);
  assert.equal(client.statuses.at(-1).state, "success");
  assert.match(client.statuses.at(-1).description, /no eligible changed Markdown files/);
});

test("B6 a corrected new PR revision receives a new controlling result", async () => {
  const current = structuredClone(pull);
  const client = makeClient({ current });
  await ledger.publishRun(client, current, runRecord());
  assert.equal(client.statuses.at(-1).state, "failure");
  current.head.sha = nextHead; // The author's new commit changes the PR head.
  const corrected = runRecord({ headSha: nextHead, triggerRunId: "82:1", findings: [] });
  await ledger.publishRun(client, current, corrected);
  assert.equal(client.statuses.at(-1).state, "success");
  assert.deepEqual(await ledger.readLatestRun(client, current), corrected);
  assert.equal(client.comments.length, 2);
});

test("B7 another agent's proposed correction is an ordinary comment, not a dismissal", async () => {
  const client = makeClient();
  const proposal = { action: "created", issue: { number: 7, pull_request: {} },
    comment: { body: `Finding ${finding.id}: author, please use Invoice in docs/spec.md`,
      user: { login: "other-agent" } } };
  const result = await dismissal.handleDismissal({ client, event: proposal });
  assert.equal(result.handled, false);
  assert.equal(client.statuses.length, 0);
  assert.equal(client.calls.length, 0);
  assert.equal(pull.head.sha, head);
});

test("B8 a reasoned maintainer dismissal clears only its named finding", async () => {
  const second = { ...finding, id: "e".repeat(64), quote: "Another wrong passage" };
  const run = runRecord({ findings: [finding, second] });
  const client = makeClient();
  client.comments.push({ body: `/ontology-dismiss ${finding.id} ${head} Correct term is already defined elsewhere`,
    user: { login: "maintainer" } });
  let dismissals = await dismissal.readDismissals(client, pull, run);
  assert.equal(dismissals.length, 1);
  assert.equal(dismissals[0].author, "maintainer");
  assert.equal(ledger.statusFor(run, dismissals).state, "failure");
  client.comments.push({ body: `/ontology-dismiss ${second.id} ${head} The second passage is a quotation`,
    user: { login: "maintainer" } });
  dismissals = await dismissal.readDismissals(client, pull, run);
  assert.equal(ledger.statusFor(run, dismissals).state, "success");
});

test("B9 dismissal survives the same SHA but expires after a new commit or edited comment", async () => {
  const current = structuredClone(pull);
  const client = makeClient({ current });
  const run = runRecord();
  const comment = { body: `/ontology-dismiss ${finding.id} ${head} False positive after review`,
    user: { login: "maintainer" } };
  client.comments.push(comment);
  assert.equal((await dismissal.readDismissals(client, current, run)).length, 1);
  assert.equal((await dismissal.readDismissals(client, current, run)).length, 1);
  comment.body = "Edited away the dismissal";
  assert.equal((await dismissal.readDismissals(client, current, run)).length, 0);
  comment.body = `/ontology-dismiss ${finding.id} ${head} False positive after review`;
  current.head.sha = nextHead;
  const newRun = runRecord({ headSha: nextHead });
  assert.equal((await dismissal.readDismissals(client, current, newRun)).length, 0);
});

test("B10 a later unavailable run permits merge while retaining the earlier finding comment", async () => {
  const client = makeClient();
  await ledger.publishRun(client, pull, runRecord());
  const unavailable = runRecord({ triggerRunId: "82:1", outcome: "unavailable", reviewed: [],
    unreviewed: [{ path: "<model>", reason: "credential unavailable" }], findings: [] });
  await ledger.publishRun(client, pull, unavailable);
  assert.equal(client.statuses.at(-1).state, "success");
  assert.match(client.statuses.at(-1).description, /not reviewed/);
  assert.deepEqual(await ledger.readLatestRun(client, pull), unavailable);
  assert.equal(client.comments.length, 2);
  assert.match(client.comments[0].body, new RegExp(finding.id));
});

test("B11 a partial review retains a finding and lists the unreviewed file", async () => {
  const client = makeClient();
  const run = await worker.runSemanticReview({ client, pull, config, secret: "test-key",
    deps: { triggerRunId: "81:1", collectReviewInput: async () => ({ ...input,
      unreviewed: [{ path: "docs/second.md", reason: "GitHub blob unavailable" }] }),
      reviewFiles: async () => ({ reviewed: [finding.path], unreviewed: [], findings: [finding] }) } });
  assert.equal(run.outcome, "partial");
  assert.equal(client.statuses.at(-1).state, "failure");
  assert.match(client.comments[0].body, /docs\/second\.md/);
  assert.match(client.comments[0].body, new RegExp(finding.id));
});

test("B12 incomplete review without findings permits merge and reports missing coverage", async () => {
  const client = makeClient();
  const run = await worker.runSemanticReview({ client, pull, config, secret: "test-key",
    deps: { triggerRunId: "81:1", collectReviewInput: async () => ({ ...input,
      unreviewed: [{ path: "docs/second.md", reason: "model timed out" }] }),
      reviewFiles: async () => ({ reviewed: [finding.path], unreviewed: [], findings: [] }) } });
  assert.equal(run.outcome, "partial");
  assert.equal(client.statuses.at(-1).state, "success");
  assert.match(client.statuses.at(-1).description, /Partial semantic review/);
  assert.match(client.comments[0].body, /docs\/second\.md/);
  assert.doesNotMatch(client.comments[0].body, /no active findings/);
});

test("B13 a PR-supplied model setting cannot replace the trusted configuration", async () => {
  const client = makeClient();
  const attackerPull = { ...pull, proposedConfig: {
    semanticReview: { enabled: true, model: "author-model", baseUrl: "https://author.example/v1" } } };
  let requestUrl;
  let requestBody;
  const reviewed = await worker.runSemanticReview({ client, pull: attackerPull, config,
    secret: "trusted-key", modelFetch: async (url, options) => {
      requestUrl = url;
      requestBody = JSON.parse(options.body);
      return modelResponse();
    }, deps: { triggerRunId: "81:1", collectReviewInput: async () => input } });
  assert.equal(reviewed.outcome, "reviewed");
  assert.equal(requestUrl, "https://maintainer.example/v1/chat/completions");
  assert.equal(requestBody.model, "maintainer-model");
  let called = false;
  const unavailable = await worker.runSemanticReview({ client: makeClient(), pull, config: null,
    secret: "trusted-key", modelFetch: async () => { called = true; return modelResponse(); },
    deps: { triggerRunId: "82:1" } });
  assert.equal(unavailable.outcome, "unavailable");
  assert.equal(called, false);
});

test("B14 disabling the pilot reports disabled while the deterministic checker still runs", async () => {
  const client = makeClient();
  const disabled = { ...config, semanticReview: { enabled: false } };
  let called = false;
  const run = await worker.runSemanticReview({ client, pull, config: disabled, secret: "test-key",
    modelFetch: async () => { called = true; return modelResponse(); }, deps: { triggerRunId: "81:1" } });
  assert.equal(run.outcome, "disabled");
  assert.equal(called, false);
  assert.equal(client.statuses.at(-1).state, "success");
  assert.match(client.statuses.at(-1).description, /disabled/);
  const violations = termChecker.lintFile({ file: "docs/spec.md", text: "The `Gadget` is dispatched.",
    canonical: termChecker.canonicalTerms(ontology),
    config: { allowlist: [], bannedAliases: [], semanticReview: { enabled: false } },
    ontologyPath: "docs/ontology.md" });
  assert.ok(violations.some((item) => item.message.includes("`Gadget`")));
});
