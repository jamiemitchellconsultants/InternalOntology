import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { cpSync } from "node:fs";
import { join } from "node:path";

import { withTempRepo } from "./helpers/temp-repo.mjs";

const SCRIPT_SOURCE = fileURLToPath(new URL("../templates/scripts/", import.meta.url));

/** Install the two script files into the temp repo and run the linter, capturing status and output. */
function runLinter(repo, args = []) {
  cpSync(join(SCRIPT_SOURCE, "check-ontology-terms.mjs"), join(repo.dir, "scripts/check-ontology-terms.mjs"));
  cpSync(join(SCRIPT_SOURCE, "ontology-config.mjs"), join(repo.dir, "scripts/ontology-config.mjs"));
  try {
    const stdout = execFileSync("node", ["scripts/check-ontology-terms.mjs", ...args], {
      cwd: repo.dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    return {
      status: error.status,
      stdout: error.stdout?.toString() ?? "",
      stderr: error.stderr?.toString() ?? "",
    };
  }
}

function seed(repo, { spec = "The `Invoice` is sent.", config = {} } = {}) {
  repo.write("docs/ontology.md", "# Ontology\n\n## Entities\n\n| `Invoice` | An invoice. |\n");
  repo.write("docs/spec.md", spec);
  repo.write("ontology.config.json", JSON.stringify({ ontologyPath: "docs/ontology.md", ...config }, null, 2));
  repo.write("scripts/.keep", "");
  repo.git("add", "-A");
  repo.git("commit", "-m", "fixture");
}

test("a clean repository exits 0 and reports what it checked", async () => {
  await withTempRepo(async (repo) => {
    seed(repo);
    const result = runLinter(repo);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /ontology term check: OK/);
    assert.match(result.stdout, /canonical terms/);
  });
});

test("a violation exits 1 and prints file, line and message on stderr", async () => {
  await withTempRepo(async (repo) => {
    seed(repo, { spec: "The `Bill` is sent." });
    const result = runLinter(repo);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /docs\/spec\.md:1:\d+/);
    assert.match(result.stderr, /`Bill` is not defined/);
    assert.match(result.stderr, /1 violation\(s\)/);
  });
});

test("a missing config exits 2, not 1", async () => {
  await withTempRepo(async (repo) => {
    repo.write("docs/ontology.md", "# Ontology\n\n| `Invoice` | x |\n");
    repo.write("scripts/.keep", "");
    repo.git("add", "-A");
    repo.git("commit", "-m", "fixture");
    const result = runLinter(repo);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /ontology\.config\.json not found/);
  });
});

test("an allowlist entry without a reason exits 2", async () => {
  await withTempRepo(async (repo) => {
    seed(repo, { spec: "The `IClock` abstraction.", config: { allowlist: [{ term: "IClock" }] } });
    const result = runLinter(repo);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /has no reason/);
  });
});

test("--also lints an untracked file", async () => {
  await withTempRepo(async (repo) => {
    seed(repo);
    repo.write("scratch/pr-body.md", "This mentions `Bill` in the drafted body.");
    const result = runLinter(repo, ["--also", "scratch/pr-body.md"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /scratch\/pr-body\.md:1:\d+/);
  });
});

test("--help exits 0 and prints usage, without requiring a config to exist", async () => {
  await withTempRepo(async (repo) => {
    // Deliberately no seed(repo) call: --help must not need ontology.config.json to be present.
    cpSync(join(SCRIPT_SOURCE, "check-ontology-terms.mjs"), join(repo.dir, "scripts/check-ontology-terms.mjs"));
    cpSync(join(SCRIPT_SOURCE, "ontology-config.mjs"), join(repo.dir, "scripts/ontology-config.mjs"));
    const stdout = execFileSync("node", ["scripts/check-ontology-terms.mjs", "--help"], {
      cwd: repo.dir,
      encoding: "utf8",
    });
    assert.match(stdout, /usage: node scripts\/check-ontology-terms\.mjs/);
    assert.match(stdout, /--also/);
    assert.match(stdout, /0 clean, 1 violations found, 2 the check could not run/);
  });
});
