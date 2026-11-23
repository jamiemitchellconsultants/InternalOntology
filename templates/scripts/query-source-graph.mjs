import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { treeFromRevision } from "./source-graph-git.mjs";
import { loadCheckConfig } from "./check-source-graph.mjs";
import { loadGraph, resolveCoverage } from "./source-graph-model.mjs";
import { parseTurtle } from "./owl-ontology.mjs";
import { parseBehaviourReference, behaviourIri, behavioursFile, readBehaviours } from "./source-graph-design-docs.mjs";

const val = (r, p) => r?.first(p)?.object;
const idFor = (id) => id.startsWith(":") || id.startsWith("kit:") ? id : `:${id}`;
export function openGraph(cwd, rev = "HEAD") {
  const tree = treeFromRevision(cwd, rev), config = loadCheckConfig(tree);
  return { tree, config, graph: loadGraph(tree, config) };
}
function nodeView(r) { return r && { iri: r.iri, label: val(r, "rdfs:label"), kind: val(r, "kit:kind"), denotes: val(r, "kit:denotes"), designStatus: val(r, "kit:designStatus") ?? null }; }
function assertionView(graph, r) {
  const basis = val(r, "kit:basis");
  return { iri: r.iri, relationship: val(r, "kit:relationship"), basis, tentative: basis === "kit:inferred",
    subject: nodeView(graph.resources.get(val(r, "kit:subject"))), object: nodeView(graph.resources.get(val(r, "kit:object"))),
    evidence: r.values("kit:evidence").map((p) => graph.resources.get(p.object)).filter(Boolean).map((e) => ({
      iri: e.iri, path: val(e, "kit:path"), startLine: val(e, "kit:startLine"), endLine: val(e, "kit:endLine"), role: val(e, "kit:role"), blobId: val(e, "kit:blobId") })) };
}
export function neighbors(graph, id) {
  const iri = idFor(id), node = nodeView(graph.resources.get(iri));
  const edges = graph.byType("kit:GraphAssertion").filter((a) => val(a, "kit:subject") === iri || val(a, "kit:object") === iri).map((a) => assertionView(graph, a));
  return { node: node || null, edges };
}
export function search(graph, terms) {
  const words = terms.map((t) => t.toLowerCase());
  const matches = graph.byType("kit:GraphNode").filter((n) => words.every((word) => `${n.iri} ${val(n, "rdfs:label") || ""}`.toLowerCase().includes(word))).map((n) => ({ node: nodeView(n), assertions: neighbors(graph, n.iri).edges }));
  return { matches };
}
export function findPaths(graph, from, to, { maxDepth = 4 } = {}) {
  maxDepth = Math.max(0, Math.min(6, maxDepth));
  const paths = [], target = idFor(to), start = idFor(from);
  function visit(node, seen, edges) {
    if (paths.length >= 20) return;
    if (node === target && edges.length) { paths.push(edges); return; }
    if (edges.length >= maxDepth) return;
    for (const edge of neighbors(graph, node).edges) {
      if (edge.subject?.iri !== node || !edge.object || seen.has(edge.object.iri)) continue;
      visit(edge.object.iri, new Set([...seen, edge.object.iri]), [...edges, edge]);
    }
  }
  visit(start, new Set([start]), []);
  return { paths, maxDepth };
}
const LOCAL_NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const ontologyTurtlePath = (config) => config.ontologyPath.replace(/\.md$/, ".ttl");
export function resolveTerm(tree, config, input) {
  if (typeof input !== "string") return null;
  const name = input.startsWith(config.namespaceUri) ? input.slice(config.namespaceUri.length) : input.startsWith(":") ? input.slice(1) : input;
  if (!LOCAL_NAME.test(name)) return null;
  const subjects = new Set(parseTurtle(tree.text(ontologyTurtlePath(config))).map((t) => t.subject));
  return subjects.has(`:${name}`) ? { iri: `:${name}`, name } : null;
}
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const byIri = (a, b) => compare(a.iri, b.iri);
const bySubjectThenIri = (a, b) => compare(a.subject?.iri ?? "", b.subject?.iri ?? "") || byIri(a, b);
export function conceptImplementations(graph, iri) {
  const denoting = graph.byType("kit:GraphNode").filter((n) => val(n, "kit:denotes") === iri).sort(byIri);
  const targets = new Set(denoting.map((n) => n.iri));
  const implementing = graph.byType("kit:GraphAssertion").filter((a) => val(a, "kit:relationship") === "kit:implements" && targets.has(val(a, "kit:object")))
    .map((a) => assertionView(graph, a))
    .sort(bySubjectThenIri);
  return { term: { iri, name: iri.slice(1) }, denotes: denoting.map(nodeView), implements: implementing };
}
export function behaviourLinks(graph, tree, reference) {
  const parsed = parseBehaviourReference(reference), iri = behaviourIri(parsed.slug, parsed.id);
  const node = graph.resources.get(iri);
  const sorted = (list) => list.sort(bySubjectThenIri);
  if (!node) {
    const file = behavioursFile(tree, parsed.slug);
    const declared = file?.conflict ? { path: null, declared: false, conflict: file.conflict } : file?.path ? { path: file.path, declared: readBehaviours(tree.text(file.path), { lite: file.lite }).some((b) => b.id === parsed.id) } : { path: null, declared: false };
    return { reference, behaviour: null, replacement: null, declared, components: [], symbols: [], tests: [] };
  }
  const assertions = graph.byType("kit:GraphAssertion");
  const group = (relationship, side, kinds) => sorted(assertions.filter((a) => val(a, "kit:relationship") === relationship && val(a, side) === iri)
    .map((a) => assertionView(graph, a)).filter((a) => kinds.includes((side === "kit:object" ? a.subject : a.object)?.kind)));
  const replaced = assertions.find((a) => val(a, "kit:relationship") === "kit:replaced-by" && val(a, "kit:subject") === iri);
  const testedBy = sorted(assertions.filter((a) => val(a, "kit:relationship") === "kit:tested-by" && val(a, "kit:subject") === iri).map((a) => assertionView(graph, a)));
  return { reference, behaviour: nodeView(node), replacement: replaced ? nodeView(graph.resources.get(val(replaced, "kit:object"))) ?? null : null, declared: null,
    components: group("kit:implements", "kit:object", ["kit:component", "kit:system"]),
    symbols: group("kit:implements", "kit:object", ["kit:source-symbol", "kit:source-file"]), tests: testedBy };
}
export function codeLinks(graph, id) {
  const iri = idFor(id), resource = graph.resources.get(iri);
  if (!resource || !graph.byType("kit:GraphNode").includes(resource)) return { node: null, behaviours: [], decisions: [], via: [] };
  const assertions = graph.byType("kit:GraphAssertion");
  const linksOf = (nodeIri) => {
    const from = (relationship, kind) => assertions.filter((a) => val(a, "kit:relationship") === relationship && val(a, "kit:subject") === nodeIri)
      .map((a) => assertionView(graph, a)).filter((a) => a.object?.kind === kind).sort(byIri);
    return { behaviours: from("kit:implements", "kit:behaviour"), decisions: from("kit:documented-by", "kit:decision") };
  };
  const via = assertions.filter((a) => val(a, "kit:relationship") === "kit:contains" && val(a, "kit:object") === iri)
    .map((a) => graph.resources.get(val(a, "kit:subject"))).filter((c) => c && ["kit:component", "kit:system"].includes(val(c, "kit:kind")))
    .sort(byIri).map((c) => ({ component: nodeView(c), ...linksOf(c.iri) }));
  return { node: nodeView(resource), ...linksOf(iri), via };
}
export function coverageReport(graph, paths = []) {
  const inventory = graph.byType("kit:GraphCoverage").map((r) => ({ iri: r.iri, selector: val(r, "kit:pathSelector"), status: val(r, "kit:status"), priority: val(r, "kit:priority"), reason: val(r, "kit:reason") }));
  const files = paths.map((path) => { const result = resolveCoverage(graph, path); return { path, status: result.status, reason: result.reason }; });
  return { inventory, files };
}
export function annotate(result, { graphTree, workingTree }) {
  const copy = structuredClone(result);
  let stale = graphTree.id !== workingTree.id;
  const mark = (a) => { for (const e of a.evidence || []) { e.status = !workingTree.has(e.path) ? "missing" : workingTree.blobId(e.path) === e.blobId ? "current" : "changed"; if (e.status !== "current") stale = true; } };
  for (const e of copy.edges || []) mark(e);
  for (const e of copy.implements || []) mark(e);
  for (const m of copy.matches || []) for (const e of m.assertions) mark(e);
  for (const list of [copy.components, copy.symbols, copy.tests]) for (const e of list || []) mark(e);
  for (const list of [copy.behaviours, copy.decisions]) for (const e of list || []) mark(e);
  for (const v of copy.via || []) for (const e of [...v.behaviours, ...v.decisions]) mark(e);
  for (const path of copy.paths || []) for (const e of path) mark(e);
  return { ...copy, graphRevision: graphTree.id, workingRevision: workingTree.id, stale };
}
export function main(argv, { cwd = process.cwd(), stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const args = [], opts = { rev: "HEAD", working: "HEAD", maxDepth: 4, json: false };
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
      if (arg === "--json") opts.json = true;
      else if (["--rev", "--working-rev", "--max-depth"].includes(arg) && argv[i + 1]) { const v = argv[++i]; if (arg === "--rev") opts.rev = v; else if (arg === "--working-rev") opts.working = v; else opts.maxDepth = Number(v); }
      else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
      else args.push(arg);
    }
    const [command, ...values] = args, { graph, tree, config } = openGraph(cwd, opts.rev), workingTree = treeFromRevision(cwd, opts.working);
    let result;
    if (command === "concept" && values.length === 1) {
      const term = resolveTerm(tree, config, values[0]);
      if (!term) throw new Error(`${values[0]} is not a term in ${ontologyTurtlePath(config)}; try: node scripts/query-source-graph.mjs search ${values[0]}`);
      result = conceptImplementations(graph, term.iri);
    }
    else if (command === "behaviour" && values.length === 1) {
      if (!parseBehaviourReference(values[0])) throw new Error(`${values[0]} is not a behaviour reference; use <slug>#B<n>`);
      result = behaviourLinks(graph, tree, values[0]);
    }
    else if (command === "code" && values.length === 1) {
      result = codeLinks(graph, values[0]);
      if (!result.node) throw new Error(`${idFor(values[0])} is not a graph node; try: node scripts/query-source-graph.mjs search <words>`);
    }
    else if (command === "search" && values.length) result = search(graph, values);
    else if ((command === "neighbors" || command === "node") && values.length === 1) result = neighbors(graph, values[0]);
    else if (command === "path" && values.length === 2 && Number.isInteger(opts.maxDepth) && opts.maxDepth >= 0) result = findPaths(graph, values[0], values[1], { maxDepth: opts.maxDepth });
    else if (command === "coverage") result = {};
    else throw new Error("invalid graph query");
    const fileKind = command === "code" && ["kit:source-file", "kit:test"].includes(result.node.kind);
    const paths = command === "coverage" ? values : fileKind ? [result.node.label] : [];
    result = { ...annotate(result, { graphTree: tree, workingTree }), coverage: coverageReport(graph, paths) };
    if (opts.json) { stdout.write(JSON.stringify(result) + "\n"); return 0; }
    stdout.write(`graph revision ${result.graphRevision}\nworking revision ${result.workingRevision}\n${result.stale ? "STALE\n" : ""}`);
    const print = (a) => {
      stdout.write(`${a.iri} basis: ${a.basis?.replace("kit:", "")}${a.tentative ? " (tentative)" : ""}\n${a.subject?.iri} ${a.relationship} ${a.object?.iri}\n`);
      for (const e of a.evidence) stdout.write(`${e.path}:${e.startLine}-${e.endLine} ${e.role} ${e.blobId} ${e.status}\n`);
    };
    if (result.term) {
      stdout.write(`concept ${result.term.iri}\ndenotes\n`);
      for (const n of result.denotes) stdout.write(`${n.iri} ${n.label}\n`);
      stdout.write("implements\n");
      result.implements.forEach(print);
      const gap = !result.denotes.length ? `No graph node denotes ${result.term.iri}` : !result.implements.length ? `No kit:implements assertion links a source element to ${result.term.iri}` : null;
      if (gap) {
        stdout.write(`${gap}; that does not mean the concept is unimplemented.\n`);
        for (const c of result.coverage.inventory) stdout.write(`${c.selector}: ${c.status}${c.reason ? ` — ${c.reason}` : ""}\n`);
      }
    }
    if (command === "behaviour") {
      const ref = result.reference;
      if (!result.behaviour) {
        const id = `B${parseBehaviourReference(ref).id}`, d = result.declared;
        stdout.write(d.conflict ? `No graph node for ${ref}; ${d.conflict[0]} and ${d.conflict[1]} both declare behaviours.\n` : d.path ? `No graph node for ${ref}; ${d.path} ${d.declared ? "declares" : "does not declare"} ${id}.\n` : `No graph node for ${ref}; no behaviours file declares behaviours for ${parseBehaviourReference(ref).slug}.\n`);
      } else {
        stdout.write(`behaviour ${result.behaviour.iri} ${result.behaviour.label} (${result.behaviour.designStatus?.replace("kit:", "") ?? "no status"})\n`);
        if (result.replacement) stdout.write(`replaced by ${result.replacement.iri} ${result.replacement.label}\n`);
        for (const heading of ["components", "symbols", "tests"]) { stdout.write(`${heading}\n`); result[heading].forEach(print); }
        if (!result.components.length && !result.symbols.length && !result.tests.length) {
          stdout.write(`No graph assertion links ${ref}; that does not mean the behaviour is unimplemented or untested.\n`);
          for (const c of result.coverage.inventory) stdout.write(`${c.selector}: ${c.status}${c.reason ? ` — ${c.reason}` : ""}\n`);
        }
      }
    }
    if (command === "code") {
      const section = (v) => { stdout.write("behaviours\n"); v.behaviours.forEach(print); stdout.write("decisions\n"); v.decisions.forEach(print); };
      stdout.write(`code ${result.node.iri} ${result.node.label}\n`);
      section(result);
      for (const v of result.via) { stdout.write(`via component ${v.component.iri} ${v.component.label}\n`); section(v); }
      if (![result, ...result.via].some((v) => v.behaviours.length || v.decisions.length)) {
        stdout.write(`No behaviour or decision is linked to ${result.node.iri}, directly or via its component; that does not mean the code has no reason to exist.\n`);
        for (const c of fileKind ? result.coverage.files : result.coverage.inventory) stdout.write(`${c.path || c.selector}: ${c.status}${c.reason ? ` — ${c.reason}` : ""}\n`);
      }
    }
    for (const m of result.matches || []) { stdout.write(`${m.node.iri} ${m.node.label}\n`); m.assertions.forEach(print); }
    if (result.node && command !== "code") stdout.write(`${result.node.iri} ${result.node.label} ${result.node.denotes || ""}\n`);
    (result.edges || []).forEach(print);
    for (const path of result.paths || []) path.forEach((edge, i) => { stdout.write(`step ${i + 1}\n`); print(edge); });
    const empty = (result.matches && !result.matches.length) || (result.edges && !result.edges.length) || (result.paths && !result.paths.length);
    if (empty || command === "coverage") {
      if (empty) stdout.write("No matching graph assertions; topic coverage cannot be determined.\n");
      for (const c of result.coverage.files.length ? result.coverage.files : result.coverage.inventory) stdout.write(`${c.path || c.selector}: ${c.status}${c.reason ? ` — ${c.reason}` : ""}\n`);
    }
    return 0;
  } catch (error) { stderr.write(`${error.message}\n`); return 2; }
}
let isEntryPoint = false;
try { isEntryPoint = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); }
catch { /* An unresolvable argument cannot name this module. */ }
if (isEntryPoint) process.exitCode = main(process.argv.slice(2));
