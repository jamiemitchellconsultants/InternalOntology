import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import { hashScope, isIndexPath } from "./semantic-index-source.mjs";

const STORE = ".ontology-index";
const INDEX = "index-v1.jsonl";
const RECORD_BYTES = 128 * 1024;
const EXPANDED_BYTES = 2 * 1024 ** 3;
const GIT_ID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const HASH = /^[a-f0-9]{64}$/;
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function invalid(reason) {
  return new Error("invalid index: " + reason);
}

function bounds(options) {
  const limits = options?.limits ?? {};
  return {
    recordBytes: Math.min(limits.recordBytes ?? RECORD_BYTES, RECORD_BYTES),
    expandedBytes: Math.min(limits.expandedBytes ?? EXPANDED_BYTES, EXPANDED_BYTES),
  };
}

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

async function checkKind(path, isDirectory, missingAllowed = false) {
  let stat;
  try {
    stat = await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT" && missingAllowed) return false;
    throw error;
  }
  if (stat.isSymbolicLink()) throw new Error("Index storage cannot use a symbolic link.");
  if (isDirectory ? !stat.isDirectory() : !stat.isFile()) throw new Error("Index storage path has the wrong file type.");
  return true;
}

async function storage(root, create) {
  const directory = join(root, STORE);
  const active = join(directory, INDEX);
  await checkKind(directory, true, create);
  const tracked = git(root, "ls-files", "-z", "--", STORE);
  if (tracked) throw new Error("Index storage contains tracked paths.");
  let head;
  try {
    head = git(root, "rev-parse", "--verify", "--quiet", "HEAD").trim();
  } catch (error) {
    if (error.status !== 1) throw error;
  }
  if (head && git(root, "ls-tree", "-z", head, "--", STORE)) {
    throw new Error("Index storage contains tracked paths.");
  }
  try {
    git(root, "check-ignore", "-q", "--no-index", "--", STORE + "/");
  } catch {
    throw new Error("Ignore /" + STORE + "/ in Git before using index storage.");
  }
  if (create) {
    await mkdir(directory, { mode: 0o700, recursive: true });
    await checkKind(directory, true);
  }
  await checkKind(active, false, create);
  return { root, directory, active };
}

function keys(value, fields) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === fields.length && fields.every((key) => Object.hasOwn(value, key));
}

function selectors(items) {
  return Array.isArray(items) && items.every((path, i) =>
    typeof path === "string" && isIndexPath(path.replace(/\/$/, "")) && (i === 0 || items[i - 1] < path));
}

function checkHeader(value) {
  const fields = ["kind", "version", "repository", "sourceCommit", "scope", "scopeDigest", "embeddingDigest", "dimensions"];
  if (!keys(value, fields) || value.kind !== "header" || value.version !== 1) {
    throw invalid("unsupported or malformed header");
  }
  if ((value.repository !== null && (typeof value.repository !== "string" ||
      !/^[a-z0-9][a-z0-9.-]*\/[a-z0-9-]+\/[a-z0-9_.-]+$/.test(value.repository))) ||
      typeof value.sourceCommit !== "string" || !GIT_ID.test(value.sourceCommit) ||
      !keys(value.scope, ["include", "exclude"]) || !selectors(value.scope.include) ||
      !value.scope.include.length || !selectors(value.scope.exclude) ||
      value.scopeDigest !== hashScope(value.scope) || typeof value.embeddingDigest !== "string" ||
      !HASH.test(value.embeddingDigest) || !Number.isInteger(value.dimensions) ||
      value.dimensions < 1 || value.dimensions > 8192) throw invalid("malformed provenance");
  return Object.fromEntries(fields.map((key) => [key, value[key]]));
}

function vectorFrom(value, dimensions) {
  if (typeof value !== "string") throw invalid("vector encoding");
  const bytes = Buffer.from(value, "base64");
  if (bytes.length !== 4 * dimensions || bytes.toString("base64") !== value) throw invalid("vector encoding or dimensions");
  const values = new Float32Array(dimensions);
  for (let i = 0; i < dimensions; i += 1) values[i] = bytes.readFloatLE(i * 4);
  if (!values.every(Number.isFinite) || !values.some((entry) => entry !== 0)) throw invalid("unusable vector");
  return values;
}

function vectorTo(values) {
  const bytes = Buffer.alloc(values.length * 4);
  for (let i = 0; i < values.length; i += 1) bytes.writeFloatLE(values[i], i * 4);
  return bytes.toString("base64");
}

function checkPassage(value, prior, header) {
  const fields = ["kind", "path", "blobId", "startLine", "endLine", "position", "vector"];
  if (!keys(value, fields) || value.kind !== "passage" || !isIndexPath(value.path) ||
      typeof value.blobId !== "string" || !GIT_ID.test(value.blobId) ||
      !Number.isSafeInteger(value.startLine) || value.startLine < 1 || !Number.isSafeInteger(value.endLine) ||
      value.endLine < value.startLine || !Number.isSafeInteger(value.position)) throw invalid("malformed passage");
  const sameFile = value.path === prior?.path;
  if (sameFile ? value.position !== prior.position + 1 || value.blobId !== prior.blobId ||
      value.startLine < prior.startLine || value.endLine < prior.endLine :
      value.position !== 0 || (prior && value.path <= prior.path)) throw invalid("passage order or identity");
  const { kind, vector, ...rest } = value;
  return { ...rest, vector: vectorFrom(vector, header.dimensions) };
}

async function* fileBytes(file) {
  let offset = 0;
  for (;;) {
    const buffer = Buffer.allocUnsafe(64 * 1024);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, offset);
    if (!bytesRead) return;
    offset += bytesRead;
    yield buffer.subarray(0, bytesRead);
  }
}

async function* lines(file, limits) {
  let pending = Buffer.alloc(0);
  let total = 0;
  for await (const bytes of fileBytes(file)) {
    total += bytes.length;
    if (total > limits.expandedBytes) throw invalid("expanded byte limit");
    const data = pending.length ? Buffer.concat([pending, bytes]) : bytes;
    let start = 0;
    for (let end = data.indexOf(10, start); end >= 0; end = data.indexOf(10, start)) {
      if (end - start + 1 > limits.recordBytes) throw invalid("record byte limit");
      yield data.subarray(start, end + 1);
      start = end + 1;
    }
    pending = data.subarray(start);
    if (pending.length >= limits.recordBytes) throw invalid("record byte limit");
  }
  if (pending.length) throw invalid("missing final line delimiter");
}

function parse(bytes) {
  try {
    return JSON.parse(utf8.decode(bytes));
  } catch {
    throw invalid("malformed UTF-8 or JSON record");
  }
}

async function* scan(file, limits) {
  let header;
  let prior;
  let count = 0;
  let footer = false;
  const hash = createHash("sha256");
  for await (const bytes of lines(file, limits)) {
    if (footer) throw invalid("trailing data");
    const value = parse(bytes);
    if (!header) {
      header = checkHeader(value);
      hash.update(bytes);
      yield header;
    } else if (value?.kind === "footer") {
      if (!keys(value, ["kind", "count", "sha256"]) || value.count !== count ||
          value.sha256 !== hash.digest("hex")) throw invalid("record count or digest");
      footer = true;
    } else {
      prior = checkPassage(value, prior, header);
      hash.update(bytes);
      count += 1;
      yield prior;
    }
  }
  if (!footer) throw invalid("missing footer");
}

async function openPath(path, limits) {
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    if (!(await file.stat()).isFile()) throw invalid("expected a regular file");
    let header;
    for await (const entry of scan(file, limits)) header ??= entry;
    return {
      header,
      async *records() {
        let first = true;
        for await (const value of scan(file, limits)) {
          if (!first) yield value;
          first = false;
        }
      },
      bytes: () => fileBytes(file),
      close: () => file.close(),
    };
  } catch (error) {
    await file.close();
    throw error;
  }
}

export async function openIndex(root, options) {
  const { active } = await storage(root, false);
  return openPath(active, bounds(options));
}

async function* serialized(header, records, limits) {
  const hash = createHash("sha256");
  let count = 0;
  function line(value) {
    const bytes = Buffer.from(JSON.stringify(value) + "\n");
    if (bytes.length > limits.recordBytes) throw invalid("record byte limit");
    return bytes;
  }
  const first = line(checkHeader(header));
  hash.update(first);
  yield first;
  for await (const record of records) {
    const { path, blobId, startLine, endLine, position, vector } = record;
    const bytes = line({ kind: "passage", path, blobId, startLine, endLine, position, vector: vectorTo(vector) });
    hash.update(bytes);
    count += 1;
    yield bytes;
  }
  yield line({ kind: "footer", count, sha256: hash.digest("hex") });
}

async function promote(location, input, limits, verify) {
  const path = join(location.directory, "candidate-" + randomUUID());
  const file = await open(path, "wx", 0o600);
  try {
    let total = 0;
    try {
      for await (const chunk of input) {
        const bytes = Buffer.from(chunk);
        total += bytes.length;
        if (total > limits.expandedBytes) throw invalid("expanded byte limit");
        await file.writeFile(bytes);
      }
      await file.sync();
    } finally {
      await file.close();
    }
    const reader = await openPath(path, limits);
    try {
      if (verify) await verify(reader);
    } finally {
      await reader.close();
    }
    // A checkout can change the tracked or ignored paths while the candidate is being built.
    await storage(location.root, true);
    await rename(path, location.active);
  } finally {
    await unlink(path).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

export async function withIndexWriter(root, write, options) {
  const location = await storage(root, true);
  const lock = join(location.directory, "writer.lock");
  let handle;
  try {
    handle = await open(lock, "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST") throw new Error("An index writer holds .ontology-index/writer.lock. Check the owner before recovering it.");
    throw error;
  }
  const limits = bounds(options);
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, host: hostname() }) + "\n");
    return await write({
      replace: ({ header, records }) => promote(location, serialized(header, records, limits), limits),
      importStream: (stream, verify) => promote(location, stream, limits, verify),
    });
  } finally {
    try {
      await handle.close();
    } finally {
      await unlink(lock);
    }
  }
}

export function indexReadiness(header, context) {
  if (header.embeddingDigest !== context.embeddingDigest || header.dimensions !== context.policy.embedding.dimensions) {
    return "incompatible";
  }
  if (header.sourceCommit !== context.sourceTree.id || header.scopeDigest !== context.scopeDigest ||
      header.repository !== (context.policy.release?.repository ?? null)) return "stale";
  return "current";
}
