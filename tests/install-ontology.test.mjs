import { test } from "node:test";
import assert from "node:assert/strict";

import { buildPlan } from "../bin/install-ontology.mjs";

test("a core install writes the scripts, config, ontology and lint workflow", () => {
  const plan = buildPlan({});
  assert.deepEqual(plan.map((entry) => entry.dest).sort(), [
    ".github/workflows/ontology-lint.yml",
    "docs/ontology.md",
    "ontology.config.json",
    "scripts/build-ontology.mjs",
    "scripts/check-ontology-terms.mjs",
    "scripts/ontology-config.mjs",
    "scripts/owl-ontology.mjs",
  ]);
});

test("ontology.config.json gets a namespaceUri derived from the project name", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets Co" });
    const config = JSON.parse(readFileSync(join(repo.dir, "ontology.config.json"), "utf8"));
    assert.equal(config.namespaceUri, "https://ontology.example/widgets-co#");
  });
});

test("the newly installed owl-ontology.mjs and build-ontology.mjs are byte-identical to the kit's templates", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets" });
    for (const rel of ["scripts/owl-ontology.mjs", "scripts/build-ontology.mjs"]) {
      const templatePath = fileURLToPath(new URL(`../templates/${rel}`, import.meta.url));
      assert.equal(readFileSync(join(repo.dir, rel), "utf8"), readFileSync(templatePath, "utf8"));
    }
  });
});

test("the lint workflow runs build-ontology.mjs --check before the term check", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets" });
    const workflow = readFileSync(join(repo.dir, ".github/workflows/ontology-lint.yml"), "utf8");
    const checkIndex = workflow.indexOf("build-ontology.mjs --check");
    const termIndex = workflow.indexOf("check-ontology-terms.mjs");
    assert.ok(checkIndex > -1, "missing build-ontology.mjs --check step");
    assert.ok(checkIndex < termIndex, "build-ontology.mjs --check must run before the term check");
  });
});

test("the spliced protocol section points at ontology.ttl as the editable source", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets" });
    const agents = readFileSync(join(repo.dir, "AGENTS.md"), "utf8");
    assert.match(agents, /docs\/ontology\.ttl/);
    assert.match(agents, /node scripts\/build-ontology\.mjs/);
  });
});

test("every plan entry names an existing template", () => {
  for (const entry of buildPlan({ withDriftReview: true, withEnumTests: "csharp" })) {
    assert.ok(entry.template, `plan entry for ${entry.dest} has no template`);
  }
});

test("a core install does not write the drift reviewer", () => {
  const dests = buildPlan({}).map((entry) => entry.dest);
  assert.equal(dests.includes("scripts/review-ontology-drift.mjs"), false);
});

test("--with-drift-review adds the reviewer, its test, its workflow and its runbook", () => {
  const dests = buildPlan({ withDriftReview: true }).map((entry) => entry.dest);
  for (const expected of [
    "scripts/review-ontology-drift.mjs",
    "scripts/review-ontology-drift.test.mjs",
    ".github/workflows/ontology-drift-review.yml",
    "docs/ontology-drift-review.md",
  ]) {
    assert.ok(dests.includes(expected), `missing ${expected}`);
  }
});

test("--with-enum-tests picks the template for the named language", () => {
  const entry = buildPlan({ withEnumTests: "csharp" }).find((item) => item.dest.includes("OntologyEnum"));
  assert.ok(entry);
  assert.equal(entry.template, "enum-tests/csharp-xunit.cs");
});

test("--with-enum-tests rejects an unsupported language", () => {
  assert.throws(() => buildPlan({ withEnumTests: "cobol" }), /unsupported enum test language "cobol"/);
});

test("a custom ontology path moves both the file and the config value", () => {
  const plan = buildPlan({ ontologyPath: "documentation/domain.md" });
  const dests = plan.map((entry) => entry.dest);
  assert.ok(dests.includes("documentation/domain.md"));
  assert.equal(dests.includes("docs/ontology.md"), false);
});

test("entries requiring substitution are marked, and script copies are not", () => {
  const plan = buildPlan({});
  const config = plan.find((entry) => entry.dest === "ontology.config.json");
  const script = plan.find((entry) => entry.dest === "scripts/check-ontology-terms.mjs");
  assert.equal(config.substitute, true);
  assert.equal(script.substitute, false);
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  spliceProtocol,
  detectAgentFile,
  hasUnmarkedProtocolSection,
  substituteJsonString,
  START_MARKER,
  END_MARKER,
} from "../bin/install-ontology.mjs";
import { withTempRepo } from "./helpers/temp-repo.mjs";

test("hasUnmarkedProtocolSection is true for a hand-written heading with no markers", () => {
  assert.equal(hasUnmarkedProtocolSection("# Agents\n\n## Ontology protocol\n\nHand-written.\n"), true);
});

test("hasUnmarkedProtocolSection is false once the kit's own markers are present", () => {
  assert.equal(
    hasUnmarkedProtocolSection(`# Agents\n\n${START_MARKER}\n## Ontology protocol\n\nBody.\n${END_MARKER}\n`),
    false,
  );
});

test("hasUnmarkedProtocolSection is false when there is no such heading at all", () => {
  assert.equal(hasUnmarkedProtocolSection("# Agents\n\nSome unrelated rules.\n"), false);
});

test("hasUnmarkedProtocolSection ignores a mid-line mention, matching only a real heading", () => {
  assert.equal(hasUnmarkedProtocolSection("See the Ontology protocol section above for details.\n"), false);
});

test("substituteJsonString escapes a quote so the result is valid JSON", () => {
  const result = substituteJsonString('{"ontologyPath": "{{ONTOLOGY_PATH}}"}', {
    ONTOLOGY_PATH: 'docs/on"to.md',
  });
  const parsed = JSON.parse(result);
  assert.equal(parsed.ontologyPath, 'docs/on"to.md');
});

test("splicing into a file with no markers appends a marked block", () => {
  const result = spliceProtocol("# Agents\n\nSome rules.\n", "## Ontology protocol\n\nBody.\n");
  assert.match(result, /^# Agents/);
  assert.ok(result.includes(START_MARKER));
  assert.ok(result.includes(END_MARKER));
  assert.match(result, /## Ontology protocol/);
});

test("splicing twice is idempotent — one marked block, not two", () => {
  const once = spliceProtocol("# Agents\n", "## Ontology protocol\n\nBody.\n");
  const twice = spliceProtocol(once, "## Ontology protocol\n\nBody.\n");
  assert.equal(twice, once);
  assert.equal(twice.split(START_MARKER).length - 1, 1);
});

test("splicing replaces the previous body in place, preserving surrounding text", () => {
  const first = spliceProtocol("# Agents\n\nBefore.\n", "## Ontology protocol\n\nOld body.\n");
  const withTrailer = `${first}\n## Another section\n\nAfter.\n`;
  const second = spliceProtocol(withTrailer, "## Ontology protocol\n\nNew body.\n");
  assert.match(second, /Before\./);
  assert.match(second, /After\./);
  assert.match(second, /New body\./);
  assert.doesNotMatch(second, /Old body\./);
});

test("splicing into an empty file produces just the marked block", () => {
  const result = spliceProtocol("", "## Ontology protocol\n\nBody.\n");
  assert.equal(result.startsWith(START_MARKER), true);
});

test("an unterminated start marker is an error rather than a silent duplicate", () => {
  assert.throws(
    () => spliceProtocol(`# Agents\n${START_MARKER}\nhalf a block\n`, "body"),
    /unterminated ontology-protocol marker/,
  );
});

test("detectAgentFile prefers an existing AGENTS.md", async () => {
  await withTempRepo(async (repo) => {
    repo.write("AGENTS.md", "# Agents\n");
    repo.write("CLAUDE.md", "# Claude\n");
    assert.deepEqual(detectAgentFile(repo.dir), { path: "AGENTS.md", created: false });
  });
});

test("detectAgentFile falls back to CLAUDE.md when AGENTS.md is absent", async () => {
  await withTempRepo(async (repo) => {
    repo.write("CLAUDE.md", "# Claude\n");
    assert.deepEqual(detectAgentFile(repo.dir), { path: "CLAUDE.md", created: false });
  });
});

test("detectAgentFile proposes creating AGENTS.md when neither exists", async () => {
  await withTempRepo(async (repo) => {
    assert.deepEqual(detectAgentFile(repo.dir), { path: "AGENTS.md", created: true });
  });
});

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { install, detectDefaultBranch } from "../bin/install-ontology.mjs";

test("detectDefaultBranch reports the target's actual current branch", async () => {
  await withTempRepo(async (repo) => {
    // Whatever branch a fresh `git init` lands on (main, master, or a CI's own default) —
    // detectDefaultBranch must report it, not silently substitute a guess.
    assert.equal(detectDefaultBranch(repo.dir), repo.git("symbolic-ref", "--short", "HEAD").trim());
    repo.git("checkout", "-b", "trunk");
    assert.equal(detectDefaultBranch(repo.dir), "trunk");
  });
});

test("detectDefaultBranch falls back to main when detection cannot resolve a branch", () => {
  // Not a git repository at all — symbolic-ref has nothing to read.
  assert.equal(detectDefaultBranch("/nonexistent-path-for-ontology-kit-test"), "main");
});

test("installing writes every planned file into the target", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets" });
    for (const expected of [
      "scripts/check-ontology-terms.mjs",
      "scripts/ontology-config.mjs",
      "ontology.config.json",
      "docs/ontology.md",
      ".github/workflows/ontology-lint.yml",
      "AGENTS.md",
    ]) {
      assert.ok(existsSync(join(repo.dir, expected)), `missing ${expected}`);
    }
  });
});

test("placeholders are substituted in the files that carry them", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets" });
    const ontology = readFileSync(join(repo.dir, "docs/ontology.md"), "utf8");
    assert.match(ontology, /^# Widgets — Application Ontology/m);
    assert.doesNotMatch(ontology, /\{\{/);
    const config = JSON.parse(readFileSync(join(repo.dir, "ontology.config.json"), "utf8"));
    assert.equal(config.ontologyPath, "docs/ontology.md");
  });
});

test("the installed scripts are byte-identical to the kit's templates", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets" });
    const templatePath = fileURLToPath(new URL("../templates/scripts/check-ontology-terms.mjs", import.meta.url));
    assert.equal(
      readFileSync(join(repo.dir, "scripts/check-ontology-terms.mjs"), "utf8"),
      readFileSync(templatePath, "utf8"),
    );
  });
});

test("the protocol is spliced into the detected agent file", async () => {
  await withTempRepo(async (repo) => {
    repo.write("AGENTS.md", "# Agents\n\nExisting rules.\n");
    install({ target: repo.dir, projectName: "Widgets" });
    const agents = readFileSync(join(repo.dir, "AGENTS.md"), "utf8");
    assert.match(agents, /Existing rules\./);
    assert.match(agents, /## Ontology protocol/);
    assert.match(agents, /docs\/ontology\.md/);
  });
});

test("a second install is idempotent — no duplicated protocol, no error", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets" });
    const first = readFileSync(join(repo.dir, "AGENTS.md"), "utf8");
    install({ target: repo.dir, projectName: "Widgets", force: true });
    const second = readFileSync(join(repo.dir, "AGENTS.md"), "utf8");
    assert.equal(second, first);
  });
});

test("an existing file is skipped rather than overwritten", async () => {
  await withTempRepo(async (repo) => {
    repo.write("docs/ontology.md", "# Hand-written ontology\n");
    const result = install({ target: repo.dir, projectName: "Widgets" });
    assert.equal(readFileSync(join(repo.dir, "docs/ontology.md"), "utf8"), "# Hand-written ontology\n");
    assert.ok(result.skipped.some((entry) => entry.dest === "docs/ontology.md"));
  });
});

test("--force overwrites an existing kit-owned file", async () => {
  await withTempRepo(async (repo) => {
    repo.write("scripts/check-ontology-terms.mjs", "// hand-modified\n");
    const result = install({ target: repo.dir, projectName: "Widgets", force: true });
    assert.match(readFileSync(join(repo.dir, "scripts/check-ontology-terms.mjs"), "utf8"), /Deterministic ontology term linter/);
    assert.ok(result.written.includes("scripts/check-ontology-terms.mjs"));
  });
});

test("--force does NOT overwrite adopter-owned files — this is the critical upgrade-path fix", async () => {
  await withTempRepo(async (repo) => {
    repo.write("docs/ontology.md", "# Real seeded ontology\n\n| `Widget` | a widget |\n");
    repo.write(
      "ontology.config.json",
      JSON.stringify({
        ontologyPath: "docs/ontology.md",
        allowlist: [{ term: "IClock", reason: "architecture interface, not a domain concept" }],
      }),
    );
    const result = install({ target: repo.dir, projectName: "Widgets", force: true });

    const ontology = readFileSync(join(repo.dir, "docs/ontology.md"), "utf8");
    assert.equal(ontology, "# Real seeded ontology\n\n| `Widget` | a widget |\n");

    const config = JSON.parse(readFileSync(join(repo.dir, "ontology.config.json"), "utf8"));
    assert.equal(config.allowlist[0].term, "IClock");

    assert.ok(result.skipped.some((entry) => entry.dest === "docs/ontology.md" && entry.ownedBy === "adopter"));
    assert.ok(result.skipped.some((entry) => entry.dest === "ontology.config.json" && entry.ownedBy === "adopter"));

    // The scripts, being kit-owned, are still replaced by the same --force.
    assert.ok(result.written.includes("scripts/check-ontology-terms.mjs"));
  });
});

test("--reset-content overwrites adopter-owned files back to the shipped templates", async () => {
  await withTempRepo(async (repo) => {
    repo.write("docs/ontology.md", "# Real seeded ontology\n\n| `Widget` | a widget |\n");
    repo.write(
      "ontology.config.json",
      JSON.stringify({
        ontologyPath: "docs/ontology.md",
        allowlist: [{ term: "IClock", reason: "architecture interface, not a domain concept" }],
      }),
    );
    install({ target: repo.dir, projectName: "Widgets", resetContent: true });

    assert.match(readFileSync(join(repo.dir, "docs/ontology.md"), "utf8"), /Application Ontology/);
    const config = JSON.parse(readFileSync(join(repo.dir, "ontology.config.json"), "utf8"));
    assert.deepEqual(config.allowlist, []);
  });
});

test("--reset-content alone leaves kit-owned files untouched without --force", async () => {
  await withTempRepo(async (repo) => {
    repo.write("scripts/check-ontology-terms.mjs", "// hand-modified\n");
    const result = install({ target: repo.dir, projectName: "Widgets", resetContent: true });
    assert.equal(readFileSync(join(repo.dir, "scripts/check-ontology-terms.mjs"), "utf8"), "// hand-modified\n");
    assert.ok(result.skipped.some((entry) => entry.dest === "scripts/check-ontology-terms.mjs" && entry.ownedBy === "kit"));
  });
});

test("--ontology-path outside the repository (relative escape) is refused before anything is written", async () => {
  await withTempRepo(async (repo) => {
    assert.throws(
      () => install({ target: repo.dir, ontologyPath: "../outside.md" }),
      /--ontology-path must not contain "\.\." segments/,
    );
    assert.equal(existsSync(join(repo.dir, "..", "outside.md")), false);
    assert.equal(existsSync(join(repo.dir, "ontology.config.json")), false);
  });
});

test("--ontology-path given an absolute path is refused before anything is written", async () => {
  await withTempRepo(async (repo) => {
    assert.throws(
      () => install({ target: repo.dir, ontologyPath: "/etc/onto.md" }),
      /--ontology-path must be repository-relative, not absolute/,
    );
    assert.equal(existsSync(join(repo.dir, "ontology.config.json")), false);
  });
});

test("a quote in --ontology-path is JSON-escaped in ontology.config.json rather than corrupting it", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, ontologyPath: 'docs/on"to.md' });
    const raw = readFileSync(join(repo.dir, "ontology.config.json"), "utf8");
    const config = JSON.parse(raw); // throws if the JSON is malformed
    assert.equal(config.ontologyPath, 'docs/on"to.md');
  });
});

test("installing over an AGENTS.md with a hand-written, unmarked Ontology protocol section is refused", async () => {
  await withTempRepo(async (repo) => {
    repo.write("AGENTS.md", "# Agents\n\n## Ontology protocol\n\nHand-written, no markers.\n");
    assert.throws(
      () => install({ target: repo.dir, projectName: "Widgets" }),
      /AGENTS\.md already has a hand-written "## Ontology protocol" section/,
    );
    // Refused before any file is written.
    assert.equal(existsSync(join(repo.dir, "ontology.config.json")), false);
  });
});

test("a marked protocol section (this kit's own) is spliced in place, not refused", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets" });
    // Second run: markers are present, so this must not throw.
    install({ target: repo.dir, projectName: "Widgets", force: true });
    const agents = readFileSync(join(repo.dir, "AGENTS.md"), "utf8");
    assert.equal(agents.split("## Ontology protocol").length - 1, 1);
  });
});

test("the lint workflow substitutes the detected default branch", async () => {
  await withTempRepo(async (repo) => {
    repo.git("checkout", "-b", "trunk");
    install({ target: repo.dir, projectName: "Widgets" });
    const workflow = readFileSync(join(repo.dir, ".github/workflows/ontology-lint.yml"), "utf8");
    assert.match(workflow, /branches: \["trunk"\]/);
  });
});

test("--default-branch overrides detection", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", defaultBranch: "master" });
    const workflow = readFileSync(join(repo.dir, ".github/workflows/ontology-lint.yml"), "utf8");
    assert.match(workflow, /branches: \["master"\]/);
  });
});

test("--with-enum-tests installs the example with an .example suffix", async () => {
  await withTempRepo(async (repo) => {
    const result = install({ target: repo.dir, projectName: "Widgets", withEnumTests: "csharp" });
    assert.ok(existsSync(join(repo.dir, "tests/OntologyEnumTests.cs.example")));
    assert.equal(existsSync(join(repo.dir, "tests/OntologyEnumTests.cs")), false);
    assert.equal(result.enumTestExample, "tests/OntologyEnumTests.cs.example");
  });
});

test("--dry-run reports no protocol note claiming it wrote anything", async () => {
  await withTempRepo(async (repo) => {
    const stdout = execFileSync(
      "node",
      [CLI, "--target", repo.dir, "--project-name", "Widgets", "--dry-run"],
      { encoding: "utf8" },
    );
    assert.match(stdout, /Protocol would be spliced into AGENTS\.md\./);
    assert.doesNotMatch(stdout, /Protocol spliced into AGENTS\.md\./);
  });
});

test("--help exits 0 and prints usage without installing anything", async () => {
  await withTempRepo(async (repo) => {
    const stdout = execFileSync("node", [CLI, "--help"], { encoding: "utf8" });
    assert.match(stdout, /usage: node bin\/install-ontology\.mjs/);
    assert.match(stdout, /--reset-content/);
  });
});

test("--dry-run writes nothing but reports the same plan", async () => {
  await withTempRepo(async (repo) => {
    const result = install({ target: repo.dir, projectName: "Widgets", dryRun: true });
    assert.equal(existsSync(join(repo.dir, "docs/ontology.md")), false);
    assert.equal(existsSync(join(repo.dir, "AGENTS.md")), false);
    assert.ok(result.written.includes("docs/ontology.md"));
  });
});

test("installing into a directory that is not a git repository is refused", async () => {
  await withTempRepo(async (repo) => {
    const notARepo = join(repo.dir, "subdir-without-git");
    assert.throws(
      () => install({ target: notARepo, projectName: "Widgets" }),
      /is not a git repository/,
    );
  });
});

test("the project name defaults to the target directory name", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir });
    const ontology = readFileSync(join(repo.dir, "docs/ontology.md"), "utf8");
    assert.match(ontology, new RegExp(`^# ${repo.dir.split("/").pop()} — Application Ontology`, "m"));
  });
});

import { execFileSync } from "node:child_process";

import { parseCliArgs } from "../bin/install-ontology.mjs";

const CLI = fileURLToPath(new URL("../bin/install-ontology.mjs", import.meta.url));

test("parseCliArgs reads every supported option", () => {
  assert.deepEqual(
    parseCliArgs([
      "--target", "/tmp/repo",
      "--project-name", "Widgets",
      "--ontology-path", "documentation/domain.md",
      "--default-branch", "trunk",
      "--with-drift-review",
      "--with-enum-tests", "python",
      "--force",
      "--reset-content",
      "--dry-run",
    ]),
    {
      target: "/tmp/repo",
      projectName: "Widgets",
      ontologyPath: "documentation/domain.md",
      defaultBranch: "trunk",
      withDriftReview: true,
      withEnumTests: "python",
      force: true,
      resetContent: true,
      dryRun: true,
    },
  );
});

test("parseCliArgs recognises --help and short-circuits other parsing", () => {
  assert.deepEqual(parseCliArgs(["--help"]), { help: true });
  assert.deepEqual(parseCliArgs(["-h"]), { help: true });
  // --help wins even alongside args that would otherwise be invalid (missing --target).
  assert.deepEqual(parseCliArgs(["--with-enum-tests", "--help"]), { help: true });
});

test("parseCliArgs requires --target", () => {
  assert.throws(() => parseCliArgs([]), /--target is required/);
});

test("parseCliArgs rejects an option that takes a value but has none", () => {
  assert.throws(() => parseCliArgs(["--target"]), /--target needs a value/);
});

test("parseCliArgs rejects an unknown option", () => {
  assert.throws(() => parseCliArgs(["--target", "/tmp/x", "--wat"]), /unknown option "--wat"/);
});

test("the CLI installs into a real repository and reports what it wrote", async () => {
  await withTempRepo(async (repo) => {
    const stdout = execFileSync("node", [CLI, "--target", repo.dir, "--project-name", "Widgets"], {
      encoding: "utf8",
    });
    assert.match(stdout, /docs\/ontology\.md/);
    assert.match(stdout, /AGENTS\.md/);
    assert.ok(existsSync(join(repo.dir, "scripts/check-ontology-terms.mjs")));
  });
});

test("the CLI exits non-zero with a readable message on a non-git target", async () => {
  await withTempRepo(async (repo) => {
    const target = join(repo.dir, "nope");
    let status = 0;
    let stderr = "";
    try {
      execFileSync("node", [CLI, "--target", target], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      status = error.status;
      stderr = error.stderr.toString();
    }
    assert.equal(status, 1);
    assert.match(stderr, /is not a git repository/);
  });
});
