import { test } from "node:test";
import assert from "node:assert/strict";
import { planSemanticReviews, runSemanticReview, finalizeSemanticReview } from "./semantic-review-worker.mjs";
import { publishRun } from "./semantic-review-ledger.mjs";

const pull = { number: 7, head: { sha: "a".repeat(40), repo: { id: 1 } },
  base: { repo: { id: 1 } }, merge_commit_sha: "b".repeat(40), user: { login: "author" } };
const config = { ontologyPath: "docs/ontology.md", ignorePaths: [], sections: { required: ["Entities"], optional: [] },
  semanticReview: { enabled: false, model: "", baseUrl: "" } };
const input = { headSha: pull.head.sha, mergeSha: pull.merge_commit_sha, files: [{ path: "docs/a.md", text: "wrong term" }],
  ontologyText: "## Entities\n\n| Name | Description |\n| --- | --- |\n| `Invoice` | bill |", unreviewed: [] };

function deps(extra = {}) {
  const published = [];
  return { published, value: { triggerRunId: 81, isEligiblePull: async () => true,
    collectReviewInput: async () => input, publishPending: async () => {},
    publishRun: async (_client, _pull, run) => { published.push(run); },
    readDismissals: async () => [], ...extra } };
}

test("disabled review emits a visible result without invoking the model", async () => {
  const support = deps();
  let calls = 0;
  const result = await runSemanticReview({ client: {}, pull, config, secret: "",
    modelFetch: async () => { calls++; throw new Error("must not call model"); }, deps: support.value });
  assert.equal(result.outcome, "disabled");
  assert.equal(calls, 0);
  assert.equal(support.published.length, 1);
});

test("older identification cannot publish after a newer finding while planning overlapping attempts", async () => {
  const enabled = { ...config, semanticReview: { enabled: true, model: "m", baseUrl: "https://model.example/v1" } };
  const comments = [];
  const posts = [];
  const client = {
    get: async () => pull,
    getAll: async () => comments,
    post: async (path, body) => {
      posts.push({ path, body });
      if (path.includes("/comments")) {
        const comment = { body: body.body, user: { login: "github-actions[bot]" }, html_url: "https://example.test/run" };
        comments.push(comment);
        return comment;
      }
      return {};
    },
  };
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  const planning = planSemanticReviews({ client, pulls: [pull], loadTrustedConfig: () => enabled,
    deps: { isEligiblePull: async () => true, collectReviewInput: async () => {
      entered();
      await waiting;
      return input;
    } } });
  await started;
  const newer = { schema: 1, prNumber: 7, headSha: pull.head.sha, mergeSha: pull.merge_commit_sha,
    triggerRunId: "82:1", outcome: "reviewed", eligible: ["docs/a.md"], reviewed: ["docs/a.md"], unreviewed: [],
    findings: [{ id: "f".repeat(64), path: "docs/a.md", quote: "wrong term", evidenceKey: "Entities:Invoice",
      reason: "wrong", suggestion: "use Invoice" }] };
  await publishRun(client, pull, newer);
  const count = posts.length;
  release();
  assert.deepEqual(await planning, { all: [{ number: 7, headSha: pull.head.sha }],
    review: [{ number: 7, headSha: pull.head.sha }] });
  assert.equal(posts.length, count);
  assert.equal(posts.at(-1).body.state, "failure");
});

test("ineligible author and missing config do not call the model", async () => {
  let calls = 0;
  const modelFetch = async () => { calls++; throw new Error("must not call model"); };
  const out = await runSemanticReview({ client: {}, pull, config, secret: "secret", modelFetch,
    deps: deps({ isEligiblePull: async () => false }).value });
  assert.equal(out.outcome, "out-of-scope");
  const missing = await runSemanticReview({ client: {}, pull, config: null, secret: "secret", modelFetch,
    deps: deps().value });
  assert.equal(missing.outcome, "unavailable");
  assert.equal(calls, 0);
});

test("ambiguous workflow association is unavailable without model access", async () => {
  const result = await runSemanticReview({ client: {}, pull: { ...pull, semanticAssociationAmbiguous: true },
    config, secret: "secret", modelFetch: async () => { throw new Error("must not call"); }, deps: deps().value });
  assert.equal(result.outcome, "unavailable");
});

test("no selected files passes with no eligible outcome", async () => {
  const support = deps({ collectReviewInput: async () => ({ ...input, files: [] }) });
  const result = await runSemanticReview({ client: {}, pull,
    config: { ...config, semanticReview: { enabled: true, model: "m", baseUrl: "https://model.example/v1" } },
    secret: "secret", modelFetch: async () => { throw new Error("must not call"); }, deps: support.value });
  assert.equal(result.outcome, "no-eligible");
});

test("a finding blocks and a partial review keeps that finding", async () => {
  const enabled = { ...config, semanticReview: { enabled: true, model: "m", baseUrl: "https://model.example/v1" } };
  const finding = { id: "f".repeat(64), path: "docs/a.md", quote: "wrong term",
    evidenceKey: "Entities:Invoice", reason: "wrong", suggestion: "use Invoice" };
  const support = deps({ reviewFiles: async () => ({ reviewed: ["docs/a.md"], unreviewed: [], findings: [finding] }) });
  const reviewed = await runSemanticReview({ client: {}, pull, config: enabled, secret: "secret", deps: support.value });
  assert.equal(reviewed.outcome, "reviewed");
  assert.equal(reviewed.findings.length, 1);
  const partial = await runSemanticReview({ client: {}, pull, config: enabled, secret: "secret",
    deps: deps({ collectReviewInput: async () => ({ ...input, unreviewed: [{ path: "docs/b.md", reason: "blob unavailable" }] }),
      reviewFiles: async () => ({ reviewed: ["docs/a.md"], unreviewed: [], findings: [finding] }) }).value });
  assert.equal(partial.outcome, "partial");
  assert.equal(partial.findings.length, 1);
  const withoutFinding = await runSemanticReview({ client: {}, pull, config: enabled, secret: "secret",
    deps: deps({ collectReviewInput: async () => ({ ...input, unreviewed: [{ path: "docs/b.md", reason: "blob unavailable" }] }),
      reviewFiles: async () => ({ reviewed: ["docs/a.md"], unreviewed: [], findings: [] }) }).value });
  assert.equal(withoutFinding.outcome, "partial");
  assert.deepEqual(withoutFinding.findings, []);
});

test("model failure permits merge with explicit unavailable coverage", async () => {
  const enabled = { ...config, semanticReview: { enabled: true, model: "m", baseUrl: "https://model.example/v1" } };
  const result = await runSemanticReview({ client: {}, pull, config: enabled, secret: "secret",
    deps: deps({ reviewFiles: async () => { throw new Error("model offline"); } }).value });
  assert.equal(result.outcome, "unavailable");
  assert.deepEqual(result.findings, []);
  assert.ok(result.unreviewed.length > 0);
});

test("the proposed ontology and current revision go to the model", async () => {
  const enabled = { ...config, semanticReview: { enabled: true, model: "m", baseUrl: "https://model.example/v1" } };
  const newer = { ...pull, head: { ...pull.head, sha: "c".repeat(40) } };
  const support = deps({ reviewFiles: async (args) => {
    assert.equal(args.ontologyText, input.ontologyText);
    assert.equal(args.headSha, newer.head.sha);
    return { reviewed: ["docs/a.md"], unreviewed: [], findings: [] };
  } });
  const result = await runSemanticReview({ client: {}, pull: newer, config: enabled, secret: "secret", deps: support.value });
  assert.equal(result.headSha, newer.head.sha);
  assert.equal(result.outcome, "reviewed");
});

test("finalizer preserves an already published partial finding", async () => {
  const comments = [];
  const statuses = [];
  const client = {
    get: async () => pull,
    getAll: async () => comments,
    post: async (path, body) => {
      if (path.includes("/statuses/")) statuses.push(body);
      if (path.includes("/comments")) {
        const comment = { body: body.body, user: { login: "github-actions[bot]" }, html_url: "https://example.test/run" };
        comments.push(comment);
        return comment;
      }
      return {};
    },
  };
  const finding = { id: "f".repeat(64), path: "docs/a.md", quote: "wrong term",
    evidenceKey: "Entities:Invoice", reason: "wrong", suggestion: "use Invoice" };
  const run = { schema: 1, prNumber: 7, headSha: pull.head.sha, mergeSha: pull.merge_commit_sha,
    triggerRunId: "81:1", outcome: "partial", eligible: ["docs/a.md", "docs/b.md"],
    reviewed: ["docs/a.md"], unreviewed: [{ path: "docs/b.md", reason: "offline" }], findings: [finding] };
  await publishRun(client, pull, run);
  const result = await finalizeSemanticReview({ client, pull, triggerRunId: "81:1" });
  assert.deepEqual(result, run);
  assert.equal(comments.length, 1);
  assert.equal(statuses.at(-1).state, "failure");
  const unavailable = await finalizeSemanticReview({ client, pull, triggerRunId: "82:1" });
  assert.equal(unavailable.outcome, "unavailable");
  assert.equal(statuses.at(-1).state, "success");
  const statusCount = statuses.length;
  const older = await finalizeSemanticReview({ client, pull, triggerRunId: "81:1" });
  assert.equal(older.triggerRunId, "82:1");
  assert.equal(statuses.length, statusCount);
});

test("serialized finalizer publishes no-eligible and permission-unavailable outcomes", async () => {
  const client = { get: async () => pull, getAll: async () => [] };
  const enabled = { ...config, semanticReview: { enabled: true, model: "m", baseUrl: "https://model.example/v1" } };
  let pending = 0;
  const support = deps({ publishPending: async () => { pending++; },
    collectReviewInput: async () => ({ ...input, files: [] }) });
  const clean = await finalizeSemanticReview({ client, pull, triggerRunId: "83:1", config: enabled,
    deps: support.value });
  assert.equal(clean.outcome, "no-eligible");
  assert.equal(pending, 1);
  assert.equal(support.published.length, 1);
  const unavailable = await finalizeSemanticReview({ client, pull, triggerRunId: "84:1", config: enabled,
    deps: deps({ publishPending: async () => {}, isEligiblePull: async () => { throw new Error("offline"); } }).value });
  assert.equal(unavailable.outcome, "unavailable");
  assert.match(unavailable.unreviewed[0].reason, /permission/i);
});
