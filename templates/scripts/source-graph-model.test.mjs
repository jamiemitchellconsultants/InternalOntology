import { test } from "node:test";
import assert from "node:assert/strict";
import { CORE, matchSelector, refreshIdFor, renderSchema, loadGraph, resolveCoverage } from "./source-graph-model.mjs";
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
  assert.match(schema, /^\s*kit:schemaVersion 1 ;$/m);
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
