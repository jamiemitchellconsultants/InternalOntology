import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { install } from "../bin/install-ontology.mjs";
import { withTempRepo } from "./helpers/temp-repo.mjs";
import { widgets, writeGraph, find, setPair, S } from "../templates/scripts/source-graph-test-helpers.mjs";

test("B6: an installed reader exposes a conflicting label alongside the canonical ontology link", async () => {
  await withTempRepo(async (repo) => {
    repo.git("symbolic-ref", "HEAD", "refs/heads/main");
    install({ target: repo.dir, projectName: "Widgets", withSourceGraph: true });
    if (process.env.SOURCE_GRAPH_ACCEPTANCE_SCRIPT_ROOT) {
      cpSync(process.env.SOURCE_GRAPH_ACCEPTANCE_SCRIPT_ROOT, join(repo.dir, "scripts"),
        { recursive: true, force: true });
    }
    const spec = widgets(repo);
    setPair(find(spec.nodes, ":node-invoice"), "rdfs:label", S("Bill"));
    writeGraph(repo, spec);
    repo.git("add", "-A");
    repo.git("commit", "-q", "-m", "record conflicting label");

    const graph = JSON.parse(execFileSync(process.execPath,
      ["scripts/query-source-graph.mjs", "neighbors", "node-invoice", "--json"],
      { cwd: repo.dir, encoding: "utf8" }));
    assert.equal(graph.node.label, "Bill");
    assert.equal(graph.node.denotes, ":Invoice");
    assert.match(readFileSync(join(repo.dir, "docs/ontology.ttl"), "utf8"), /:Invoice a owl:Class/);
    const protocol = readFileSync(join(repo.dir, "AGENTS.md"), "utf8");
    assert.match(protocol, /name the conflict and use\s+the ontology term/);
  });
});
