import { createHash } from "node:crypto";
import { parseGraphTurtle, canonicalProblems, GRAPH_PREFIXES } from "./source-graph-turtle.mjs";

export const CORE = {
  schemaVersion: 1,
  kinds: ["kit:concept", "kit:source-file", "kit:source-symbol", "kit:test", "kit:dependency", "kit:document", "kit:deployment-resource", "kit:system", "kit:component"],
  relationships: ["kit:contains", "kit:implements", "kit:tested-by", "kit:depends-on", "kit:documented-by", "kit:calls", "kit:communicates-with", "kit:deployed-by"],
  roles: ["kit:role-implementation", "kit:role-test", "kit:role-selected-document", "kit:role-ontology", "kit:role-deployment"],
  bases: ["kit:direct", "kit:inferred"], statuses: ["kit:covered", "kit:unknown", "kit:excluded"],
  outcomes: ["kit:graph-updated", "kit:no-fact-change"],
};
export const ROLE_KEYS = { "kit:role-implementation": "implementation", "kit:role-test": "test", "kit:role-selected-document": "selected-document", "kit:role-ontology": "ontology", "kit:role-deployment": "deployment" };
export const CORE_DEFINITIONS = Object.fromEntries(Object.values(CORE).flat().filter((v) => typeof v === "string").map((v) => [v, v.slice(4).replaceAll("-", " ")]));
Object.assign(CORE_DEFINITIONS, {
  "kit:concept": "A canonical Ontology concept.", "kit:source-file": "A tracked implementation file.", "kit:source-symbol": "A named code element in a source file.", "kit:test": "A test file or named test case.", "kit:dependency": "A declared package or external dependency.", "kit:document": "A selected design, architecture, or other authored document.", "kit:deployment-resource": "A resource declared by eligible deployment evidence.", "kit:system": "A software system named by reviewed source or selected documents.", "kit:component": "A logical part of a system named by reviewed source or selected documents.",
  "kit:contains": "The subject contains the object.", "kit:implements": "A source element realizes the named concept or behaviour.", "kit:tested-by": "The subject has the named test as evidence of expected behaviour.", "kit:depends-on": "The subject declares or uses the named dependency.", "kit:documented-by": "The subject is described by the named document.", "kit:calls": "A source element invokes another source element.", "kit:communicates-with": "A system or component exchanges information with another.", "kit:deployed-by": "A system or component is deployed through the named resource.",
});
export function renderSchema() {
  let s = `@prefix kit: <${GRAPH_PREFIXES.kit}> .\n@prefix rdfs: <${GRAPH_PREFIXES.rdfs}> .\n\nkit:GraphVocabulary a rdfs:Class ;\n    kit:schemaVersion 1 ;\n    rdfs:comment "Core source graph vocabulary." .\n`;
  for (const [key, type] of [["kinds", "GraphKind"], ["relationships", "GraphRelationship"], ["roles", "GraphRole"], ["bases", "GraphBasis"], ["statuses", "GraphStatus"], ["outcomes", "GraphOutcome"]]) {
    for (const iri of CORE[key]) s += `\n${iri} a kit:${type} ;\n    rdfs:comment "${CORE_DEFINITIONS[iri]}" .\n`;
  }
  return s;
}
export function matchSelector(selector, path) {
  let re = "^";
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (c === "*" && selector[i + 1] === "*") {
      i++;
      if (selector[i + 1] === "/") { re += "(?:.*/)?"; i++; } else re += ".*";
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
  }
  return new RegExp(re + "$", "s").test(path);
}
export const refreshIdFor = (path) => `:refresh-${createHash("sha1").update(path).digest("hex").slice(0, 12)}`;
export function loadGraph(tree, config) {
  const root = config.sourceGraph.root;
  const files = tree.paths().filter((p) => p.startsWith(root + "/") && p.endsWith(".ttl") && p !== `${root}/graph-schema.ttl`).sort();
  const namespaces = new Map(), resources = new Map(), duplicates = [], problems = [];
  for (const file of files) {
    try {
      const text = tree.text(file), parsed = parseGraphTurtle(text, file);
      namespaces.set(file, parsed.namespace);
      for (const problem of canonicalProblems(text)) problems.push({ file, ...problem, rule: "turtle-noncanonical", message: problem.rule });
      for (const b of parsed.blocks) {
        if (resources.has(b.subject)) {
          let duplicate = duplicates.find((d) => d.iri === b.subject);
          if (!duplicate) { duplicate = { iri: b.subject, files: [resources.get(b.subject).file] }; duplicates.push(duplicate); }
          duplicate.files.push(file);
          continue;
        }
        const resource = { iri: b.subject, type: b.type, file, line: b.line,
          values: (predicate) => b.pairs.filter((p) => p.predicate === predicate),
          first: (predicate) => b.pairs.find((p) => p.predicate === predicate) };
        resources.set(b.subject, resource);
      }
    } catch (error) { problems.push({ file, line: error.line ?? 1, rule: "turtle-syntax", message: error.rule ?? error.message }); }
  }
  return { root, namespaces, files, resources, duplicates, problems, byType: (type) => [...resources.values()].filter((r) => r.type === type) };
}
export function resolveCoverage(graph, path) {
  const candidates = graph.byType("kit:GraphCoverage").filter((r) => {
    const selector = r.first("kit:pathSelector"), priority = r.first("kit:priority"), status = r.first("kit:status");
    return selector?.objectType === "string" && priority?.objectType === "integer" && status?.objectType === "iri" && CORE.statuses.includes(status.object) && matchSelector(selector.object, path);
  }).sort((a, b) => Number(b.first("kit:priority").object) - Number(a.first("kit:priority").object) || (a.iri < b.iri ? -1 : 1));
  if (!candidates.length) return { status: "kit:unknown", coverage: null };
  const coverage = candidates[0], status = coverage.first("kit:status").object, priority = Number(coverage.first("kit:priority").object);
  const conflict = candidates.some((r) => Number(r.first("kit:priority").object) === priority && r.first("kit:status").object !== status);
  return { status, coverage, reason: coverage.first("kit:reason")?.object, ...(conflict ? { conflict: true } : {}) };
}
