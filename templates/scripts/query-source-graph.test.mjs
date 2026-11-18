import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { openGraph, search, neighbors, findPaths, coverageReport, annotate, main, resolveTerm, conceptImplementations } from "./query-source-graph.mjs";
import { treeFromRevision } from "./source-graph-git.mjs";
import { withScratchRepo, widgets, block, S, writeGraph } from "./source-graph-test-helpers.mjs";

// The graph is parsed into memory before the scratch repository is removed, so tests that only
// query the graph can use it afterwards. Tests that run git or the command stay inside the callback.
async function open(language = "csharp") {
  let opened;
  await withScratchRepo(async (repo) => { widgets(repo, language); repo.commit("graph"); opened = openGraph(repo.dir, "HEAD"); });
  return opened;
}

test("B1: a concept finds its implementation, test, dependency and document with evidence and basis", async () => {
  const { graph } = await open();
  const match = search(graph, ["invoice"]).matches.find((m) => m.node.iri === ":node-invoice");
  assert.ok(match);
  const relationships = match.assertions.map((a) => a.relationship).sort();
  assert.deepEqual(relationships, ["kit:documented-by", "kit:implements", "kit:tested-by"]);
  for (const a of match.assertions) { assert.ok(a.evidence.length > 0 && a.evidence[0].path && a.basis); }
  const impl = neighbors(graph, "node-impl").edges.map((e) => e.relationship).sort();
  assert.ok(impl.includes("kit:depends-on"));
});

test("B2: an indirect relationship is shown as its recorded steps, never as a direct edge", async () => {
  const { graph } = await open();
  const { paths } = findPaths(graph, ":node-impl", ":node-design");
  assert.equal(paths.length, 1);
  assert.deepEqual(paths[0].map((e) => e.relationship), ["kit:implements", "kit:documented-by"]);
  assert.ok(paths[0].every((e) => e.evidence.length > 0));
  assert.equal(neighbors(graph, ":node-impl").edges.some((e) => e.object.iri === ":node-design"), false);
});

test("paths respect direction, the depth limit, the ceiling and cycles", async () => {
  const { graph } = await open();
  assert.equal(findPaths(graph, ":node-design", ":node-impl").paths.length, 0);
  assert.equal(findPaths(graph, ":node-impl", ":node-design", { maxDepth: 1 }).paths.length, 0);
  assert.equal(findPaths(graph, ":node-impl", ":node-design", { maxDepth: 99 }).maxDepth, 6);
});

test("B3: no match reports the absence, applicable coverage and the limit of that answer", async () => {
  await withScratchRepo(async (repo) => {
    widgets(repo);
    repo.commit("graph");
    assert.deepEqual(search(openGraph(repo.dir, "HEAD").graph, ["payroll"]).matches, []);
    let out = "";
    const code = main(["search", "payroll"], { cwd: repo.dir, stdout: { write: (t) => { out += t; } }, stderr: { write() {} } });
    assert.equal(code, 0);
    assert.match(out, /topic coverage cannot be determined/);
    assert.match(out, /kit:covered/);
    assert.doesNotMatch(out, /no relationship exists/i);
  });
});

test("B4 and B7: an inferred assertion is labelled tentative and keeps its observations", async () => {
  const { graph } = await open();
  const inferred = neighbors(graph, ":node-ledger").edges.find((e) => e.relationship === "kit:communicates-with");
  assert.equal(inferred.basis, "kit:inferred");
  assert.equal(inferred.tentative, true);
  assert.ok(inferred.evidence[0].path.startsWith("src/"));
  assert.equal(neighbors(graph, ":node-ledger").edges.find((e) => e.relationship === "kit:deployed-by").tentative, false);
});

test("B5: later source or a different commit marks the result stale and names changed evidence", async () => {
  await withScratchRepo(async (repo) => {
    const spec = widgets(repo);
    const pinned = repo.commit("graph");
    const { graph, tree } = openGraph(repo.dir, "HEAD");
    const result = neighbors(graph, ":node-impl");
    assert.equal(annotate(result, { graphTree: tree, workingTree: tree }).stale, false);
    repo.write(spec.paths.impl, "later edit\n");
    const later = repo.commit("later");
    const marked = annotate(neighbors(graph, ":node-impl"), { graphTree: tree, workingTree: treeFromRevision(repo.dir, later) });
    assert.equal(marked.stale, true);
    assert.equal(marked.graphRevision, pinned);
    assert.ok(marked.edges.flatMap((e) => e.evidence).some((e) => e.status === "changed"));
  });
});

test("B12: partial coverage is reported with its gaps and still usable", async () => {
  const { graph } = await open();
  const report = coverageReport(graph, ["src/Invoice.cs", "docker-compose.yml", "README.md"]);
  const status = Object.fromEntries(report.files.map((f) => [f.path, f.status]));
  assert.deepEqual(status, { "src/Invoice.cs": "kit:covered", "docker-compose.yml": "kit:unknown", "README.md": "kit:unknown" });
  assert.ok(report.files.find((f) => f.path === "docker-compose.yml").reason);
});

test("B15: a consumer reads a pinned commit as JSON with assertions and coverage", async () => {
  await withScratchRepo(async (repo) => {
    widgets(repo);
    const sha = repo.commit("graph");
    repo.write("README.md", "# moved on\n");
    repo.commit("later");
    let out = "";
    const code = main(["search", "invoice", "--rev", sha, "--json"], { cwd: repo.dir, stdout: { write: (t) => { out += t; } }, stderr: { write() {} } });
    const json = JSON.parse(out);
    assert.equal(code, 0);
    assert.equal(json.graphRevision, sha);
    assert.ok(json.matches[0].assertions.length > 0);
    assert.ok(json.coverage.inventory.length > 0);
  });
});

test("B13: the same questions give the same answers whatever the source language", async () => {
  const shape = async (language) => {
    const { graph } = await open(language);
    const normalise = (e) => ({ relationship: e.relationship, basis: e.basis, subject: e.subject.iri, object: e.object.iri,
      evidence: e.evidence.map((v) => v.role) });
    return JSON.stringify(neighbors(graph, ":node-impl").edges.map(normalise).sort((a, b) => a.relationship.localeCompare(b.relationship)));
  };
  const baseline = await shape("csharp");
  for (const language of ["typescript", "java", "python"]) assert.equal(await shape(language), baseline, language);
});

function run(repo, argv) {
  let out = "", err = "";
  const code = main(argv, { cwd: repo.dir, stdout: { write: (t) => { out += t; } }, stderr: { write: (t) => { err += t; } } });
  return { code, out, err };
}
const EXTRA_TERMS = "\n:Payment a owl:Class .\n\n:Refund a owl:Class .\n\n:InvoiceStatus a owl:Class .\n\n:InvoiceOpen a :InvoiceStatus .\n";
function conceptFixture(repo, { inferred = false } = {}) {
  const spec = widgets(repo);
  repo.write("docs/ontology.ttl", readFileSync(join(repo.dir, "docs/ontology.ttl"), "utf8") + EXTRA_TERMS);
  spec.nodes.push(
    block(":node-invoice-service", "kit:GraphNode", [["kit:kind", "kit:source-symbol"], ["rdfs:label", S("InvoiceService")]]),
    block(":node-refund", "kit:GraphNode", [["kit:denotes", ":Refund"], ["kit:kind", "kit:concept"], ["rdfs:label", S("Refund")]]),
    block(":node-invoice-open", "kit:GraphNode", [["kit:denotes", ":InvoiceOpen"], ["kit:kind", "kit:concept"], ["rdfs:label", S("InvoiceOpen")]]));
  spec.assertions.push(
    block(":assertion-a7", "kit:GraphAssertion", [["kit:basis", inferred ? "kit:inferred" : "kit:direct"], ["kit:evidence", ":evidence-e1"],
      ["kit:object", ":node-invoice"], ["kit:relationship", "kit:implements"], ["kit:subject", ":node-invoice-service"]]),
    block(":assertion-a8", "kit:GraphAssertion", [["kit:basis", "kit:direct"], ["kit:evidence", ":evidence-e5"],
      ["kit:object", ":node-invoice-service"], ["kit:relationship", "kit:contains"], ["kit:subject", ":node-ledger"]]));
  writeGraph(repo, spec);
  return spec;
}

test("B20 and B23: a term resolves from its name, :Name form or full IRI, and nothing else", async () => {
  await withScratchRepo(async (repo) => {
    conceptFixture(repo); repo.commit("graph");
    const { tree, config } = openGraph(repo.dir, "HEAD");
    for (const input of ["Invoice", ":Invoice", "https://ontology.example/widgets#Invoice"]) {
      assert.deepEqual(resolveTerm(tree, config, input), { iri: ":Invoice", name: "Invoice" }, input);
    }
    assert.deepEqual(resolveTerm(tree, config, "InvoiceOpen"), { iri: ":InvoiceOpen", name: "InvoiceOpen" });
    for (const input of ["invoice", "Invoices", "Inv", "https://other.example/x#Invoice", ":", "", "Invoice Service"]) {
      assert.equal(resolveTerm(tree, config, input), null, JSON.stringify(input));
    }
  });
});

test("B20 and B21: denoting nodes and implementing file and symbol nodes are grouped, one hop only", async () => {
  await withScratchRepo(async (repo) => {
    conceptFixture(repo); repo.commit("graph");
    const { graph } = openGraph(repo.dir, "HEAD");
    const result = conceptImplementations(graph, ":Invoice");
    assert.deepEqual(result.term, { iri: ":Invoice", name: "Invoice" });
    assert.deepEqual(result.denotes.map((n) => n.iri), [":node-invoice"]);
    assert.deepEqual(result.implements.map((a) => a.subject.iri), [":node-impl", ":node-invoice-service"]);
    assert.ok(result.implements.every((a) => a.relationship === "kit:implements" && a.object.iri === ":node-invoice" && a.evidence.length > 0));
    assert.equal(result.implements.some((a) => a.subject.iri === ":node-ledger"), false);
  });
});

test("B20: text and JSON output carry basis, tentative marks, evidence status and staleness", async () => {
  await withScratchRepo(async (repo) => {
    const spec = conceptFixture(repo, { inferred: true });
    const pinned = repo.commit("graph");
    const text = run(repo, ["concept", "Invoice"]);
    assert.equal(text.code, 0);
    assert.match(text.out, /^concept :Invoice$/m);
    assert.match(text.out, /^denotes\n:node-invoice Invoice$/m);
    assert.match(text.out, /^implements$/m);
    assert.match(text.out, /^:assertion-a7 basis: inferred \(tentative\)$/m);
    assert.match(text.out, /^:node-invoice-service kit:implements :node-invoice$/m);
    assert.doesNotMatch(text.out, /STALE/);
    const json = JSON.parse(run(repo, ["concept", ":Invoice", "--json"]).out);
    assert.equal(json.term.iri, ":Invoice");
    assert.equal(json.implements.find((a) => a.iri === ":assertion-a7").tentative, true);
    assert.ok(json.implements.flatMap((a) => a.evidence).every((e) => e.status === "current"));
    assert.ok(json.coverage.inventory.length > 0);
    repo.write(spec.paths.impl, "later edit\n");
    repo.commit("later");
    const stale = run(repo, ["concept", "Invoice", "--rev", pinned]);
    assert.match(stale.out, /^STALE$/m);
    assert.match(stale.out, / changed$/m);
  });
});

test("B22: a known term with nothing linked says so without calling it unimplemented and prints coverage", async () => {
  await withScratchRepo(async (repo) => {
    conceptFixture(repo); repo.commit("graph");
    const none = run(repo, ["concept", "Payment"]);
    assert.equal(none.code, 0);
    assert.match(none.out, /^No graph node denotes :Payment; that does not mean the concept is unimplemented\.$/m);
    assert.match(none.out, /kit:covered/);
    const unlinked = run(repo, ["concept", "Refund"]);
    assert.match(unlinked.out, /^:node-refund Refund$/m);
    assert.match(unlinked.out, /^No kit:implements assertion links a source element to :Refund; that does not mean the concept is unimplemented\.$/m);
    assert.match(unlinked.out, /kit:covered/);
    for (const out of [none.out, unlinked.out]) assert.doesNotMatch(out, /is not implemented|does not exist/i);
  });
});

test("B23: an input that is not an ontology term exits 2 and suggests search", async () => {
  await withScratchRepo(async (repo) => {
    conceptFixture(repo); repo.commit("graph");
    const result = run(repo, ["concept", "Invoices"]);
    assert.equal(result.code, 2);
    assert.equal(result.out, "");
    assert.match(result.err, /^Invoices is not a term in docs\/ontology\.ttl; try: node scripts\/query-source-graph\.mjs search Invoices$/m);
    for (const argv of [["concept"], ["concept", "Invoice", "Payment"]]) assert.equal(run(repo, argv).code, 2);
  });
});

test("B24: the lookup makes no network call", async () => {
  await withScratchRepo(async (repo) => {
    conceptFixture(repo); repo.commit("graph");
    const original = globalThis.fetch;
    globalThis.fetch = () => { throw new Error("network call"); };
    try { assert.equal(run(repo, ["concept", "Invoice"]).code, 0); } finally { globalThis.fetch = original; }
  });
});
