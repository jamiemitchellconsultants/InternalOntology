import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { measurePilot, rankKeywordLocations } from "../scripts/measure-semantic-index.mjs";
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
