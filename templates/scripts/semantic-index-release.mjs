import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import { validateConfig } from "./ontology-config.mjs";
import { hashEmbedding, hashScope, verifyIndexSource } from "./semantic-index-source.mjs";
import { indexReadiness, openIndex, withIndexWriter } from "./semantic-index-store.mjs";
import { treeFromRevision } from "./source-graph-git.mjs";

const MAX_ASSET_BYTES = 2 * 1024 ** 3;
const MAX_METADATA_BYTES = 8 * 1024 ** 2;
const GIT_ID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const SHA256 = /^[a-f0-9]{64}$/;

function reject(message) {
  throw Object.assign(new Error(message), { code: "release" });
}

function assertGitId(value) {
  if (typeof value !== "string" || !GIT_ID.test(value)) reject("GitHub did not supply a valid commit or object ID.");
  return value;
}

function assetInfo(raw) {
  if (raw.digest != null && (typeof raw.digest !== "string" ||
      !raw.digest.startsWith("sha256:") || !SHA256.test(raw.digest.slice(7)))) {
    reject("GitHub supplied an invalid asset digest.");
  }
  return { id: raw.id, name: raw.name, bytes: raw.size, sha256: raw.digest?.slice(7) ?? null, state: raw.state };
}

function assetName(commit, context) {
  return ["ontology-index-v1", commit, context.scopeDigest, context.embeddingDigest].join("-") + ".jsonl.gz";
}

function matchingAsset(release, name) {
  const matches = release.assets.filter((asset) => asset.name === name);
  if (matches.length > 1) reject("More than one release asset matches the semantic index.");
  return matches[0];
}

function checkAsset(asset) {
  if (!asset || asset.state !== "uploaded") reject("No compatible uploaded snapshot. Select another release or run refresh.");
  if (!Number.isSafeInteger(asset.bytes) || asset.bytes < 1 || asset.bytes >= MAX_ASSET_BYTES) {
    reject("Release snapshot size must be under 2 GiB.");
  }
}

function requireRepository(context) {
  const repository = context.policy.release?.repository;
  if (!repository) reject("Set semanticIndex.release.repository in the trusted configuration.");
  return repository;
}

function checkedRelease(release, tag) {
  if (!Number.isSafeInteger(release?.id) || release.id < 1 || release.tag !== tag || !Array.isArray(release.assets)) {
    reject("GitHub did not return the selected release.");
  }
  return release;
}

function checkedAncestor(context, commit, allowAncestor) {
  if (commit === context.sourceTree.id) return;
  if (!allowAncestor) reject("The release commit differs from HEAD. Select the exact release or explicitly allow an ancestor.");
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", commit, context.sourceTree.id], {
      cwd: context.root, stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    reject("Git cannot verify the release commit as a local ancestor. Fetch it or select a compatible release.");
  }
}

async function* checkedBytes(stream, asset) {
  let size = 0;
  const hash = createHash("sha256");
  for await (const chunk of stream) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size >= MAX_ASSET_BYTES || size > asset.bytes) reject("Release snapshot exceeds its declared size.");
    hash.update(bytes);
    yield bytes;
  }
  if (size !== asset.bytes || (asset.sha256 && hash.digest("hex") !== asset.sha256)) {
    reject("Release snapshot size or digest mismatch.");
  }
}

export async function downloadIndex({ context, tag, allowAncestor, transport }) {
  try {
    const repository = requireRepository(context);
    const release = checkedRelease(await transport.getRelease(repository, tag), tag);
    const commit = assertGitId(await transport.resolveReleaseCommit(repository, release));
    checkedAncestor(context, commit, allowAncestor);
    const asset = matchingAsset(release, assetName(commit, context));
    checkAsset(asset);
    const tree = treeFromRevision(context.root, commit);
    await withIndexWriter(context.root, async (writer) => {
      const stream = await transport.readAsset(repository, asset);
      const expanded = createGunzip();
      const transfer = pipeline(Readable.from(checkedBytes(stream, asset)), expanded);
      transfer.catch(() => {});
      try {
        await writer.importStream(expanded, async (reader) => {
          await transfer;
          const { header } = reader;
          if (header.repository !== repository || header.sourceCommit !== commit ||
              header.scopeDigest !== context.scopeDigest || header.embeddingDigest !== context.embeddingDigest ||
              header.dimensions !== context.policy.embedding.dimensions) {
            reject("Snapshot provenance does not match the selected repository, commit, scope and model.");
          }
          await verifyIndexSource(tree, context.policy.scope, reader.records());
          const latest = checkedRelease(await transport.getRelease(repository, tag), tag);
          const latestAsset = matchingAsset(latest, asset.name);
          if (latest.id !== release.id || latestAsset?.id !== asset.id || latestAsset.sha256 !== asset.sha256 ||
              latestAsset.bytes !== asset.bytes || await transport.resolveReleaseCommit(repository, latest) !== commit) {
            reject("The selected release changed during download.");
          }
        });
      } finally {
        expanded.destroy();
        await transfer.catch(() => {});
      }
    });
    return { repository, release: tag, asset: asset.name, indexCommit: commit, bytes: asset.bytes };
  } catch (error) {
    if (error.code === "release") throw error;
    reject("Could not import the release snapshot. Check Git history, the asset and local index storage.");
  }
}

async function writeCompressed(reader, path) {
  let bytes = 0;
  const hash = createHash("sha256");
  const meter = new Transform({
    transform(chunk, _encoding, done) {
      bytes += chunk.length;
      if (bytes >= MAX_ASSET_BYTES) {
        done(Object.assign(new Error("Release snapshot size must be under 2 GiB."), { code: "release" }));
        return;
      }
      hash.update(chunk);
      done(null, chunk);
    },
  });
  await pipeline(Readable.from(reader.bytes()), createGzip(), meter, createWriteStream(path, { flags: "wx", mode: 0o600 }));
  return { bytes, sha256: hash.digest("hex") };
}

async function checkPublisher(context, repository, transport) {
  const repo = await transport.getRepository(repository);
  if (repo.canWrite !== true) reject("GitHub repository write access is required to upload a snapshot.");
  const actor = await transport.getActor(repository);
  let policy;
  try {
    const raw = await transport.getPolicy(repository, repo.defaultBranch);
    policy = validateConfig(raw, { ontologyExists: () => true }).semanticIndex;
  } catch {
    reject("The repository default branch must contain valid semantic index publishing settings.");
  }
  if (!policy?.enabled || policy.release?.repository !== repository ||
      typeof actor !== "string" || !policy.release.publishers.includes(actor.toLowerCase())) {
    reject("The authenticated GitHub account is not an approved snapshot publisher.");
  }
  if (hashScope(policy.scope) !== context.scopeDigest || hashEmbedding(policy.embedding) !== context.embeddingDigest) {
    reject("The index scope or model differs from the current repository publishing policy.");
  }
}

async function getWritableRelease(transport, repository, tag, commit, name) {
  const release = checkedRelease(await transport.getRelease(repository, tag), tag);
  if (release.immutable && !release.draft) reject("The selected release is immutable. Choose an eligible draft at the same commit.");
  if (await transport.resolveReleaseCommit(repository, release) !== commit) reject("The release does not resolve to the pushed indexed commit.");
  if (matchingAsset(release, name)) reject("The release already contains this asset.");
  return release;
}

export async function uploadIndex({ context, tag, transport }) {
  let reader;
  let temp;
  try {
    const repository = requireRepository(context);
    reader = await openIndex(context.root);
    if (indexReadiness(reader.header, context) !== "current") reject("Refresh the local index before uploading it.");
    const { sourceCommit: commit } = reader.header;
    const asset = assetName(commit, context);
    await checkPublisher(context, repository, transport);
    const release = await getWritableRelease(transport, repository, tag, commit, asset);
    await verifyIndexSource(context.sourceTree, context.policy.scope, reader.records());
    temp = await mkdtemp(join(context.root, ".ontology-index", "upload-"));
    const archive = join(temp, asset);
    const { bytes, sha256 } = await writeCompressed(reader, archive);
    const latest = await getWritableRelease(transport, repository, tag, commit, asset);
    if (latest.id !== release.id) reject("The selected release changed before upload.");
    await transport.uploadAsset(repository, latest, archive);
    const published = checkedRelease(await transport.getRelease(repository, tag), tag);
    const result = matchingAsset(published, asset);
    checkAsset(result);
    if (published.id !== release.id || await transport.resolveReleaseCommit(repository, published) !== commit ||
        result.bytes !== bytes || (result.sha256 && result.sha256 !== sha256)) {
      reject("GitHub could not confirm the asset on the selected release and commit.");
    }
    return { repository, release: tag, asset, indexCommit: commit, bytes };
  } catch (error) {
    if (error.code === "release") throw error;
    reject("Could not upload the release snapshot. Check the local index, repository access and selected release.");
  } finally {
    try {
      await reader?.close();
    } finally {
      if (temp) await rm(temp, { recursive: true, force: true });
    }
  }
}

function startGh(spawnGh, argv) {
  const env = { ...process.env };
  delete env.ONTOLOGY_INDEX_EMBEDDING_TOKEN;
  const child = spawnGh(argv, { stdio: ["ignore", "pipe", "pipe"], env });
  let stderr = "";
  child.stderr.on("data", (chunk) => { if (stderr.length < 4096) stderr += String(chunk).slice(0, 4096 - stderr.length); });
  const result = new Promise((resolve) => {
    child.once("error", () => resolve({ status: 1, missing: false }));
    child.once("close", (status) => resolve({ status, missing: /\bHTTP 404\b/.test(stderr) }));
  });
  return { child, result };
}

async function output(spawnGh, argv, missingAllowed = false) {
  const { child, result } = startGh(spawnGh, argv);
  let bytes = 0;
  const parts = [];
  for await (const chunk of child.stdout) {
    const data = Buffer.from(chunk);
    bytes += data.length;
    if (bytes > MAX_METADATA_BYTES) {
      child.kill();
      reject("GitHub returned too much release metadata.");
    }
    parts.push(data);
  }
  const resolved = await result;
  if (missingAllowed && resolved.missing) return null;
  if (resolved.status !== 0) reject("GitHub CLI could not complete the remote operation.");
  return Buffer.concat(parts, bytes).toString("utf8");
}

export function createReleaseTransport({ spawnGh = (args, options) => spawn("gh", args, options) } = {}) {
  function route(repository, path) {
    const [host, owner, name] = repository.split("/");
    return ["api", "--hostname", host, "repos/" + owner + "/" + name + (path ? "/" + path : "")];
  }
  async function metadata(args, missingAllowed = false) {
    const body = await output(spawnGh, args, missingAllowed);
    if (body === null) return null;
    try { return JSON.parse(body); } catch { reject("GitHub returned invalid release metadata."); }
  }
  const api = (repository, path, optional = false) => metadata(route(repository, path), optional);
  const pages = async (repository, path) => (await metadata([...route(repository, path), "--paginate", "--slurp"])).flat();

  async function peel(repository, object) {
    for (let level = 0; object?.type === "tag" && level < 8; level += 1) {
      object = (await api(repository, "git/tags/" + assertGitId(object.sha))).object;
    }
    if (object?.type !== "commit") reject("The release reference is not a Git commit.");
    return assertGitId(object.sha);
  }

  async function getRelease(repository, tag) {
    const view = await metadata(["release", "view", "--repo", repository, "--json",
      "databaseId,tagName,isDraft,isImmutable,targetCommitish", "--", tag]);
    if (!Number.isSafeInteger(view.databaseId) || view.databaseId < 1) reject("GitHub returned an invalid release ID.");
    return {
      id: view.databaseId, tag: view.tagName, draft: view.isDraft, immutable: view.isImmutable,
      target: view.targetCommitish, assets: (await pages(repository, "releases/" + view.databaseId + "/assets?per_page=100")).map(assetInfo),
    };
  }

  async function resolveReleaseCommit(repository, release) {
    const tagged = await api(repository, "git/ref/tags/" + encodeURIComponent(release.tag), true);
    if (tagged) return peel(repository, tagged.object);
    if (!release.draft || !release.target) reject("The selected release has no pushed tag or draft target.");
    if (!GIT_ID.test(release.target)) {
      const ref = await api(repository, "git/ref/heads/" + encodeURIComponent(release.target), true);
      if (!ref) reject("The draft target branch was not found in the repository.");
      return peel(repository, ref.object);
    }
    const commit = release.target;
    for (const kind of ["heads", "tags"]) {
      for (const ref of await pages(repository, "git/matching-refs/" + kind)) {
        if (!["commit", "tag"].includes(ref.object?.type)) continue;
        const tip = await peel(repository, ref.object);
        if (tip === commit) return commit;
        const comparison = await api(repository, "compare/" + commit + "..." + tip, true);
        if (comparison?.merge_base_commit?.sha === commit) return commit;
      }
    }
    reject("The draft target cannot be verified on a pushed branch or tag.");
  }

  return {
    getRepository: async (repository) => {
      const value = await api(repository, "");
      return { defaultBranch: value.default_branch, canWrite: value.permissions?.push === true };
    },
    getActor: async (repository) => (await metadata(["api", "--hostname", repository.split("/")[0], "user"])).login,
    getPolicy: async (repository, defaultBranch) => {
      const ref = await api(repository, "git/ref/heads/" + encodeURIComponent(defaultBranch));
      const commit = await peel(repository, ref.object);
      const file = await api(repository, "contents/ontology.config.json?ref=" + commit);
      if (file.encoding !== "base64" || typeof file.content !== "string") reject("GitHub returned invalid repository policy.");
      try { return JSON.parse(Buffer.from(file.content, "base64").toString("utf8")); } catch { reject("GitHub returned invalid repository policy."); }
    },
    getRelease,
    resolveReleaseCommit,
    readAsset: async (repository, asset) => {
      if (!Number.isSafeInteger(asset.id) || asset.id < 1) reject("GitHub supplied an invalid asset ID.");
      return Readable.from((async function* () {
        const { child, result } = startGh(spawnGh, [...route(repository, "releases/assets/" + asset.id),
          "--header", "Accept: application/octet-stream"]);
        try {
          for await (const chunk of child.stdout) yield chunk;
          if ((await result).status !== 0) reject("GitHub could not download the selected asset.");
        } finally {
          if (child.exitCode === null) child.kill();
        }
      })());
    },
    uploadAsset: async (repository, release, path) => {
      await output(spawnGh, ["release", "upload", "--repo", repository, "--", release.tag, path]);
      const confirmed = await getRelease(repository, release.tag);
      if (confirmed.id !== release.id) reject("The selected release changed during upload.");
      return matchingAsset(confirmed, basename(path));
    },
  };
}
