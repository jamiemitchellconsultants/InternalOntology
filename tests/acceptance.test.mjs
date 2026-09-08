import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { install } from "../bin/install-ontology.mjs";
import { withTempRepo } from "./helpers/temp-repo.mjs";

function run(dir, command, args) {
  try {
    return { status: 0, stdout: execFileSync(command, args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }), stderr: "" };
  } catch (error) {
    return { status: error.status, stdout: error.stdout?.toString() ?? "", stderr: error.stderr?.toString() ?? "" };
  }
}

test("a full install passes its own check with the templates untouched", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withDriftReview: true });
    repo.git("add", "-A");
    repo.git("commit", "-m", "install ontology kit");

    const result = run(repo.dir, "node", ["scripts/check-ontology-terms.mjs"]);
    assert.equal(result.status, 0, `installed templates violate their own check:\n${result.stderr}`);
  });
});

test("the shipped reviewer tests pass inside the target repository", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withDriftReview: true });
    const result = run(repo.dir, "node", ["--test", "scripts/review-ontology-drift.test.mjs"]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
});

test("a real ontology and matching prose pass; an invented term fails", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets" });

    // Replace the template with a small real ontology, and narrow the configured sections to match.
    writeFileSync(join(repo.dir, "docs/ontology.md"), [
      "# Widgets — Application Ontology",
      "",
      "## Entities",
      "",
      "| Name | Properties | Description |",
      "|------|------------|-------------|",
      "| `Widget` | `id`, `status` | A widget. |",
      "",
      "## Enums",
      "",
      "| Name | Values | Description |",
      "|------|--------|-------------|",
      "| `WidgetStatus` | `Pending`, `Shipped` | Lifecycle state of a `Widget`. |",
      "",
      "## Relationships",
      "",
      "| From | Relationship | To | Cardinality |",
      "|------|--------------|----|-------------|",
      "| `Widget` | has | `WidgetStatus` | 1 → 1 |",
      "",
      "## Business Rules & Invariants",
      "",
      "- **`Widget`** — must not be `Shipped` while still `Pending`.",
      "",
    ].join("\n"));

    const config = JSON.parse(readFileSync(join(repo.dir, "ontology.config.json"), "utf8"));
    config.sections.optional = [];
    writeFileSync(join(repo.dir, "ontology.config.json"), JSON.stringify(config, null, 2));

    repo.write("docs/spec.md", "A `Widget` becomes `Shipped` once dispatched.\n");
    repo.git("add", "-A");
    repo.git("commit", "-m", "seed ontology");

    const clean = run(repo.dir, "node", ["scripts/check-ontology-terms.mjs"]);
    assert.equal(clean.status, 0, clean.stderr);

    repo.write("docs/spec.md", "A `Gadget` becomes `Shipped` once dispatched.\n");
    repo.git("add", "-A");
    const dirty = run(repo.dir, "node", ["scripts/check-ontology-terms.mjs"]);
    assert.equal(dirty.status, 1);
    assert.match(dirty.stderr, /`Gadget` is not defined in docs\/ontology\.md/);
  });
});

test("an allowlist entry with a reason clears the violation", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets" });
    repo.write("docs/spec.md", "The `IClock` abstraction is injected.\n");

    const config = JSON.parse(readFileSync(join(repo.dir, "ontology.config.json"), "utf8"));
    config.allowlist = [{ term: "IClock", reason: "architecture interface name, not a domain concept" }];
    writeFileSync(join(repo.dir, "ontology.config.json"), JSON.stringify(config, null, 2));

    repo.git("add", "-A");
    repo.git("commit", "-m", "seed");

    const result = run(repo.dir, "node", ["scripts/check-ontology-terms.mjs"]);
    assert.equal(result.status, 0, result.stderr);
  });
});

test("the reviewer's projection accepts the installed ontology template", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withDriftReview: true });
    repo.write("check-projection.mjs", [
      'import { readFileSync } from "node:fs";',
      'import { loadConfig } from "./scripts/ontology-config.mjs";',
      'import { projectOntology } from "./scripts/review-ontology-drift.mjs";',
      "",
      "const config = loadConfig({});",
      'projectOntology(readFileSync(config.ontologyPath, "utf8"), config.sections);',
      'console.log("projection ok");',
      "",
    ].join("\n"));

    const result = run(repo.dir, "node", ["check-projection.mjs"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /projection ok/);
  });
});
