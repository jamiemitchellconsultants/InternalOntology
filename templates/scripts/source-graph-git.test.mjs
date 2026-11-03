import { test } from "node:test";
import assert from "node:assert/strict";
import { treeFromRevision, treeFromIndex, changedPaths, lineCount, GitSourceError } from "./source-graph-git.mjs";
import { withScratchRepo, blobId } from "./source-graph-test-helpers.mjs";

test("a revision tree reads committed content, not a dirty working file", async () => {
  await withScratchRepo(async (repo) => {
    repo.write("a.txt", "one\ntwo\n");
    const sha = repo.commit("first");
    repo.write("a.txt", "changed in the working tree\n");
    const tree = treeFromRevision(repo.dir, "HEAD");
    assert.equal(tree.kind, "commit");
    assert.equal(tree.id, sha);
    assert.equal(tree.text("a.txt"), "one\ntwo\n");
    assert.equal(tree.blobId("a.txt"), repo.git("rev-parse", "HEAD:a.txt").trim());
  });
});

test("the index tree includes a staged file and names a candidate tree", async () => {
  await withScratchRepo(async (repo) => {
    repo.write("a.txt", "x\n");
    repo.commit("first");
    repo.write("b.txt", "staged\n");
    repo.git("add", "b.txt");
    repo.write("c.txt", "untracked\n");
    const tree = treeFromIndex(repo.dir);
    assert.equal(tree.kind, "candidate");
    assert.match(tree.id, /^[0-9a-f]{40,64}$/);
    assert.deepEqual(tree.paths(), ["a.txt", "b.txt"]);
    assert.equal(tree.blobId("b.txt"), blobId(repo.dir, "b.txt"));
  });
});

test("an unknown revision, a leading dash and an unmerged index are setup errors", async () => {
  await withScratchRepo(async (repo) => {
    repo.write("a.txt", "x\n");
    repo.commit("first");
    assert.throws(() => treeFromRevision(repo.dir, "no-such-rev"), GitSourceError);
    assert.throws(() => treeFromRevision(repo.dir, "--help"), GitSourceError);
    repo.git("checkout", "-q", "-b", "other");
    repo.write("a.txt", "other\n");
    repo.commit("other");
    repo.git("checkout", "-q", "main");
    repo.write("a.txt", "main\n");
    repo.commit("main");
    try { repo.git("merge", "other"); } catch { /* conflict is the point */ }
    assert.throws(() => treeFromIndex(repo.dir), GitSourceError);
  });
});

test("awkward file names reach git as data and come back intact", async () => {
  await withScratchRepo(async (repo) => {
    const names = ["with space.txt", 'quote".txt', "new\nline.txt", "semi;colon $(touch pwned).txt"];
    for (const name of names) repo.write(name, "x\n");
    repo.commit("names");
    const tree = treeFromRevision(repo.dir, "HEAD");
    assert.deepEqual(tree.paths(), [...names].sort());
    assert.equal(tree.has("pwned"), false);
  });
});

test("changed paths report added, modified, deleted and a move as delete plus add", async () => {
  await withScratchRepo(async (repo) => {
    repo.write("keep.txt", "k\n");
    repo.write("edit.txt", "1\n");
    repo.write("gone.txt", "g\n");
    repo.write("old-name.txt", "same content\n");
    repo.commit("base");
    repo.write("edit.txt", "2\n");
    repo.remove("gone.txt");
    repo.remove("old-name.txt");
    repo.write("new-name.txt", "same content\n");
    repo.write("added.txt", "a\n");
    repo.commit("head");
    const base = treeFromRevision(repo.dir, "HEAD~1");
    const head = treeFromRevision(repo.dir, "HEAD");
    assert.deepEqual(changedPaths(base, head), [
      { path: "added.txt", change: "added" },
      { path: "edit.txt", change: "modified" },
      { path: "gone.txt", change: "deleted" },
      { path: "new-name.txt", change: "added" },
      { path: "old-name.txt", change: "deleted" },
    ]);
  });
});

test("line counting treats an unterminated last line as a line and an empty file as none", () => {
  assert.equal(lineCount(Buffer.from("")), 0);
  assert.equal(lineCount(Buffer.from("a\nb\n")), 2);
  assert.equal(lineCount(Buffer.from("a\nb")), 2);
});

test("submodule entries are skipped", async () => {
  await withScratchRepo(async (repo) => {
    repo.write("a.txt", "x\n");
    const sha = repo.commit("base");
    repo.git("update-index", "--add", "--cacheinfo", `160000,${sha},sub`);
    const tree = treeFromIndex(repo.dir);
    assert.deepEqual(tree.paths(), ["a.txt"]);
  });
});
