import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export async function withScratchRepo(body) {
  const dir = mkdtempSync(join(tmpdir(), "source-graph-"));
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  const write = (rel, text) => {
    const path = join(dir, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  };
  const remove = (rel) => rmSync(join(dir, rel), { force: true });
  const commit = (message) => { git("add", "-A"); git("commit", "-q", "-m", message); return git("rev-parse", "HEAD").trim(); };
  try {
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Graph Test");
    git("config", "commit.gpgsign", "false");
    git("config", "core.hooksPath", join(dir, ".no-hooks"));
    await body({ dir, git, write, remove, commit });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function blobId(dir, rel) {
  return execFileSync("git", ["-C", dir, "hash-object", "--", rel], { encoding: "utf8" }).trim();
}
