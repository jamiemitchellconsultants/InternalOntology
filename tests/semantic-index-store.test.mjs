import assert from "node:assert/strict";
import { appendFileSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { join } from "node:path";
import { test } from "node:test";
import { withTempRepo } from "./helpers/temp-repo.mjs";
import { hashScope } from "../templates/scripts/semantic-index-source.mjs";
import { openIndex, withIndexWriter } from "../templates/scripts/semantic-index-store.mjs";

const scope = { include: ["src/"], exclude: [] };
const header = (digit) => ({
  kind: "header", version: 1, repository: null, sourceCommit: digit.repeat(40),
  scope, scopeDigest: hashScope(scope), embeddingDigest: "a".repeat(64), dimensions: 2,
});
const record = (digit) => ({
  path: "src/a.txt", blobId: digit.repeat(40), startLine: 1, endLine: 1, position: 0,
  vector: Float32Array.of(1, 0),
});

test("B12 failed write keeps the old index and a reader pins its original revision", async () => {
  await withTempRepo(async ({ dir, write }) => {
    write(".gitignore", "/.ontology-index/\n");
    await withIndexWriter(dir, (writer) => writer.replace({ header: header("1"), records: [record("a")] }));
    const original = await openIndex(dir);
    try {
      async function* interrupted() {
        yield record("b");
        throw new Error("source interrupted");
      }
      await assert.rejects(withIndexWriter(dir, (writer) => writer.replace({ header: header("2"), records: interrupted() })), /source interrupted/);
      const stillActive = await openIndex(dir);
      assert.equal(stillActive.header.sourceCommit, "1".repeat(40));
      await stillActive.close();
      await withIndexWriter(dir, (writer) => writer.replace({ header: header("2"), records: [record("b")] }));
      for await (const row of original.records()) assert.equal(row.blobId, "a".repeat(40));
      const current = await openIndex(dir);
      assert.equal(current.header.sourceCommit, "2".repeat(40));
      await current.close();
    } finally {
      await original.close();
    }
  });
});

test("B2 and B6 reject bytes after the verified footer", async () => {
  await withTempRepo(async ({ dir, write }) => {
    write(".gitignore", "/.ontology-index/\n");
    await withIndexWriter(dir, (writer) => writer.replace({ header: header("1"), records: [record("a")] }));
    appendFileSync(join(dir, ".ontology-index/index-v1.jsonl"), "{}\n");
    await assert.rejects(openIndex(dir), /invalid index/);
  });
});

function reseal(lines) {
  const body = lines.join("\n") + "\n";
  return body + JSON.stringify({ kind: "footer", count: lines.length - 1,
    sha256: createHash("sha256").update(body).digest("hex") }) + "\n";
}

test("B6 validates even a resealed malformed payload and keeps the active file", async () => {
  await withTempRepo(async ({ dir, write }) => {
    write(".gitignore", "/.ontology-index/\n");
    await withIndexWriter(dir, (writer) => writer.replace({ header: header("1"), records: [] }));
    const empty = await openIndex(dir);
    for await (const _ of empty.records()) assert.fail("empty corpus produced a passage");
    await empty.close();
    await withIndexWriter(dir, (writer) => writer.replace({ header: header("1"), records: [record("a")] }));
    const file = join(dir, ".ontology-index/index-v1.jsonl");
    const original = readFileSync(file);
    const [first, second] = original.toString().split("\n");
    const row = JSON.parse(second);
    const invalid = [first + "\n", Buffer.from([0xff, 10]),
      reseal([JSON.stringify({ ...header("1"), version: 2 }), second]),
      reseal([first, JSON.stringify({ ...row, vector: "no base64" })]),
      reseal([first, JSON.stringify({ ...row, vector: "AACAPw==" })]),
      reseal([first, second, second]),
      reseal([first, JSON.stringify({ ...row, path: "src/z.txt" }), second]),
      original.toString().replace(/"count":1/, '"count":2'),
      original.toString().replace(/"sha256":"./, '"sha256":"Z'),
    ];
    for (const bytes of invalid) {
      await assert.rejects(withIndexWriter(dir, (writer) => writer.importStream(Readable.from([bytes]))), /invalid index/);
      assert.deepEqual(readFileSync(file), original);
    }
    for (const limits of [{ recordBytes: 32 }, { expandedBytes: original.length - 1 }]) {
      await assert.rejects(openIndex(dir, { limits }), /invalid index/);
    }
    await assert.rejects(withIndexWriter(dir, (writer) => writer.importStream(Readable.from([original]), () => {
      throw new Error("source references rejected");
    })), /source references rejected/);
    assert.deepEqual(readFileSync(file), original);
  });
});

test("B12 excludes concurrent writers and unsafe tracked or linked storage", async () => {
  await withTempRepo(async ({ dir, write, git }) => {
    write(".gitignore", "/.ontology-index/\n");
    let release;
    let entered;
    const held = new Promise((resolve) => { release = resolve; });
    const ready = new Promise((resolve) => { entered = resolve; });
    const active = withIndexWriter(dir, async () => { entered(); await held; });
    await ready;
    try {
      await assert.rejects(withIndexWriter(dir, () => assert.fail("second writer ran")), /writer/);
    } finally {
      release();
      await active;
    }
    write("outside.txt", "outside\n");
    symlinkSync(join(dir, "outside.txt"), join(dir, ".ontology-index/index-v1.jsonl"));
    await assert.rejects(withIndexWriter(dir, () => assert.fail("linked store opened")), /symbolic link|symlink/);
    writeFileSync(join(dir, ".ontology-index/tracked.txt"), "tracked\n");
    git("add", "-f", ".ontology-index/tracked.txt");
    await assert.rejects(withIndexWriter(dir, () => assert.fail("tracked store opened")), /tracked/);
  });
});
