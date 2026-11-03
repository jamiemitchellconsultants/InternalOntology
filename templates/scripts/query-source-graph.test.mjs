import { test } from "node:test";
import assert from "node:assert/strict";
import { openGraph, search, neighbors, findPaths, coverageReport, annotate, main } from "./query-source-graph.mjs";
import { treeFromRevision } from "./source-graph-git.mjs";
import { withScratchRepo, widgets } from "./source-graph-test-helpers.mjs";

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
