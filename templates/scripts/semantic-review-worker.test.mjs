import { test } from "node:test";
import assert from "node:assert/strict";
import { planSemanticReviews, runSemanticReview, finalizeSemanticReview } from "./semantic-review-worker.mjs";
import { createModelAuth } from "./llm-auth.mjs";
import { publishRun } from "./semantic-review-ledger.mjs";

const authFor = (key) => createModelAuth({ env: key ? { K: key } : {}, staticKeyVar: "K" });
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
  const result = await runSemanticReview({ client: {}, pull, config, auth: authFor(""),
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
  const out = await runSemanticReview({ client: {}, pull, config, auth: authFor("secret"), modelFetch,
    deps: deps({ isEligiblePull: async () => false }).value });
  assert.equal(out.outcome, "out-of-scope");
  const missing = await runSemanticReview({ client: {}, pull, config: null, auth: authFor("secret"), modelFetch,
    deps: deps().value });
  assert.equal(missing.outcome, "unavailable");
  assert.equal(calls, 0);
});

test("ambiguous workflow association is unavailable without model access", async () => {
  const result = await runSemanticReview({ client: {}, pull: { ...pull, semanticAssociationAmbiguous: true },
    config, auth: authFor("secret"), modelFetch: async () => { throw new Error("must not call"); }, deps: deps().value });
  assert.equal(result.outcome, "unavailable");
});

test("no selected files passes with no eligible outcome", async () => {
  const support = deps({ collectReviewInput: async () => ({ ...input, files: [] }) });
  const result = await runSemanticReview({ client: {}, pull,
    config: { ...config, semanticReview: { enabled: true, model: "m", baseUrl: "https://model.example/v1" } },
    auth: authFor("secret"), modelFetch: async () => { throw new Error("must not call"); }, deps: support.value });
  assert.equal(result.outcome, "no-eligible");
});

test("a finding blocks and a partial review keeps that finding", async () => {
  const enabled = { ...config, semanticReview: { enabled: true, model: "m", baseUrl: "https://model.example/v1" } };
  const finding = { id: "f".repeat(64), path: "docs/a.md", quote: "wrong term",
    evidenceKey: "Entities:Invoice", reason: "wrong", suggestion: "use Invoice" };
  const support = deps({ reviewFiles: async () => ({ reviewed: ["docs/a.md"], unreviewed: [], findings: [finding] }) });
  const reviewed = await runSemanticReview({ client: {}, pull, config: enabled, auth: authFor("secret"), deps: support.value });
  assert.equal(reviewed.outcome, "reviewed");
  assert.equal(reviewed.findings.length, 1);
  const partial = await runSemanticReview({ client: {}, pull, config: enabled, auth: authFor("secret"),
    deps: deps({ collectReviewInput: async () => ({ ...input, unreviewed: [{ path: "docs/b.md", reason: "blob unavailable" }] }),
      reviewFiles: async () => ({ reviewed: ["docs/a.md"], unreviewed: [], findings: [finding] }) }).value });
  assert.equal(partial.outcome, "partial");
  assert.equal(partial.findings.length, 1);
  const withoutFinding = await runSemanticReview({ client: {}, pull, config: enabled, auth: authFor("secret"),
    deps: deps({ collectReviewInput: async () => ({ ...input, unreviewed: [{ path: "docs/b.md", reason: "blob unavailable" }] }),
      reviewFiles: async () => ({ reviewed: ["docs/a.md"], unreviewed: [], findings: [] }) }).value });
  assert.equal(withoutFinding.outcome, "partial");
  assert.deepEqual(withoutFinding.findings, []);
});

test("model failure permits merge with explicit unavailable coverage", async () => {
  const enabled = { ...config, semanticReview: { enabled: true, model: "m", baseUrl: "https://model.example/v1" } };
  const result = await runSemanticReview({ client: {}, pull, config: enabled, auth: authFor("secret"),
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
  const result = await runSemanticReview({ client: {}, pull: newer, config: enabled, auth: authFor("secret"), deps: support.value });
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

test("a partial OIDC configuration makes the credential misconfigured, without echoing values", async () => {
  const auth = createModelAuth({ env: { ONTOLOGY_OIDC_CLIENT_SECRET: "hush-value" }, staticKeyVar: "K" });
  const support = deps();
  const result = await runSemanticReview({ client: {}, pull, config: { ...config,
    semanticReview: { enabled: true, model: "m", baseUrl: "https://model.example/v1" } },
    auth, modelFetch: async () => { throw new Error("must not call"); }, deps: support.value });
  assert.equal(result.outcome, "unavailable");
  assert.match(JSON.stringify(result), /semantic model credential is misconfigured/);
  assert.doesNotMatch(JSON.stringify(result), /hush-value/);
});

const tooLargeEnabled = { ...config, semanticReview: { enabled: true, model: "m", baseUrl: "https://model.example/v1" } };
const tooLargeItem = { path: "docs/a.md", code: "too-large", reason: "ontology too large for the configured budget" };

test("a run whose every file is too large for the budget has the too-large outcome", async () => {
  const result = await runSemanticReview({ client: {}, pull, config: tooLargeEnabled, auth: authFor("secret"),
    deps: deps({ reviewFiles: async () => ({ reviewed: [], unreviewed: [tooLargeItem], findings: [] }) }).value });
  assert.equal(result.outcome, "too-large");
  assert.deepEqual(result.reviewed, []);
});

test("a too-large file next to a reviewed one is partial, and next to another cause is not too-large", async () => {
  const partial = await runSemanticReview({ client: {}, pull, config: tooLargeEnabled, auth: authFor("secret"),
    deps: deps({ reviewFiles: async () => ({ reviewed: ["docs/b.md"], unreviewed: [tooLargeItem], findings: [] }) }).value });
  assert.equal(partial.outcome, "partial");
  const mixed = await runSemanticReview({ client: {}, pull, config: tooLargeEnabled, auth: authFor("secret"),
    deps: deps({ collectReviewInput: async () => ({ ...input, unreviewed: [{ path: "docs/c.md", reason: "blob unavailable" }] }),
      reviewFiles: async () => ({ reviewed: [], unreviewed: [tooLargeItem], findings: [] }) }).value });
  assert.equal(mixed.outcome, "unavailable");
});

test("a junk budget setting publishes an explained unavailable run, then fails, without calling the model", async () => {
  const support = deps({ reviewFiles: async () => { throw new Error("must not call the model"); } });
  await assert.rejects(
    runSemanticReview({ client: {}, pull, config: tooLargeEnabled, auth: authFor("secret"),
      env: { ONTOLOGY_MAX_REQUEST_CHARS: "abc" }, deps: support.value }),
    /ONTOLOGY_MAX_REQUEST_CHARS must be a positive integer, got "abc"/);
  assert.equal(support.published.length, 1);
  assert.equal(support.published[0].outcome, "unavailable");
  assert.match(JSON.stringify(support.published[0].unreviewed), /ONTOLOGY_MAX_REQUEST_CHARS must be a positive integer, got \\"abc\\"/);
});

test("a junk setting does not fail a disabled review", async () => {
  const result = await runSemanticReview({ client: {}, pull, config, auth: authFor("secret"),
    env: { ONTOLOGY_MAX_REQUEST_CHARS: "abc" }, deps: deps().value });
  assert.equal(result.outcome, "disabled");
});

test("valid settings reach the model module as the budget and timeout", async () => {
  let seen;
  await runSemanticReview({ client: {}, pull, config: tooLargeEnabled, auth: authFor("secret"),
    env: { ONTOLOGY_MAX_REQUEST_CHARS: "90000", ONTOLOGY_MODEL_TIMEOUT_MS: "45000" },
    deps: deps({ reviewFiles: async (arguments_) => { seen = arguments_; return { reviewed: ["docs/a.md"], unreviewed: [], findings: [] }; } }).value });
  assert.equal(seen.maxRequestChars, 90_000);
  assert.equal(seen.timeoutMs, 45_000);
  await runSemanticReview({ client: {}, pull, config: tooLargeEnabled, auth: authFor("secret"), env: {},
    deps: deps({ reviewFiles: async (arguments_) => { seen = arguments_; return { reviewed: ["docs/a.md"], unreviewed: [], findings: [] }; } }).value });
  assert.equal(seen.maxRequestChars, 200_000);
  assert.equal(seen.timeoutMs, 300_000);
});

const enabledConfig = { ...config, bannedAliases: [{ phrase: "bill", nameInstead: ["Invoice"] }],
  semanticReview: { enabled: true, model: "m", baseUrl: "https://model.example/v1", projection: "matched" } };

test("B6 B20 the worker passes a matched projector, with the banned aliases, by default", async () => {
  const { catalogOntology } = await import("./semantic-review-model.mjs");
  let seen;
  const support = deps({ reviewFiles: async (args) => { seen = args; return { reviewed: ["docs/a.md"], unreviewed: [], findings: [] }; } });
  const { projection, ...withoutKey } = enabledConfig.semanticReview;
  await runSemanticReview({ client: {}, pull, config: { ...enabledConfig, semanticReview: withoutKey },
    auth: authFor("k"), env: {}, deps: support.value });
  assert.equal(seen.project.mode, "matched");
  const catalog = catalogOntology(input.ontologyText, config.sections);
  assert.deepEqual(seen.project(catalog, "the bill").keys, ["Entities:Invoice"]);
  assert.deepEqual(seen.project(catalog, "nothing").keys, []);
});

test("B21 projection full reaches the model module", async () => {
  let seen;
  const support = deps({ reviewFiles: async (args) => { seen = args; return { reviewed: ["docs/a.md"], unreviewed: [], findings: [] }; } });
  await runSemanticReview({ client: {}, pull, config: { ...enabledConfig, semanticReview: { ...enabledConfig.semanticReview, projection: "full" } },
    auth: authFor("k"), env: {}, deps: support.value });
  assert.equal(seen.project.mode, "full");
});

test("B10 the run record carries the projections, and has none when the model module gives none", async () => {
  const summary = [{ path: "docs/a.md", mode: "matched", entriesSent: 1, entriesTotal: 1, largestChars: 10, fullChars: 20 }];
  const withSummary = deps({ reviewFiles: async () => ({ reviewed: ["docs/a.md"], unreviewed: [], findings: [], projections: summary }) });
  const run = await runSemanticReview({ client: {}, pull, config: enabledConfig, auth: authFor("k"), env: {}, deps: withSummary.value });
  assert.deepEqual(run.projections, summary);
  assert.equal(run.outcome, "reviewed");
  const without = deps({ reviewFiles: async () => ({ reviewed: ["docs/a.md"], unreviewed: [], findings: [] }) });
  const older = await runSemanticReview({ client: {}, pull, config: enabledConfig, auth: authFor("k"), env: {}, deps: without.value });
  assert.equal("projections" in older, false);
});

test("B12 a finding has the same identity in matched and full mode", async () => {
  const reply = { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ findings: [
    { quote: "wrong term", evidenceKey: "Entities:Invoice", reason: "r", suggestion: "s" }] }) } }] }) };
  const ids = [];
  for (const projection of ["matched", "full"]) {
    const support = deps();
    const run = await runSemanticReview({ client: {}, pull, config: { ...enabledConfig, semanticReview: { ...enabledConfig.semanticReview, projection } },
      auth: authFor("k"), env: {}, modelFetch: async () => reply, deps: support.value });
    ids.push(run.findings.map((item) => item.id));
  }
  assert.equal(ids[0].length, 1);
  assert.deepEqual(ids[0], ids[1]);
});
