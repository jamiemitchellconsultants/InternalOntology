import { test } from "node:test";
import assert from "node:assert/strict";
import { runGraphNamingReview, planGraphNamingReviews, finalizeGraphNamingReview, handleSettlementEvent } from "./graph-naming-worker.mjs";
import { createModelAuth } from "./llm-auth.mjs";
import { block, S, ttl, NS } from "./source-graph-test-helpers.mjs";
import { pullFixture, namingRun, HEAD, MERGE } from "./graph-naming-test-helpers.mjs";

const auth = createModelAuth({ env: { K: "k" }, staticKeyVar: "K" });
const noAuth = createModelAuth({ env: {}, staticKeyVar: "K" });
const enabled = { enabled: true, model: "m", baseUrl: "https://model.example/v1" };
const config = (namingReview = enabled, graphEnabled = true) => ({ ontologyPath: "docs/ontology.md", sections: { required: ["Entities"], optional: [] },
  sourceGraph: { enabled: graphEnabled, root: "g", evidence: {}, namingReview } });
const markdown = "## Entities\n\n| Name | Description |\n| --- | --- |\n| `SessionRemoval` | removing a session |\n";
const turtle = `@prefix : <${NS}> .\n@prefix owl: <http://www.w3.org/2002/07/owl#> .\n\n:SessionRemoval a owl:Class .\n`;
const concept = block(":node-session-removal", "kit:GraphNode", [["kit:denotes", ":SessionRemoval"], ["kit:kind", "kit:concept"], ["rdfs:label", S("SessionRemoval")]]);
const symbol = (label) => block(":node-job", "kit:GraphNode", [["kit:kind", "kit:source-symbol"], ["rdfs:label", S(label)]]);
const link = [
  block(":assertion-j", "kit:GraphAssertion", [["kit:basis", "kit:direct"], ["kit:evidence", ":evidence-j"], ["kit:object", ":node-session-removal"], ["kit:relationship", "kit:implements"], ["kit:subject", ":node-job"]]),
  block(":evidence-j", "kit:GraphEvidence", [["kit:blobId", S("a".repeat(40))], ["kit:endLine", 3], ["kit:path", S("src/RemovalJob.cs")], ["kit:role", "kit:role-implementation"], ["kit:startLine", 1]]),
];
const snapshot = (blocks) => ({ files: [{ path: "g/nodes.ttl", text: ttl(blocks) }], markdown, turtle });
const input = (head, base = [concept]) => ({ changed: true, incomplete: false, base: snapshot(base), head: snapshot(head) });
const mismatchInput = () => input([concept, symbol("RemovalJob"), ...link]);

function harness(extra = {}) {
  const published = [], modelCalls = [];
  const deps = { triggerRunId: "81:1", isEligiblePull: async () => true, collectGraphNamingInput: async () => mismatchInput(),
    publishPending: async () => {}, publishState: async ({ run }) => { published.push(run); return { published: true, newKeys: [] }; },
    reviewPairs: async (args) => { modelCalls.push(args); return { reviewed: [...new Set(args.pairs.map((p) => p.node))], unreviewed: [], results: [] }; },
    ...extra };
  return { deps, published, modelCalls };
}
const review = (h, extra = {}) => runGraphNamingReview({ client: {}, pull: pullFixture(), config: config(), auth, env: {}, deps: h.deps, ...extra });

test("B34: a repository that has not opted in reports disabled without reading the pull request", async () => {
  for (const trusted of [config({ enabled: false, model: "", baseUrl: "" }), config(enabled, false)]) {
    let read = 0;
    const h = harness({ collectGraphNamingInput: async () => { read++; return mismatchInput(); } });
    const run = await review(h, { config: trusted });
    assert.deepEqual([run.outcome, read, h.modelCalls.length, h.published.length], ["disabled", 0, 0, 1]);
  }
});

test("B32: missing trusted configuration is unavailable, not disabled", async () => {
  for (const trusted of [null, { ...config(), sourceGraph: { enabled: true, root: "g" } }]) {
    const run = await review(harness(), { config: trusted });
    assert.equal(run.outcome, "unavailable");
    assert.deepEqual(run.unreviewed, [{ node: "<review>", reason: "trusted graph naming configuration is unavailable" }]);
  }
});

test("B31: forks are out of scope; ambiguous or unchecked pull requests are unavailable", async () => {
  assert.equal((await review(harness({ isEligiblePull: async () => false }))).outcome, "out-of-scope");
  assert.equal((await review(harness(), { pull: pullFixture({ semanticAssociationAmbiguous: true }) })).unreviewed[0].node, "<PR association>");
  assert.deepEqual((await review(harness({ isEligiblePull: async () => { throw new Error("x"); } }))).unreviewed,
    [{ node: "<permission>", reason: "author permission could not be checked" }]);
});

test("B31: no graph or ontology change, or no compared node, is no-eligible with no model call", async () => {
  const unchanged = harness({ collectGraphNamingInput: async () => ({ changed: false, incomplete: false, base: null, head: null }) });
  const same = harness({ collectGraphNamingInput: async () => input([concept], [concept]) });
  assert.equal((await review(unchanged)).outcome, "no-eligible");
  assert.equal((await review(same)).outcome, "no-eligible");
  assert.equal(unchanged.modelCalls.length + same.modelCalls.length, 0);
});

test("B28: when every pair contains its canonical name the run is reviewed without a model call", async () => {
  const h = harness({ collectGraphNamingInput: async () => input([concept, symbol("SessionRemovalJob"), ...link]) });
  const run = await review(h);
  assert.deepEqual([run.outcome, run.compared, run.reviewed, run.prefiltered, h.modelCalls.length], ["reviewed", 1, 1, 1, 0]);
});

test("B32: the model gets the trusted settings, the head catalog and the pairs; the run records its revision", async () => {
  const h = harness();
  const run = await review(h);
  const [call] = h.modelCalls;
  assert.deepEqual([call.model, call.baseUrl], ["m", "https://model.example/v1"]);
  assert.ok(call.catalog.evidenceKeys.has("Entities:SessionRemoval"));
  assert.deepEqual(call.pairs.map((p) => [p.node, p.type]), [[":node-job", "implements"]]);
  assert.deepEqual([run.schema, run.prNumber, run.headSha, run.mergeSha, run.triggerRunId, run.outcome], [1, 7, HEAD, MERGE, "81:1", "reviewed"]);
  assert.equal(h.published.at(-1), run);
});

test("B33: outcomes follow the semantic rule and the stored run stays bounded", async () => {
  const outcome = async (result) => (await review(harness({ reviewPairs: async () => result }))).outcome;
  assert.equal(await outcome({ reviewed: [":node-job"], unreviewed: [], results: [{ key: "k", node: ":node-job" }] }), "reviewed");
  assert.equal(await outcome({ reviewed: [":a"], unreviewed: [{ node: ":b", reason: "model timed out" }], results: [] }), "partial");
  assert.equal(await outcome({ reviewed: [], unreviewed: [{ node: ":node-job", reason: "model timed out" }], results: [] }), "unavailable");
  assert.equal(await outcome({ reviewed: [], unreviewed: [{ node: ":node-job", code: "too-large", reason: "x" }], results: [] }), "too-large");
  const many = Array.from({ length: 30 }, (_, i) => ({ node: `:n${i}`, reason: "model timed out" }));
  const run = await review(harness({ reviewPairs: async () => ({ reviewed: [], unreviewed: many, results: [] }) }));
  assert.deepEqual([run.unreviewedCount, run.unreviewed.length], [30, 20]);
});

test("B33: credential, input, catalogue and budget failures are visible and never block", async () => {
  const noKey = await review(harness(), { auth: noAuth });
  assert.deepEqual(noKey.unreviewed, [{ node: "<model>", reason: "graph naming model credential is unavailable" }]);
  const unreadable = await review(harness({ collectGraphNamingInput: async () => { throw new Error("secret detail"); } }));
  assert.deepEqual(unreadable.unreviewed, [{ node: "<pull request>", reason: "PR graph or ontology could not be read" }]);
  const badOntology = () => { const i = mismatchInput(); i.head.markdown = "# no sections\n"; return i; };
  const uncatalogued = await review(harness({ collectGraphNamingInput: async () => badOntology() }));
  assert.deepEqual(uncatalogued.unreviewed, [{ node: "<ontology>", reason: "proposed ontology could not be catalogued" }]);
  for (const run of [noKey, unreadable, uncatalogued]) assert.equal(run.outcome, "unavailable");
  const h = harness();
  await assert.rejects(review(h, { env: { ONTOLOGY_MAX_REQUEST_CHARS: "lots" } }));
  assert.equal(h.published.at(-1).unreviewed[0].node, "<configuration>");
});

test("an unparsable head graph file or an incomplete listing is not reviewed; the rest still is", async () => {
  const h = harness({ collectGraphNamingInput: async () => { const i = mismatchInput(); i.incomplete = true; i.head.files.push({ path: "g/broken.ttl", text: "not turtle" }); return i; } });
  const run = await review(h);
  assert.equal(run.outcome, "partial");
  assert.deepEqual(run.unreviewed, [{ node: "<changed files>", reason: "GitHub file listing is incomplete" },
    { node: "g/broken.ttl", reason: "graph file could not be parsed; the source-graph check reports why" }]);
});

test("B31: review jobs are planned only for eligible, enabled pull requests with graph or ontology changes", async () => {
  const pulls = [1, 2, 3, 4].map((number) => pullFixture({ number, ...(number === 4 ? { semanticAssociationAmbiguous: true } : {}) }));
  const plan = (loadTrustedConfig, deps) => planGraphNamingReviews({ client: {}, pulls, loadTrustedConfig, deps });
  const { all, review: planned } = await plan(() => config(), { isEligiblePull: async (_c, p) => p.number !== 2,
    collectGraphNamingInput: async (_c, p) => ({ changed: p.number !== 3 }) });
  assert.deepEqual(all.map((p) => p.number), [1, 2, 3, 4]);
  assert.deepEqual(planned, [{ number: 1, headSha: HEAD }]);
  assert.deepEqual((await plan(() => config({ enabled: false, model: "", baseUrl: "" }), { isEligiblePull: async () => true })).review, []);
  assert.deepEqual((await plan(() => { throw new Error("bad"); }, { isEligiblePull: async () => true })).review, []);
});

test("finalize reconciles its own run, skips a newer one, and otherwise reports without a model", async () => {
  const calls = [];
  const deps = (run) => ({ loadLedger: async () => ({ ledger: { run }, comment: null }), isEligiblePull: async () => true,
    collectGraphNamingInput: async () => mismatchInput(), publishPending: async () => {},
    publishState: async (args) => { calls.push(args.run ?? "recompute"); return { published: true, newKeys: [] }; } });
  const finalize = (config, run) => finalizeGraphNamingReview({ client: {}, pull: pullFixture(), triggerRunId: "81:1", config, deps: deps(run) });
  await finalize(config(), namingRun([], { triggerRunId: "81:1" }));
  assert.deepEqual(calls, ["recompute"]);
  calls.length = 0;
  await finalize(config(), namingRun([], { triggerRunId: "82:1" }));
  assert.deepEqual(calls, []);
  assert.deepEqual((await finalize(config(), null)).unreviewed, [{ node: "<model>", reason: "graph naming model credential is unavailable" }]);
  assert.deepEqual((await finalize(null, null)).unreviewed, [{ node: "<review>", reason: "trusted graph naming configuration is unavailable" }]);
  assert.deepEqual((await finalize(undefined, null)).unreviewed, [{ node: "<model job>", reason: "trusted model job did not publish a result" }]);
});

test("the settle trigger recomputes only for command comments on open pull requests", async () => {
  const seen = [];
  const deps = { publishState: async ({ pull }) => { seen.push(pull.number); return { published: true, newKeys: [] }; } };
  const client = { get: async () => pullFixture() };
  const event = (action, body, extra = {}) => ({ action, issue: { number: 7, pull_request: {} }, comment: { body, user: { login: "reviewer" } }, ...extra });
  const handle = (e, c = client) => handleSettlementEvent({ client: c, event: e, deps });
  assert.deepEqual(await handle(event("created", "/graph-naming accept R1")), { handled: true, reason: "state recomputed" });
  assert.deepEqual(await handle(event("created", "/graph-naming reject R1")), { handled: true, reason: "state recomputed" });
  assert.deepEqual(await handle(event("created", "thanks")), { handled: false, reason: "not a graph naming command" });
  assert.equal((await handle(event("edited", "thanks", { changes: { body: { from: "/graph-naming accept R1" } } }))).handled, true);
  assert.equal((await handle(event("deleted", "/graph-naming defer R1"))).handled, true);
  assert.deepEqual(await handle({ ...event("created", "/graph-naming accept R1"), issue: { number: 7 } }), { handled: false, reason: "not a pull request comment" });
  assert.deepEqual(await handle(event("created", "x", { comment: { body: "/graph-naming accept R1", user: { login: "github-actions[bot]" } } })),
    { handled: false, reason: "comment by the workflow bot" });
  assert.deepEqual(await handle(event("created", "/graph-naming accept R1"), { get: async () => pullFixture({ state: "closed" }) }),
    { handled: false, reason: "pull request is not open" });
  assert.deepEqual(seen, [7, 7, 7, 7]);
});
