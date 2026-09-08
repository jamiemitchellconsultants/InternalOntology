import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Create a throwaway git repository, hand it to `body`, and remove it afterwards.
 * @param {(repo: {dir: string, write: (rel: string, text: string) => void, git: (...args: string[]) => string}) => Promise<void>} body
 */
export async function withTempRepo(body) {
  const dir = mkdtempSync(join(tmpdir(), "ontology-kit-"));
  const git = (...args) =>
    execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  const write = (rel, text) => {
    const path = join(dir, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  };
  try {
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Ontology Kit Test");
    // Isolate from the host's global/system git config: downstream tests commit inside this
    // repo, and an inherited gpgsign, hooksPath, or commit.template would break or hang them.
    git("config", "commit.gpgsign", "false");
    git("config", "core.hooksPath", join(dir, ".git-hooks-disabled"));
    git("config", "commit.template", "");
    await body({ dir, write, git });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
