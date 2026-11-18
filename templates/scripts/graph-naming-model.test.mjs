import { test } from "node:test";
import assert from "node:assert/strict";
import { createModelAuth } from "./llm-auth.mjs";
import { catalogOntology, REQUEST_OVERHEAD } from "./semantic-review-model.mjs";
import { resultKey, batchPairs, reviewPairs, GRAPH_SYSTEM_PROMPT, MAX_RESULTS, MAX_TEXT } from "./graph-naming-model.mjs";

const ontology = ["## Entities", "", "| Name | Description |", "| --- | --- |", "| `SessionRemoval` | removing a session |", "| `Invoice` | a bill |", ""].join("\n");
const catalog = catalogOntology(ontology, { required: ["Entities"], optional: [] });
const auth = createModelAuth({ env: { K: "k" }, staticKeyVar: "K" });
const pair = (node, label, type = "implements", value = ":SessionRemoval") => ({ node, kind: "kit:source-symbol", type, label, value,
  name: value ? value.slice(1) : null, file: "g/nodes.ttl", evidence: ["src/RemovalJob.cs"] });
const job = pair(":node-job", "RemovalJob");
const mismatch = { node: ":node-job", quoted: "RemovalJob", item: "Entity:SessionRemoval", reason: "Job is not the ontology's word", suggestion: "SessionRemovalJob" };
const content = (results) => JSON.stringify({ results });
function model(reply) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    if (typeof reply === "number") return { ok: false, status: reply, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: reply } }] }) };
  };
  return { calls, fetchImpl };
}
const review = (pairs, fetchImpl, extra = {}) => reviewPairs({ pairs, catalog, model: "m", baseUrl: "https://model.example/v1/", auth, fetchImpl,
  timeoutMs: 5000, maxRequestChars: 60_000, ...extra });
const keyOf = (fields) => resultKey({ node: ":node-job", type: "implements", label: "RemovalJob", value: ":SessionRemoval", ontologyKey: "Entities:SessionRemoval", ...fields });

test("B30: the result key depends on node, pair and ontology item only", () => {
  assert.match(keyOf({}), /^[0-9a-f]{64}$/);
  assert.equal(keyOf({}), keyOf({}));
  for (const change of [{ node: ":m" }, { type: "denotes" }, { label: "RemovalTask" }, { value: ":Invoice" }, { ontologyKey: "Entities:Invoice" }]) {
    assert.notEqual(keyOf({}), keyOf(change));
  }
});

test("B29: a grounded, fenced reply becomes a result with the canonical ontology key", async () => {
  const result = await review([job], model("```json\n" + content([mismatch]) + "\n```").fetchImpl);
  assert.deepEqual(result.reviewed, [":node-job"]);
  assert.deepEqual(result.unreviewed, []);
  assert.deepEqual(result.results, [{ key: keyOf({}), node: ":node-job", type: "implements", label: "RemovalJob", value: ":SessionRemoval",
    ontologyKey: "Entities:SessionRemoval", reason: mismatch.reason, suggestion: mismatch.suggestion, file: "g/nodes.ttl", evidence: ["src/RemovalJob.cs"] }]);
});

test("B30: the same mismatch worded differently has the same key", async () => {
  const first = await review([job], model(content([mismatch])).fetchImpl);
  const second = await review([job], model(content([{ ...mismatch, item: "Entities:SessionRemoval", reason: "other words", suggestion: "x" }])).fetchImpl);
  assert.equal(first.results[0].key, second.results[0].key);
});

test("B29: node-level grounding failures leave that node not reviewed with a fixed reason", async () => {
  const good = { ...mismatch, node: ":node-other", quoted: "Purger" };
  for (const [bad, reason] of [
    [{ ...mismatch, quoted: "Removal Job" }, "result quotes a value the node does not hold"],
    [{ ...mismatch, item: "Entities:NoSuchThing" }, "result cites an unknown ontology item"],
    [{ ...mismatch, reason: "" }, "model result was incomplete"],
  ]) {
    const result = await review([job, pair(":node-other", "Purger")], model(content([bad, good])).fetchImpl);
    assert.deepEqual(result.unreviewed, [{ node: ":node-job", reason }]);
    assert.deepEqual(result.reviewed, [":node-other"]);
    assert.deepEqual(result.results.map((r) => r.node), [":node-other"]);
  }
});

test("B29: batch-level failures leave every node in the request not reviewed and never echo the reply", async () => {
  for (const [reply, reason] of [["", "model reply was empty"], ["SECRET not json", "model reply was not valid JSON"],
    [JSON.stringify({ findings: [] }), "model reply had no results list"],
    [content([{ ...mismatch, node: ":node-elsewhere" }]), "result names a node that was not compared"],
    [500, "model returned HTTP 500"]]) {
    const result = await review([job, pair(":node-other", "Purger")], model(reply).fetchImpl);
    assert.deepEqual(result.unreviewed, [{ node: ":node-job", reason }, { node: ":node-other", reason }], reason);
    assert.deepEqual(result.results, []);
    assert.doesNotMatch(JSON.stringify(result), /SECRET/);
  }
  const thrown = await review([job], async () => { throw new TypeError("SECRET socket"); });
  assert.deepEqual(thrown.unreviewed, [{ node: ":node-job", reason: "model assessment was unusable" }]);
});

test("the pair is chosen by the quoted value and the cited item", async () => {
  const pairs = [pair(":node-r", "Removal", "denotes", ":SessionRemoval"), pair(":node-r", "Removal", "implements", ":Invoice")];
  const reply = content([{ ...mismatch, node: ":node-r", quoted: "Removal", item: "Entities:Invoice" },
    { ...mismatch, node: ":node-r", quoted: ":SessionRemoval", item: "Entities:SessionRemoval" }]);
  const result = await review(pairs, model(reply).fetchImpl);
  assert.deepEqual(result.results.map((r) => [r.type, r.value, r.ontologyKey]).sort(),
    [["denotes", ":SessionRemoval", "Entities:SessionRemoval"], ["implements", ":Invoice", "Entities:Invoice"]]);
});

test("B32: requests carry the catalog and the pairs as data, in whole-node batches within the budget", async () => {
  const { calls, fetchImpl } = model(content([]));
  const pairs = Array.from({ length: 30 }, (_, i) => pair(`:node-${String(i).padStart(2, "0")}`, `Label${i}`));
  const result = await review(pairs, fetchImpl, { maxRequestChars: REQUEST_OVERHEAD + GRAPH_SYSTEM_PROMPT.length + catalog.projection.length + 800 });
  assert.ok(calls.length > 1);
  for (const call of calls) {
    const [system, user] = call.body.messages;
    assert.equal(call.url, "https://model.example/v1/chat/completions");
    assert.equal(call.body.model, "m");
    assert.equal(system.content, `${GRAPH_SYSTEM_PROMPT}\n\n${catalog.projection}`);
    assert.ok(user.content.length <= 800);
    assert.ok(JSON.parse(user.content).pairs.every((p) => Object.keys(p).sort().join() === "item,label,node,type"));
  }
  assert.equal(result.reviewed.length, 30);
});

test("batchPairs keeps a node's pairs together and reports a node too large for any request", () => {
  const budget = REQUEST_OVERHEAD + GRAPH_SYSTEM_PROMPT.length + catalog.projection.length + 500;
  const { batches, unreviewed } = batchPairs([pair(":node-a", "A", "denotes"), pair(":node-a", "A"), pair(":node-huge", "X".repeat(2000))], catalog, budget);
  assert.deepEqual(batches.map((b) => b.map((p) => p.node)), [[":node-a", ":node-a"]]);
  assert.deepEqual(unreviewed, [{ node: ":node-huge", code: "too-large", reason: "graph names too large for the configured budget" }]);
});

test("B33: an ontology too large for the budget, or a node the model rejects as too large, is too-large", async () => {
  const small = await review([job], model(content([])).fetchImpl, { maxRequestChars: 100 });
  assert.deepEqual(small.unreviewed, [{ node: ":node-job", code: "too-large",
    reason: `ontology too large for the configured budget (projection ${catalog.projection.length} characters, budget 100)` }]);
  const rejected = await review([job, pair(":node-other", "Purger")], model(413).fetchImpl);
  assert.deepEqual(rejected.unreviewed, [
    { node: ":node-job", code: "too-large", reason: "ontology too large: the model rejected the smallest request" },
    { node: ":node-other", code: "too-large", reason: "ontology too large: the model rejected the smallest request" }]);
});

test("results are capped and ordered, and stored text is truncated after the key is computed", async () => {
  const pairs = Array.from({ length: 25 }, (_, i) => pair(`:node-${String(i).padStart(2, "0")}`, `Label${i}`));
  const long = "w".repeat(400);
  const result = await review(pairs, model(content(pairs.map((p) => ({ node: p.node, quoted: p.label, item: "Entities:SessionRemoval", reason: long, suggestion: long })))).fetchImpl);
  assert.equal(result.results.length, MAX_RESULTS);
  assert.deepEqual(result.results.map((r) => r.node), pairs.slice(0, 20).map((p) => p.node));
  assert.deepEqual(result.unreviewed, pairs.slice(20).map((p) => ({ node: p.node, reason: "result limit reached" })));
  assert.equal(result.reviewed.length, 20);
  assert.equal(result.results[0].reason.length, MAX_TEXT);
  assert.ok(result.results[0].reason.endsWith("…"));
  const longLabel = pair(":node-long", "L".repeat(400));
  const [one] = (await review([longLabel], model(content([{ ...mismatch, node: ":node-long", quoted: longLabel.label }])).fetchImpl)).results;
  assert.equal(one.label.length, MAX_TEXT);
  assert.equal(one.key, resultKey({ node: ":node-long", type: "implements", label: longLabel.label, value: ":SessionRemoval", ontologyKey: "Entities:SessionRemoval" }));
});
