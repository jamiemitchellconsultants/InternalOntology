import { lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { treeFromIndex, treeFromRevision } from "./source-graph-git.mjs";
import { loadCheckConfig } from "./check-source-graph.mjs";
import { normaliseRepoRelativePath } from "./ontology-config.mjs";
import { chooseSource, parseProvenance, PROVENANCE_PREFIX, readRenderInput, RenderError } from "./source-graph-render-input.mjs";
import { renderMarkdown } from "./source-graph-markdown.mjs";

const regeneration = "Commit canonical source changes, then run node scripts/render-source-graph.mjs and stage the generated Markdown in the same PR.";
const sameInput = (a, b) => JSON.stringify(a.inventory) === JSON.stringify(b.inventory);

function outputTarget(cwd, markdownPath) {
  const root = realpathSync(cwd);
  const normalized = normaliseRepoRelativePath(markdownPath, "output path outside the worktree");
  const target = resolve(root, normalized);
  const rel = relative(root, target);
  if (!normalized || normalized !== markdownPath || isAbsolute(rel) || rel === ".." || rel.startsWith(".." + "/") || rel.startsWith(".." + "\\")) {
    throw new RenderError("output path must remain inside the worktree");
  }
  let path = root;
  for (const segment of normalized.split("/")) {
    path = join(path, segment);
    let stat;
    try { stat = lstatSync(path); } catch (error) { if (error.code === "ENOENT") break; throw error; }
    if (stat.isSymbolicLink()) throw new RenderError(`output path traverses a symbolic link: ${markdownPath}`);
    if (path !== target && !stat.isDirectory()) throw new RenderError(`output ancestor is not a directory: ${markdownPath}`);
    if (path === target) {
      if (!stat.isFile()) throw new RenderError(`output is not a regular file: ${markdownPath}`);
      if (!readFileSync(target, "utf8").startsWith(PROVENANCE_PREFIX)) {
        throw new RenderError(`preserving unmarked authored file ${markdownPath}; select another sourceGraph.markdownPath`);
      }
    }
  }
  return target;
}

export function publishMarkdown({ cwd, markdownPath, markdown, beforeReplace = () => {} }) {
  const target = outputTarget(cwd, markdownPath);
  mkdirSync(dirname(target), { recursive: true });
  outputTarget(cwd, markdownPath);
  const temporary = join(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, markdown, { flag: "wx" });
    beforeReplace();
    outputTarget(cwd, markdownPath);
    renameSync(temporary, target);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function optionsFor(argv) {
  const result = {}, seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (seen.has(arg)) throw new RenderError(`duplicate option ${arg}`);
    seen.add(arg);
    if (["--help", "--check", "--staged", "--print-source-rev"].includes(arg)) result[arg] = true;
    else if (["--rev", "--source-rev"].includes(arg) && argv[i + 1] && !argv[i + 1].startsWith("-")) result[arg] = argv[++i];
    else throw new RenderError(`invalid option ${arg}`);
  }
  if (result["--help"]) return result;
  const check = result["--check"], inspect = result["--print-source-rev"];
  if ((check && inspect) || (result["--staged"] && (!check || result["--rev"])) ||
      (result["--source-rev"] && (check || inspect)) || (result["--rev"] && !check && !inspect)) {
    throw new RenderError("incompatible source graph rendering modes");
  }
  return result;
}

function documentFrom(tree, path) {
  if (!tree.has(path)) throw new RenderError(`missing generated Markdown ${path}. ${regeneration}`, 1);
  return tree.text(path);
}

function openSource(cwd, revision) {
  let tree;
  try { tree = treeFromRevision(cwd, revision); }
  catch { throw new RenderError(`source snapshot ${revision} is unavailable; retrieve it during checkout/preparation or regenerate with --source-rev HEAD`); }
  return readRenderInput(tree);
}

export function main(argv, { cwd = process.cwd(), stdout = process.stdout, stderr = process.stderr, beforePublish = () => {} } = {}) {
  try {
    const opts = optionsFor(argv);
    if (opts["--help"]) {
      stdout.write("Usage: render-source-graph [--source-rev REV | --check [--rev REV | --staged] | --print-source-rev [--rev REV]]\n");
      return 0;
    }
    if (opts["--print-source-rev"]) {
      const tree = treeFromRevision(cwd, opts["--rev"] || "HEAD");
      const config = loadCheckConfig(tree);
      if (!config.sourceGraph.repositoryUrl) throw new RenderError("sourceGraph.repositoryUrl is required to render source permalinks");
      const recorded = parseProvenance(documentFrom(tree, config.sourceGraph.markdownPath));
      stdout.write(recorded.sourceRevision + "\n");
      return 0;
    }
    if (opts["--check"]) {
      const tree = opts["--staged"] ? treeFromIndex(cwd) : treeFromRevision(cwd, opts["--rev"] || "HEAD");
      const current = readRenderInput(tree);
      const actual = documentFrom(tree, current.markdownPath), recorded = parseProvenance(actual);
      const source = openSource(cwd, recorded.sourceRevision);
      if (!sameInput(current, source) || recorded.fingerprint !== source.fingerprint || actual !== renderMarkdown(source)) {
        throw new RenderError(`stale source graph Markdown ${current.markdownPath}: source projection or generated bytes differ. ${regeneration}`, 1);
      }
      stdout.write(`source graph Markdown current: ${opts["--staged"] ? "candidate tree" : "revision"} ${tree.id}, source ${source.tree.id}\n`);
      return 0;
    }
    const current = readRenderInput(treeFromRevision(cwd, "HEAD"));
    if (!sameInput(current, readRenderInput(treeFromIndex(cwd)))) {
      throw new RenderError(`staged source input differs from HEAD. ${regeneration}`);
    }
    const source = chooseSource({ cwd, candidate: current, explicitSourceRev: opts["--source-rev"] });
    publishMarkdown({ cwd, markdownPath: current.markdownPath, markdown: renderMarkdown(source), beforeReplace() {
      beforePublish();
      if (!sameInput(current, readRenderInput(treeFromIndex(cwd)))) {
        throw new RenderError(`staged input changed during generation. ${regeneration}`);
      }
    } });
    stdout.write(`generated ${current.markdownPath} from source ${source.tree.id}; stage the document before committing\n`);
    return 0;
  } catch (error) {
    stderr.write(`source graph Markdown: ${error.message}\n`);
    return error instanceof RenderError ? error.code : 2;
  }
}

let isEntryPoint = false;
try { isEntryPoint = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); }
catch { /* An unresolvable argument cannot identify this command. */ }
if (isEntryPoint) process.exitCode = main(process.argv.slice(2));
