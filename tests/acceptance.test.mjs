import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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

test("semantic opt-in ships byte-identical scripts and passing tests in a scratch repository", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
    const scripts = ["github", "model", "ledger", "dismissal", "worker"];
    for (const name of scripts) {
      for (const suffix of [".mjs", ".test.mjs"]) {
        const filename = `semantic-review-${name}${suffix}`;
        const template = fileURLToPath(new URL(`../templates/scripts/${filename}`, import.meta.url));
        assert.equal(readFileSync(join(repo.dir, "scripts", filename), "utf8"), readFileSync(template, "utf8"));
      }
    }
    const config = JSON.parse(readFileSync(join(repo.dir, "ontology.config.json"), "utf8"));
    assert.equal(config.semanticReview.enabled, false);
    const result = run(repo.dir, "node", ["--test", ...scripts.map((name) => `scripts/semantic-review-${name}.test.mjs`)]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
});

test("installed disabled, finding, and later unavailable runs map to the expected statuses", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
    const worker = await import(pathToFileURL(join(repo.dir, "scripts/semantic-review-worker.mjs")).href);
    const ledger = await import(pathToFileURL(join(repo.dir, "scripts/semantic-review-ledger.mjs")).href);
    const pull = { number: 7, head: { sha: "a".repeat(40) }, merge_commit_sha: "b".repeat(40) };
    const config = JSON.parse(readFileSync(join(repo.dir, "ontology.config.json"), "utf8"));
    let modelCalls = 0;
    const baseDeps = { isEligiblePull: async () => true, publishPending: async () => {},
      publishRun: async () => {}, readDismissals: async () => [] };
    const disabled = await worker.runSemanticReview({ client: {}, pull, config, secret: "",
      modelFetch: async () => { modelCalls++; throw new Error("must not call"); }, deps: baseDeps });
    assert.equal(disabled.outcome, "disabled");
    assert.equal(modelCalls, 0);
    config.semanticReview = { enabled: true, model: "m", baseUrl: "https://model.example/v1" };
    const input = { files: [{ path: "docs/a.md", text: "wrong term" }], ontologyText: "## Entities\n| Name | Description |\n| --- | --- |\n| `Invoice` | bill |", unreviewed: [] };
    const finding = { id: "f".repeat(64), path: "docs/a.md", quote: "wrong term",
      evidenceKey: "Entities:Invoice", reason: "wrong", suggestion: "use Invoice" };
    const blocked = await worker.runSemanticReview({ client: {}, pull, config, secret: "test",
      deps: { ...baseDeps, collectReviewInput: async () => input,
        reviewFiles: async () => ({ reviewed: ["docs/a.md"], unreviewed: [], findings: [finding] }) } });
    assert.equal(ledger.statusFor(blocked, []).state, "failure");
    const unavailable = await worker.runSemanticReview({ client: {}, pull, config, secret: "test",
      deps: { ...baseDeps, collectReviewInput: async () => input,
        reviewFiles: async () => { throw new Error("model offline"); } } });
    assert.equal(unavailable.outcome, "unavailable");
    assert.equal(ledger.statusFor(unavailable, []).state, "success");
    assert.match(ledger.statusFor(unavailable, []).description, /not reviewed/i);
  });
});
