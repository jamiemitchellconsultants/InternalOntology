import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { withTempRepo } from "./temp-repo.mjs";

test("withTempRepo creates a real git repository and cleans it up", async () => {
  let seen;
  await withTempRepo(async (repo) => {
    seen = repo.dir;
    assert.ok(existsSync(`${repo.dir}/.git`), "expected an initialised git repository");
    repo.write("docs/note.md", "hello");
    assert.equal(readFileSync(`${repo.dir}/docs/note.md`, "utf8"), "hello");
    repo.git("add", "-A");
    repo.git("commit", "-m", "test fixture");
    assert.match(repo.git("ls-files"), /docs\/note\.md/);
  });
  assert.equal(existsSync(seen), false, "expected the temp repository to be removed");
});

test("withTempRepo removes the directory and rethrows when the callback throws", async () => {
  let seen;
  await assert.rejects(
    withTempRepo(async (repo) => {
      seen = repo.dir;
      throw new Error("boom");
    }),
    /boom/,
    "expected the callback's rejection to propagate",
  );
  assert.equal(existsSync(seen), false, "expected the temp repository to be removed even on failure");
});
