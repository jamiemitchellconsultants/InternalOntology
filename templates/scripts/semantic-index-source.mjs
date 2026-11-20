import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { CONFIG_FILENAME, validateConfig } from "./ontology-config.mjs";
import { treeFromRevision } from "./source-graph-git.mjs";

const MAX_BLOB_BYTES = 8 * 1024 * 1024;
const PASSAGE_BYTES = 2048;
const OVERLAP_LINES = 8;
const sourceFields = ["path", "blobId", "startLine", "endLine", "position"];

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

function problem(code, message) {
  return Object.assign(new Error(message), { code });
}

function digest(tuple) {
  return createHash("sha256").update(JSON.stringify(tuple)).digest("hex");
}

export function hashScope({ include, exclude }) {
  return digest(["scope-v1", include, exclude]);
}

export function hashEmbedding({ model, revision, dimensions, documentPrefix, queryPrefix }) {
  return digest(["openai-embeddings-v1", model, revision, dimensions, documentPrefix, queryPrefix]);
}

function regularBlob(tree, path) {
  return ["100644", "100755"].includes(tree.entryMode(path));
}

export function resolveIndexContext(cwd, env) {
  let root;
  let configurationTree;
  let policy;
  const ref = env.ONTOLOGY_INDEX_CONFIG_REF ?? "refs/remotes/origin/HEAD";
  try {
    root = git(cwd, ["rev-parse", "--show-toplevel"]).replace(/\r?\n$/, "");
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(ref)) {
      if (!ref.startsWith("refs/")) throw new Error("Expected a full ref");
      git(root, ["check-ref-format", ref]);
    }
    configurationTree = treeFromRevision(root, ref);
    if (!regularBlob(configurationTree, CONFIG_FILENAME)) throw new Error("Missing committed configuration");
    const raw = JSON.parse(configurationTree.readBounded(CONFIG_FILENAME, MAX_BLOB_BYTES).toString("utf8"));
    policy = validateConfig(raw, { ontologyExists: (path) => configurationTree.has(path) }).semanticIndex;
  } catch {
    throw problem("config", "Read valid semantic index settings from a trusted committed ref. Fetch the default branch or set ONTOLOGY_INDEX_CONFIG_REF.");
  }
  if (!policy?.enabled) throw problem("disabled", "Semantic indexing is disabled in the trusted configuration.");
  let sourceTree;
  try {
    sourceTree = treeFromRevision(root, "HEAD");
  } catch {
    throw problem("unborn", "Semantic indexing needs a readable source commit at HEAD.");
  }
  return {
    root, sourceTree, configurationCommit: configurationTree.id, policy,
    scopeDigest: hashScope(policy.scope), embeddingDigest: hashEmbedding(policy.embedding),
  };
}

export function isIndexPath(path) {
  return typeof path === "string" && !/[\\\0]/.test(path) && !/^[A-Za-z]:/.test(path) &&
    !path.split("/").some((part) => !part || part === "." || part === "..");
}

function isInScope(path, { include, exclude }) {
  const matches = (selector) => selector.endsWith("/") ? path.startsWith(selector) : path === selector;
  return include.some(matches) && !exclude.some(matches);
}

export function listIndexEntries(tree, scope) {
  return tree.paths().filter((path) => isIndexPath(path) && regularBlob(tree, path) && isInScope(path, scope))
    .map((path) => ({ path, blobId: tree.blobId(path) }));
}

function* pieces(text) {
  let line = 0;
  for (const [body] of text.matchAll(/[^\n]*\n|[^\n]+$/g)) {
    line += 1;
    const bytes = Buffer.byteLength(body);
    if (bytes <= PASSAGE_BYTES) {
      yield { text: body, line, bytes, whole: true };
      continue;
    }
    let fragment = "";
    let size = 0;
    for (const point of body) {
      const width = Buffer.byteLength(point);
      if (size + width > PASSAGE_BYTES) {
        yield { text: fragment, line, bytes: size, whole: false };
        fragment = "";
        size = 0;
      }
      fragment += point;
      size += width;
    }
    if (size) yield { text: fragment, line, bytes: size, whole: false };
  }
}

export function readIndexPassages(tree, entry) {
  const data = tree.readBounded(entry.path, MAX_BLOB_BYTES);
  if (data.includes(0)) return [];
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(data);
  } catch {
    return [];
  }
  const passages = [];
  let window = [];
  let size = 0;
  const emit = () => {
    const body = window.map((piece) => piece.text).join("");
    if (body.trim()) passages.push({
      ...entry, startLine: window[0].line, endLine: window.at(-1).line, position: passages.length, text: body,
    });
  };
  for (const piece of pieces(text)) {
    if (size + piece.bytes > PASSAGE_BYTES) {
      emit();
      const overlap = [];
      size = 0;
      for (const prior of window.slice(-OVERLAP_LINES).reverse()) {
        if (!prior.whole || size + prior.bytes + piece.bytes > PASSAGE_BYTES) break;
        overlap.unshift(prior);
        size += prior.bytes;
      }
      window = overlap;
    }
    window.push(piece);
    size += piece.bytes;
  }
  emit();
  return passages;
}

export function hasIndexEdits({ root, sourceTree, policy }) {
  const staged = git(root, ["diff", "--cached", "--name-only", "--no-renames", "-z", sourceTree.id, "--"]);
  const unstaged = git(root, ["diff", "--name-only", "--no-renames", "-z", "--"]);
  return (staged + unstaged).split("\0").some((path) => isIndexPath(path) && isInScope(path, policy.scope));
}

export async function verifyIndexSource(tree, scope, records) {
  function* expectedRecords() {
    for (const entry of listIndexEntries(tree, scope)) yield* readIndexPassages(tree, entry);
  }
  const expected = expectedRecords();
  const fail = () => { throw new Error("Index source references do not match the approved Git commit."); };
  for await (const record of records) {
    const next = expected.next();
    if (next.done || sourceFields.some((key) => record[key] !== next.value[key])) fail();
  }
  if (!expected.next().done) fail();
}
