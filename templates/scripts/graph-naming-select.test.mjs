import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGraph } from "./source-graph-model.mjs";
import { block, S, ttl, NS } from "./source-graph-test-helpers.mjs";
import { memoryTree, ontologySnapshot, words, containsCanonical, selectComparedNodes, formPairs } from "./graph-naming-select.mjs";

const sections = { required: ["Entities"], optional: [] };
const markdown = (rows) => ["## Entities", "", "| Name | Description |", "| --- | --- |", ...rows.map(([n, d]) => `| \`${n}\` | ${d} |`), ""].join("\n");
const turtle = (names) => `@prefix : <${NS}> .\n@prefix owl: <http://www.w3.org/2002/07/owl#> .\n\n` + names.map((n) => `:${n} a owl:Class .`).join("\n\n") + "\n";
const onto = (rows) => ontologySnapshot({ markdown: markdown(rows), turtle: turtle(rows.map(([n]) => n)), sections });
const ROWS = [["SessionRemoval", "removing a session"], ["Invoice", "a bill"], ["Payment", "money received"]];
const node = (id, kind, label, extra = []) => block(`:node-${id}`, "kit:GraphNode", [["kit:kind", kind], ["rdfs:label", S(label)], ...extra]);
const implementsA = (id, subject, object) => block(`:assertion-${id}`, "kit:GraphAssertion", [["kit:basis", "kit:direct"],
  ["kit:evidence", `:evidence-${id}`], ["kit:object", object], ["kit:relationship", "kit:implements"], ["kit:subject", subject]]);
const evidence = (id, path) => block(`:evidence-${id}`, "kit:GraphEvidence", [["kit:blobId", S("a".repeat(40))], ["kit:endLine", 3],
  ["kit:path", S(path)], ["kit:role", "kit:role-implementation"], ["kit:startLine", 1]]);
const graphOf = (blocks) => loadGraph(memoryTree([{ path: "g/nodes.ttl", text: ttl(blocks) }]), { sourceGraph: { root: "g" } });
const concept = node("session-removal", "kit:concept", "SessionRemoval", [["kit:denotes", ":SessionRemoval"]]);
const select = (base, head, baseOntology = onto(ROWS), headOntology = baseOntology) =>
  selectComparedNodes({ baseGraph: graphOf(base), headGraph: graphOf(head), baseOntology, headOntology }).map((n) => n.iri);

test("the ontology snapshot keeps subjects, rows by name and the catalog", () => {
  const o = onto(ROWS);
  assert.ok(o.subjects.has(":SessionRemoval"));
  assert.equal(o.rows.get("Invoice"), "| `Invoice` | a bill |");
  assert.ok(o.catalog.evidenceKeys.has("Entities:Invoice"));
  const empty = ontologySnapshot({ markdown: null, turtle: null, sections });
  assert.deepEqual([empty.catalog, [...empty.subjects], [...empty.rows]], [null, [], []]);
});

test("B28: whole PascalCase word sequences match case-insensitively and in order", () => {
  assert.deepEqual(words("XMLInvoiceParser"), ["xml", "invoice", "parser"]);
  assert.deepEqual(words("session_removal-service2"), ["session", "removal", "service", "2"]);
  for (const [label, name] of [["SessionRemovalService", "SessionRemoval"], ["session_removal_service", "SessionRemoval"],
    ["removeSessionRemoval", "SessionRemoval"], ["XMLInvoiceParser", "Invoice"], ["invoice", "Invoice"], ["HTTPRequest", "Request"],
    ["SessionRemoval", "SessionRemoval"]]) assert.equal(containsCanonical(label, name), true, `${label} contains ${name}`);
  for (const [label, name] of [["SessionRemovals", "SessionRemoval"], ["SessionRemover", "SessionRemoval"], ["RemovalSession", "SessionRemoval"],
    ["Invoicer", "Invoice"], ["Invoices", "Invoice"], ["Session", "SessionRemoval"], ["", "Invoice"]]) {
    assert.equal(containsCanonical(label, name), false, `${label} does not contain ${name}`);
  }
});

test("B27: new nodes and changed labels, kinds or denotes are compared; unchanged ones are not", () => {
  assert.deepEqual(select(
    [concept, node("a", "kit:component", "Billing"), node("b", "kit:component", "Ledger"), node("c", "kit:component", "Payments")],
    [concept, node("a", "kit:component", "Invoicing"), node("b", "kit:system", "Ledger"), node("c", "kit:component", "Payments"), node("d", "kit:component", "Receipts")]),
  [":node-a", ":node-b", ":node-d"]);
});

test("B27: becoming the subject of a new or changed kit:implements selects the subject only", () => {
  const invoice = node("invoice", "kit:concept", "Invoice", [["kit:denotes", ":Invoice"]]);
  const job = node("job", "kit:source-symbol", "RemovalJob");
  const toRemoval = [implementsA("j", ":node-job", ":node-session-removal"), evidence("j", "src/RemovalJob.cs")];
  const toInvoice = [implementsA("j", ":node-job", ":node-invoice"), evidence("j", "src/RemovalJob.cs")];
  assert.deepEqual(select([concept, invoice, job], [concept, invoice, job, ...toRemoval]), [":node-job"]);
  assert.deepEqual(select([concept, invoice, job, ...toInvoice], [concept, invoice, job, ...toRemoval]), [":node-job"]);
  assert.deepEqual(select([concept, invoice, job, ...toInvoice], [concept, invoice, job, implementsA("j", ":node-job", ":node-invoice"), evidence("j", "src/Other.cs")]), []);
});

test("B27: an ontology row change or removal selects the nodes that denote or implement the item", () => {
  const blocks = [concept, node("job", "kit:source-symbol", "RemovalJob"), implementsA("j", ":node-job", ":node-session-removal"),
    evidence("j", "src/RemovalJob.cs"), node("payment", "kit:concept", "Payment", [["kit:denotes", ":Payment"]]), node("other", "kit:component", "Ledger")];
  const changed = onto([["SessionRemoval", "ending a recording session"], ["Invoice", "a bill"], ["Payment", "money received"]]);
  assert.deepEqual(select(blocks, blocks, onto(ROWS), changed), [":node-job", ":node-session-removal"]);
  assert.deepEqual(select(blocks, blocks, onto(ROWS), onto([["SessionRemoval", "removing a session"], ["Invoice", "a bill"]])), [":node-payment"]);
});

test("B27: with no base graph or base ontology every head node is new", () => {
  const empty = ontologySnapshot({ markdown: null, turtle: null, sections });
  const nodes = selectComparedNodes({ baseGraph: null, headGraph: graphOf([concept, node("x", "kit:component", "Ledger")]), baseOntology: empty, headOntology: onto(ROWS) });
  assert.deepEqual(nodes.map((n) => n.iri), [":node-session-removal", ":node-x"]);
});

test("B27: a compared node carries its implemented items, Turtle file and evidence paths", () => {
  const head = [concept, node("job", "kit:source-symbol", "RemovalJob"), implementsA("j", ":node-job", ":node-session-removal"), evidence("j", "src/RemovalJob.cs")];
  const [job] = selectComparedNodes({ baseGraph: graphOf([concept]), headGraph: graphOf(head), baseOntology: onto(ROWS), headOntology: onto(ROWS) });
  assert.deepEqual(job, { iri: ":node-job", kind: "kit:source-symbol", label: "RemovalJob", denotes: null,
    implements: [{ assertion: ":assertion-j", concept: ":node-session-removal", item: ":SessionRemoval" }], file: "g/nodes.ttl", evidence: ["src/RemovalJob.cs"] });
});

const compared = (iri, kind, label, extra = {}) => ({ iri, kind, label, denotes: null, implements: [], file: "g/n.ttl", evidence: [], ...extra });
const link = (assertion, item = ":SessionRemoval") => ({ assertion, concept: ":node-c", item });

test("B27: pairs by kind and link; file, test and document nodes form none", () => {
  const nodes = [
    compared(":node-file", "kit:source-file", "src/Removal.cs", { implements: [link(":a1")] }),
    compared(":node-dep", "kit:dependency", "Polly"),
    compared(":node-bill", "kit:component", "Billing"),
    compared(":node-job", "kit:source-symbol", "RemovalJob", { implements: [link(":a2"), link(":a3", null)], evidence: ["src/RemovalJob.cs"] }),
    compared(":node-removal", "kit:concept", "Removal", { denotes: ":SessionRemoval" }),
  ];
  const at = { file: "g/n.ttl" };
  assert.deepEqual(formPairs(nodes, onto(ROWS)), { prefiltered: 0, pairs: [
    { node: ":node-bill", kind: "kit:component", type: "synonym", label: "Billing", value: "", name: null, ...at, evidence: [] },
    { node: ":node-job", kind: "kit:source-symbol", type: "implements", label: "RemovalJob", value: ":SessionRemoval", name: "SessionRemoval", ...at, evidence: ["src/RemovalJob.cs"] },
    { node: ":node-removal", kind: "kit:concept", type: "denotes", label: "Removal", value: ":SessionRemoval", name: "SessionRemoval", ...at, evidence: [] },
  ] });
});

test("B28: pairs whose label contains the canonical name are dropped and counted; duplicates collapse", () => {
  const nodes = [
    compared(":n1", "kit:source-symbol", "SessionRemovalService", { implements: [link(":a1")] }),
    compared(":n2", "kit:concept", "SessionRemoval", { denotes: ":SessionRemoval" }),
    compared(":n3", "kit:component", "InvoiceDesk"),
    compared(":n4", "kit:source-symbol", "SessionRemovals", { implements: [link(":a4")] }),
    compared(":n5", "kit:source-symbol", "Purger", { implements: [link(":a5"), { assertion: ":a6", concept: ":node-c2", item: ":SessionRemoval" }] }),
  ];
  const { pairs, prefiltered } = formPairs(nodes, onto(ROWS));
  assert.equal(prefiltered, 3);
  assert.deepEqual(pairs.map((p) => [p.node, p.type]), [[":n4", "implements"], [":n5", "implements"]]);
});
