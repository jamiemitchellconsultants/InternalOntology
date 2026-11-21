import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { withTempRepo } from "./helpers/temp-repo.mjs";
import { estimateTokens } from "../templates/scripts/semantic-index-tokens.mjs";
import { formatIndexResponse, runIndexCommand } from "../templates/scripts/semantic-index.mjs";

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

test("B9 an invalid cap is a configuration error that names the setting and makes no model request", async () => {
  await withSearchRepo(async ({ policy, setPolicy, commit, options, requested, run }) => {
    setPolicy({ ...policy, responseCap: 0 });
    options.env.ONTOLOGY_INDEX_CONFIG_REF = commit();
    const result = await run("search", "--query", "query");
    assert.equal(result.exitCode, 2);
    assert.equal(result.value.code, "config");
    assert.match(result.value.message, /semanticIndex\.responseCap/);
    assert.deepEqual(requested, []);
  });
});

const DEFAULT_KEYS = ["ok", "state", "configurationCommit", "sourceCommit", "indexCommit", "committedOnly", "dirty", "results"];
const logLines = (dir) => readFileSync(join(dir, ".ontology-index/token-log.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));

test("B1, B2 and B6 append an estimate to search and keep the existing JSON unchanged", async () => {
  await withSearchRepo(async ({ dir, first, options, run }) => {
    options.now = () => new Date("2026-11-21T10:00:00.000Z");
    await run("refresh");
    const { value } = await run("search", "--query", "query");
    const { tokens, ...rest } = value;
    assert.deepEqual(Object.keys(rest), DEFAULT_KEYS);
    assert.equal(Object.keys(value).at(-1), "tokens");
    assert.deepEqual(rest.results.map(({ commit, path }) => [commit, path]), [[first, "src/a.txt"], [first, "src/b.txt"]]);
    assert.deepEqual(tokens, { estimate: estimateTokens(JSON.stringify(rest)), estimated: true });
    assert.deepEqual(logLines(dir), [{ time: "2026-11-21T10:00:00.000Z", command: "search", count: 2, tokens: tokens.estimate, truncated: false }]);
    assert.doesNotMatch(readFileSync(join(dir, ".ontology-index/token-log.jsonl"), "utf8"), /query|original|src\//);
    assert.equal(Object.hasOwn((await run("status")).value, "tokens"), false);
  });
});

test("B2 and B6 text search output gains only a trailing estimate line", async () => {
  await withSearchRepo(async ({ options, run }) => {
    await run("refresh");
    const { value } = await runIndexCommand(["search", "--query", "query"], options);
    const { tokens, ...rest } = value;
    const lines = formatIndexResponse(value).split("\n");
    assert.equal(lines.at(-1), "Estimated tokens: " + tokens.estimate);
    assert.equal(lines.slice(0, -1).join("\n"), formatIndexResponse(rest));
    assert.match(lines[1], /^"src\/a\.txt":1-1 1\.0000$/);
    assert.equal(tokens.estimate, estimateTokens(formatIndexResponse(rest)));
  });
});

test("B6 and B7 compact JSON states the commit once and returns the same results", async () => {
  await withSearchRepo(async ({ first, options, run }) => {
    await run("refresh");
    const full = (await run("search", "--query", "query")).value;
    const compact = (await run("search", "--query", "query", "--compact")).value;
    assert.equal(compact.indexCommit, first);
    assert.deepEqual(compact.results, full.results.map(({ commit, ...location }) => location));
    assert.ok(compact.tokens.estimate < full.tokens.estimate);
    assert.equal((await runIndexCommand(["search", "--query", "query", "--compact"], options)).value.code, "usage");
  });
});

test("B8, B9 and B10 cut search at the trusted cap and say what was omitted", async () => {
  await withSearchRepo(async ({ dir, write, policy, setPolicy, commit, options, run }) => {
    write("src/c.txt", "third\n");
    write("src/d.txt", "fourth\n");
    setPolicy({ ...policy, responseCap: 120 });
    options.env.ONTOLOGY_INDEX_CONFIG_REF = commit();
    options.env.ONTOLOGY_INDEX_RESPONSE_CAP = "100000";
    await run("refresh");
    const { exitCode, value } = await run("search", "--query", "query");
    assert.equal(exitCode, 0);
    const returned = value.results.length;
    assert.ok(returned >= 1 && returned < 4, "fixture should truncate between one and three results");
    assert.deepEqual(value.truncated, { returned, omitted: 4 - returned });
    const { tokens, tokenLog, ...payload } = value;
    assert.equal(tokens.estimate, estimateTokens(JSON.stringify(payload)));
    const { truncated, ...withoutMarker } = payload;
    assert.ok(estimateTokens(JSON.stringify(withoutMarker)) <= 120);
    assert.deepEqual(logLines(dir).at(-1), { ...logLines(dir).at(-1), count: returned, truncated: true });
  });
});

test("B8 a cap below the fixed fields returns no results and still succeeds", async () => {
  await withSearchRepo(async ({ policy, setPolicy, commit, options, run }) => {
    setPolicy({ ...policy, responseCap: 1 });
    options.env.ONTOLOGY_INDEX_CONFIG_REF = commit();
    await run("refresh");
    const { exitCode, value } = await run("search", "--query", "query");
    assert.equal(exitCode, 0);
    assert.deepEqual(value.results, []);
    assert.deepEqual(value.truncated, { returned: 0, omitted: 2 });
    const text = formatIndexResponse((await runIndexCommand(["search", "--query", "query"], options)).value);
    assert.match(text, /Truncated at the response cap: 0 results returned, 2 omitted\./);
  });
});

test("B2 a failed log write is reported without failing the search", async () => {
  await withSearchRepo(async ({ dir, run }) => {
    await run("refresh");
    mkdirSync(join(dir, ".ontology-index/token-log.jsonl"));
    const { exitCode, value } = await run("search", "--query", "query");
    assert.equal(exitCode, 0);
    assert.equal(typeof value.tokens.estimate, "number");
    assert.match(value.tokenLog, /^Token log not recorded: /);
    assert.equal(Object.keys(value).at(-1), "tokenLog");
  });
});

test("B5 show returns only the cited lines from the indexed commit", async () => {
  await withSearchRepo(async ({ dir, write, commit, options, run }) => {
    write("src/a.txt", "one\ntwo\nthree\n");
    const indexed = commit();
    options.now = () => new Date("2026-11-21T12:00:00.000Z");
    await run("refresh");
    write("src/a.txt", "working tree edit\n");
    const { exitCode, value } = await run("show", "--path", "src/a.txt", "--lines", "2-3", "--commit", indexed);
    assert.equal(exitCode, 0);
    assert.deepEqual([value.commit, value.path, value.startLine, value.endLine, value.text], [indexed, "src/a.txt", 2, 3, "two\nthree\n"]);
    assert.equal(value.dirty, true);
    const { tokens, ...payload } = value;
    assert.equal(tokens.estimate, estimateTokens(JSON.stringify(payload)));
    assert.deepEqual(logLines(dir).at(-1), { time: "2026-11-21T12:00:00.000Z", command: "show", count: 2, tokens: tokens.estimate, truncated: false });
    const text = formatIndexResponse((await runIndexCommand(["show", "--path", "src/a.txt", "--lines", "2-3"], options)).value);
    assert.match(text, new RegExp(`"src/a.txt":2-3 at ${indexed}\\ntwo\\nthree\\nEstimated tokens: \\d+$`));
  });
});

test("B5 show refuses another commit, an unapproved path and a range outside the file", async () => {
  await withSearchRepo(async ({ dir, write, commit, run }) => {
    write("unapproved.txt", "private\n");
    commit();
    await run("refresh");
    for (const args of [
      ["--path", "src/a.txt", "--lines", "1-1", "--commit", "0".repeat(40)],
      ["--path", "unapproved.txt", "--lines", "1-1"],
      ["--path", "src/a.txt", "--lines", "1-9"],
    ]) {
      const { exitCode, value } = await run("show", ...args);
      assert.equal(exitCode, 2, args.join(" "));
      assert.equal(value.code, "refused");
      assert.equal(Object.hasOwn(value, "text"), false);
    }
    for (const args of [["--lines", "1-1"], ["--path", "src/a.txt", "--lines", "3"], ["--path", "src/a.txt", "--lines", "0-2"],
      ["--path", "src/a.txt", "--lines", "4-2"], ["--path", "src/a.txt", "--lines", "1-1", "--commit", "abc"]]) {
      assert.equal((await run("show", ...args)).value.code, "usage", args.join(" "));
    }
    assert.throws(() => readFileSync(join(dir, ".ontology-index/token-log.jsonl")), /ENOENT/);
  });
});

test("B5 show on a stale index is refused with the recovery message", async () => {
  await withSearchRepo(async ({ write, commit, run }) => {
    await run("refresh");
    write("src/a.txt", "moved on\n");
    commit();
    const { exitCode, value } = await run("show", "--path", "src/a.txt", "--lines", "1-1");
    assert.equal(exitCode, 1);
    assert.equal(value.code, "stale");
  });
});

test("B8 and B10 a capped passage returns whole leading lines and names the next line", async () => {
  await withSearchRepo(async ({ write, policy, setPolicy, commit, options, run }) => {
    write("src/long.txt", Array.from({ length: 40 }, (_, i) => `line ${i + 1} with some text\n`).join(""));
    write("src/wide.txt", "w".repeat(4000) + "\n");
    setPolicy({ ...policy, responseCap: 150 });
    options.env.ONTOLOGY_INDEX_CONFIG_REF = commit();
    await run("refresh");
    const { exitCode, value } = await run("show", "--path", "src/long.txt", "--lines", "1-40");
    assert.equal(exitCode, 0);
    const kept = value.text.split("\n").length - 1;
    assert.ok(kept >= 1 && kept < 40);
    assert.ok(value.text.endsWith("\n"));
    assert.deepEqual(value.truncated, { lastLine: kept, nextLine: kept + 1 });
    const { tokens, truncated, ...withoutMarker } = value;
    assert.ok(estimateTokens(JSON.stringify(withoutMarker)) <= 150);
    const wide = (await run("show", "--path", "src/wide.txt", "--lines", "1-1")).value;
    assert.equal(wide.text, "");
    assert.deepEqual(wide.truncated, { lastLine: null, nextLine: 1 });
  });
});
