import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderSchema, refreshIdFor } from "../templates/scripts/source-graph-model.mjs";
import { canonicalProblems, parseGraphTurtle, GRAPH_PREFIXES } from "../templates/scripts/source-graph-turtle.mjs";

const template = (rel) => readFileSync(fileURLToPath(new URL(`../templates/${rel}`, import.meta.url)), "utf8");

test("the shipped schema file equals the generated one", () => {
  assert.equal(template("source-graph/graph-schema.ttl"), renderSchema());
});

import { substitute, install } from "../bin/install-ontology.mjs";
import { join } from "node:path";
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

const protocol = template("protocol/source-graph-protocol.md");
const has = (text, phrases) => { for (const phrase of phrases) assert.ok(text.includes(phrase), phrase); };

test("B1–B4: the graph protocol makes the agent look up before naming code", () => {
  has(protocol, ["node scripts/query-source-graph.mjs concept <Term>", "Use the ontology's exact name as the name or as its distinguishing part",
    "follow its naming and say in your reply which node you matched", "add it to the ontology first",
    "never link new code to an approximate existing concept", "name the conflict in your reply and in the pull request body"]);
});

test("B6–B12: the graph protocol records what was built and proposes narrow coverage", () => {
  has(protocol, ["a `kit:implements` assertion from the source element to the concept node", "record a `kit:source-symbol` node",
    "assert `kit:contains` from its file's node", "Leave existing file-level entries that the change does not touch as they are",
    "the narrowest selector that holds the new code", "Never widen excluded scope", "quoting the exclusion's reason",
    "add a \"Graph changes\" section", "stays unrecorded, with the reason", "Record only source that exists at the pull request's revision"]);
});

test("B18, B26, B37, B45: authoring pointer, settlement rule and Turtle-first order", () => {
  has(protocol, ["read \"Authoring graph entries\" in `docs/source-knowledge-graph.md`", "Never accept, reject or defer a graph naming result",
    "apply its correction to the graph or the code", "Write graph changes in Turtle only", "Never write or edit the generated Markdown by hand"]);
  assert.ok(protocol.indexOf("Write graph changes in Turtle only") < protocol.indexOf("node scripts/render-source-graph.mjs"));
});

test("the graph protocol keeps one line per paragraph", () => {
  assert.doesNotMatch(protocol, /[^\n]\n(?![\n#]|$)/);
});

test("B5: an install splices the stronger protocol into AGENTS.md", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withSourceGraph: true });
    const agents = readFileSync(join(repo.dir, "AGENTS.md"), "utf8");
    has(agents, ["query-source-graph.mjs concept <Term>", "Never accept, reject or defer a graph naming result", "docs/source-knowledge-graph/README.md"]);
    assert.doesNotMatch(agents, /\{\{GRAPH_ROOT\}\}/);
  });
});

const runbook = template("docs/source-knowledge-graph.md");
const authoring = runbook.slice(runbook.indexOf("## Authoring graph entries"), runbook.indexOf("## Recover a source snapshot"));

test("B13–B19: the authoring section covers label, kind, link, evidence, refinement, declining and the reply", () => {
  assert.ok(runbook.indexOf("## Author and review in one PR") < runbook.indexOf("## Authoring graph entries"));
  for (const heading of ["### Label", "### Kind", "### Concept link", "### Evidence", "### Refine without changing identity",
    "### Decline what has no source", "### Write, check, then render", "### Reply",
    "### Example: a symbol that implements a concept", "### Example: widening coverage for new code"]) {
    assert.ok(authoring.includes(`\n${heading}\n`), heading);
  }
  has(authoring, ["the ontology term exactly", "exactly as written in source", "its repository-relative path", "Declare a local kind",
    "keep its node or assertion IRI", "the graph records only implemented source", "Never write or edit the generated Markdown by hand"]);
  for (const line of ["Label:", "Kind:", "Concept link:", "Evidence:", "Check:"]) assert.match(authoring, new RegExp(`^${line} `, "m"));
});

test("B7 and B9: every Turtle example is canonical graph Turtle and refresh IDs match their paths", () => {
  const header = `@prefix : <${NS}> .\n@prefix kit: <${GRAPH_PREFIXES.kit}> .\n@prefix rdfs: <${GRAPH_PREFIXES.rdfs}> .\n`;
  const examples = [...authoring.matchAll(/```turtle\n([\s\S]*?)```/g)].map((m) => m[1]);
  assert.equal(examples.length, 3);
  for (const example of examples) {
    const text = `${header}\n${example}`;
    assert.deepEqual(canonicalProblems(text), [], example.split("\n")[0]);
    for (const b of parseGraphTurtle(text).blocks.filter((b) => b.type === "kit:GraphRefreshRecord")) {
      assert.equal(b.subject, refreshIdFor(b.pairs.find((p) => p.predicate === "kit:path").object));
    }
  }
  for (const pattern of [/kit:source-symbol/, /kit:contains/, /"src\/Downloads\/\*\*"/, /kit:covered/]) assert.match(authoring, pattern);
});

test("B45: the authoring order is Turtle, check, then render, and both examples end with it", () => {
  const order = authoring.slice(authoring.indexOf("### Write, check, then render"), authoring.indexOf("### Reply"));
  assert.ok(order.indexOf("check-source-graph.mjs --staged --base") < order.indexOf("node scripts/render-source-graph.mjs"));
  assert.ok(order.includes("render-source-graph.mjs --check --staged"));
  for (const example of authoring.split("### Example:").slice(1)) assert.match(example, /write, check and render order/);
});

test("B20: the check workflow writes reports to the step summary in both steps and stays read-only", () => {
  const workflow = template("github/workflows/source-graph-check.yml");
  assert.equal(workflow.match(/--summary "\$GITHUB_STEP_SUMMARY"/g)?.length, 2);
  assert.match(workflow, /^permissions:\n  contents: read\n/m);
});
