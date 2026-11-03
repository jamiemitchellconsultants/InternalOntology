import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export async function withScratchRepo(body) {
  const dir = mkdtempSync(join(tmpdir(), "source-graph-"));
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  const write = (rel, text) => {
    const path = join(dir, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  };
  const remove = (rel) => rmSync(join(dir, rel), { force: true });
  const commit = (message) => { git("add", "-A"); git("commit", "-q", "-m", message); return git("rev-parse", "HEAD").trim(); };
  try {
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Graph Test");
    git("config", "commit.gpgsign", "false");
    git("config", "core.hooksPath", join(dir, ".no-hooks"));
    await body({ dir, git, write, remove, commit });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function blobId(dir, rel) {
  return execFileSync("git", ["-C", dir, "hash-object", "--", rel], { encoding: "utf8" }).trim();
}

import { formatGraphTurtle } from "./source-graph-turtle.mjs";
export const NS = "https://ontology.example/widgets#";
export const S = (text) => ({ literal: text });                   // string value marker
export function block(subject, type, pairs) {                      // pairs: [predicate, value]
  return { subject, type, line: 0, pairs: pairs.map(([predicate, value]) =>
    typeof value === "number" ? { predicate, object: String(value), objectType: "integer" }
    : value?.literal !== undefined ? { predicate, object: value.literal, objectType: "string" }
    : { predicate, object: value, objectType: "iri" }) };
}
export const ttl = (blocks, namespace = NS) => formatGraphTurtle({ namespace, blocks });

import { refreshIdFor, renderSchema } from "./source-graph-model.mjs";

export const LANGUAGES = {
  csharp:     { impl: "src/Invoice.cs",   test: "tests/InvoiceTests.cs",  dep: "Widgets.csproj",   code: (n) => `// line ${n}\n` },
  typescript: { impl: "src/invoice.ts",   test: "tests/invoice.test.ts",  dep: "package.json",     code: (n) => `// line ${n}\n` },
  java:       { impl: "src/Invoice.java", test: "tests/InvoiceTest.java", dep: "pom.xml",          code: (n) => `// line ${n}\n` },
  python:     { impl: "src/invoice.py",   test: "tests/test_invoice.py",  dep: "requirements.txt", code: (n) => `# line ${n}\n` },
};
export const ROOT = "docs/source-knowledge-graph";

export function widgets(repo, language = "csharp") {
  const l = LANGUAGES[language];
  const body = (count) => Array.from({ length: count }, (_, i) => l.code(i + 1)).join("");
  repo.write(l.impl, body(6));
  repo.write(l.test, body(4));
  repo.write(l.dep, body(2));
  repo.write("docs/design.md", "# Design\n\nInvoices post to the ledger.\n");
  repo.write("docs/ontology.md", "# Widgets — Application Ontology\n");
  repo.write("docs/ontology.ttl",
    `@prefix : <${NS}> .\n@prefix kit: <https://ontology-kit.dev/schema#> .\n` +
    `@prefix owl: <http://www.w3.org/2002/07/owl#> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n\n:Invoice a owl:Class .\n`);
  repo.write("infra/main.tf", 'resource "aws_s3_bucket" "b" {}\n\n');
  repo.write("docker-compose.yml", "services: {}\n");
  repo.write("README.md", "# Widgets\n");
  const config = {
    ontologyPath: "docs/ontology.md", namespaceUri: NS,
    sourceGraph: { enabled: true, root: ROOT, evidence: {
      implementation: ["src/**", l.dep], test: ["tests/**"], "selected-document": ["docs/design.md"],
      ontology: ["docs/ontology.ttl"], deployment: ["**/*.tf"] } },
  };
  repo.write("ontology.config.json", JSON.stringify(config, null, 2) + "\n");
  const covered = [l.impl, l.test, l.dep, "docs/design.md", "docs/ontology.ttl", "infra/main.tf"];
  const ev = (id, path, start, end, role) => block(`:evidence-${id}`, "kit:GraphEvidence", [
    ["kit:blobId", S(blobId(repo.dir, path))], ["kit:endLine", end], ["kit:path", S(path)],
    ["kit:role", role], ["kit:startLine", start]]);
  const as = (id, subject, relationship, object, basis, evidence) => block(`:assertion-${id}`, "kit:GraphAssertion", [
    ["kit:basis", basis], ["kit:evidence", `:evidence-${evidence}`], ["kit:object", object],
    ["kit:relationship", relationship], ["kit:subject", subject]]);
  const node = (id, kind, label, extra = []) => block(`:node-${id}`, "kit:GraphNode",
    [["kit:kind", kind], ["rdfs:label", S(label)], ...extra]);
  const spec = { language, paths: l, config, covered, version: 1, omitFromManifest: [], declaredKinds: [],
    coverage: [
      block(":coverage-graph-root", "kit:GraphCoverage", [["kit:pathSelector", S(`${ROOT}/**`)],
        ["kit:priority", 1000], ["kit:reason", S("graph files are not reviewed as covered source")], ["kit:status", "kit:excluded"]]),
      ...["src/**", "tests/**", l.dep, "docs/design.md", "docs/ontology.ttl", "infra/**"].map((selector, i) =>
        block(`:coverage-c${i}`, "kit:GraphCoverage", [["kit:pathSelector", S(selector)], ["kit:priority", 10], ["kit:status", "kit:covered"]])),
      block(":coverage-compose", "kit:GraphCoverage", [["kit:pathSelector", S("docker-compose.yml")],
        ["kit:priority", 10], ["kit:reason", S("not an accepted deployment source")], ["kit:status", "kit:unknown"]]),
    ],
    nodes: [
      node("invoice", "kit:concept", "Invoice", [["kit:denotes", ":Invoice"]]),
      node("impl", "kit:source-file", l.impl), node("test", "kit:test", l.test),
      node("money", "kit:dependency", "money"), node("design", "kit:document", "design"),
      node("ledger", "kit:component", "Ledger"), node("main-tf", "kit:deployment-resource", "bucket"),
    ],
    evidence: [
      ev("e1", l.impl, 1, 3, "kit:role-implementation"), ev("e2", l.test, 1, 2, "kit:role-test"),
      ev("e3", l.dep, 1, 1, "kit:role-implementation"), ev("e4", "docs/design.md", 1, 3, "kit:role-selected-document"),
      ev("e5", l.impl, 2, 2, "kit:role-implementation"), ev("e6", "infra/main.tf", 1, 1, "kit:role-deployment"),
    ],
    assertions: [
      as("a1", ":node-impl", "kit:implements", ":node-invoice", "kit:direct", "e1"),
      as("a2", ":node-invoice", "kit:tested-by", ":node-test", "kit:direct", "e2"),
      as("a3", ":node-impl", "kit:depends-on", ":node-money", "kit:direct", "e3"),
      as("a4", ":node-invoice", "kit:documented-by", ":node-design", "kit:direct", "e4"),
      as("a5", ":node-impl", "kit:communicates-with", ":node-ledger", "kit:inferred", "e5"),
      as("a6", ":node-ledger", "kit:deployed-by", ":node-main-tf", "kit:direct", "e6"),
    ],
    records: covered.map((path) => refreshRecord(repo, path)),
  };
  writeGraph(repo, spec);
  return spec;
}

export function refreshRecord(repo, path, outcome = "kit:no-fact-change") {
  return block(refreshIdFor(path), "kit:GraphRefreshRecord",
    [["kit:blobId", S(blobId(repo.dir, path))], ["kit:path", S(path)], ["kit:reviewOutcome", outcome]]);
}

export function writeGraph(repo, spec) {
  const iris = (blocks) => blocks.map((b) => b.subject).filter((s) => !spec.omitFromManifest.includes(s));
  const graph = block(":graph", "kit:SourceKnowledgeGraph", [
    ["kit:schemaVersion", spec.version],
    ...spec.declaredKinds.map((k) => ["kit:declaresKind", k]),
    ...iris(spec.coverage).map((s) => ["kit:coverage", s]),
    ...iris(spec.records).map((s) => ["kit:refreshRecord", s]),
  ]);
  repo.write(`${ROOT}/graph-schema.ttl`, renderSchema());
  repo.write(`${ROOT}/manifest.ttl`, ttl([graph, ...spec.coverage, ...spec.records]));
  repo.write(`${ROOT}/nodes.ttl`, ttl(spec.nodes));
  repo.write(`${ROOT}/assertions/widgets.ttl`, ttl([...spec.assertions, ...spec.evidence]));
}

export const find = (blocks, subject) => blocks.find((b) => b.subject === subject);
export const setPair = (b, predicate, value) => { b.pairs = b.pairs.filter((p) => p.predicate !== predicate)
  .concat(block("", "", [[predicate, value]]).pairs); };
export const dropPair = (b, predicate) => { b.pairs = b.pairs.filter((p) => p.predicate !== predicate); };
