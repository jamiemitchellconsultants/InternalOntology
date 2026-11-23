import { validateConfig, normaliseRepoRelativePath } from "./ontology-config.mjs";
import { parseTurtle } from "./owl-ontology.mjs";
import { lineCount, changedPaths, treeFromIndex, treeFromRevision } from "./source-graph-git.mjs";
import { parseGraphTurtle } from "./source-graph-turtle.mjs";
import { BEHAVIOUR_IRI, DECISION_IRI, behaviourIri, behavioursFile, decisionIri, readBehaviours, readDecision } from "./source-graph-design-docs.mjs";
import { appendFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CORE, DESIGN_STATUSES, NODE_PREDICATE_VERSIONS, ROLE_KEYS, introducedIn, loadGraph, matchSelector, resolveCoverage, refreshIdFor } from "./source-graph-model.mjs";

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
  "kit:GraphNode": { "kit:kind": "iri", "rdfs:label": "string", "kit:denotes": "iri?", "kit:designStatus": "iri?", "kit:evidence": "iri*" },
  "kit:GraphAssertion": { "kit:subject": "iri", "kit:relationship": "iri", "kit:object": "iri", "kit:basis": "iri", "kit:evidence": "iri+" },
  "kit:GraphEvidence": { "kit:path": "string", "kit:startLine": "integer", "kit:endLine": "integer", "kit:blobId": "string", "kit:role": "iri" },
  "kit:GraphCoverage": { "kit:pathSelector": "string", "kit:status": "iri", "kit:priority": "integer", "kit:reason": "string?" },
  "kit:GraphRefreshRecord": { "kit:path": "string", "kit:blobId": "string?", "kit:deleted": "integer?", "kit:reviewOutcome": "iri" },
  "kit:GraphKindDefinition": { "rdfs:comment": "string" }, "kit:GraphRelationshipDefinition": { "rdfs:comment": "string" },
};
const REFS = {
  "kit:GraphAssertion": { "kit:subject": "kit:GraphNode", "kit:object": "kit:GraphNode", "kit:evidence": "kit:GraphEvidence" },
  "kit:SourceKnowledgeGraph": { "kit:coverage": "kit:GraphCoverage", "kit:refreshRecord": "kit:GraphRefreshRecord", "kit:declaresKind": "kit:GraphKindDefinition", "kit:declaresRelationship": "kit:GraphRelationshipDefinition" },
  "kit:GraphNode": { "kit:evidence": "kit:GraphEvidence" },
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
  const validVersion = (n) => Number.isInteger(n) && n >= 1 && n <= CORE.schemaVersion;
  for (const m of manifests) if (!validVersion(Number(value(m, "kit:schemaVersion"))) || version !== CORE.schemaVersion) add(m, "schema-version", "schema version does not match core version");
  const validVersions = manifests.map((m) => Number(value(m, "kit:schemaVersion"))).filter(validVersion);
  const manifestVersion = validVersions.length ? Math.min(...validVersions) : NaN;
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
    if (validVersion(manifestVersion)) {
      const needs = new Set(), need = (iri, n) => { if (n > manifestVersion && !needs.has(iri)) { needs.add(iri); add(r, "schema-version-too-old", `${iri} needs kit:schemaVersion ${n}`); } };
      if (r.type === "kit:GraphNode") {
        for (const p of r.values("kit:kind")) need(p.object, introducedIn(p.object));
        for (const p of r.values("kit:designStatus")) need(p.object, introducedIn(p.object));
        for (const [predicate, n] of Object.entries(NODE_PREDICATE_VERSIONS)) if (r.values(predicate).length) need(predicate, n);
      }
      if (r.type === "kit:GraphAssertion") for (const p of r.values("kit:relationship")) need(p.object, introducedIn(p.object));
    }
    const refs = REFS[r.type] || {};
    for (const [predicate, type] of Object.entries(refs)) for (const p of r.values(predicate)) if (graph.resources.get(p.object)?.type !== type) add(r, "dangling-reference", `${predicate} references missing ${p.object}`);
    if (r.type === "kit:GraphNode") {
      const kind = value(r, "kit:kind"), declared = manifests.some((m) => m.values("kit:declaresKind").some((p) => p.object === kind));
      if (kind && !CORE.kinds.includes(kind) && !(declared && graph.resources.get(kind)?.type === "kit:GraphKindDefinition")) add(r, "unknown-kind", `unknown kind ${kind}`);
      if (kind === "kit:concept" && !value(r, "kit:denotes")) add(r, "missing-predicate", "concept node requires kit:denotes");
      else if (kind === "kit:concept" && !ontology.has(value(r, "kit:denotes"))) add(r, "denotes-missing", `ontology lacks ${value(r, "kit:denotes")}`);
      const statuses = r.values("kit:designStatus").map((p) => p.object), evidence = r.values("kit:evidence");
      if (Object.hasOwn(DESIGN_STATUSES, kind)) {
        if (statuses.length !== 1 || !DESIGN_STATUSES[kind].includes(statuses[0])) add(r, "design-status", `${kind} needs one of ${DESIGN_STATUSES[kind].join(", ")}`);
        if (evidence.length !== 1) add(r, "design-evidence", `${kind} needs exactly one kit:evidence`);
      } else {
        if (statuses.length) add(r, "design-status", `${kind} cannot carry kit:designStatus`);
        if (evidence.length) add(r, "design-evidence", `${kind} cannot carry kit:evidence`);
      }
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
      let validPath = false;
      try { validPath = typeof path === "string" && !!path.trim() && normaliseRepoRelativePath(path, "evidence path") === path; }
      catch { /* The path is invalid and is reported below. */ }
      if (!validPath) add(r, "evidence-path-missing", `invalid path ${JSON.stringify(path)}`);
      else if (!tree.has(path)) add(r, "evidence-path-missing", `${path} is missing`);
      if (validPath && resolveCoverage(graph, path).status !== "kit:covered") add(r, "evidence-out-of-coverage", `${path} is outside coverage`);
      if (validPath && !(config.sourceGraph.evidence[ROLE_KEYS[role]] || []).some((s) => matchSelector(s, path))) add(r, "evidence-role-mismatch", `${path} does not match ${role}`);
      const badRange = !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start;
      if (badRange || (validPath && tree.has(path) && end > lineCount(tree.read(path)))) add(r, "evidence-range", `${path} has invalid line range ${start}-${end}`);
      if (validPath && tree.has(path)) {
        if (blob !== tree.blobId(path)) add(r, "evidence-blob-mismatch", `${path} expected blob ${tree.blobId(path)}, cited ${blob}`);
      }
    }
  }
  for (const path of tree.paths()) {
    if (resolveCoverage(graph, path).conflict) add({ file: path }, "coverage-conflict", `conflicting coverage for ${path}`);
    if (path.startsWith(graph.root + "/") && resolveCoverage(graph, path).status !== "kit:excluded") add({ file: path }, "root-not-excluded", `${path} is not excluded`);
  }
  if (resolveCoverage(graph, `${graph.root}/probe`).status !== "kit:excluded") add({ file: graph.root }, "root-not-excluded", "graph root is not excluded");
  findings.push(...designFindings(graph, tree));
  return findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule) || a.message.localeCompare(b.message)).map(({ line, ...f }) => f);
}

export function designFindings(graph, tree) {
  const findings = [], conflicts = new Set();
  const add = (r, rule, message) => findings.push({ file: r.file || graph.root, subject: r.iri || "", rule, message, line: 0 });
  const first = (resource, predicate) => resource?.first(predicate)?.object;
  const nodeKind = (iri) => first(graph.resources.get(iri), "kit:kind");

  // Index the assertions once: by subject for replacement links, and in full for the kind check.
  const assertions = graph.byType("kit:GraphAssertion");
  const linksBySubject = new Map();
  for (const a of assertions) {
    const subject = first(a, "kit:subject");
    if (!linksBySubject.has(subject)) linksBySubject.set(subject, []);
    linksBySubject.get(subject).push({ relationship: first(a, "kit:relationship"), object: first(a, "kit:object") });
  }

  // Cache the document reads: one behaviours lookup per feature slug, one ADR read per number.
  const behaviourFiles = new Map(), behaviourLists = new Map(), decisions = new Map();
  const locate = (slug) => {
    if (!behaviourFiles.has(slug)) behaviourFiles.set(slug, behavioursFile(tree, slug));
    return behaviourFiles.get(slug);
  };
  const declarations = (located) => {
    if (!behaviourLists.has(located.path)) behaviourLists.set(located.path, readBehaviours(tree.text(located.path), { lite: located.lite }));
    return behaviourLists.get(located.path);
  };
  const decisionOf = (number) => {
    if (!decisions.has(number)) decisions.set(number, readDecision(tree, number));
    return decisions.get(number);
  };

  const singleEvidence = (node) => {
    const items = node.values("kit:evidence");
    return items.length === 1 ? graph.resources.get(items[0].object) : undefined;
  };
  const isSelectedDocument = (evidence, path) =>
    first(evidence, "kit:role") === "kit:role-selected-document" && first(evidence, "kit:path") === path;

  function linkFinding(node, relationship, expected) {
    const objects = (linksBySubject.get(node.iri) || [])
      .filter((link) => link.relationship === relationship)
      .map((link) => link.object);
    if (objects.length > 1) {
      const wanted = expected ? `exactly one to ${expected}` : "none";
      add(node, "design-replacement", `${node.iri} has ${objects.length} ${relationship} links; expects ${wanted}`);
    } else if (expected && objects[0] !== expected) {
      add(node, "design-replacement", `${node.iri} expects ${relationship} ${expected}`);
    } else if (!expected && objects.length) {
      add(node, "design-replacement", `${node.iri} has ${relationship} ${objects[0]} that its document does not name`);
    }
  }

  function behaviourFinding(node) {
    const match = BEHAVIOUR_IRI.exec(node.iri);
    if (!match) { add(node, "design-iri", `${node.iri} is not :behaviour-<slug>-B<n>`); return; }
    const [, slug, id] = match, located = locate(slug);
    if (!located) { add(node, "design-undeclared", `no behaviours file declares behaviours for ${slug}`); return; }
    if (located.conflict) {
      if (!conflicts.has(slug)) {
        conflicts.add(slug);
        add({ file: located.conflict[0] }, "design-file-conflict", `${located.conflict[0]} and ${located.conflict[1]} both declare behaviours`);
      }
      return;
    }
    const evidence = singleEvidence(node);
    if (!evidence) return;
    if (!isSelectedDocument(evidence, located.path)) {
      add(node, "design-evidence", `evidence must be a selected-document item for ${located.path}`);
      return;
    }
    const declared = declarations(located).filter((d) => String(d.id) === id);
    if (declared.length > 1) { add(node, "design-id-reused", `${located.path} declares B${id} more than once`); return; }
    const line = Number(first(evidence, "kit:startLine")), here = declared.find((d) => d.line === line);
    if (!here) {
      const where = Number.isInteger(line) ? `${located.path}:${line}` : located.path;
      add(node, "design-undeclared", `${where} does not declare B${id}`);
      return;
    }
    const label = `${slug}#B${id} ${here.title}`;
    if (first(node, "rdfs:label") !== label) { add(node, "design-label", `label must be ${JSON.stringify(label)}`); return; }
    const status = here.retired ? "kit:retired" : "kit:current";
    if (first(node, "kit:designStatus") !== status) { add(node, "design-status", `${node.iri} must be ${status}`); return; }
    const replaced = here.retired && here.replacement ? behaviourIri(here.replacementSlug ?? slug, here.replacement) : null;
    linkFinding(node, "kit:replaced-by", replaced);
  }

  function decisionFinding(node) {
    const match = DECISION_IRI.exec(node.iri);
    if (!match) { add(node, "design-iri", `${node.iri} is not :decision-<NNNN>`); return; }
    const number = match[1], decision = decisionOf(number);
    if (!decision) { add(node, "design-undeclared", `no ADR ${number} in docs/adr`); return; }
    if (decision.duplicates.length) {
      add(node, "design-undeclared", `ADR ${number} has more than one file: ${[decision.path, ...decision.duplicates].join(", ")}`);
      return;
    }
    const evidence = singleEvidence(node);
    if (!evidence) return;
    if (!isSelectedDocument(evidence, decision.path)) {
      add(node, "design-evidence", `evidence must be a selected-document item for ${decision.path}`);
      return;
    }
    const start = Number(first(evidence, "kit:startLine")), end = Number(first(evidence, "kit:endLine"));
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      add(node, "design-undeclared", `${decision.path} does not declare ADR ${number} on its title and Status lines`);
      return;
    }
    if (decision.titleLine === null || decision.statusLine === null || start !== decision.titleLine || end !== decision.statusLine) {
      add(node, "design-undeclared", `${decision.path} does not declare ADR ${number} on lines ${start}-${end}`);
      return;
    }
    const label = `ADR ${number} ${decision.title}`;
    if (first(node, "rdfs:label") !== label) { add(node, "design-label", `label must be ${JSON.stringify(label)}`); return; }
    if (!["proposed", "accepted", "superseded", "deprecated"].includes(decision.status)) {
      add(node, "design-status", `ADR ${number} has status "${decision.status ?? ""}", which is not proposed, accepted, superseded or deprecated; do not record it as a decision node`);
      return;
    }
    const status = `kit:${decision.status}`;
    if (first(node, "kit:designStatus") !== status) { add(node, "design-status", `${node.iri} must be ${status}`); return; }
    const successor = decision.status === "superseded" && decision.successor ? decisionIri(decision.successor) : null;
    linkFinding(node, "kit:superseded-by", successor);
  }

  for (const node of graph.byType("kit:GraphNode")) {
    const kind = first(node, "kit:kind");
    if (kind === "kit:decision") decisionFinding(node);
    else if (kind === "kit:behaviour") behaviourFinding(node);
  }
  const linkNodeKinds = { "kit:replaced-by": "kit:behaviour", "kit:superseded-by": "kit:decision" };
  for (const link of assertions) {
    const relationship = first(link, "kit:relationship"), subject = first(link, "kit:subject"), object = first(link, "kit:object");
    const kind = linkNodeKinds[relationship];
    if (kind && (nodeKind(subject) !== kind || nodeKind(object) !== kind)) {
      add(link, "design-link-kinds", `${relationship} must join two ${kind} nodes`);
    }
  }
  return findings;
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
function freshness(tree, config, graph, requiredPaths = new Set()) {
  const findings = [], records = recordMap(graph), manifests = graph.byType("kit:SourceKnowledgeGraph");
  const add = (r, rule, message) => findings.push({ file: r?.file || graph.root, subject: r?.iri || "", rule, message });
  for (const [path, list] of records) {
    const covered = resolveCoverage(graph, path).status === "kit:covered";
    if (tree.has(path) && !covered && !requiredPaths.has(path)) continue;
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
  const covered = (g, p) => g && resolveCoverage(g, p).status === "kit:covered";
  const changed = changedPaths(baseTree, headTree);
  const requiredPaths = new Set(changed.filter(({ path }) =>
    !path.startsWith(headGraph.root + "/") && (covered(baseGraph, path) || covered(headGraph, path)))
    .map(({ path }) => path));
  const findings = [...checkTree({ tree: headTree, config }), ...freshness(headTree, config, headGraph, requiredPaths)];
  if (baseGraph) {
    const proposedSelectors = new Set(headGraph.byType("kit:GraphCoverage")
      .map((r) => r.first("kit:pathSelector")?.object));
    const seen = new Set();
    for (const coverage of baseGraph.byType("kit:GraphCoverage")) {
      if (coverage.first("kit:status")?.object !== "kit:covered") continue;
      const selector = coverage.first("kit:pathSelector")?.object;
      if (typeof selector !== "string" || seen.has(selector)) continue;
      seen.add(selector);
      if (!proposedSelectors.has(selector)) findings.push({
        file: `${headGraph.root}/manifest.ttl`, subject: coverage.iri, rule: "coverage-transition",
        message: `base covered selector ${JSON.stringify(selector)} was removed; retain it as covered or as a reasoned unknown/excluded scope`,
      });
    }
  }
  const headRecords = recordMap(headGraph), baseRecords = baseGraph ? recordMap(baseGraph) : new Map();
  for (const { path } of changed) {
    if (!requiredPaths.has(path)) continue;
    const record = headRecords.get(path)?.[0], old = baseRecords.get(path)?.[0], expected = headTree.has(path) ? headTree.blobId(path) : "deleted 1";
    if (!record) { if (!findings.some((f) => f.rule === "refresh-missing" && f.message.includes(path))) findings.push({ file: headGraph.root, subject: "", rule: "refresh-missing", message: `${path} requires ${expected}` }); continue; }
    const nowBlob = record.first("kit:blobId")?.object, nowDeleted = record.first("kit:deleted")?.object;
    const oldBlob = old?.first("kit:blobId")?.object, oldDeleted = old?.first("kit:deleted")?.object;
    if ((headTree.has(path) ? nowBlob !== expected : Number(nowDeleted) !== 1) || (old && nowBlob === oldBlob && nowDeleted === oldDeleted)) {
      if (!findings.some((f) => f.rule === "refresh-stale" && f.message.includes(path))) findings.push({ file: record.file, subject: record.iri, rule: "refresh-stale", message: `${path} requires ${expected} and a changed review record` });
    }
  }
  return findings.sort((a, b) => a.file.localeCompare(b.file) || a.subject.localeCompare(b.subject) || a.rule.localeCompare(b.rule) || a.message.localeCompare(b.message));
}
const INACTIVE = new Set(["kit:retired", "kit:superseded", "kit:deprecated"]);
export function retiredDesignLinks(graph) {
  const inactive = new Map(), replacement = new Map(), assertions = graph.byType("kit:GraphAssertion");
  for (const node of graph.byType("kit:GraphNode")) {
    const status = node.first("kit:designStatus")?.object;
    if (INACTIVE.has(status)) inactive.set(node.iri, status);
  }
  for (const a of assertions) {
    const rel = a.first("kit:relationship")?.object;
    if (rel === "kit:replaced-by" || rel === "kit:superseded-by") replacement.set(a.first("kit:subject")?.object, a.first("kit:object")?.object);
  }
  const reports = [];
  for (const a of assertions) {
    const relationship = a.first("kit:relationship")?.object, subject = a.first("kit:subject")?.object, object = a.first("kit:object")?.object;
    if (relationship === "kit:replaced-by" || relationship === "kit:superseded-by") continue;
    const end = inactive.has(object) ? object : inactive.has(subject) ? subject : null;
    if (end === null) continue;
    reports.push({ assertion: a.iri, subject, relationship, object, inactive: end, status: inactive.get(end), replacement: replacement.get(end) ?? null });
  }
  return reports.sort((a, b) => (a.assertion < b.assertion ? -1 : a.assertion > b.assertion ? 1 : 0));
}
const reportLine = (r, quote = "") => `${quote}${r.subject}${quote} ${r.relationship} ${quote}${r.object}${quote} (${r.status.replace(/^kit:/, "")}${r.replacement ? `, replaced by ${quote}${r.replacement}${quote}` : ""})`;
export function main(argv, { cwd = process.cwd(), stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    let rev, base, head, summary, staged = false, json = false;
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
      if (arg === "--help") { stdout.write("Usage: check-source-graph [--rev REV | --base REV --head REV | --staged] [--json] [--summary FILE]\n"); return 0; }
      if (arg === "--json") json = true;
      else if (arg === "--staged") staged = true;
      else if (arg === "--summary" && argv[i + 1] && !argv[i + 1].startsWith("--")) summary = argv[++i];
      else if (["--rev", "--base", "--head"].includes(arg) && argv[i + 1] && !argv[i + 1].startsWith("--")) { const v = argv[++i]; if (arg === "--rev") rev = v; else if (arg === "--base") base = v; else head = v; }
      else throw new CheckSetupError(`invalid option ${arg}`);
    }
    if ((staged && (rev || head)) || (head && !base) || (rev && base)) throw new CheckSetupError("incompatible revision options");
    const tree = staged ? treeFromIndex(cwd) : treeFromRevision(cwd, head || rev || "HEAD");
    const findings = base || staged ? checkPullRequest({ baseTree: treeFromRevision(cwd, base || "HEAD"), headTree: tree }) : checkRevision(tree);
    const reports = retiredDesignLinks(loadGraph(tree, loadCheckConfig(tree)));
    const label = `${staged ? "candidate tree" : "revision"} ${tree.id}`;
    if (json) stdout.write(JSON.stringify({ revision: tree.id, ok: !findings.length, findings, reports }) + "\n");
    else {
      stdout.write(`${findings.length ? "source graph checked" : "source graph ok"}: ${label}\n`);
      if (!findings.length) stdout.write("structurally valid; whether each claim is true is for maintainers to review\n");
      for (const f of findings) stderr.write(`${f.file}: ${f.subject ? f.subject + ": " : ""}${f.rule}: ${f.message}\n`);
      if (reports.length) stdout.write(`retired design links: ${reports.length}\n${reports.map((r) => `${r.assertion}: ${reportLine(r)}\n`).join("")}`);
    }
    if (summary) appendFileSync(summary, `### Retired design links\n\n${reports.length ? reports.map((r) => `- \`${r.assertion}\`: ${reportLine(r, "`")}\n`).join("") : "None.\n"}`);
    return findings.length ? 1 : 0;
  } catch (error) { stderr.write(`${error.message}\n`); return 2; }
}

let isEntryPoint = false;
try { isEntryPoint = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); }
catch { /* An unresolvable argument cannot name this module. */ }
if (isEntryPoint) {
  process.exitCode = main(process.argv.slice(2));
}
