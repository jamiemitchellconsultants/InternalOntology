import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { checkCap, compactLocations, compareDiscovery, compareEstimates, discoveryFromTranscript, graphFirstSavings, measurePilot, protocolCost, rankKeywordLocations } from "../scripts/measure-semantic-index.mjs";
import { treeFromRevision } from "../templates/scripts/source-graph-git.mjs";
import { withTempRepo } from "./helpers/temp-repo.mjs";

test("B3 counts hits within five locations and validates every semantic citation", () => {
  const commit = "1".repeat(40);
  const hit = { commit, path: "src/rule.txt", startLine: 3, endLine: 4 };
  const miss = { ...hit, startLine: 1, endLine: 2 };
  const expected = [hit];
  const locate = (rev, path, start, end) => rev === commit && path === hit.path && start >= 1 && end <= 10;
  const report = measurePilot({ commit, locate, questions: [
    { id: "refund", expected, semantic: [hit], keyword: [miss] },
    { id: "cancellation", expected, semantic: [miss, miss, miss, miss, miss, hit], keyword: [hit] },
  ] });
  assert.deepEqual(report, { questions: 2, semanticHits: 1, keywordHits: 1, semanticRate: 0.5, keywordRate: 0.5 });
  assert.throws(() => measurePilot({ commit, locate, questions: [{ id: "bad", expected, semantic: [{ ...hit, endLine: 11 }], keyword: [] }] }), /citation/);
});

test("B3 keyword baseline ranks distinct matches on approved committed lines", async () => {
  await withTempRepo(async ({ dir, write, git }) => {
    write("src/a.txt", "none\nrefund rule\nREFUND refund\n");
    write("src/private.txt", "refund rule\n");
    git("add", ".");
    git("commit", "-qm", "pinned inputs");
    const tree = treeFromRevision(dir, "HEAD");
    write("src/a.txt", "dirty value\n");
    const result = rankKeywordLocations(tree, { include: ["src/"], exclude: ["src/private.txt"] }, "refund rule refund");
    assert.deepEqual(result.map(({ path, startLine, commit }) => [path, startLine, commit]),
      [["src/a.txt", 2, tree.id], ["src/a.txt", 3, tree.id]]);
  });
});

test("B3 the pilot CLI's labelled baseline comes from the pinned tree and query", async () => {
  await withTempRepo(async ({ dir, write, git }) => {
    write("src/a.txt", "unrelated\nrefund\n");
    git("add", ".");
    git("commit", "-qm", "baseline source");
    const commit = git("rev-parse", "HEAD").trim();
    const location = { commit, path: "src/a.txt", startLine: 2, endLine: 2 };
    write("report.json", JSON.stringify({ commit, scope: { include: ["src/"], exclude: [] }, questions: [
      { id: "refund", text: "refund", expected: [location], semantic: [location], keyword: [] },
    ] }));
    const script = fileURLToPath(new URL("../scripts/measure-semantic-index.mjs", import.meta.url));
    const report = JSON.parse(execFileSync(process.execPath, [script, join(dir, "report.json"), dir], { encoding: "utf8" }));
    assert.equal(report.keywordHits, 1);
  });
});

test("B4 compares estimates with an independent count and names the largest gap", () => {
  assert.deepEqual(compareEstimates([{ id: "a", estimate: 110, independent: 100 }, { id: "b", estimate: 90, independent: 100 }, { id: "c", estimate: 130, independent: 100 }]),
    { samples: 3, meanDifference: 10, meanRelativeDifference: 0.1, largest: { id: "c", difference: 30 } });
  assert.throws(() => compareEstimates([]), /estimate/i);
  assert.throws(() => compareEstimates([{ id: "a", estimate: 1, independent: 0 }]), /independent/);
});

test("B7 compact results give the same hits as default results", () => {
  const commit = "1".repeat(40);
  const hit = { commit, path: "src/rule.txt", startLine: 3, endLine: 4 };
  const locate = () => true;
  const compact = { indexCommit: commit, results: [{ path: hit.path, startLine: 3, endLine: 4, score: 0.9 }] };
  const rows = compactLocations(compact);
  assert.deepEqual(rows, [{ ...hit, score: 0.9 }]);
  const questions = (semantic) => [{ id: "q", expected: [hit], semantic, keyword: [] }];
  assert.equal(measurePilot({ commit, locate, questions: questions(rows) }).semanticRate,
    measurePilot({ commit, locate, questions: questions([{ ...hit, score: 0.9 }]) }).semanticRate);
});

test("B10 checks the largest response against the cap plus the notice", () => {
  assert.deepEqual(checkCap({ cap: 100, notice: 20, responses: [{ id: "a", tokens: 90 }, { id: "b", tokens: 115 }] }),
    { cap: 100, notice: 20, largest: { id: "b", tokens: 115 }, withinCap: true });
  assert.equal(checkCap({ cap: 100, notice: 20, responses: [{ id: "a", tokens: 121 }] }).withinCap, false);
});

test("B14 reports the protocol's token change and any rule no longer followed", () => {
  const report = protocolCost({ previousText: "x".repeat(400), currentText: "x".repeat(300), rules: ["leads", "refresh", "empty"],
    runs: [{ protocol: "previous", followed: ["leads", "refresh"] }, { protocol: "current", followed: ["leads"] }] });
  assert.deepEqual(report, { previousTokens: 100, currentTokens: 75, change: -25, dropped: ["refresh"] });
  assert.throws(() => protocolCost({ previousText: "", currentText: "", rules: ["a"], runs: [{ protocol: "current", followed: ["b"] }] }), /rule/);
});

test("B16 totals graph-first searches and tokens and lists uncited answers", () => {
  assert.deepEqual(graphFirstSavings([
    { id: "a", previous: { searches: 3, tokens: 900 }, current: { searches: 0, tokens: 200 }, citesEvidence: true },
    { id: "b", previous: { searches: 1, tokens: 300 }, current: { searches: 1, tokens: 300 }, citesEvidence: false },
  ]), { questions: 2, previous: { searches: 4, tokens: 1200 }, current: { searches: 1, tokens: 500 }, change: { searches: -3, tokens: -700 }, uncited: ["b"] });
});

test("B4, B10, B14 and B16 the --tokens CLI reports only the supplied sections", async () => {
  await withTempRepo(async ({ dir, write }) => {
    write("previous.md", "x".repeat(40));
    write("current.md", "x".repeat(20));
    write("tokens.json", JSON.stringify({
      cap: { cap: 10, notice: 2, responses: [{ id: "a", tokens: 11 }] },
      protocol: { previous: "previous.md", current: "current.md", rules: ["r"], runs: [{ protocol: "previous", followed: ["r"] }, { protocol: "current", followed: ["r"] }] },
    }));
    const script = fileURLToPath(new URL("../scripts/measure-semantic-index.mjs", import.meta.url));
    const report = JSON.parse(execFileSync(process.execPath, [script, "--tokens", join(dir, "tokens.json")], { encoding: "utf8" }));
    assert.deepEqual(Object.keys(report), ["cap", "protocol"]);
    assert.equal(report.cap.withinCap, true);
    assert.deepEqual(report.protocol, { previousTokens: 10, currentTokens: 5, change: -5, dropped: [] });
    write("none.json", "{}");
    assert.throws(() => execFileSync(process.execPath, [script, "--tokens", join(dir, "none.json")], { stdio: "pipe" }), /Supply at least one/);
  });
});

const assistant = (id, content, usage = { input_tokens: 10, cache_read_input_tokens: 90 }) =>
  JSON.stringify({ type: "assistant", message: { id, content, usage } });
const tool = (name, input) => ({ type: "tool_use", name, input });

test("B11 counts discovery up to the first edit from a session transcript", () => {
  const jsonl = [
    JSON.stringify({ type: "user", message: { content: "find the refund rule" } }),
    assistant("m1", [tool("Bash", { command: "node scripts/semantic-index.mjs search --query refund --json --compact" })]),
    assistant("m1", [tool("Read", { file_path: "src/refund.ts" })]),
    assistant("m2", [tool("Grep", { pattern: "refund" }), tool("Bash", { command: "rg refund src" }), tool("Read", { file_path: "src/refund.ts" })]),
    assistant("m3", [tool("Edit", { file_path: "src/refund.ts" })]),
    assistant("m4", [tool("Read", { file_path: "src/after.ts" })]),
  ].join("\n");
  assert.deepEqual(discoveryFromTranscript(jsonl), { inputTokens: 300, filesOpened: 1, searchCalls: 2, indexCommands: 1, edited: true });
  assert.equal(discoveryFromTranscript(assistant("m1", [tool("Read", { file_path: "a" })])).edited, false);
  assert.throws(() => discoveryFromTranscript("{}\nnot json"), /line 2 is not JSON/);
});

test("B12 compares each task with the baseline and with running without the index", () => {
  const figures = (inputTokens, filesOpened, searchCalls, indexCommands, edited = true) => ({ inputTokens, filesOpened, searchCalls, indexCommands, edited });
  const report = compareDiscovery([
    { id: "t1", note: "trusted the first result", baseline: figures(1000, 4, 3, 2), withIndex: figures(600, 2, 1, 2), withoutIndex: figures(1500, 6, 5, 0) },
    { id: "t2", note: "needed one exact search", baseline: figures(500, 2, 1, 1), withIndex: figures(500, 2, 1, 1), withoutIndex: figures(400, 2, 2, 0, false) },
  ]);
  assert.deepEqual(report.tasks[0].vsBaseline, { inputTokens: -400, filesOpened: -2, searchCalls: -2, indexCommands: 0 });
  assert.deepEqual(report.totals.vsWithoutIndex, { inputTokens: -800, filesOpened: -4, searchCalls: -5, indexCommands: 3 });
  assert.deepEqual(report.incomplete, ["t2"]);
  assert.throws(() => compareDiscovery([{ id: "t3", note: "", baseline: figures(1, 1, 1, 1), withIndex: figures(1, 1, 1, 1), withoutIndex: figures(1, 1, 1, 1) }]), /t3 needs a developer note/);
});

test("B11 and B12 the --tokens CLI reads transcript paths and figures objects for tasks", async () => {
  await withTempRepo(async ({ dir, write }) => {
    write("runs/baseline.jsonl", [
      assistant("m1", [tool("Grep", { pattern: "x" }), tool("Read", { file_path: "a" }), tool("Read", { file_path: "b" })]),
      assistant("m2", [tool("Edit", { file_path: "a" })]),
    ].join("\n"));
    const figures = { inputTokens: 100, filesOpened: 1, searchCalls: 1, indexCommands: 1, edited: true };
    write("tokens.json", JSON.stringify({
      tasks: [{ id: "t1", note: "note", baseline: "runs/baseline.jsonl", withIndex: figures, withoutIndex: figures }],
    }));
    const script = fileURLToPath(new URL("../scripts/measure-semantic-index.mjs", import.meta.url));
    const report = JSON.parse(execFileSync(process.execPath, [script, "--tokens", join(dir, "tokens.json")], { encoding: "utf8" }));
    assert.deepEqual(Object.keys(report), ["discovery"]);
    assert.deepEqual(report.discovery.tasks[0].vsBaseline, { inputTokens: -100, filesOpened: -1, searchCalls: 0, indexCommands: 1 });
    assert.deepEqual(report.discovery.incomplete, []);
  });
});
