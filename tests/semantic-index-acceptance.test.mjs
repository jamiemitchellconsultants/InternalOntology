import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { fixtureToken, store, withSemanticIndexFixture } from "./helpers/semantic-index-acceptance-fixture.mjs";

const tag = "v1";
const measurement = fileURLToPath(new URL("../scripts/measure-semantic-index.mjs", import.meta.url));

test("semantic index acceptance exercises the installed CLI and two independent checkouts", async (t) => {
  await withSemanticIndexFixture(async ({ publisher, reader, policy, savePolicy, commit, disabled, pinned, requests, model, run, ghState }) => {
    const publish = (...args) => run(publisher, pinned, ...args);
    const read = (...args) => run(reader, pinned, ...args);
    const query = (...args) => read("search", "--query", "refund", ...args);
    const readerStore = join(reader.dir, store);
    const archive = ghState + ".gz";
    const epoch = performance.now();

    await t.test("B1, B2, B13, B14 and B15 respect committed policy before searching", async () => {
      for (const args of [["status"], ["refresh"], ["search", "--query", "refund"], ["upload", "--release", tag], ["download", "--release", tag]]) {
        const disabledResult = await run(publisher, disabled, ...args);
        assert.equal(disabledResult.exit, 2);
        assert.equal(disabledResult.code, "disabled");
      }
      assert.equal((await read("status")).state, "missing");
      assert.match((await query()).message, /Download.*refresh/);
      assert.deepEqual(requests, []);
      const refresh = await publish("refresh");
      assert.equal(refresh.state, "current", refresh.message);
      assert.equal(refresh.metrics.sourceEmbeddings, 6);
      assert.deepEqual(requests.flatMap(({ input }) => input), [
        "doc:# Store vocabulary\n", "doc:Refund a payment on a cancelled order.\nReject settled orders.\n",
        "doc:Dispatch packages.\n", "doc:Obsolete policy.\n", "doc:Reserve stock.\n", "doc:Refund test rejects a settled order.\n",
      ]);
      assert.ok(requests.every(({ model, path, authorised }) => model === "fixture" && path === "/v1/embeddings" && authorised));
    });

    await t.test("B4, B6, B7, B8 and B16 exchange one safe, reusable release asset", async () => {
      const uploaded = await publish("upload", "--release", tag);
      assert.equal(uploaded.exit, 0, uploaded.message);
      assert.equal(uploaded.indexCommit, pinned);
      const originalAsset = readFileSync(archive);
      const releaseMetadata = readFileSync(ghState);
      assert.equal(uploaded.bytes, originalAsset.length);
      assert.match((await publish("upload", "--release", tag)).message, /already contains/);
      assert.deepEqual(readFileSync(archive), originalAsset);
      assert.deepEqual(readFileSync(ghState), releaseMetadata);
      const before = requests.length;
      const downloaded = await read("download", "--release", tag);
      assert.equal(downloaded.state, "current", downloaded.message);
      assert.equal(downloaded.asset, uploaded.asset);
      assert.equal(requests.length, before);
      const first = await query("--limit", "1");
      assert.deepEqual(first.results, [{ commit: pinned, path: "src/a-refund.txt", startLine: 1, endLine: 2, score: 1 }]);
      assert.deepEqual(requests.slice(before).flatMap(({ input }) => input), ["query:refund"]);
      const active = readFileSync(readerStore);
      assert.deepEqual(gunzipSync(originalAsset), active);
      const raw = active.toString();
      assert.ok(!raw.includes(fixtureToken));
      assert.ok(!raw.includes(policy.semanticIndex.embedding.endpoint));
      assert.ok(!raw.includes("Refund a payment"));
      writeFileSync(archive, originalAsset.subarray(0, 32));
      try {
        assert.equal((await read("download", "--release", tag)).exit, 1);
        assert.deepEqual(readFileSync(readerStore), active);
      } finally {
        writeFileSync(archive, originalAsset);
      }
    });

    await t.test("B3 validates citations and measures both retrieval methods on the same commit", async () => {
      const expected = [{ commit: pinned, path: "src/a-refund.txt", startLine: 1, endLine: 2 }];
      const questions = [];
      for (const text of ["refund", "reimburse"]) {
        const { results: semantic } = await read("search", "--query", text, "--limit", "5");
        questions.push({ id: text, text, expected, semantic });
      }
      const input = join(reader.dir, ".git/pilot.json");
      const runMeasurement = () => {
        writeFileSync(input, JSON.stringify({ commit: pinned, scope: policy.semanticIndex.scope, questions }));
        return JSON.parse(execFileSync(process.execPath, [measurement, input, reader.dir], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
      };
      const { semanticHits, keywordHits, questions: count } = runMeasurement();
      assert.deepEqual([semanticHits, keywordHits, count], [2, 1, 2]);
      questions[0].semantic[0].endLine = 999;
      assert.throws(runMeasurement, /Unresolvable source citation/);
    });

    await t.test("B5, B9 and B10 import an ancestor and refresh only changed passages for a local commit", async () => {
      reader.git("mv", "src/dispatch.txt", "src/renamed.txt");
      reader.git("rm", "src/obsolete.txt");
      reader.write("src/a-refund.txt", "Refund a cancelled payment.\n");
      reader.write("src/new.txt", "New rule.\n");
      reader.git("add", ".");
      reader.git("commit", "-qm", "edit, add, rename and delete source locally");
      const local = reader.git("rev-parse", "HEAD").trim();
      const before = requests.length;
      assert.match((await read("download", "--release", tag)).message, /differs from HEAD/);
      const ancestor = await read("download", "--release", tag, "--allow-ancestor");
      assert.equal(ancestor.state, "stale", ancestor.message);
      assert.deepEqual([ancestor.sourceCommit, ancestor.indexCommit], [local, pinned]);
      assert.equal((await query()).code, "stale");
      assert.equal(requests.length, before);
      reader.write("src/a-refund.txt", "Uncommitted replacement.\n");
      reader.git("add", "src/a-refund.txt");
      reader.write("src/a-refund.txt", "Unstaged replacement.\n");
      assert.equal((await read("refresh")).metrics.sourceEmbeddings, 3);
      assert.equal((await read("refresh")).metrics.sourceEmbeddings, 0);
      assert.ok(requests.slice(before).flatMap(({ input }) => input).includes("doc:Refund a cancelled payment.\n"));
      assert.ok(requests.slice(before).flatMap(({ input }) => input).every((value) => !value.includes("replacement")));
      const result = await query("--limit", "100");
      assert.equal(result.dirty, true);
      assert.ok(result.results.every(({ commit }) => commit === local));
      const paths = new Set(result.results.map(({ path }) => path));
      assert.ok(paths.has("src/new.txt") && paths.has("src/renamed.txt"));
      assert.ok(!paths.has("src/dispatch.txt") && !paths.has("src/obsolete.txt"));
      assert.match((await read("upload", "--release", tag)).message, /pushed indexed commit/);
    });

    await t.test("B2, B11, B12 and B14 reject incompatible inputs and preserve the last complete index", async () => {
      const active = join(publisher.dir, store);
      const beforeFailure = readFileSync(active);
      const changePolicy = (patch, message) => {
        savePolicy({ ...policy, semanticIndex: { ...policy.semanticIndex, ...patch } });
        return commit(message);
      };
      const updated = changePolicy({ scope: { include: ["unapproved.txt"] } }, "approve a different scope");
      const rest = (...args) => run(publisher, updated, ...args);
      assert.equal((await rest("status")).state, "stale");
      model.fail = true;
      const failure = await rest("refresh");
      model.fail = false;
      assert.equal(failure.exit, 1);
      assert.ok(!failure.message.includes(fixtureToken));
      assert.deepEqual(readFileSync(active), beforeFailure);
      assert.equal((await rest("refresh")).metrics.sourceEmbeddings, 1);
      assert.deepEqual((await rest("search", "--query", "fixture")).results.map(({ path }) => path), ["unapproved.txt"]);
      const other = changePolicy({ scope: { include: ["unapproved.txt"] }, embedding: { ...policy.semanticIndex.embedding, revision: "r2" } }, "advance the model revision");
      const before = requests.length;
      assert.equal((await run(publisher, other, "search", "--query", "fixture")).code, "incompatible");
      assert.equal(requests.length, before);
      appendFileSync(active, "{}\n");
      assert.equal((await run(publisher, other, "search", "--query", "fixture")).code, "unreadable");
      assert.equal(requests.length, before);
      assert.equal(publisher.git("check-ignore", store).trim(), store);
      const empty = changePolicy({ scope: { include: ["src/absent.txt"] } }, "use a scope with no eligible passages");
      assert.equal((await run(publisher, empty, "refresh")).metrics.sourceEmbeddings, 0);
      assert.deepEqual((await run(publisher, empty, "search", "--query", "fixture")).results, []);
      const incomplete = changePolicy({ embedding: { model: "fixture" } }, "omit required model settings");
      const beforeInvalid = requests.length;
      for (const args of [["status"], ["refresh"], ["search", "--query", "fixture"], ["upload", "--release", tag], ["download", "--release", tag]]) {
        assert.equal((await run(publisher, incomplete, ...args)).code, "config");
      }
      assert.equal(requests.length, beforeInvalid);
    });

    t.diagnostic("fixture elapsed ms: " + Math.round(performance.now() - epoch));
  });
});
