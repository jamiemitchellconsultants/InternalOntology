import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { appendTokenRecord, readTokenRecords, summariseTokenUse } from "../templates/scripts/semantic-index-token-log.mjs";

const record = (time, command, tokens, extra = {}) => ({ time, command, count: 2, tokens, truncated: false, ...extra });

async function withStore(body) {
  const root = mkdtempSync(join(tmpdir(), "token-log-"));
  try {
    mkdirSync(join(root, ".ontology-index"));
    await body(root, join(root, ".ontology-index"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("B1 appends one counts-only record per response", async () => {
  await withStore(async (root, store) => {
    assert.deepEqual(await appendTokenRecord(root, record("2026-11-21T10:00:00.000Z", "search", 40)), { recorded: true });
    const text = readFileSync(join(store, "token-log.jsonl"), "utf8");
    assert.equal(text, '{"time":"2026-11-21T10:00:00.000Z","command":"search","count":2,"tokens":40,"truncated":false}\n');
  });
});

test("B1 rotates once at the size limit keeping one previous file", async () => {
  await withStore(async (root, store) => {
    for (const tokens of [1, 2, 3]) await appendTokenRecord(root, record("2026-11-21T10:00:00.000Z", "search", tokens), { maxBytes: 150 });
    assert.equal(readFileSync(join(store, "token-log.1.jsonl"), "utf8").trim().split("\n").length, 1);
    const { records, skipped } = await readTokenRecords(root);
    assert.deepEqual(records.map(({ tokens }) => tokens), [2, 3]);
    assert.equal(skipped, 0);
  });
});

test("B2 never throws and reports why a record was not written", async () => {
  await withStore(async (root, store) => {
    rmSync(store, { recursive: true });
    assert.match((await appendTokenRecord(root, record("2026-11-21T10:00:00.000Z", "show", 1))).message, /^Token log not recorded: \.ontology-index is not a directory/);
    mkdirSync(store);
    writeFileSync(join(root, "target.txt"), "");
    symlinkSync(join(root, "target.txt"), join(store, "token-log.jsonl"));
    const result = await appendTokenRecord(root, record("2026-11-21T10:00:00.000Z", "show", 1));
    assert.equal(result.recorded, false);
    assert.match(result.message, /not a regular file/);
    assert.equal(readFileSync(join(root, "target.txt"), "utf8"), "");
  });
});

test("B3 skips unreadable lines and summarises the rest", async () => {
  await withStore(async (root, store) => {
    writeFileSync(join(store, "token-log.jsonl"), [
      JSON.stringify(record("2026-11-20T09:00:00.000Z", "search", 100)),
      "not json",
      JSON.stringify({ ...record("2026-11-21T09:00:00.000Z", "search", 5), query: "leaked" }),
      JSON.stringify(record("2026-11-21T10:00:00.000Z", "show", 300)),
      JSON.stringify(record("2026-11-21T11:00:00.000Z", "search", 200)),
      "",
    ].join("\n"));
    const { records, skipped } = await readTokenRecords(root);
    assert.equal(skipped, 2);
    assert.deepEqual(summariseTokenUse(records), {
      commands: 3, totalTokens: 600, meanTokens: 200,
      largest: { time: "2026-11-21T10:00:00.000Z", command: "show", tokens: 300 },
      byCommand: { search: { commands: 2, totalTokens: 300, meanTokens: 150 }, show: { commands: 1, totalTokens: 300, meanTokens: 300 } },
      since: null,
    });
    const recent = summariseTokenUse(records, { since: "2026-11-21T10:00:00Z" });
    assert.equal(recent.commands, 2);
    assert.equal(recent.since, "2026-11-21T10:00:00.000Z");
  });
});

test("B3 an absent log is an empty baseline", async () => {
  await withStore(async (root) => {
    const { records, skipped } = await readTokenRecords(root);
    assert.deepEqual([records, skipped], [[], 0]);
    assert.deepEqual(summariseTokenUse(records), { commands: 0, totalTokens: 0, meanTokens: 0, largest: null, byCommand: {}, since: null });
    assert.equal(existsSync(join(root, ".ontology-index/token-log.jsonl")), false);
  });
});
