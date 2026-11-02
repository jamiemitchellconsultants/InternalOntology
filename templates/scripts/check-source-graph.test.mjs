import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTree, loadCheckConfig, CheckSetupError } from "./check-source-graph.mjs";
import { treeFromRevision } from "./source-graph-git.mjs";
import { withScratchRepo, widgets, writeGraph, find, setPair, dropPair, block, S, ttl, blobId, ROOT } from "./source-graph-test-helpers.mjs";

async function run(mutate, language = "csharp") {
  let findings;
  await withScratchRepo(async (repo) => {
    const spec = widgets(repo, language);
    await mutate?.(spec, repo);
    writeGraph(repo, spec);
    repo.commit("graph");
    const tree = treeFromRevision(repo.dir, "HEAD");
    findings = checkTree({ tree, config: loadCheckConfig(tree) });
  });
  return findings;
}

test("a complete widgets graph is clean in every language", async () => {
  for (const language of ["csharp", "typescript", "java", "python"]) {
    assert.deepEqual(await run(null, language), [], language);
  }
});

test("partial coverage is valid: unknown areas stay unknown and nothing else is required", async () => {
  const findings = await run((spec) => {
    spec.coverage = spec.coverage.filter((c) => ["coverage-graph-root", "coverage-c0"].includes(c.subject.slice(1)));
    spec.records = spec.records.filter((r) => r.pairs.some((p) => p.object.startsWith("src/")));
    spec.assertions = []; spec.evidence = []; spec.nodes = [];
  });
  assert.deepEqual(findings, []);
});

const mutations = [
  ["duplicate-iri", (s) => s.assertions.push(structuredClone(find(s.assertions, ":assertion-a1")))],
  ["dangling-reference", (s) => setPair(find(s.assertions, ":assertion-a1"), "kit:subject", ":node-missing")],
  ["dangling-reference", (s) => setPair(find(s.assertions, ":assertion-a1"), "kit:evidence", ":evidence-missing")],
  ["missing-evidence", (s) => dropPair(find(s.assertions, ":assertion-a1"), "kit:evidence")],
  ["missing-basis", (s) => dropPair(find(s.assertions, ":assertion-a1"), "kit:basis")],
  ["bad-value", (s) => setPair(find(s.assertions, ":assertion-a1"), "kit:basis", "kit:guess")],
  ["bad-value", (s) => setPair(find(s.evidence, ":evidence-e1"), "kit:startLine", S("one"))],
  ["evidence-path-missing", (s) => setPair(find(s.evidence, ":evidence-e1"), "kit:path", S("src/Gone.cs"))],
  ["evidence-blob-mismatch", (s) => setPair(find(s.evidence, ":evidence-e1"), "kit:blobId", S("0".repeat(40)))],
  ["evidence-range", (s) => setPair(find(s.evidence, ":evidence-e1"), "kit:endLine", 999)],
  ["evidence-range", (s) => { setPair(find(s.evidence, ":evidence-e1"), "kit:startLine", 5);
    setPair(find(s.evidence, ":evidence-e1"), "kit:endLine", 2); }],
  ["evidence-out-of-coverage", (s) => setPair(find(s.evidence, ":evidence-e1"), "kit:path", S("README.md"))],
  ["unknown-kind", (s) => setPair(find(s.nodes, ":node-impl"), "kit:kind", "kit:gadget")],
  ["unknown-kind", (s) => setPair(find(s.nodes, ":node-impl"), "kit:kind", ":kind-widget")],
  ["unknown-relationship", (s) => setPair(find(s.assertions, ":assertion-a1"), "kit:relationship", "kit:owns")],
  ["denotes-missing", (s) => setPair(find(s.nodes, ":node-invoice"), "kit:denotes", ":Missing")],
  ["missing-predicate", (s) => dropPair(find(s.nodes, ":node-invoice"), "kit:denotes")],
  ["coverage-malformed", (s) => dropPair(find(s.coverage, ":coverage-compose"), "kit:reason")],
  ["coverage-malformed", (s) => setPair(find(s.coverage, ":coverage-c0"), "kit:priority", S("high"))],
  ["coverage-conflict", (s) => s.coverage.push(block(":coverage-dup", "kit:GraphCoverage", [
    ["kit:pathSelector", S("src/**")], ["kit:priority", 10], ["kit:reason", S("later")], ["kit:status", "kit:unknown"]]))],
  ["root-not-excluded", (s) => { s.coverage = s.coverage.filter((c) => c.subject !== ":coverage-graph-root"); }],
  ["schema-version", (s) => { s.version = 2; }],
  ["coverage-unreferenced", (s) => { s.omitFromManifest = [":coverage-c0"]; }],
];

for (const [rule, mutate] of mutations) {
  test(`the checker reports ${rule}`, async () => {
    const findings = await run(mutate);
    const hit = findings.find((finding) => finding.rule === rule);
    assert.ok(hit, `expected ${rule}, got ${JSON.stringify(findings)}`);
    assert.ok(hit.file.length > 0 && hit.message.length > 0);
  });
}

test("a declared local kind with a definition is accepted", async () => {
  const findings = await run((s) => {
    setPair(find(s.nodes, ":node-impl"), "kit:kind", ":kind-widget");
    s.nodes.push(block(":kind-widget", "kit:GraphKindDefinition", [["rdfs:comment", S("A widget-specific thing.")]]));
    s.declaredKinds = [":kind-widget"];
  });
  assert.deepEqual(findings, []);
});

test("B14: only Terraform counts as deployment evidence in the pilot", async () => {
  const findings = await run((s, repo) => {
    setPair(find(s.coverage, ":coverage-compose"), "kit:status", "kit:covered");
    dropPair(find(s.coverage, ":coverage-compose"), "kit:reason");
    setPair(find(s.evidence, ":evidence-e6"), "kit:path", S("docker-compose.yml"));
    setPair(find(s.evidence, ":evidence-e6"), "kit:blobId", S(blobId(repo.dir, "docker-compose.yml")));
  });
  assert.ok(findings.some((f) => f.rule === "evidence-role-mismatch" && /docker-compose/.test(f.message)));
  assert.equal(findings.some((f) => f.rule === "evidence-out-of-coverage"), false);
});

test("syntax, noncanonical order, a wrong namespace and two graph resources are reported", async () => {
  const cases = [
    ["turtle-syntax", (s, r) => { s.after = () => r.write(`${ROOT}/nodes.ttl`, "@prefix : <x> .\n[ ] a :b .\n"); }],
    ["turtle-noncanonical", (s, r) => { s.after = () => r.write(`${ROOT}/nodes.ttl`,
      ttl(s.nodes).replace(":node-design", ":aaa").replace(":node-impl", ":node-design").replace(":aaa", ":node-impl")); }],
    ["namespace-mismatch", (s, r) => { s.after = () => r.write(`${ROOT}/nodes.ttl`, ttl(s.nodes, "https://other.example/x#")); }],
    ["graph-resource-count", (s, r) => { s.nodes.push(block(":graph-two", "kit:SourceKnowledgeGraph", [["kit:schemaVersion", 1]])); }],
  ];
  for (const [rule, mutate] of cases) {
    let findings;
    await withScratchRepo(async (repo) => {
      const spec = widgets(repo);
      mutate(spec, repo);
      writeGraph(repo, spec);
      spec.after?.();
      repo.commit("graph");
      const tree = treeFromRevision(repo.dir, "HEAD");
      findings = checkTree({ tree, config: loadCheckConfig(tree) });
    });
    assert.ok(findings.some((f) => f.rule === rule), `${rule}: ${JSON.stringify(findings)}`);
  }
});

test("a missing ontology Turtle, a disabled graph and a missing schema are setup errors or findings", async () => {
  await withScratchRepo(async (repo) => {
    widgets(repo);
    repo.remove("docs/ontology.ttl");
    repo.commit("no ttl");
    assert.throws(() => loadCheckConfig(treeFromRevision(repo.dir, "HEAD")), (e) => e instanceof CheckSetupError && /build-ontology/.test(e.message));
  });
  await withScratchRepo(async (repo) => {
    widgets(repo);
    repo.write("ontology.config.json", JSON.stringify({ ontologyPath: "docs/ontology.md" }));
    repo.commit("disabled");
    assert.throws(() => loadCheckConfig(treeFromRevision(repo.dir, "HEAD")), CheckSetupError);
  });
});

test("unknown predicates on known resources are rejected", async () => {
  const findings = await run((s) => setPair(find(s.nodes, ":node-impl"), "kit:typo", "kit:test"));
  assert.ok(findings.some((f) => f.rule === "bad-value" && /kit:typo/.test(f.message)));
});

test("a missing schema is reported", async () => {
  await withScratchRepo(async (repo) => {
    widgets(repo);
    repo.remove(`${ROOT}/graph-schema.ttl`);
    repo.commit("missing schema");
    const tree = treeFromRevision(repo.dir, "HEAD");
    assert.ok(checkTree({ tree, config: loadCheckConfig(tree) }).some((f) => f.rule === "schema-missing"));
  });
});
