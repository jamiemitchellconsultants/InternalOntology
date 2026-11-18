// Scenarios for #122 shared by the acceptance tests and the person-run walkthrough setup. Each one works on a repository
// that already has the kit installed with --with-source-graph and uses only the installed scripts and runbook.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const NS = "https://ontology.example/widgets#";
const HEADER = `@prefix : <${NS}> .\n@prefix kit: <https://ontology-kit.dev/schema#> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n`;

export const load = (repo, name) => import(pathToFileURL(join(repo.dir, "scripts", name)).href);
export const read = (repo, rel) => readFileSync(join(repo.dir, rel), "utf8");
export const commit = (repo, message) => { repo.git("add", "-A"); repo.git("commit", "-q", "-m", message); return repo.git("rev-parse", "HEAD").trim(); };

export async function installedModules(repo) {
  return { h: await load(repo, "source-graph-test-helpers.mjs"), turtle: await load(repo, "source-graph-turtle.mjs"), model: await load(repo, "source-graph-model.mjs") };
}

function runbookFences(repo, heading, { parseGraphTurtle }) {
  const doc = read(repo, "docs/source-knowledge-graph.md");
  const start = doc.indexOf(`### ${heading}`);
  if (start === -1) throw new Error(`runbook has no "${heading}" section`);
  const next = doc.indexOf("\n### ", start + 4);
  const section = doc.slice(start, next === -1 ? doc.length : next);
  return [...section.matchAll(/```turtle\n([\s\S]*?)```/g)].map((m) => parseGraphTurtle(HEADER + m[1]).blocks);
}

function stampBlobs(repo, blocks, { blobId }) {
  for (const b of blocks) {
    const path = b.pairs.find((p) => p.predicate === "kit:path")?.object;
    for (const pair of b.pairs) if (pair.predicate === "kit:blobId") pair.object = blobId(repo.dir, path);
  }
  return blocks;
}

function place(spec, blocks) {
  const into = { "kit:GraphNode": "nodes", "kit:GraphAssertion": "assertions", "kit:GraphEvidence": "evidence", "kit:GraphCoverage": "coverage", "kit:GraphRefreshRecord": "records" };
  for (const b of blocks) {
    if (!into[b.type]) throw new Error(`unexpected block ${b.type}`);
    spec[into[b.type]].push(b);
  }
}

export function addTerm(repo, term) {
  repo.write("docs/ontology.ttl", `${read(repo, "docs/ontology.ttl")}\n:${term} a owl:Class .\n`);
}

export function replaceRecord(repo, spec, h, path) {
  spec.records = spec.records.filter((r) => !r.pairs.some((p) => p.predicate === "kit:path" && p.object === path));
  spec.records.push(h.refreshRecord(repo, path, "kit:graph-updated"));
}

const lines = (count, at, text) => Array.from({ length: count }, (_, i) => (i + 1 === at ? text : `// line ${i + 1}`)).join("\n") + "\n";

// The runbook's first example applied to the widgets graph and staged; the caller runs the check against `base`.
export async function symbolScenario(repo) {
  const { h, turtle } = await installedModules(repo);
  const spec = h.widgets(repo);
  const base = commit(repo, "base graph");
  const path = "src/Sessions/SessionRemovalService.cs";
  repo.write(path, lines(12, 12, "public sealed class SessionRemovalService { }"));
  addTerm(repo, "SessionRemoval");
  const [blocks] = runbookFences(repo, "Example: a symbol that implements a concept", turtle);
  place(spec, stampBlobs(repo, blocks, h));
  spec.nodes.push(h.block(":node-session-removal-file", "kit:GraphNode", [["kit:kind", "kit:source-file"], ["rdfs:label", h.S(path)]]));
  spec.records.push(h.refreshRecord(repo, path, "kit:graph-updated"));
  replaceRecord(repo, spec, h, "docs/ontology.ttl");
  h.writeGraph(repo, spec);
  repo.git("add", "-A");
  return { base, path };
}

// A base graph whose coverage holds only src/Invoice.cs, committed, with the new code written but not yet recorded.
export async function wideningBase(repo) {
  const { h } = await installedModules(repo);
  const spec = h.widgets(repo);
  h.setPair(h.find(spec.coverage, ":coverage-c0"), "kit:pathSelector", h.S("src/Invoice.cs"));
  spec.config.sourceGraph.evidence.implementation = ["src/Invoice.cs", spec.paths.dep];
  repo.write("ontology.config.json", JSON.stringify(spec.config, null, 2) + "\n");
  h.writeGraph(repo, spec);
  const base = commit(repo, "base graph with narrow coverage");
  const path = "src/Downloads/AssetDownloadRetryPolicy.cs";
  repo.write(path, lines(8, 8, "public sealed class AssetDownloadRetryPolicy { }"));
  addTerm(repo, "AssetDownloadRetry");
  return { spec, base, path };
}

// The runbook's second example applied on top of wideningBase and staged.
export async function wideningScenario(repo, { spec, path }) {
  const { h, turtle, model } = await installedModules(repo);
  const [manifest, entries] = runbookFences(repo, "Example: widening coverage for new code", turtle);
  const record = manifest.find((b) => b.type === "kit:GraphRefreshRecord");
  place(spec, stampBlobs(repo, [...manifest, ...entries], h));
  spec.config.sourceGraph.evidence.implementation.push("src/Downloads/**");
  repo.write("ontology.config.json", JSON.stringify(spec.config, null, 2) + "\n");
  replaceRecord(repo, spec, h, "docs/ontology.ttl");
  h.writeGraph(repo, spec);
  repo.git("add", "-A");
  return { recordIri: record.subject, expectedIri: model.refreshIdFor(path) };
}

// The widgets graph plus an inferred symbol implementation, a containing component and an unlinked term, committed.
export async function lookupScenario(repo) {
  const { h } = await installedModules(repo);
  const spec = h.widgets(repo);
  addTerm(repo, "Payment");
  spec.nodes.push(h.block(":node-invoice-service", "kit:GraphNode", [["kit:kind", "kit:source-symbol"], ["rdfs:label", h.S("InvoiceService")]]),
    h.block(":node-billing", "kit:GraphNode", [["kit:kind", "kit:component"], ["rdfs:label", h.S("Billing")]]));
  spec.assertions.push(
    h.block(":assertion-a7", "kit:GraphAssertion", [["kit:basis", "kit:inferred"], ["kit:evidence", ":evidence-e1"],
      ["kit:object", ":node-invoice"], ["kit:relationship", "kit:implements"], ["kit:subject", ":node-invoice-service"]]),
    h.block(":assertion-a8", "kit:GraphAssertion", [["kit:basis", "kit:direct"], ["kit:evidence", ":evidence-e5"],
      ["kit:object", ":node-invoice-service"], ["kit:relationship", "kit:contains"], ["kit:subject", ":node-billing"]]));
  replaceRecord(repo, spec, h, "docs/ontology.ttl");
  h.writeGraph(repo, spec);
  const pinned = commit(repo, "graph");
  return { spec, pinned };
}
