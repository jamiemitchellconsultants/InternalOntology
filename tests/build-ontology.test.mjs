import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { run, ttlPathFor, parseCliArgs } from "../templates/scripts/build-ontology.mjs";
import { withTempRepo } from "./helpers/temp-repo.mjs";

const CLI = fileURLToPath(new URL("../templates/scripts/build-ontology.mjs", import.meta.url));

function writeMinimalConfig(repo, overrides = {}) {
  repo.write(
    "ontology.config.json",
    JSON.stringify({ ontologyPath: "docs/ontology.md", namespaceUri: "https://ontology.example/w#", ...overrides }),
  );
}

const MINIMAL_MD = `# Widgets — Application Ontology

## Entities

| Name | Properties | Description |
| --- | --- | --- |
| \`Widget\` | \`id\` | A thing that gets made. |
`;

test("ttlPathFor swaps the .md extension for .ttl", () => {
  assert.equal(ttlPathFor("docs/ontology.md"), "docs/ontology.ttl");
});

test("with no ontology.ttl yet, run() migrates and reports migrated: true", async () => {
  await withTempRepo(async (repo) => {
    repo.write("docs/ontology.md", MINIMAL_MD);
    writeMinimalConfig(repo);
    const result = run({ cwd: repo.dir });
    assert.equal(result.migrated, true);
    assert.ok(existsSync(join(repo.dir, "docs/ontology.ttl")));
  });
});

test("migrating then rendering reproduces an equivalent ontology.md", async () => {
  await withTempRepo(async (repo) => {
    repo.write("docs/ontology.md", MINIMAL_MD);
    writeMinimalConfig(repo);
    run({ cwd: repo.dir });
    const rendered = readFileSync(join(repo.dir, "docs/ontology.md"), "utf8");
    assert.match(rendered, /# Widgets — Application Ontology/);
    assert.match(rendered, /\| `Widget` \| `id` \| A thing that gets made\. \|/);
  });
});

test("a second run with no ontology.ttl edit is a no-op — changed: false", async () => {
  await withTempRepo(async (repo) => {
    repo.write("docs/ontology.md", MINIMAL_MD);
    writeMinimalConfig(repo);
    run({ cwd: repo.dir });
    const result = run({ cwd: repo.dir });
    assert.equal(result.migrated, false);
    assert.equal(result.changed, false);
  });
});

test("editing ontology.ttl and running again regenerates ontology.md", async () => {
  await withTempRepo(async (repo) => {
    repo.write("docs/ontology.md", MINIMAL_MD);
    writeMinimalConfig(repo);
    run({ cwd: repo.dir });
    const ttlPath = join(repo.dir, "docs/ontology.ttl");
    const ttl = readFileSync(ttlPath, "utf8").replace('"A thing that gets made."', '"Edited description."');
    repo.write("docs/ontology.ttl", ttl);
    const result = run({ cwd: repo.dir });
    assert.equal(result.changed, true);
    assert.match(readFileSync(join(repo.dir, "docs/ontology.md"), "utf8"), /Edited description\./);
  });
});

test("--check reports changed: true without writing, when ontology.md is stale", async () => {
  await withTempRepo(async (repo) => {
    repo.write("docs/ontology.md", MINIMAL_MD);
    writeMinimalConfig(repo);
    run({ cwd: repo.dir }); // establishes ontology.ttl and a fresh ontology.md
    repo.write("docs/ontology.md", "stale content\n");
    const result = run({ cwd: repo.dir, check: true });
    assert.equal(result.changed, true);
    assert.equal(readFileSync(join(repo.dir, "docs/ontology.md"), "utf8"), "stale content\n");
  });
});

test("--check reports changed: false when ontology.md already matches", async () => {
  await withTempRepo(async (repo) => {
    repo.write("docs/ontology.md", MINIMAL_MD);
    writeMinimalConfig(repo);
    run({ cwd: repo.dir });
    const result = run({ cwd: repo.dir, check: true });
    assert.equal(result.changed, false);
  });
});

test("--force rewrites ontology.md even though it already matches", async () => {
  await withTempRepo(async (repo) => {
    repo.write("docs/ontology.md", MINIMAL_MD);
    writeMinimalConfig(repo);
    run({ cwd: repo.dir });
    const before = readFileSync(join(repo.dir, "docs/ontology.md"), "utf8");
    const result = run({ cwd: repo.dir, force: true });
    assert.equal(readFileSync(join(repo.dir, "docs/ontology.md"), "utf8"), before);
    assert.equal(result.changed, false); // it already matched; --force wrote the same bytes again
  });
});

test("parseCliArgs rejects combining --check and --force", () => {
  assert.throws(() => parseCliArgs(["--check", "--force"]), /--check and --force are contradictory/);
});

test("parseCliArgs recognises --help and short-circuits other parsing", () => {
  assert.deepEqual(parseCliArgs(["--help"]), { help: true });
});

test("parseCliArgs rejects an unknown flag", () => {
  assert.throws(() => parseCliArgs(["--wat"]), /unknown argument "--wat"/);
});

test("the CLI exits 1 when --check finds ontology.md stale", async () => {
  await withTempRepo(async (repo) => {
    repo.write("docs/ontology.md", MINIMAL_MD);
    writeMinimalConfig(repo);
    execFileSync("node", [CLI], { cwd: repo.dir, encoding: "utf8" });
    repo.write("docs/ontology.md", "stale\n");
    let status = 0;
    try {
      execFileSync("node", [CLI, "--check"], { cwd: repo.dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      status = error.status;
    }
    assert.equal(status, 1);
  });
});

test("the CLI exits 0 and prints usage for --help without touching any file", async () => {
  await withTempRepo(async (repo) => {
    const stdout = execFileSync("node", [CLI, "--help"], { cwd: repo.dir, encoding: "utf8" });
    assert.match(stdout, /usage: node scripts\/build-ontology\.mjs/);
    assert.equal(existsSync(join(repo.dir, "ontology.config.json")), false);
  });
});
