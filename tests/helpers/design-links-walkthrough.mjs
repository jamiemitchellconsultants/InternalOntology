// Create disposable, pinned examples for the feature #185 owner walkthroughs.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { install } from "../../bin/install-ontology.mjs";
import { serializeTurtle } from "../../templates/scripts/owl-ontology.mjs";
import {
  addDesignDocs, blobId, block, DESIGN_ADRS, DESIGN_FEATURE, find, refreshRecord, rewriteDoc, S, setPair, widgets, writeGraph,
} from "../../templates/scripts/source-graph-test-helpers.mjs";

const [target] = process.argv.slice(2);
if (!target) throw new Error("Usage: node tests/helpers/design-links-walkthrough.mjs <empty-directory>");
const dir = resolve(target);
if (readdirSync(dir).length) throw new Error("Use an empty disposable directory.");

const git = (...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
const write = (relative, content) => {
  const path = join(dir, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
};
const repo = { dir, git, write };
function save(tag) {
  git("add", "--", "AGENTS.md", "docs", "scripts", "src", "tests", "infra", "Widgets.csproj", "README.md",
    "ontology.config.json", "docker-compose.yml", ".github");
  git("commit", "-qm", tag);
  git("tag", tag);
}
git("init", "-q", "-b", "main");
git("config", "user.name", "Design walkthrough fixture");
git("config", "user.email", "test@example.com");
git("config", "commit.gpgsign", "false");
git("config", "tag.gpgSign", "false");
git("config", "core.hooksPath", join(dir, ".no-hooks"));
git("config", "commit.template", "");
install({ target: dir, projectName: "Widgets", withSourceGraph: true });
const spec = widgets(repo);
spec.config.sourceGraph.repositoryUrl = "https://github.com/fixture/widgets";
git("remote", "add", "origin", spec.config.sourceGraph.repositoryUrl + ".git");
const ontology = serializeTurtle([
  { subject: ":Invoice", predicate: "a", object: "owl:Class", objectType: "iri" },
  { subject: ":Invoice", predicate: "rdfs:label", object: "Invoice", objectType: "literal" },
  { subject: ":Invoice", predicate: "rdfs:comment", object: "A request for payment in the synthetic fixture.", objectType: "literal" },
], { namespaceUri: spec.config.namespaceUri });
rewriteDoc(repo, spec, "docs/ontology.ttl", ontology);
rewriteDoc(repo, spec, spec.paths.impl, "class Ledger {\n    void Pay() {}\n}\n");
write("ontology.config.json", JSON.stringify(spec.config, null, 2) + "\n");
writeGraph(repo, spec);
save("schema-1");

const { featurePath } = addDesignDocs(repo, spec);
rewriteDoc(repo, spec, spec.paths.impl, "class Ledger {\n    void PayInvoice() {}\n}\n");
const source = DESIGN_FEATURE.replace("\n\n### Retired behaviours", "\n- **B4 Review payments.**\n### Retired behaviours")
  .replace("| B2 | Ledger |", "| B2 | Planned refund component |");
rewriteDoc(repo, spec, featurePath, source);
const accepted = "docs/adr/0001-use-a-ledger.md";
rewriteDoc(repo, spec, accepted, DESIGN_ADRS[accepted].replace("**Status:** accepted", "**Status:** accepted; amended by ADR 0002"));
const edge = (name, subject, relationship, object, basis, ...evidence) => block(name, "kit:GraphAssertion", [
  ["kit:subject", subject], ["kit:relationship", relationship], ["kit:object", object], ["kit:basis", basis],
  ...evidence.map((iri) => ["kit:evidence", iri]),
]);
spec.nodes.push(block(":node-pay", "kit:GraphNode", [["kit:kind", "kit:source-symbol"], ["rdfs:label", S("PayInvoice")]]));
spec.assertions.push(
  edge(":assertion-component-file", ":node-ledger", "kit:contains", ":node-impl", "kit:direct", ":evidence-e5"),
  edge(":assertion-component-symbol", ":node-ledger", "kit:contains", ":node-pay", "kit:direct", ":evidence-e5"),
  edge(":assertion-symbol-behaviour", ":node-pay", "kit:implements", ":behaviour-payments-B1", "kit:direct", ":evidence-e5", ":evidence-d1"),
  edge(":assertion-tentative", ":behaviour-payments-B1", "kit:depends-on", ":node-money", "kit:inferred", ":evidence-d1", ":evidence-e5"),
  edge(":assertion-symbol-adr", ":node-pay", "kit:documented-by", ":decision-0001", "kit:inferred", ":evidence-e5", ":evidence-d4"),
  edge(":assertion-component-adr", ":node-ledger", "kit:documented-by", ":decision-0002", "kit:direct", ":evidence-e5", ":evidence-d5"),
);
const { code, ...filePaths } = spec.paths;
const snapshot = { ...spec, paths: filePaths };
writeGraph(repo, spec);
save("linked");

const fullPath = "docs/features/payments/02-behaviours.md";
function variant(tag, change) {
  git("switch", "-q", "--detach", "linked");
  const variantSpec = structuredClone(snapshot);
  change(variantSpec);
  writeGraph(repo, variantSpec);
  save(tag);
}
variant("conflict", () => write(fullPath, "**B1 — Pay an invoice.**\n"));
variant("promoted", (s) => {
  rmSync(join(dir, featurePath));
  const fullSource = source.replace("- **B1 Pay an invoice.**", "**B1 — Pay an invoice.**")
    .replace("- **B2 Refund a payment.**", "**B2. Refund a payment.**");
  write(fullPath, fullSource);
  const fullBlob = blobId(dir, fullPath);
  const selectors = s.config.sourceGraph.evidence["selected-document"];
  s.config.sourceGraph.evidence["selected-document"] = selectors.map((selector) => selector === featurePath ? fullPath : selector);
  setPair(find(s.coverage, ":coverage-d0"), "kit:pathSelector", S(fullPath));
  for (const e of s.evidence.filter((item) => item.pairs.some((p) => p.predicate === "kit:path" && p.object === featurePath))) {
    setPair(e, "kit:path", S(fullPath));
    setPair(e, "kit:blobId", S(fullBlob));
  }
  const oldRecord = s.records.find((record) => record.pairs.some((pair) => pair.object === featurePath));
  s.records = s.records.filter((record) => record !== oldRecord);
  s.records.push(refreshRecord(repo, fullPath));
  write("ontology.config.json", JSON.stringify(s.config, null, 2) + "\n");
});
variant("prior-status", (s) => {
  rewriteDoc(repo, s, featurePath, source.replace("### Retired behaviours", "### Older payment methods"));
  const adr = "docs/adr/0002-keep-cheques.md";
  rewriteDoc(repo, s, adr, DESIGN_ADRS[adr].replace("superseded by ADR 0001", "accepted"));
  setPair(find(s.nodes, ":behaviour-payments-B3"), "kit:designStatus", "kit:current");
  setPair(find(s.nodes, ":decision-0002"), "kit:designStatus", "kit:accepted");
  s.assertions = s.assertions.filter((edge) => ![":assertion-d1", ":assertion-d2"].includes(edge.subject));
});
variant("missing", (s) => rewriteDoc(repo, s, featurePath, source.replace("- **B1 Pay an invoice.**", "- Pay an invoice.")));
variant("reused", (s) => rewriteDoc(repo, s, featurePath, source.replace("**B4 Review payments.**", "**B3 Review payments.**")));
variant("reworded", (s) => {
  rewriteDoc(repo, s, featurePath, source.replace("**B1 Pay an invoice.**", "**B1 Pay an open invoice.**"));
  setPair(find(s.nodes, ":behaviour-payments-B1"), "rdfs:label", S("payments#B1 Pay an open invoice"));
});
git("switch", "-q", "--detach", "linked");
console.log(dir);
