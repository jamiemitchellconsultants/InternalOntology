import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { EventEmitter } from "node:events";
import { gzipSync, gunzipSync } from "node:zlib";
import { test } from "node:test";
import { withTempRepo } from "./helpers/temp-repo.mjs";
import { runIndexCommand } from "../templates/scripts/semantic-index.mjs";
import { createReleaseTransport } from "../templates/scripts/semantic-index-release.mjs";

test("B4, B7 and B8 exchange an exact snapshot and preserve a published asset on collision", async () => {
  await withTempRepo(async (builder) => withTempRepo(async (reader) => {
    const policy = { ontologyPath: "docs/ontology.md", semanticIndex: {
      enabled: true, scope: { include: ["src/"] },
      embedding: { endpoint: "https://owner.test/v1/embeddings", model: "fixture", revision: "r1", dimensions: 2, queryPrefix: "q:" },
      release: { repository: "github.com/example/fixture", publishers: ["dev"] },
    } };
    builder.write(".gitignore", "/.ontology-index/\n");
    builder.write("ontology.config.json", JSON.stringify(policy));
    builder.write("docs/ontology.md", "# Ontology\n");
    builder.write("src/rule.txt", "refund rule\n");
    builder.git("add", ".");
    builder.git("commit", "-qm", "source");
    const commit = builder.git("rev-parse", "HEAD").trim();
    reader.git("fetch", "-q", builder.dir, commit);
    reader.git("switch", "-q", "--detach", "FETCH_HEAD");

    const assets = [];
    let snapshotBytes;
    let uploadCalls = 0;
    let canWrite = true;
    let actor = "dev";
    let releaseCommit = commit;
    let immutable = false;
    let policyToPublish = policy;
    let uploadFailure = false;
    let readFailure = false;
    const releaseTransport = {
      getRepository: async () => ({ defaultBranch: "main", canWrite }),
      getActor: async () => actor,
      getRelease: async () => ({ id: 12, tag: "v1", draft: false, immutable, target: releaseCommit, assets: [...assets] }),
      getPolicy: async () => policyToPublish,
      resolveReleaseCommit: async () => releaseCommit,
      readAsset: async () => {
        if (readFailure) return Readable.from((async function* () { yield snapshotBytes.subarray(0, 8); throw new Error("lost connection"); })());
        return Readable.from([snapshotBytes]);
      },
      uploadAsset: async (_repo, _release, path) => {
        uploadCalls += 1;
        if (uploadFailure) throw new Error("upload service interrupted");
        snapshotBytes = readFileSync(path);
        const asset = { id: 21, name: basename(path), bytes: snapshotBytes.length, sha256: createHash("sha256").update(snapshotBytes).digest("hex"), state: "uploaded" };
        assets.push(asset);
        return asset;
      },
    };
    const requests = [];
    const fetchImpl = async (_url, init) => {
      const { input } = JSON.parse(init.body);
      requests.push(...input);
      return Response.json({ data: input.map((_, index) => ({ index, embedding: [1, 0] })) });
    };
    const run = (repo, ...args) => runIndexCommand([...args, "--json"], { cwd: repo.dir, env: { ONTOLOGY_INDEX_CONFIG_REF: commit }, fetchImpl, releaseTransport });
    assert.equal((await run(builder, "refresh")).exitCode, 0);
    assert.equal((await run(builder, "upload", "--release", "v1")).exitCode, 0);
    assert.equal((await run(builder, "upload", "--release", "v1")).exitCode, 1);
    assert.equal(uploadCalls, 1);
    assert.equal((await run(reader, "download", "--release", "v1")).exitCode, 0);
    assert.deepEqual(requests, ["refund rule\n"]);
    const search = await run(reader, "search", "--query", "refund");
    assert.equal(search.value.results[0].commit, commit);
    assert.deepEqual(requests, ["refund rule\n", "q:refund"]);

    reader.write("src/next.txt", "follow-up\n");
    reader.git("add", ".");
    reader.git("commit", "-qm", "next revision");
    assert.equal((await run(reader, "download", "--release", "v1")).exitCode, 1);
    const ancestor = await run(reader, "download", "--release", "v1", "--allow-ancestor");
    assert.equal(ancestor.exitCode, 0, ancestor.value.message);
    assert.equal(ancestor.value.state, "stale");
    assert.equal((await run(reader, "refresh")).value.metrics.sourceEmbeddings, 1);

    const active = reader.dir + "/.ontology-index/index-v1.jsonl";
    const currentBytes = readFileSync(active);
    const validSnapshot = snapshotBytes;
    const originalAsset = { ...assets[0] };
    const badImport = async (cause) => {
      const result = await run(reader, "download", "--release", "v1", "--allow-ancestor");
      assert.equal(result.exitCode, 1, cause);
      assert.deepEqual(readFileSync(active), currentBytes, cause);
    };
    assets.push({ ...assets[0], id: 22 });
    await badImport("duplicate asset");
    assets.pop();
    assets[0].bytes = 2 * 1024 ** 3;
    await badImport("oversize metadata");
    assets[0] = { ...originalAsset, sha256: "b".repeat(64) };
    await badImport("mismatched service digest");
    assets[0] = { ...originalAsset };
    readFailure = true;
    await badImport("truncated transfer");
    readFailure = false;
    for (const mutate of [
      (head, row) => { row.endLine = 2; },
      (head) => { head.repository = "github.com/other/fixture"; },
      (head) => { head.embeddingDigest = "1".repeat(64); },
    ]) {
      const [head, row, footer] = gunzipSync(validSnapshot).toString().trim().split("\n").map(JSON.parse);
      mutate(head, row);
      const prefix = JSON.stringify(head) + "\n" + JSON.stringify(row) + "\n";
      footer.sha256 = createHash("sha256").update(prefix).digest("hex");
      snapshotBytes = gzipSync(prefix + JSON.stringify(footer) + "\n");
      assets[0] = { ...originalAsset, bytes: snapshotBytes.length, sha256: null };
      await badImport("resealed invalid provenance or citation");
    }
    snapshotBytes = validSnapshot;
    assets[0] = { ...originalAsset };
    const rejectUpload = async (message) => {
      const rejected = await run(builder, "upload", "--release", "v1");
      assert.equal(rejected.exitCode, 1);
      assert.match(rejected.value.message, message);
      assert.equal(uploadCalls, 1);
      assert.deepEqual(assets[0], originalAsset);
    };
    actor = "other";
    await rejectUpload(/approved snapshot publisher/);
    actor = "dev";
    canWrite = false;
    await rejectUpload(/write access/);
    canWrite = true;
    immutable = true;
    await rejectUpload(/immutable/);
    immutable = false;
    releaseCommit = "b".repeat(40);
    await rejectUpload(/pushed indexed commit/);
    releaseCommit = commit;
    policyToPublish = { ...policy, semanticIndex: { ...policy.semanticIndex, scope: { include: ["other/"] } } };
    await rejectUpload(/publishing policy/);
    policyToPublish = policy;
    const unrelated = { ...originalAsset, id: 23, name: "other-artifact.tgz" };
    assets.splice(0, assets.length, unrelated);
    uploadFailure = true;
    assert.equal((await run(builder, "upload", "--release", "v1")).exitCode, 1);
    assert.deepEqual(assets, [unrelated]);
    assert.deepEqual(requests, ["refund rule\n", "q:refund", "follow-up\n"]);
  }));
});

test("B7 and B8 use the explicit repository and upload without clobbering", async () => {
  const invocations = [];
  const spawnGh = (argv) => {
    invocations.push(argv);
    const process = new EventEmitter();
    const response = argv.includes("upload") ? {} : argv.includes("view") ?
      { databaseId: 9, tagName: "v1", isDraft: true, isImmutable: false, targetCommitish: "main" } :
      [[{ id: 8, name: "index.jsonl.gz", size: 12, digest: null, state: "uploaded" }]];
    process.stdout = Readable.from([Buffer.from(JSON.stringify(response))]);
    process.stderr = Readable.from([]);
    process.kill = () => {};
    process.stdout.on("end", () => process.emit("close", 0));
    return process;
  };
  const client = createReleaseTransport({ spawnGh });
  const release = { id: 9, tag: "v1" };
  const asset = await client.uploadAsset("github.com/example/fixture", release, "/tmp/index.jsonl.gz");
  assert.equal(asset.id, 8);
  const upload = invocations.find((args) => args.includes("upload"));
  assert.ok(upload.includes("github.com/example/fixture"));
  assert.ok(upload.includes("v1"));
  assert.ok(!upload.includes("--clobber"));
});
