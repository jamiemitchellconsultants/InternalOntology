// Acceptance tests for feature #100 (docs/features/drift-request-budget/): the installed drift
// reviewer against a large ontology. The first test is the regression guard for the gap that let a
// 24,000-character budget through: an ontology of about 60 KB must plan batches by default.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { install } from "../bin/install-ontology.mjs";
import { withTempRepo } from "./helpers/temp-repo.mjs";

const KIT = resolve(fileURLToPath(new URL("..", import.meta.url)));

function largeOntology(rows) {
  const entities = Array.from({ length: rows }, (_, index) =>
    `| \`Entity${index}\` | A canonical entity number ${index} with a reasonably long one line description of its role. |`);
  return [
    "# Large ontology", "",
    "## Entities", "", "| Name | Description |", "|---|---|", ...entities, "",
    "## Enums", "", "| Name | Values |", "|---|---|", "| `Colour` | `Red`, `Blue` |", "",
    "## Relationships", "", "| From | Relationship | To |", "|---|---|---|", "| `Entity0` | has | `Entity1` |", "",
    "## Business Rules & Invariants", "", "- **`Entity0`** — always exists.", "",
  ].join("\n");
}

function runDrift(repo, env) {
  try {
    const stdout = execFileSync("node", ["scripts/review-ontology-drift.mjs", "docs/notes.md"], {
      cwd: repo.dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, BASE_REF: "main", DRY_RUN: "1", ...env },
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    return { status: error.status, stdout: error.stdout?.toString() ?? "", stderr: error.stderr?.toString() ?? "" };
  }
}

async function withLargeOntologyRepo(body) {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withDriftReview: true });
    repo.write("docs/ontology.md", largeOntology(600));
    repo.git("add", "-A");
    repo.git("commit", "-q", "-m", "seed");
    repo.git("branch", "-M", "main");
    repo.git("checkout", "-q", "-b", "change");
    repo.write("docs/notes.md", "A plain sentence added in the change.\n");
    repo.git("add", "-A");
    repo.git("commit", "-q", "-m", "add notes");
    await body(repo);
  });
}

test("B1 B13 a 60 KB ontology plans batches with the default settings", async () => {
  await withLargeOntologyRepo(async (repo) => {
    assert.ok(readFileSync(join(repo.dir, "docs/ontology.md"), "utf8").length > 55_000);
    const result = runDrift(repo, {});
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /batch/);
    assert.match(result.stdout, /budget: 200000 chars/);
    assert.doesNotMatch(result.stdout + result.stderr, /no useful diff budget/);
  });
});

test("B7 B10 a budget the ontology cannot fit is a skipped outcome, not a failure", async () => {
  await withLargeOntologyRepo(async (repo) => {
    const result = runDrift(repo, { ONTOLOGY_MAX_REQUEST_CHARS: "2000" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /drift review skipped: ontology too large for the configured budget/);
  });
});

test("B3 an override that fits the ontology is used", async () => {
  await withLargeOntologyRepo(async (repo) => {
    const result = runDrift(repo, { ONTOLOGY_MAX_REQUEST_CHARS: "90000" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /budget: 90000 chars/);
  });
});

test("B5 a junk budget fails before any review and names the variable and the value", async () => {
  await withLargeOntologyRepo(async (repo) => {
    const result = runDrift(repo, { ONTOLOGY_MAX_REQUEST_CHARS: "abc" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ONTOLOGY_MAX_REQUEST_CHARS must be a positive integer, got "abc"/);
  });
});

test("B11 a junk timeout fails the same way", async () => {
  await withLargeOntologyRepo(async (repo) => {
    const result = runDrift(repo, { ONTOLOGY_MODEL_TIMEOUT_MS: "0" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ONTOLOGY_MODEL_TIMEOUT_MS/);
  });
});

test("B15 the installed reviewer is byte-identical to the template", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withDriftReview: true });
    assert.equal(readFileSync(join(repo.dir, "scripts/review-ontology-drift.mjs"), "utf8"),
      readFileSync(join(KIT, "templates/scripts/review-ontology-drift.mjs"), "utf8"));
  });
});
