import { test } from "node:test";
import assert from "node:assert/strict";
import { CORE, DESIGN_STATUSES, NODE_PREDICATE_VERSIONS, introducedIn, matchSelector, refreshIdFor, renderSchema, loadGraph, resolveCoverage } from "./source-graph-model.mjs";
import { treeFromRevision } from "./source-graph-git.mjs";
import { withScratchRepo, NS, ttl, block, S } from "./source-graph-test-helpers.mjs";

test("selectors anchor and distinguish * from **", () => {
  const cases = [
    ["src/**", "src/a.cs", true], ["src/**", "src/x/y/a.cs", true], ["src/**", "src", false],
    ["src/*", "src/x/a.cs", false], ["**/*.tf", "main.tf", true], ["**/*.tf", "infra/a/main.tf", true],
    ["**/*.tf", "main.tfx", false], ["a?c", "abc", true], ["a?c", "a/c", false],
    ["docs/a.b", "docs/aXb", false], ["**", ".hidden/file", true], ["x+y(1).txt", "x+y(1).txt", true],
  ];
  for (const [selector, path, expected] of cases) {
    assert.equal(matchSelector(selector, path), expected, `${selector} vs ${path}`);
  }
});

test("a refresh id is stable and hyphenated", () => {
  assert.equal(refreshIdFor("src/a.cs"), refreshIdFor("src/a.cs"));
  assert.match(refreshIdFor("src/a.cs"), /^:refresh-[0-9a-f]{12}$/);
  assert.notEqual(refreshIdFor("src/a.cs"), refreshIdFor("src/b.cs"));
});

test("the generated schema names every core iri and its version", () => {
  const schema = renderSchema();
  for (const iri of Object.values(CORE).flat().filter((v) => typeof v === "string")) {
    assert.match(schema, new RegExp(`^${iri} a `, "m"), iri);
  }
  assert.match(schema, /^\s*kit:schemaVersion 2 ;$/m);
});

test("B22: schema version 2 adds the design kinds, statuses and links", () => {
  assert.equal(CORE.schemaVersion, 2);
  for (const kind of ["kit:behaviour", "kit:decision"]) assert.ok(CORE.kinds.includes(kind), kind);
  for (const rel of ["kit:replaced-by", "kit:superseded-by"]) assert.ok(CORE.relationships.includes(rel), rel);
  assert.deepEqual(CORE.designStatuses, ["kit:current", "kit:retired", "kit:proposed", "kit:accepted", "kit:superseded", "kit:deprecated"]);
  assert.deepEqual(DESIGN_STATUSES, {
    "kit:behaviour": ["kit:current", "kit:retired"],
    "kit:decision": ["kit:proposed", "kit:accepted", "kit:superseded", "kit:deprecated"],
  });
  assert.deepEqual(NODE_PREDICATE_VERSIONS, { "kit:designStatus": 2, "kit:evidence": 2 });
});

test("B22: every value added in version 2 says so, and version 1 values stay at 1", () => {
  for (const iri of ["kit:behaviour", "kit:decision", "kit:replaced-by", "kit:superseded-by", ...CORE.designStatuses]) {
    assert.equal(introducedIn(iri), 2, iri);
  }
  for (const iri of ["kit:concept", "kit:component", "kit:implements", "kit:tested-by", "kit:documented-by", "kit:role-selected-document", "kit:direct", "kit:covered"]) {
    assert.equal(introducedIn(iri), 1, iri);
  }
});

test("B22: the schema defines each new value in words", () => {
  const schema = renderSchema();
  assert.match(schema, /^kit:behaviour a kit:GraphKind ;\n    rdfs:comment "A behaviour an analyst declares in a feature document, identified by its feature slug and id\." \.$/m);
  assert.match(schema, /^kit:superseded-by a kit:GraphRelationship ;\n    rdfs:comment "A superseded decision is superseded by the named decision\." \.$/m);
  assert.match(schema, /^kit:retired a kit:GraphDesignStatus ;\n    rdfs:comment "The behaviour is listed under Retired behaviours\." \.$/m);
});

const config = { sourceGraph: { enabled: true, root: "g", evidence: {} } };
const cov = (id, selector, status, priority, reason) => block(`:coverage-${id}`, "kit:GraphCoverage", [
  ["kit:pathSelector", S(selector)], ["kit:priority", priority], ["kit:status", status],
  ...(reason ? [["kit:reason", S(reason)]] : []),
]);

test("loading reads nested shards, skips the schema and survives one broken file", async () => {
  await withScratchRepo(async (repo) => {
    repo.write("g/graph-schema.ttl", renderSchema());
    repo.write("g/manifest.ttl", ttl([cov("a", "src/**", "kit:covered", 10)]));
    repo.write("g/assertions/deep/x.ttl", ttl([cov("b", "docs/**", "kit:covered", 5)]));
    repo.write("g/broken.ttl", "not turtle at all\n");
    repo.commit("graph");
    const graph = loadGraph(treeFromRevision(repo.dir, "HEAD"), config);
    assert.deepEqual([...graph.resources.keys()].sort(), [":coverage-a", ":coverage-b"]);
    assert.equal(graph.problems.length, 1);
    assert.equal(graph.problems[0].file, "g/broken.ttl");
    assert.equal(graph.namespaces.get("g/manifest.ttl"), NS);
  });
});

test("duplicate iris across files are reported once with both files", async () => {
  await withScratchRepo(async (repo) => {
    repo.write("g/a.ttl", ttl([cov("a", "src/**", "kit:covered", 10)]));
    repo.write("g/b.ttl", ttl([cov("a", "docs/**", "kit:covered", 10)]));
    repo.commit("graph");
    const graph = loadGraph(treeFromRevision(repo.dir, "HEAD"), config);
    assert.deepEqual(graph.duplicates, [{ iri: ":coverage-a", files: ["g/a.ttl", "g/b.ttl"] }]);
  });
});

test("the highest priority wins, equal priority with different status conflicts, unmatched is unknown", async () => {
  await withScratchRepo(async (repo) => {
    repo.write("g/c.ttl", ttl([
      cov("broad", "src/**", "kit:covered", 10),
      cov("hole", "src/generated/**", "kit:excluded", 20, "generated"),
      cov("x", "docs/**", "kit:covered", 5),
      cov("y", "docs/**", "kit:unknown", 5, "not yet"),
    ]));
    repo.commit("graph");
    const graph = loadGraph(treeFromRevision(repo.dir, "HEAD"), config);
    assert.equal(resolveCoverage(graph, "src/a.cs").status, "kit:covered");
    assert.equal(resolveCoverage(graph, "src/generated/a.cs").status, "kit:excluded");
    assert.equal(resolveCoverage(graph, "docs/a.md").conflict, true);
    assert.deepEqual(resolveCoverage(graph, "README.md"), { status: "kit:unknown", coverage: null });
  });
});
