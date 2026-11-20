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
  const listing = git(cwd, ["ls-tree", "-r", "-z", "--full-tree", treeId], "buffer");
  for (let start = 0; start < listing.length;) {
    const end = listing.indexOf(0, start);
    if (end < 0) throw new GitSourceError("incomplete tree listing");
    const record = listing.subarray(start, end);
    start = end + 1;
    const tab = record.indexOf("\t");
    const [mode, type, sha] = record.subarray(0, tab).toString().split(" ");
    if (type !== "blob") continue;
    const rawPath = record.subarray(tab + 1);
    const path = rawPath.toString("utf8");
    const usableMode = rawPath.equals(Buffer.from(path)) && !entries.has(path) ? mode : undefined;
    entries.set(path, { sha, mode: usableMode });
  }
  const paths = [...entries.keys()].sort();
  const blobId = (path) => entries.get(path)?.sha;
  const requireBlob = (path) => {
    const sha = blobId(path);
    if (!sha) throw new GitSourceError("path not found in tree: " + path);
    return sha;
  };
  const read = (path) => {
    const sha = requireBlob(path);
    if (!cache.has(sha)) cache.set(sha, git(cwd, ["cat-file", "blob", sha], "buffer"));
    return cache.get(sha);
  };
  const readBounded = (path, maxBytes) => {
    const sha = requireBlob(path);
    const size = Number(git(cwd, ["cat-file", "-s", sha]).trim());
    if (!Number.isSafeInteger(size) || size < 0 || size > maxBytes) {
      throw new GitSourceError("blob exceeds the " + maxBytes + "-byte read limit: " + path);
    }
    return git(cwd, ["cat-file", "blob", sha], "buffer");
  };
  return {
    id, kind, revision: id, paths: () => [...paths], has: (path) => entries.has(path),
    blobId, read, readBounded, entryMode: (path) => entries.get(path)?.mode,
    text: (path) => read(path).toString("utf8"),
  };
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
