import { pathToFileURL } from "node:url";
import { treeFromRevision } from "./source-graph-git.mjs";
import { loadCheckConfig } from "./check-source-graph.mjs";
import { loadGraph, resolveCoverage } from "./source-graph-model.mjs";

const val = (r, p) => r?.first(p)?.object;
const idFor = (id) => id.startsWith(":") || id.startsWith("kit:") ? id : `:${id}`;
export function openGraph(cwd, rev = "HEAD") {
  const tree = treeFromRevision(cwd, rev), config = loadCheckConfig(tree);
  return { tree, config, graph: loadGraph(tree, config) };
}
function nodeView(r) { return r && { iri: r.iri, label: val(r, "rdfs:label"), kind: val(r, "kit:kind"), denotes: val(r, "kit:denotes") }; }
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
  for (const m of copy.matches || []) for (const e of m.assertions) mark(e);
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
    const [command, ...values] = args, { graph, tree } = openGraph(cwd, opts.rev), workingTree = treeFromRevision(cwd, opts.working);
    let result;
    if (command === "search" && values.length) result = search(graph, values);
    else if ((command === "neighbors" || command === "node") && values.length === 1) result = neighbors(graph, values[0]);
    else if (command === "path" && values.length === 2 && Number.isInteger(opts.maxDepth) && opts.maxDepth >= 0) result = findPaths(graph, values[0], values[1], { maxDepth: opts.maxDepth });
    else if (command === "coverage") result = {};
    else throw new Error("invalid graph query");
    const paths = command === "coverage" ? values : [];
    result = { ...annotate(result, { graphTree: tree, workingTree }), coverage: coverageReport(graph, paths) };
    if (opts.json) { stdout.write(JSON.stringify(result) + "\n"); return 0; }
    stdout.write(`graph revision ${result.graphRevision}\nworking revision ${result.workingRevision}\n${result.stale ? "STALE\n" : ""}`);
    const print = (a) => {
      stdout.write(`${a.iri} basis: ${a.basis?.replace("kit:", "")}${a.tentative ? " (tentative)" : ""}\n${a.subject?.iri} ${a.relationship} ${a.object?.iri}\n`);
      for (const e of a.evidence) stdout.write(`${e.path}:${e.startLine}-${e.endLine} ${e.role} ${e.blobId} ${e.status}\n`);
    };
    for (const m of result.matches || []) { stdout.write(`${m.node.iri} ${m.node.label}\n`); m.assertions.forEach(print); }
    if (result.node) stdout.write(`${result.node.iri} ${result.node.label} ${result.node.denotes || ""}\n`);
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
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
