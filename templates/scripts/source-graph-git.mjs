import { execFileSync } from "node:child_process";

export class GitSourceError extends Error {}

function git(cwd, args, encoding = "utf8") {
  try {
    return execFileSync("git", args, { cwd, encoding, maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    throw new GitSourceError(`git ${args[0]} failed: ${error.stderr?.toString().trim() || error.message}`);
  }
}

function makeTree(cwd, id, treeId, kind) {
  const entries = new Map();
  const cache = new Map();
  for (const record of git(cwd, ["ls-tree", "-r", "-z", "--full-tree", treeId]).split("\0")) {
    if (!record) continue;
    const tab = record.indexOf("\t");
    const [mode, type, sha] = record.slice(0, tab).split(" ");
    if (type === "blob") entries.set(record.slice(tab + 1), sha);
  }
  const paths = [...entries.keys()].sort();
  const read = (path) => {
    const sha = entries.get(path);
    if (!sha) throw new GitSourceError(`path not found in tree: ${path}`);
    if (!cache.has(sha)) cache.set(sha, git(cwd, ["cat-file", "blob", sha], "buffer"));
    return cache.get(sha);
  };
  return { id, kind, revision: id, paths: () => [...paths], has: (path) => entries.has(path),
    blobId: (path) => entries.get(path), read, text: (path) => read(path).toString("utf8") };
}

export function treeFromRevision(cwd, rev) {
  if (typeof rev !== "string" || !rev || rev.startsWith("-")) throw new GitSourceError("invalid revision");
  const id = git(cwd, ["rev-parse", "--verify", "--quiet", `${rev}^{commit}`]).trim();
  const treeId = git(cwd, ["rev-parse", "--verify", "--quiet", `${id}^{tree}`]).trim();
  return makeTree(cwd, id, treeId, "commit");
}

export function treeFromIndex(cwd) {
  const id = git(cwd, ["write-tree"]).trim();
  return makeTree(cwd, id, id, "candidate");
}

export function changedPaths(baseTree, headTree) {
  return [...new Set([...baseTree.paths(), ...headTree.paths()])].sort().flatMap((path) => {
    if (!baseTree.has(path)) return [{ path, change: "added" }];
    if (!headTree.has(path)) return [{ path, change: "deleted" }];
    return baseTree.blobId(path) === headTree.blobId(path) ? [] : [{ path, change: "modified" }];
  });
}

export function lineCount(buffer) {
  if (!buffer.length) return 0;
  let count = 0;
  for (const byte of buffer) if (byte === 10) count++;
  return count + (buffer[buffer.length - 1] === 10 ? 0 : 1);
}
