import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderSchema } from "../templates/scripts/source-graph-model.mjs";

const template = (rel) => readFileSync(fileURLToPath(new URL(`../templates/${rel}`, import.meta.url)), "utf8");

test("the shipped schema file equals the generated one", () => {
  assert.equal(template("source-graph/graph-schema.ttl"), renderSchema());
});

import { substitute } from "../bin/install-ontology.mjs";
import { checkRevision } from "../templates/scripts/check-source-graph.mjs";
import { treeFromRevision } from "../templates/scripts/source-graph-git.mjs";
import { withTempRepo } from "./helpers/temp-repo.mjs";


const NS = "https://ontology.example/widgets#";

test("the starter graph passes the checker with no coverage but the graph root", async () => {
  await withTempRepo(async (repo) => {
    const values = { GRAPH_ROOT: "docs/source-knowledge-graph", NAMESPACE_URI: NS };
    repo.write("docs/source-knowledge-graph/manifest.ttl", substitute(template("source-graph/manifest.ttl"), values));
    repo.write("docs/source-knowledge-graph/nodes.ttl", substitute(template("source-graph/nodes.ttl"), values));
    repo.write("docs/source-knowledge-graph/graph-schema.ttl", renderSchema());
    repo.write("docs/ontology.md", "# Widgets — Application Ontology\n");
    repo.write("docs/ontology.ttl", `@prefix : <${NS}> .\n`);
    repo.write("ontology.config.json", JSON.stringify({ ontologyPath: "docs/ontology.md", namespaceUri: NS, sourceGraph: { enabled: true } }));
    repo.git("add", "-A"); repo.git("commit", "-q", "-m", "starter");
    assert.deepEqual(checkRevision(treeFromRevision(repo.dir, "HEAD")), []);
  });
});

test("the protocol carries each instruction the behaviours require", () => {
  const text = template("protocol/source-graph-protocol.md");
  for (const pattern of [/query-source-graph\.mjs search/, /assertion/, /inferred/, /tentative/, /coverage/, /STALE/,
    /ontology term/, /refresh record/, /git rev-parse :/, /check-source-graph\.mjs --staged --base/, /does not mean the claims are true/,
    /\{\{GRAPH_ROOT\}\}/]) assert.match(text, pattern);
  assert.doesNotMatch(text, /graphify|tree-sitter|roslyn|javaparser/i);
});

test("no installed graph markdown contains a backticked PascalCase term", () => {
  for (const rel of ["protocol/source-graph-protocol.md", "docs/source-knowledge-graph.md"]) {
    const prose = template(rel).replace(/^```[\s\S]*?^```/gm, "");
    assert.doesNotMatch(prose, /`[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*`/, rel);
  }
});
