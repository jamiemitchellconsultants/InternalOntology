import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { buildPlan, install, parseCliArgs } from "../bin/install-ontology.mjs";
import { withTempRepo } from "./helpers/temp-repo.mjs";

test("B13 opt-in installs byte-identical scripts and an ignored checkout store", async () => {
  const scripts = ["semantic-index.mjs", "semantic-index-source.mjs", "semantic-index-embed.mjs", "semantic-index-store.mjs", "semantic-index-release.mjs", "source-graph-git.mjs"];
  const combined = buildPlan({ withSemanticIndex: true, withSourceGraph: true });
  assert.equal(combined.filter(({ dest }) => dest === "scripts/source-graph-git.mjs").length, 1);
  assert.equal(buildPlan({}).some(({ dest }) => dest === "scripts/semantic-index.mjs"), false);
  await withTempRepo(async ({ dir, write, git }) => {
    write(".gitignore", "*.local\n");
    install({ target: dir, withSemanticIndex: true });
    for (const name of scripts) {
      assert.deepEqual(readFileSync(join(dir, "scripts", name)), readFileSync(new URL("../templates/scripts/" + name, import.meta.url)));
    }
    assert.equal(git("check-ignore", ".ontology-index/index-v1.jsonl").trim(), ".ontology-index/index-v1.jsonl");
    assert.match(readFileSync(join(dir, ".gitignore"), "utf8"), /^\*\.local/m);
    git("add", ".");
    git("commit", "-qm", "install");
    const revision = git("rev-parse", "HEAD").trim();
    assert.throws(() => execFileSync(process.execPath, ["scripts/semantic-index.mjs", "status", "--json"], {
      cwd: dir, env: { ...process.env, ONTOLOGY_INDEX_CONFIG_REF: revision }, stdio: ["ignore", "pipe", "pipe"],
    }), (error) => error.status === 2 && JSON.parse(error.stdout).code === "disabled");
  });
});

test("opt-in dry run and upgrades preserve the adopter's ignore rules and committed settings", async () => {
  await withTempRepo(async ({ dir, write }) => {
    assert.equal(parseCliArgs(["--target", dir, "--with-semantic-index"]).withSemanticIndex, true);
    install({ target: dir });
    assert.equal(existsSync(join(dir, ".gitignore")), false);
    write(".gitignore", "keep-without-newline");
    const config = readFileSync(join(dir, "ontology.config.json"));
    const planned = install({ target: dir, withSemanticIndex: true, dryRun: true });
    assert.ok(planned.written.includes(".gitignore"));
    assert.equal(readFileSync(join(dir, ".gitignore"), "utf8"), "keep-without-newline");
    assert.equal(existsSync(join(dir, "scripts/semantic-index.mjs")), false);
    for (const _ of [0, 1]) install({ target: dir, withSemanticIndex: true, force: true });
    assert.equal(readFileSync(join(dir, ".gitignore"), "utf8"), "keep-without-newline\n/.ontology-index/\n");
    assert.deepEqual(readFileSync(join(dir, "ontology.config.json")), config);
  });
});

test("opt-in rejects a tracked or linked storage path before installing files", async () => {
  await withTempRepo(async ({ dir, write, git }) => {
    write(".ontology-index/claimed", "existing source\n");
    git("add", ".");
    assert.throws(() => install({ target: dir, withSemanticIndex: true }), /tracked/);
    assert.equal(existsSync(join(dir, "scripts/semantic-index.mjs")), false);
  });
  await withTempRepo(async ({ dir }) => {
    mkdirSync(join(dir, "other"));
    symlinkSync(join(dir, "other"), join(dir, ".ontology-index"), "junction");
    assert.throws(() => install({ target: dir, withSemanticIndex: true }), /symbolic link|symlink/);
    assert.equal(existsSync(join(dir, "scripts/semantic-index.mjs")), false);
  });
});

test("installed commands use each adopter's model and emit refresh metrics", async () => {
  for (const endpoint of ["http://127.0.0.1:11434/v1/embeddings", "https://owner.test/v1/embeddings"]) {
    await withTempRepo(async ({ dir, write, git }) => {
      install({ target: dir, withSemanticIndex: true });
      const config = JSON.parse(readFileSync(join(dir, "ontology.config.json"), "utf8"));
      config.semanticIndex = { enabled: true, scope: { include: ["src/"] }, embedding: { endpoint, model: "chosen", revision: "r1", dimensions: 2 } };
      write("ontology.config.json", JSON.stringify(config));
      write("src/rule.txt", "current rule\n");
      git("add", ".");
      git("commit", "-qm", "configure and commit");
      const revision = git("rev-parse", "HEAD").trim();
      const { runIndexCommand } = await import(pathToFileURL(join(dir, "scripts/semantic-index.mjs")));
      const calls = [];
      const options = { cwd: dir, env: { ONTOLOGY_INDEX_CONFIG_REF: revision }, fetchImpl: async (url, { body }) => {
        calls.push(String(url));
        const { input } = JSON.parse(body);
        return Response.json({ data: input.map((_, index) => ({ index, embedding: [1, 0] })) });
      } };
      const refresh = await runIndexCommand(["refresh"], options);
      assert.equal(refresh.exitCode, 0, refresh.value.message);
      assert.equal(refresh.value.metrics.sourceEmbeddings, 1);
      assert.ok(refresh.value.metrics.elapsedMs >= 0);
      assert.equal((await runIndexCommand(["refresh"], options)).value.metrics.sourceEmbeddings, 0);
      assert.equal((await runIndexCommand(["search", "--query", "rule"], options)).value.results[0].commit, revision);
      assert.deepEqual(calls, [endpoint, endpoint]);
    });
  }
});

test("an installer-only local ignore does not replace the rule inherited by teammates", async () => {
  await withTempRepo(async ({ dir, write, git }) => {
    write(".git/info/exclude", "/.ontology-index/\n");
    install({ target: dir, withSemanticIndex: true });
    assert.equal(readFileSync(join(dir, ".gitignore"), "utf8"), "/.ontology-index/\n");
    git("add", ".");
    git("commit", "-qm", "publish portable install");
    await withTempRepo(async ({ git: teammate }) => {
      teammate("fetch", "-q", dir, "main");
      teammate("switch", "-q", "--detach", "FETCH_HEAD");
      assert.equal(teammate("check-ignore", ".ontology-index/index-v1.jsonl").trim(), ".ontology-index/index-v1.jsonl");
    });
  });
});

test("opt-in splices the agent protocol once and leaves it out without the flag", async () => {
  const start = "<!-- semantic-index-protocol:start -->";
  await withTempRepo(async ({ dir }) => {
    install({ target: dir });
    assert.doesNotMatch(readFileSync(join(dir, "AGENTS.md"), "utf8"), /semantic-index-protocol/);
    for (const _ of [0, 1]) install({ target: dir, withSemanticIndex: true });
    const text = readFileSync(join(dir, "AGENTS.md"), "utf8");
    assert.equal(text.split(start).length, 2);
    assert.match(text, /git show <commit>:<path>/);
    assert.ok(text.indexOf("<!-- ontology-protocol:end -->") < text.indexOf(start));
  });
});
