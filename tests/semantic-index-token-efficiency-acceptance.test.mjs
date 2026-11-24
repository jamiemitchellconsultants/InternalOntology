import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { withSemanticIndexFixture } from "./helpers/semantic-index-acceptance-fixture.mjs";

const logPath = (dir) => join(dir, ".ontology-index/token-log.jsonl");
const logRecords = (dir) => readFileSync(logPath(dir), "utf8").trim().split("\n").map((line) => JSON.parse(line));

test("semantic index token efficiency acceptance drives the installed CLI", async (t) => {
  await withSemanticIndexFixture(async ({ publisher, reader, policy, savePolicy, commit, pinned, requests, run }) => {
    const read = (...args) => run(reader, pinned, ...args);

    await t.test("B3 usage reports no baseline before any search or show", async () => {
      const usage = await read("usage");
      assert.equal(usage.exit, 0);
      assert.equal(usage.commands, 0);
      assert.match(usage.message, /no baseline exists/);
    });

    await t.test("B1, B2, B6 and B7 search states its estimate, logs counts only and compact keeps the same leads", async () => {
      assert.equal((await read("refresh")).state, "current");
      const full = await read("search", "--query", "refund", "--limit", "5");
      assert.equal(full.exit, 0);
      assert.equal(full.tokens.estimated, true);
      assert.ok(full.tokens.estimate > 0);
      assert.equal(full.results[0].path, "src/a-refund.txt");
      assert.ok(full.results.every(({ text }) => text === undefined));
      const records = logRecords(reader.dir);
      assert.equal(records.length, 1);
      assert.deepEqual(Object.keys(records[0]).sort(), ["command", "count", "time", "tokens", "truncated"]);
      assert.equal(records[0].command, "search");
      assert.equal(records[0].tokens, full.tokens.estimate);
      assert.doesNotMatch(readFileSync(logPath(reader.dir), "utf8"), /refund|src\//);
      const compact = await read("search", "--query", "refund", "--limit", "5", "--compact");
      assert.equal(compact.indexCommit, pinned);
      assert.deepEqual(compact.results, full.results.map(({ commit, ...location }) => location));
      assert.ok(compact.tokens.estimate < full.tokens.estimate);
      const usage = await read("usage");
      assert.equal(usage.commands, 2);
      assert.ok(usage.totalTokens > 0 && usage.largest.tokens > 0);
    });

    await t.test("B5 show returns only the cited lines from the indexed commit and refuses bad requests", async () => {
      const shown = await read("show", "--path", "src/a-refund.txt", "--lines", "1-1", "--commit", pinned);
      assert.equal(shown.exit, 0);
      assert.equal(shown.text, "Refund a payment on a cancelled order.\n");
      assert.equal(shown.tokens.estimated, true);
      assert.equal(logRecords(reader.dir).at(-1).command, "show");
      for (const args of [
        ["show", "--path", "src/a-refund.txt", "--lines", "1-1", "--commit", "0".repeat(40)],
        ["show", "--path", "unapproved.txt", "--lines", "1-1"],
        ["show", "--path", "src/a-refund.txt", "--lines", "1-99"],
      ]) {
        const refused = await read(...args);
        assert.equal(refused.code, "refused", args.join(" "));
        assert.equal(Object.hasOwn(refused, "text"), false);
      }
    });

    await t.test("B2 a failed log write is reported without failing the search", async () => {
      rmSync(logPath(reader.dir));
      mkdirSync(logPath(reader.dir));
      const result = await read("search", "--query", "refund");
      assert.equal(result.exit, 0);
      assert.equal(typeof result.tokens.estimate, "number");
      assert.match(result.tokenLog, /^Token log not recorded: /);
      rmSync(logPath(reader.dir), { recursive: true });
    });

    await t.test("B13 and B15 the installed protocol is shortened and graph-first", async () => {
      const agents = readFileSync(join(reader.dir, "AGENTS.md"), "utf8");
      assert.match(agents, /ask the graph first/);
      assert.match(agents, /show --path <path> --lines <start>-<end> --json/);
      assert.match(agents, /search --query "<one focused question>" --limit 5 --json --compact/);
    });

    await t.test("B8, B9 and B10 the trusted cap cuts a response and an invalid cap makes no model request", async () => {
      const publish = (...args) => run(publisher, pinned, ...args);
      assert.equal((await publish("refresh")).state, "current");
      savePolicy({ ...policy, semanticIndex: { ...policy.semanticIndex, responseCap: 30 } });
      const capped = commit("set a small response cap");
      const cappedRun = (...args) => run(publisher, capped, ...args);
      await cappedRun("refresh");
      const search = await cappedRun("search", "--query", "refund", "--limit", "5");
      assert.equal(search.exit, 0);
      assert.ok(search.truncated.omitted > 0);
      assert.equal(typeof search.tokens.estimate, "number");
      savePolicy({ ...policy, semanticIndex: { ...policy.semanticIndex, responseCap: 0 } });
      const invalid = commit("set an invalid response cap");
      const before = requests.length;
      const refused = await run(publisher, invalid, "search", "--query", "refund");
      assert.equal(refused.code, "config");
      assert.match(refused.message, /semanticIndex\.responseCap/);
      assert.equal(requests.length, before);
    });
  });
});
