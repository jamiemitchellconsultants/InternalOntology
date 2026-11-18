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

import { pathToFileURL } from "node:url";
const installedDrift = async (repo) =>
  import(pathToFileURL(join(repo.dir, "scripts/review-ontology-drift.mjs")).href);

test("B2 the installed planner accepts a projection up to the 500-character floor and skips beyond it", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withDriftReview: true });
    const { buildBatches, SYSTEM_PROMPT, BudgetExceededError, MAX_REQUEST_CHARS } = await installedDrift(repo);
    const files = [{ file: "a.md", lines: [{ line: 1, text: "prose" }] }];
    const room = MAX_REQUEST_CHARS - SYSTEM_PROMPT.length - 16;
    assert.equal(buildBatches(files, "x".repeat(room - 500)).length, 1);
    assert.throws(() => buildBatches(files, "x".repeat(room - 499)), BudgetExceededError);
  });
});

test("B4 an empty or whitespace budget variable uses the default", async () => {
  await withLargeOntologyRepo(async (repo) => {
    for (const value of ["", "   "]) {
      const result = runDrift(repo, { ONTOLOGY_MAX_REQUEST_CHARS: value, ONTOLOGY_MODEL_TIMEOUT_MS: value });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /budget: 200000 chars/);
    }
  });
});

test("B8 B9 the installed splitter still halves on a token limit and ends in the typed skip", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withDriftReview: true });
    const { reviewResilient, HttpError, BudgetExceededError } = await installedDrift(repo);
    const lines = [1, 2, 3, 4].map((line) => ({ line, text: "t" }));
    const sizes = [];
    await reviewResilient([{ file: "a.md", lines }], async (batch) => {
      sizes.push(batch[0].lines.length);
      if (batch[0].lines.length > 2) throw new HttpError(413, "", "too big");
      return "NO_DRIFT";
    });
    assert.deepEqual(sizes, [4, 2, 2]);
    await assert.rejects(
      reviewResilient([{ file: "a.md", lines: [{ line: 1, text: "t" }] }],
        async () => { throw new HttpError(413, "context_length_exceeded", "too big"); }),
      (error) => error instanceof BudgetExceededError);
  });
});

test("B6 the installed workflow passes both variables and bakes in no value", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withDriftReview: true });
    const yaml = readFileSync(join(repo.dir, ".github/workflows/ontology-drift-review.yml"), "utf8");
    assert.match(yaml, /ONTOLOGY_MAX_REQUEST_CHARS: \$\{\{ vars\.ONTOLOGY_MAX_REQUEST_CHARS \}\}/);
    assert.match(yaml, /ONTOLOGY_MODEL_TIMEOUT_MS: \$\{\{ vars\.ONTOLOGY_MODEL_TIMEOUT_MS \}\}/);
    assert.equal(/ONTOLOGY_(MAX_REQUEST_CHARS|MODEL_TIMEOUT_MS): ["']?\d/.test(yaml), false);
  });
});

test("B12 B14 the installed runbook states the budget, the skip and the timeout caveat", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withDriftReview: true });
    const doc = readFileSync(join(repo.dir, "docs/ontology-drift-review.md"), "utf8");
    for (const expected of ["200,000 characters", "ONTOLOGY_MAX_REQUEST_CHARS", "ONTOLOGY_MODEL_TIMEOUT_MS",
      "Skipped: ontology too large for the configured budget", "has not been measured", "max_tokens"]) {
      assert.ok(doc.includes(expected), `runbook lacks ${expected}`);
    }
    assert.match(readFileSync(join(KIT, "README.md"), "utf8"), /ONTOLOGY_MAX_REQUEST_CHARS/);
  });
});
