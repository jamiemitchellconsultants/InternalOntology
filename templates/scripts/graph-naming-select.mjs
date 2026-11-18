// Deterministic choice of what the graph naming review compares (ADR 0024). No model is involved here.
import { catalogOntology } from "./semantic-review-model.mjs";
import { parseTurtle } from "./owl-ontology.mjs";

export const SKIPPED_KINDS = ["kit:source-file", "kit:test", "kit:document"];
export const SYNONYM_KINDS = ["kit:concept", "kit:component", "kit:system", "kit:source-symbol"];

const value = (resource, predicate) => resource?.first(predicate)?.object;

export function memoryTree(files) {
  const texts = new Map(files.map((file) => [file.path, file.text]));
  const paths = [...texts.keys()].sort();
  return { paths: () => [...paths], has: (path) => texts.has(path), text: (path) => texts.get(path) };
}

export function ontologySnapshot({ markdown, turtle, sections }) {
  if (markdown === null || markdown === undefined) return { catalog: null, subjects: new Set(), rows: new Map() };
  const catalog = catalogOntology(markdown, sections);
  const subjects = new Set(turtle ? parseTurtle(turtle).map((triple) => triple.subject) : []);
  const rows = new Map();
  for (const [key, row] of catalog.rows) {
    const name = key.slice(key.indexOf(":") + 1);
    rows.set(name, rows.has(name) ? `${rows.get(name)}\n${row}` : row);
  }
  return { catalog, subjects, rows };
}

export function words(text) {
  return (String(text).match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+|[0-9]+/g) ?? []).map((word) => word.toLowerCase());
}

export function containsCanonical(label, name) {
  const haystack = words(label), needle = words(name);
  if (!needle.length || needle.length > haystack.length) return false;
  for (let start = 0; start + needle.length <= haystack.length; start++) {
    if (needle.every((word, i) => haystack[start + i] === word)) return true;
  }
  return false;
}

function nodesOf(graph) {
  return new Map((graph?.byType("kit:GraphNode") ?? []).map((node) => [node.iri, node]));
}

function implementsOf(graph) {
  return new Map((graph?.byType("kit:GraphAssertion") ?? [])
    .filter((assertion) => value(assertion, "kit:relationship") === "kit:implements")
    .map((assertion) => [assertion.iri, assertion]));
}

function affected(item, baseOntology, headOntology) {
  if (!item) return false;
  if (baseOntology.subjects.has(item) && !headOntology.subjects.has(item)) return true;
  const name = item.slice(1);
  return baseOntology.rows.has(name) && baseOntology.rows.get(name) !== headOntology.rows.get(name);
}

export function selectComparedNodes({ baseGraph, headGraph, baseOntology, headOntology }) {
  const baseNodes = nodesOf(baseGraph), headNodes = nodesOf(headGraph);
  const baseLinks = implementsOf(baseGraph), headLinks = implementsOf(headGraph);
  const assertions = headGraph.byType("kit:GraphAssertion");
  const selected = [];
  for (const node of [...headNodes.values()].sort((a, b) => (a.iri < b.iri ? -1 : 1))) {
    const before = baseNodes.get(node.iri);
    const denotes = value(node, "kit:denotes") ?? null;
    const links = [...headLinks.values()].filter((assertion) => value(assertion, "kit:subject") === node.iri);
    const implemented = links.map((assertion) => {
      const concept = value(assertion, "kit:object");
      return { assertion: assertion.iri, concept, item: value(headNodes.get(concept), "kit:denotes") ?? null };
    });
    const changed = !before || ["rdfs:label", "kit:kind", "kit:denotes"].some((p) => value(before, p) !== value(node, p));
    const linkChanged = links.some((assertion) => {
      const old = baseLinks.get(assertion.iri);
      return !old || ["kit:subject", "kit:object", "kit:relationship"].some((p) => value(old, p) !== value(assertion, p));
    });
    const ontologyChanged = [denotes, ...implemented.map((link) => link.item)].some((item) => affected(item, baseOntology, headOntology));
    if (!changed && !linkChanged && !ontologyChanged) continue;
    const evidence = new Set();
    for (const assertion of assertions) {
      if (value(assertion, "kit:subject") !== node.iri && value(assertion, "kit:object") !== node.iri) continue;
      for (const pair of assertion.values("kit:evidence")) {
        const path = value(headGraph.resources.get(pair.object), "kit:path");
        if (typeof path === "string") evidence.add(path);
      }
    }
    selected.push({ iri: node.iri, kind: value(node, "kit:kind"), label: value(node, "rdfs:label") ?? "", denotes,
      implements: implemented, file: node.file, evidence: [...evidence].sort() });
  }
  return selected;
}

export function formPairs(nodes, headOntology) {
  const names = (headOntology.catalog?.entries ?? []).map((entry) => entry.name);
  const pairs = [];
  let prefiltered = 0;
  for (const node of nodes) {
    if (SKIPPED_KINDS.includes(node.kind)) continue;
    const candidates = [];
    if (node.denotes) candidates.push({ type: "denotes", value: node.denotes });
    for (const link of node.implements) if (link.item) candidates.push({ type: "implements", value: link.item });
    if (!candidates.length && SYNONYM_KINDS.includes(node.kind)) candidates.push({ type: "synonym", value: "" });
    const seen = new Set();
    for (const candidate of candidates) {
      const id = `${candidate.type}\0${candidate.value}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const name = candidate.value ? candidate.value.slice(1) : null;
      const contained = name ? containsCanonical(node.label, name) : names.some((entry) => containsCanonical(node.label, entry));
      if (contained) { prefiltered++; continue; }
      pairs.push({ node: node.iri, kind: node.kind, type: candidate.type, label: node.label, value: candidate.value, name,
        file: node.file, evidence: node.evidence });
    }
  }
  return { pairs, prefiltered };
}
