import assert from "node:assert/strict";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { withTempRepo } from "./helpers/temp-repo.mjs";
import { runIndexCommand } from "../templates/scripts/semantic-index.mjs";

test("B1, B2 and B10 report readiness, cite the commit and reuse unchanged vectors", async () => {
  await withTempRepo(async ({ dir, write, git }) => {
    write(".gitignore", "/.ontology-index/\n");
    write("docs/ontology.md", "# Ontology\n");
    write("src/a.txt", "refund rule\n");
    write("src/b.txt", "shipping rule\n");
    write("ontology.config.json", JSON.stringify({ ontologyPath: "docs/ontology.md", semanticIndex: {
      enabled: true, scope: { include: ["src/"] },
      embedding: { endpoint: "https://owner.test/v1/embeddings", model: "pilot", revision: "r1", dimensions: 2, queryPrefix: "q:" },
    } }));
    git("add", ".");
    git("commit", "-qm", "initial source");
    const first = git("rev-parse", "HEAD").trim();
    const modelInputs = [];
    const options = { cwd: dir, env: { ONTOLOGY_INDEX_CONFIG_REF: first }, fetchImpl: async (_url, init) => {
      const { input } = JSON.parse(init.body);
      modelInputs.push(...input);
      return Response.json({ data: input.map((text, index) => ({ index, embedding: text.includes("refund") ? [1, 0] : [0, 1] })) });
    } };
    const run = (...args) => runIndexCommand([...args, "--json"], options);
    assert.equal((await run("status")).value.state, "missing");
    assert.equal((await run("search", "--query", "refund")).exitCode, 1);
    assert.deepEqual(modelInputs, []);
    assert.equal((await run("refresh")).value.metrics.sourceEmbeddings, 2);
    const search = await run("search", "--query", "refund", "--limit", "1");
    assert.equal(search.exitCode, 0);
    assert.deepEqual(search.value.results, [{ commit: first, path: "src/a.txt", startLine: 1, endLine: 1, score: 1 }]);
    git("rm", "src/b.txt");
    git("commit", "-qm", "remove shipping rule");
    assert.equal((await run("status")).value.state, "stale");
    assert.equal((await run("refresh")).value.metrics.sourceEmbeddings, 0);
    assert.deepEqual(modelInputs, ["refund rule\n", "shipping rule\n", "q:refund"]);
  });
});

async function withSearchRepo(testBody) {
  await withTempRepo(async ({ dir, git, write }) => {
    const policy = { enabled: true, scope: { include: ["src/"] }, embedding: {
      endpoint: "https://owner.test/v1/embeddings", model: "pilot", revision: "r1", dimensions: 2, queryPrefix: "q:",
    } };
    function setPolicy(next) {
      write("ontology.config.json", JSON.stringify({ ontologyPath: "docs/ontology.md", semanticIndex: next }));
    }
    function commit() {
      git("add", ".");
      git("commit", "-qm", "fixture change");
      return git("rev-parse", "HEAD").trim();
    }
    write(".gitignore", "/.ontology-index/\nignored.txt\n");
    write("src/a.txt", "original\n");
    write("src/b.txt", "unchanged\n");
    write("docs/ontology.md", "# Ontology\n");
    setPolicy(policy);
    const first = commit();
    const requested = [];
    const options = { cwd: dir, env: { ONTOLOGY_INDEX_CONFIG_REF: first }, fetchImpl: async (_url, { body }) => {
      const { input } = JSON.parse(body);
      requested.push(...input);
      return Response.json({ data: input.map((_, index) => ({ index, embedding: [1, 0] })) });
    } };
    await testBody({ dir, git, write, policy, first, setPolicy, commit, options, requested,
      run: (...args) => runIndexCommand([...args, "--json"], options) });
  });
}

test("B10 and B11 refresh an edit, addition and rename and retire excluded paths", async () => {
  await withSearchRepo(async ({ git, write, policy, setPolicy, commit, options, run }) => {
    assert.equal((await run("refresh")).value.metrics.sourceEmbeddings, 2);
    git("mv", "src/b.txt", "src/z.txt");
    write("src/a.txt", "edited\n");
    write("src/c.txt", "added\n");
    const second = commit();
    assert.equal((await run("refresh")).value.metrics.sourceEmbeddings, 3);
    assert.deepEqual((await run("search", "--query", "query")).value.results.map(({ path, commit }) => [path, commit]),
      [["src/a.txt", second], ["src/c.txt", second], ["src/z.txt", second]]);
    assert.equal((await run("refresh")).value.metrics.sourceEmbeddings, 0);
    setPolicy({ ...policy, scope: { include: ["src/c.txt"] } });
    options.env.ONTOLOGY_INDEX_CONFIG_REF = commit();
    assert.equal((await run("status")).value.state, "stale");
    assert.equal((await run("refresh")).value.metrics.sourceEmbeddings, 0);
    assert.deepEqual((await run("search", "--query", "query")).value.results.map(({ path }) => path), ["src/c.txt"]);
  });
});

test("B2, B13 and B14 stop unusable indexes before a query or fallback", async () => {
  await withSearchRepo(async ({ dir, policy, setPolicy, commit, options, requested, run }) => {
    assert.equal((await run("refresh")).exitCode, 0);
    setPolicy({ ...policy, embedding: { ...policy.embedding, revision: "r2" } });
    options.env.ONTOLOGY_INDEX_CONFIG_REF = commit();
    assert.equal((await run("search", "--query", "query")).value.code, "incompatible");
    assert.equal(requested.length, 2);
    assert.equal((await run("refresh")).value.metrics.sourceEmbeddings, 2);
    appendFileSync(join(dir, ".ontology-index/index-v1.jsonl"), "{}\n");
    assert.equal((await run("search", "--query", "query")).value.code, "unreadable");
    setPolicy({ enabled: false });
    options.env.ONTOLOGY_INDEX_CONFIG_REF = commit();
    assert.equal((await run("refresh")).value.code, "disabled");
    assert.equal(requested.length, 4);
  });
});

test("B12 pins refresh and reports when HEAD moves during a model call", async () => {
  await withSearchRepo(async ({ dir, first, write, commit, options, run }) => {
    const baseFetch = options.fetchImpl;
    let moved;
    options.fetchImpl = async (...args) => {
      if (!moved) {
        write("src/a.txt", "advanced\n");
        moved = commit();
      }
      return baseFetch(...args);
    };
    const refreshed = await run("refresh");
    assert.equal(refreshed.exitCode, 0, refreshed.value.message);
    assert.equal(refreshed.value.state, "stale");
    assert.equal(refreshed.value.indexCommit, first);
    assert.equal(refreshed.value.sourceCommit, moved);
    const active = join(dir, ".ontology-index/index-v1.jsonl");
    const before = readFileSync(active);
    options.fetchImpl = async () => new Response("provider failed", { status: 503 });
    assert.equal((await run("refresh")).exitCode, 1);
    assert.deepEqual(readFileSync(active), before);
    options.fetchImpl = baseFetch;
    assert.equal((await run("refresh")).exitCode, 0);
    options.fetchImpl = async (...args) => {
      write("src/a.txt", "advanced again\n");
      commit();
      return baseFetch(...args);
    };
    const search = await run("search", "--query", "query");
    assert.equal(search.value.code, "stale");
    assert.deepEqual(search.value.results ?? [], []);
  });
});

test("B15 sends only eligible tracked text and reports staged edits with committed citations", async () => {
  await withSearchRepo(async ({ git, write, setPolicy, policy, commit, options, requested, run }) => {
    git("rm", "src/b.txt");
    write("src/cases.txt", "test case\n");
    write("src/private/no.txt", "excluded\n");
    write("src/binary", "A\0B");
    write("unapproved.txt", "private\n");
    write("ignored.txt", "ignored\n");
    setPolicy({ ...policy, scope: { include: ["src/", "docs/ontology.md"], exclude: ["src/private/"] } });
    const source = commit();
    options.env.ONTOLOGY_INDEX_CONFIG_REF = source;
    const blob = git("rev-parse", "HEAD:src/a.txt").trim();
    git("update-index", "--add", "--cacheinfo", `120000,${blob},src/link`);
    const withLink = commitLink(git);
    write("src/a.txt", "staged private edit\n");
    git("add", "src/a.txt");
    assert.equal((await run("refresh")).value.metrics.sourceEmbeddings, 3);
    assert.deepEqual(requested, ["# Ontology\n", "original\n", "test case\n"]);
    const search = await run("search", "--query", "query");
    assert.equal(search.value.dirty, true);
    assert.deepEqual(search.value.results.map(({ commit, path }) => [commit, path]),
      [[withLink, "docs/ontology.md"], [withLink, "src/a.txt"], [withLink, "src/cases.txt"]]);
  });
});

function commitLink(git) {
  git("commit", "-qm", "track symlink fixture");
  return git("rev-parse", "HEAD").trim();
}
