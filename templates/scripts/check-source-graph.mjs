import { validateConfig, normaliseRepoRelativePath } from "./ontology-config.mjs";
import { parseTurtle } from "./owl-ontology.mjs";
import { lineCount, changedPaths, treeFromIndex, treeFromRevision } from "./source-graph-git.mjs";
import { parseGraphTurtle } from "./source-graph-turtle.mjs";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CORE, ROLE_KEYS, loadGraph, matchSelector, resolveCoverage, refreshIdFor } from "./source-graph-model.mjs";

export class CheckSetupError extends Error {}
export function loadCheckConfig(tree) {
  try {
    if (!tree.has("ontology.config.json")) throw new Error("ontology.config.json missing");
    const config = validateConfig(JSON.parse(tree.text("ontology.config.json")), { ontologyExists: (p) => tree.has(p) });
    if (!config.sourceGraph.enabled) throw new Error("graph-disabled: enable sourceGraph in ontology.config.json");
    const ttl = config.ontologyPath.replace(/\.md$/, ".ttl");
    if (!tree.has(ttl)) throw new Error(`missing ${ttl}; run node scripts/build-ontology.mjs`);
    parseTurtle(tree.text(ttl));
    return config;
  } catch (error) { throw new CheckSetupError(error.message); }
}
const shapes = {
  "kit:SourceKnowledgeGraph": { "kit:schemaVersion": "integer", "kit:coverage": "iri*", "kit:refreshRecord": "iri*", "kit:declaresKind": "iri*", "kit:declaresRelationship": "iri*" },
  "kit:GraphNode": { "kit:kind": "iri", "rdfs:label": "string", "kit:denotes": "iri?" },
  "kit:GraphAssertion": { "kit:subject": "iri", "kit:relationship": "iri", "kit:object": "iri", "kit:basis": "iri", "kit:evidence": "iri+" },
  "kit:GraphEvidence": { "kit:path": "string", "kit:startLine": "integer", "kit:endLine": "integer", "kit:blobId": "string", "kit:role": "iri" },
  "kit:GraphCoverage": { "kit:pathSelector": "string", "kit:status": "iri", "kit:priority": "integer", "kit:reason": "string?" },
  "kit:GraphRefreshRecord": { "kit:path": "string", "kit:blobId": "string?", "kit:deleted": "integer?", "kit:reviewOutcome": "iri" },
  "kit:GraphKindDefinition": { "rdfs:comment": "string" }, "kit:GraphRelationshipDefinition": { "rdfs:comment": "string" },
};
export function checkTree({ tree, config }) {
  const graph = loadGraph(tree, config), findings = [];
  const add = (r, rule, message) => findings.push({ file: r.file || graph.root, subject: r.iri || "", line: r.line || 0, rule, message });
  const value = (r, p) => r.first(p)?.object;
  for (const p of graph.problems) add(p, p.rule, p.message);
  for (const d of graph.duplicates) add({ file: d.files[0], iri: d.iri }, "duplicate-iri", `duplicate IRI in ${d.files.join(", ")}`);
  for (const [file, ns] of graph.namespaces) if (ns !== config.namespaceUri) add({ file }, "namespace-mismatch", `namespace ${ns} differs from ${config.namespaceUri}`);
  const schemaPath = `${graph.root}/graph-schema.ttl`;
  let version;
  if (!tree.has(schemaPath)) add({ file: schemaPath }, "schema-missing", "schema file missing");
  else version = Number(/^\s*kit:schemaVersion (\d+) [;.]$/m.exec(tree.text(schemaPath))?.[1]);
  const manifests = graph.byType("kit:SourceKnowledgeGraph");
  if (manifests.length !== 1) add({ file: graph.root }, "graph-resource-count", `expected one graph resource, got ${manifests.length}`);
  for (const m of manifests) if (Number(value(m, "kit:schemaVersion")) !== CORE.schemaVersion || version !== CORE.schemaVersion) add(m, "schema-version", "schema version does not match core version");
  const ontology = new Set(parseTurtle(tree.text(config.ontologyPath.replace(/\.md$/, ".ttl"))).map((t) => t.subject));
  for (const r of graph.resources.values()) {
    const shape = shapes[r.type];
    if (!shape) { add(r, "bad-value", `unknown class ${r.type}`); continue; }
    const shapeRule = r.type === "kit:GraphCoverage" ? "coverage-malformed" : r.type === "kit:GraphRefreshRecord" ? "refresh-malformed" : null;
    for (const [predicate, typeSpec] of Object.entries(shape)) {
      const pairs = r.values(predicate), optional = /[?*]$/.test(typeSpec), many = /[+*]$/.test(typeSpec), type = typeSpec.replace(/[?*+]$/, "");
      if (!pairs.length && !optional) add(r, shapeRule || (predicate === "kit:basis" ? "missing-basis" : predicate === "kit:evidence" ? "missing-evidence" : "missing-predicate"), `missing ${predicate}`);
      if ((!many && pairs.length > 1) || pairs.some((p) => p.objectType !== type)) add(r, shapeRule || "bad-value", `invalid ${predicate}`);
    }
    const pairs = parseGraphTurtle(tree.text(r.file), r.file).blocks.find((b) => b.subject === r.iri).pairs;
    for (const p of pairs) if (!Object.hasOwn(shape, p.predicate)) add(r, shapeRule || "bad-value", `unknown predicate ${p.predicate}`);
    const refs = r.type === "kit:GraphAssertion" ? { "kit:subject": "kit:GraphNode", "kit:object": "kit:GraphNode", "kit:evidence": "kit:GraphEvidence" } : r.type === "kit:SourceKnowledgeGraph" ? { "kit:coverage": "kit:GraphCoverage", "kit:refreshRecord": "kit:GraphRefreshRecord", "kit:declaresKind": "kit:GraphKindDefinition", "kit:declaresRelationship": "kit:GraphRelationshipDefinition" } : {};
    for (const [predicate, type] of Object.entries(refs)) for (const p of r.values(predicate)) if (graph.resources.get(p.object)?.type !== type) add(r, "dangling-reference", `${predicate} references missing ${p.object}`);
    if (r.type === "kit:GraphNode") {
      const kind = value(r, "kit:kind"), declared = manifests.some((m) => m.values("kit:declaresKind").some((p) => p.object === kind));
      if (kind && !CORE.kinds.includes(kind) && !(declared && graph.resources.get(kind)?.type === "kit:GraphKindDefinition")) add(r, "unknown-kind", `unknown kind ${kind}`);
      if (kind === "kit:concept" && !value(r, "kit:denotes")) add(r, "missing-predicate", "concept node requires kit:denotes");
      else if (kind === "kit:concept" && !ontology.has(value(r, "kit:denotes"))) add(r, "denotes-missing", `ontology lacks ${value(r, "kit:denotes")}`);
    }
    if (r.type === "kit:GraphAssertion") {
      const rel = value(r, "kit:relationship"), declared = manifests.some((m) => m.values("kit:declaresRelationship").some((p) => p.object === rel));
      if (rel && !CORE.relationships.includes(rel) && !(declared && graph.resources.get(rel)?.type === "kit:GraphRelationshipDefinition")) add(r, "unknown-relationship", `unknown relationship ${rel}`);
      const basis = value(r, "kit:basis"); if (basis && !CORE.bases.includes(basis)) add(r, "bad-value", `invalid basis ${basis}`);
    }
    if (["kit:GraphKindDefinition", "kit:GraphRelationshipDefinition"].includes(r.type) && (!r.iri.startsWith(":") || !value(r, "rdfs:comment")?.trim())) add(r, "bad-value", "local definition needs a local IRI and non-empty comment");
    if (r.type === "kit:GraphCoverage") {
      const selector = value(r, "kit:pathSelector"), status = value(r, "kit:status");
      try { if (typeof selector !== "string" || !selector.trim() || normaliseRepoRelativePath(selector, "selector") !== selector) throw new Error(); } catch { add(r, "coverage-malformed", "invalid path selector"); }
      if (!CORE.statuses.includes(status) || (status !== "kit:covered" && !value(r, "kit:reason")?.trim())) add(r, "coverage-malformed", "invalid status or missing gap reason");
      if (!manifests.some((m) => m.values("kit:coverage").some((p) => p.object === r.iri))) add(r, "coverage-unreferenced", "coverage not referenced by graph");
    }
    if (r.type === "kit:GraphEvidence") {
      const path = value(r, "kit:path"), role = value(r, "kit:role"), blob = value(r, "kit:blobId"), start = Number(value(r, "kit:startLine")), end = Number(value(r, "kit:endLine"));
      if (!CORE.roles.includes(role)) add(r, "bad-value", `invalid role ${role}`);
      if (typeof blob !== "string" || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(blob)) add(r, "bad-value", `invalid blob ID for ${path}`);
      if (path && !tree.has(path)) add(r, "evidence-path-missing", `${path} is missing`);
      if (path && resolveCoverage(graph, path).status !== "kit:covered") add(r, "evidence-out-of-coverage", `${path} is outside coverage`);
      if (path && !(config.sourceGraph.evidence[ROLE_KEYS[role]] || []).some((s) => matchSelector(s, path))) add(r, "evidence-role-mismatch", `${path} does not match ${role}`);
      if (path && tree.has(path)) {
        if (blob !== tree.blobId(path)) add(r, "evidence-blob-mismatch", `${path} expected blob ${tree.blobId(path)}, cited ${blob}`);
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > lineCount(tree.read(path))) add(r, "evidence-range", `${path} has invalid line range ${start}-${end}`);
      }
    }
  }
  for (const path of tree.paths()) {
    if (resolveCoverage(graph, path).conflict) add({ file: path }, "coverage-conflict", `conflicting coverage for ${path}`);
    if (path.startsWith(graph.root + "/") && resolveCoverage(graph, path).status !== "kit:excluded") add({ file: path }, "root-not-excluded", `${path} is not excluded`);
  }
  if (resolveCoverage(graph, `${graph.root}/probe`).status !== "kit:excluded") add({ file: graph.root }, "root-not-excluded", "graph root is not excluded");
  return findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule) || a.message.localeCompare(b.message)).map(({ line, ...f }) => f);
}

function configForTree(tree) {
  if (!tree.has("ontology.config.json")) throw new CheckSetupError("ontology.config.json missing");
  try { return validateConfig(JSON.parse(tree.text("ontology.config.json")), { ontologyExists: (p) => tree.has(p) }); }
  catch (error) { throw new CheckSetupError(error.message); }
}
function recordMap(graph) {
  const result = new Map();
  for (const r of graph.byType("kit:GraphRefreshRecord")) {
    const path = r.first("kit:path")?.object;
    if (!result.has(path)) result.set(path, []);
    result.get(path).push(r);
  }
  return result;
}
function freshness(tree, config, graph) {
  const findings = [], records = recordMap(graph), manifests = graph.byType("kit:SourceKnowledgeGraph");
  const add = (r, rule, message) => findings.push({ file: r?.file || graph.root, subject: r?.iri || "", rule, message });
  for (const [path, list] of records) {
    const covered = resolveCoverage(graph, path).status === "kit:covered";
    if (tree.has(path) && !covered) continue;
    for (const r of list) {
      const blob = r.first("kit:blobId")?.object, deleted = r.first("kit:deleted")?.object, outcome = r.first("kit:reviewOutcome")?.object;
      if (list.length > 1 || r.iri !== refreshIdFor(path) || Boolean(blob) === (deleted !== undefined) || (deleted !== undefined && Number(deleted) !== 1) || !CORE.outcomes.includes(outcome) || (blob && !tree.has(path)) || (deleted !== undefined && tree.has(path))) add(r, "refresh-malformed", `invalid refresh record for ${path}`);
      if (!manifests.some((m) => m.values("kit:refreshRecord").some((p) => p.object === r.iri))) add(r, "refresh-unreferenced", `refresh record for ${path} is not referenced`);
    }
  }
  for (const path of tree.paths()) {
    if (path.startsWith(graph.root + "/") || resolveCoverage(graph, path).status !== "kit:covered") continue;
    const r = records.get(path)?.[0], expected = tree.blobId(path);
    if (!r) add(null, "refresh-missing", `${path} requires kit:blobId ${expected}`);
    else if (r.first("kit:blobId")?.object !== expected) add(r, "refresh-stale", `${path} requires kit:blobId ${expected}`);
  }
  return findings;
}
export function checkRevision(tree) {
  const config = loadCheckConfig(tree), graph = loadGraph(tree, config);
  return [...checkTree({ tree, config }), ...freshness(tree, config, graph)];
}
export function checkPullRequest({ baseTree, headTree }) {
  const baseConfig = configForTree(baseTree), headConfig = configForTree(headTree);
  if (baseConfig.sourceGraph.enabled && (!headConfig.sourceGraph.enabled || headConfig.sourceGraph.root !== baseConfig.sourceGraph.root)) return [{ file: "ontology.config.json", subject: "", rule: "graph-disabled", message: "a pull request cannot disable or relocate the enabled graph" }];
  const config = loadCheckConfig(headTree), headGraph = loadGraph(headTree, config);
  const baseGraph = baseConfig.sourceGraph.enabled ? loadGraph(baseTree, baseConfig) : null;
  const findings = [...checkTree({ tree: headTree, config }), ...freshness(headTree, config, headGraph)];
  const headRecords = recordMap(headGraph), baseRecords = baseGraph ? recordMap(baseGraph) : new Map();
  const covered = (g, p) => g && resolveCoverage(g, p).status === "kit:covered";
  for (const { path } of changedPaths(baseTree, headTree)) {
    if (path.startsWith(headGraph.root + "/") || !(covered(baseGraph, path) || covered(headGraph, path))) continue;
    const record = headRecords.get(path)?.[0], old = baseRecords.get(path)?.[0], expected = headTree.has(path) ? headTree.blobId(path) : "deleted 1";
    if (!record) { if (!findings.some((f) => f.rule === "refresh-missing" && f.message.includes(path))) findings.push({ file: headGraph.root, subject: "", rule: "refresh-missing", message: `${path} requires ${expected}` }); continue; }
    const nowBlob = record.first("kit:blobId")?.object, nowDeleted = record.first("kit:deleted")?.object;
    const oldBlob = old?.first("kit:blobId")?.object, oldDeleted = old?.first("kit:deleted")?.object;
    if ((headTree.has(path) ? nowBlob !== expected : Number(nowDeleted) !== 1) || (old && nowBlob === oldBlob && nowDeleted === oldDeleted)) {
      if (!findings.some((f) => f.rule === "refresh-stale" && f.message.includes(path))) findings.push({ file: record.file, subject: record.iri, rule: "refresh-stale", message: `${path} requires ${expected} and a changed review record` });
    }
  }
  return findings;
}
export function main(argv, { cwd = process.cwd(), stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    let rev, base, head, staged = false, json = false;
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
      if (arg === "--help") { stdout.write("Usage: check-source-graph [--rev REV | --base REV --head REV | --staged] [--json]\n"); return 0; }
      if (arg === "--json") json = true;
      else if (arg === "--staged") staged = true;
      else if (["--rev", "--base", "--head"].includes(arg) && argv[i + 1] && !argv[i + 1].startsWith("--")) { const v = argv[++i]; if (arg === "--rev") rev = v; else if (arg === "--base") base = v; else head = v; }
      else throw new CheckSetupError(`invalid option ${arg}`);
    }
    if ((staged && (rev || head)) || (head && !base) || (rev && base)) throw new CheckSetupError("incompatible revision options");
    const tree = staged ? treeFromIndex(cwd) : treeFromRevision(cwd, head || rev || "HEAD");
    const findings = base || staged ? checkPullRequest({ baseTree: treeFromRevision(cwd, base || "HEAD"), headTree: tree }) : checkRevision(tree);
    const label = `${staged ? "candidate tree" : "revision"} ${tree.id}`;
    if (json) stdout.write(JSON.stringify({ revision: tree.id, ok: !findings.length, findings }) + "\n");
    else {
      stdout.write(`${findings.length ? "source graph checked" : "source graph ok"}: ${label}\n`);
      if (!findings.length) stdout.write("structurally valid; whether each claim is true is for maintainers to review\n");
      for (const f of findings) stderr.write(`${f.file}: ${f.subject ? f.subject + ": " : ""}${f.rule}: ${f.message}\n`);
    }
    return findings.length ? 1 : 0;
  } catch (error) { stderr.write(`${error.message}\n`); return 2; }
}

let isEntryPoint = false;
try { isEntryPoint = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); }
catch { /* An unresolvable argument cannot name this module. */ }
if (isEntryPoint) {
  process.exitCode = main(process.argv.slice(2));
}
