import { createHash } from "node:crypto";
import { treeFromRevision } from "./source-graph-git.mjs";
import { loadCheckConfig, checkRevision } from "./check-source-graph.mjs";
import { loadGraph, resolveCoverage } from "./source-graph-model.mjs";

export const FORMAT_VERSION = 1;
export const PROVENANCE_PREFIX = "<!-- ontology-kit-source-graph ";
const COMMIT_ID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const FINGERPRINT = /^[a-f0-9]{64}$/;
const PROVENANCE_END = " -->\n";

export class RenderError extends Error {
  constructor(message, code = 2) { super(message); this.name = "RenderError"; this.code = code; }
}

export function readRenderInput(tree) {
  try {
    const config = loadCheckConfig(tree);
    if (!config.sourceGraph.repositoryUrl) throw new RenderError("sourceGraph.repositoryUrl is required to render source permalinks");
    const findings = checkRevision(tree);
    if (findings.length) throw new RenderError(findings.map((f) => `${f.file}: ${f.subject || ""}: ${f.rule}: ${f.message}`).join("\n"));
    const graph = loadGraph(tree, config);
    const { markdownPath, repositoryUrl } = config.sourceGraph;
    const paths = new Set(["ontology.config.json", config.ontologyPath, config.ontologyPath.replace(/\.md$/, ".ttl")]);
    for (const path of tree.paths()) {
      if (path !== markdownPath && ((path.startsWith(graph.root + "/") && path.endsWith(".ttl")) ||
          resolveCoverage(graph, path).status === "kit:covered")) paths.add(path);
    }
    paths.delete(markdownPath);
    const inventory = [...paths].sort().map((path) => [path, tree.blobId(path)]);
    const fingerprint = createHash("sha256").update(JSON.stringify([FORMAT_VERSION, inventory])).digest("hex");
    return { tree, config, graph, markdownPath, repositoryUrl, inventory, fingerprint };
  } catch (error) {
    if (error instanceof RenderError) throw error;
    throw new RenderError(error.message);
  }
}

function metadata({ sourceRevision, fingerprint }) {
  if (typeof sourceRevision !== "string" || typeof fingerprint !== "string" ||
      !COMMIT_ID.test(sourceRevision) || !FINGERPRINT.test(fingerprint)) {
    throw new RenderError("invalid source graph provenance: expected a full source commit ID and SHA-256 fingerprint");
  }
  return { format: FORMAT_VERSION, sourceRevision, fingerprint };
}

export function encodeProvenance(value) {
  return PROVENANCE_PREFIX + JSON.stringify(metadata(value)) + PROVENANCE_END;
}

export function parseProvenance(markdown) {
  if (typeof markdown !== "string") throw new RenderError("missing generated source graph provenance");
  const end = markdown.indexOf("\n");
  const line = end < 0 ? markdown : markdown.slice(0, end + 1);
  if (Buffer.byteLength(line, "utf8") > 4096 || !line.startsWith(PROVENANCE_PREFIX) ||
      !line.endsWith(PROVENANCE_END) || markdown.split(PROVENANCE_PREFIX).length !== 2) {
    throw new RenderError("invalid or oversized generated source graph provenance");
  }
  let parsed;
  try { parsed = JSON.parse(line.slice(PROVENANCE_PREFIX.length, -PROVENANCE_END.length)); }
  catch { throw new RenderError("invalid source graph provenance JSON"); }
  if (!parsed || Array.isArray(parsed) || parsed.format !== FORMAT_VERSION ||
      Object.keys(parsed).length !== 3 || Object.keys(parsed).some((key) => !["format", "sourceRevision", "fingerprint"].includes(key))) {
    throw new RenderError("unsupported or invalid source graph provenance fields");
  }
  const result = metadata(parsed);
  if (encodeProvenance(result) !== line) throw new RenderError("source graph provenance must have one canonical set of fields");
  return result;
}

function sourceInput(cwd, revision) {
  let tree;
  try { tree = treeFromRevision(cwd, revision); }
  catch { throw new RenderError(`source snapshot ${revision} is unavailable; retrieve it during preparation or use --source-rev HEAD`); }
  return readRenderInput(tree);
}

const sameInventory = (a, b) => JSON.stringify(a.inventory) === JSON.stringify(b.inventory);

export function chooseSource({ cwd, candidate, explicitSourceRev }) {
  if (candidate.tree.kind !== "commit") throw new RenderError("source selection requires a committed canonical revision");
  if (explicitSourceRev !== undefined) {
    const source = sourceInput(cwd, explicitSourceRev);
    if (!sameInventory(source, candidate)) throw new RenderError("source projection does not match current committed input");
    return source;
  }
  if (!candidate.tree.has(candidate.markdownPath)) return candidate;
  const recorded = parseProvenance(candidate.tree.text(candidate.markdownPath));
  const source = sourceInput(cwd, recorded.sourceRevision);
  if (source.fingerprint !== recorded.fingerprint) throw new RenderError("source graph provenance fingerprint does not match its source snapshot");
  return sameInventory(source, candidate) ? source : candidate;
}
