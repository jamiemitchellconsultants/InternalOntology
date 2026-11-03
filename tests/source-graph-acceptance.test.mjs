import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { install } from "../bin/install-ontology.mjs";
import { withTempRepo } from "./helpers/temp-repo.mjs";
import { widgets, writeGraph, refreshRecord, blobId, setPair, find, S, LANGUAGES } from "../templates/scripts/source-graph-test-helpers.mjs";

const run = (dir, args) => {
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  try { return { code: 0, out: execFileSync("node", args, { cwd: dir, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }), err: "" }; }
  catch (e) { return { code: e.status, out: e.stdout?.toString() ?? "", err: e.stderr?.toString() ?? "" }; }
};

async function installedWidgets(repo, language = "csharp") {
  repo.git("symbolic-ref", "HEAD", "refs/heads/main");
  install({ target: repo.dir, projectName: "Widgets", withSourceGraph: true });
  const spec = widgets(repo, language);   // overwrites the starter graph, ontology and config with the fixture
  repo.git("add", "-A");
  repo.git("commit", "-q", "-m", "baseline");
  return spec;
}

test("the installed commands pass on a clean widgets repository in every language", async () => {
  for (const language of Object.keys(LANGUAGES)) {
    await withTempRepo(async (repo) => {
      await installedWidgets(repo, language);
      assert.equal(run(repo.dir, ["scripts/check-source-graph.mjs", "--rev", "HEAD"]).code, 0, language);
      assert.equal(run(repo.dir, ["scripts/query-source-graph.mjs", "search", "invoice"]).code, 0, language);
    });
  }
});

test("B13: checker and reader output is identical across languages once paths are normalised", async () => {
  const outputs = [];
  for (const language of Object.keys(LANGUAGES)) {
    await withTempRepo(async (repo) => {
      await installedWidgets(repo, language);
      const check = run(repo.dir, ["scripts/check-source-graph.mjs", "--rev", "HEAD", "--json"]);
      const query = run(repo.dir, ["scripts/query-source-graph.mjs", "neighbors", "node-impl", "--json"]);
      const strip = (text) => text.replaceAll(/[0-9a-f]{40,64}/g, "<sha>")
        .replaceAll(LANGUAGES[language].impl, "<impl>").replaceAll(LANGUAGES[language].test, "<test>")
        .replaceAll(LANGUAGES[language].dep, "<dep>");
      outputs.push([strip(check.out), strip(query.out)]);
    });
  }
  for (const pair of outputs.slice(1)) assert.deepEqual(pair, outputs[0]);
});

test("the full loop: a covered change is blocked, refreshed, then accepted, and the reader pins the old commit", async () => {
  await withTempRepo(async (repo) => {
    const spec = await installedWidgets(repo, "csharp");
    const pinned = repo.git("rev-parse", "HEAD").trim();
    repo.git("checkout", "-q", "-b", "change");
    writeFileSync(join(repo.dir, spec.paths.impl), "edited\nby\nan\nagent\nsession\nhere\n");
    repo.git("add", "-A"); repo.git("commit", "-q", "-m", "edit");
    const blocked = run(repo.dir, ["scripts/check-source-graph.mjs", "--base", "main", "--head", "HEAD"]);
    assert.equal(blocked.code, 1);
    assert.match(blocked.err, /src\/Invoice\.cs/);

    spec.records = spec.covered.map((p) => refreshRecord(repo, p));
    for (const e of spec.evidence) setPair(e, "kit:blobId", S(blobId(repo.dir, e.pairs.find((p) => p.predicate === "kit:path").object)));
    writeGraph(repo, spec);
    repo.git("add", "-A"); repo.git("commit", "-q", "-m", "refresh graph");
    assert.equal(run(repo.dir, ["scripts/check-source-graph.mjs", "--base", "main", "--head", "HEAD"]).code, 0);

    const old = run(repo.dir, ["scripts/query-source-graph.mjs", "neighbors", "node-impl", "--rev", pinned, "--working-rev", "HEAD"]);
    assert.match(old.out, new RegExp(`graph revision ${pinned}`));
    assert.match(old.out, /STALE/);
  });
});

test("the checker and reader work from git objects alone, with the working tree removed", async () => {
  await withTempRepo(async (repo) => {
    await installedWidgets(repo, "csharp");
    const clone = mkdtempSync(join(tmpdir(), "sg-bare-"));
    try {
      execFileSync("git", ["clone", "-q", "--bare", repo.dir, join(clone, "r.git")]);
      cpSync(join(repo.dir, "scripts"), join(clone, "scripts"), { recursive: true });
      const check = run(join(clone, "r.git"), [join(clone, "scripts/check-source-graph.mjs"), "--rev", "HEAD"]);
      assert.equal(check.code, 0, check.err);
      assert.match(check.out, /source graph ok: revision/);
      const query = run(join(clone, "r.git"), [join(clone, "scripts/query-source-graph.mjs"), "search", "invoice"]);
      assert.equal(query.code, 0, query.err);
      assert.match(query.out, /node-invoice/);
    } finally { rmSync(clone, { recursive: true, force: true }); }
  });
});

test("B14: Docker Compose cannot be deployment evidence in the pilot, Terraform can", async () => {
  await withTempRepo(async (repo) => {
    const spec = await installedWidgets(repo, "csharp");
    writeFileSync(join(repo.dir, "docker-compose.yml"), "services:\n  app: {}\n");
    setPair(find(spec.coverage, ":coverage-compose"), "kit:status", "kit:covered");
    spec.records.push(refreshRecord(repo, "docker-compose.yml"));
    setPair(find(spec.evidence, ":evidence-e6"), "kit:path", S("docker-compose.yml"));
    setPair(find(spec.evidence, ":evidence-e6"), "kit:blobId", S(blobId(repo.dir, "docker-compose.yml")));
    writeGraph(repo, spec);
    repo.git("add", "-A"); repo.git("commit", "-q", "-m", "compose as deployment");
    const result = run(repo.dir, ["scripts/check-source-graph.mjs", "--rev", "HEAD"]);
    assert.equal(result.code, 1);
    assert.match(result.err, /evidence-role-mismatch/);
  });
});

test("the installed Markdown passes the adopter's own term check", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withSourceGraph: true });
    repo.git("add", "-A"); repo.git("commit", "-q", "-m", "install");
    const result = run(repo.dir, ["scripts/check-ontology-terms.mjs"]);
    assert.equal(result.code, 0, result.err);
  });
});

test("the shipped graph tests pass inside the target repository", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withSourceGraph: true });
    const tests = readdirSync(join(repo.dir, "scripts")).filter((name) => name.endsWith(".test.mjs"));
    assert.ok(tests.length > 0);
    const result = run(repo.dir, ["--test", ...tests.map((name) => `scripts/${name}`)]);
    assert.equal(result.code, 0, result.out + result.err);
    assert.match(result.out, /a canonical document parses/);
  });
});

test("both commands execute when their script path contains a symlink", async () => {
  await withTempRepo(async (repo) => {
    await installedWidgets(repo, "csharp");
    symlinkSync(join(repo.dir, "scripts"), join(repo.dir, "linked-scripts"), "dir");
    const check = run(repo.dir, ["linked-scripts/check-source-graph.mjs", "--rev", "HEAD"]);
    assert.equal(check.code, 0, check.err);
    assert.match(check.out, /source graph ok: revision/);
    const query = run(repo.dir, ["linked-scripts/query-source-graph.mjs", "search", "invoice"]);
    assert.equal(query.code, 0, query.err);
    assert.match(query.out, /node-invoice/);
  });
});

test("the kit documentation describes source graph installation and safeguards", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const guide = readFileSync(new URL("../docs/ai-agent-install.md", import.meta.url), "utf8");
  const ontology = readFileSync(new URL("../docs/ontology.md", import.meta.url), "utf8");
  assert.match(readme, /--with-source-graph/);
  assert.match(readme, /--source-graph-root/);
  assert.match(guide, /--with-source-graph/);
  assert.match(ontology, /every covered existing file has a record whose blob equals its current blob/);
  assert.match(ontology, /cannot disable or relocate an enabled source graph check/);
});

test("a custom-namespace existing config produces a runnable starter graph", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Original" });
    const configPath = join(repo.dir, "ontology.config.json");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    config.namespaceUri = "https://customer.example/ontology#";
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
    const notice = install({ target: repo.dir, projectName: "Other", withSourceGraph: true }).configNotice;
    const section = JSON.parse(`{${notice.slice(notice.indexOf('"sourceGraph":'))}}`).sourceGraph;
    config.sourceGraph = section;
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
    const build = run(repo.dir, ["scripts/build-ontology.mjs"]);
    assert.equal(build.code, 0, build.err);
    repo.git("add", "-A"); repo.git("commit", "-q", "-m", "enable graph");
    const check = run(repo.dir, ["scripts/check-source-graph.mjs", "--rev", "HEAD"]);
    assert.equal(check.code, 0, check.err);
    assert.match(check.out, /source graph ok: revision [0-9a-f]{40}/);
  });
});
