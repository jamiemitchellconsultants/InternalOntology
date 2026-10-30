import { test } from "node:test";
import assert from "node:assert/strict";
import { createGitHubClient, resolvePulls, isEligiblePull, collectReviewInput } from "./semantic-review-github.mjs";

const headSha = "a".repeat(40);
const pull = {
  number: 7, state: "open", user: { login: "author" }, changed_files: 3,
  head: { sha: headSha, ref: "topic", repo: { id: 1 } },
  base: { sha: "b".repeat(40), repo: { id: 1 } }, merge_commit_sha: "c".repeat(40),
};
const blob = (text) => ({ encoding: "base64", content: Buffer.from(text).toString("base64") });

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
    get: async (path) => {
      if (path.endsWith("/git/blobs/blob-a")) return blob("unchanged line\nchanged line\n");
      if (path.endsWith("/git/blobs/blob-new")) return blob("renamed content");
      if (path.includes("/contents/docs/ontology.md")) return blob("# proposed ontology");
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
    get: async (path) => path.includes("/contents/") ? blob("# ontology") : { encoding: "base64", content: "%%%" },
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
    get: async () => blob("# ontology"),
  };
  const result = await collectReviewInput(client, pull, { ontologyPath: "docs/ontology.md", ignorePaths: [] });
  assert.deepEqual(result.files, []);
  assert.match(result.unreviewed[0].reason, /listing is unavailable/);
});
