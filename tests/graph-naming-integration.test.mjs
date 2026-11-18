// The INSTALLED graph naming review end to end: the real GitHub client over an in-memory fetch, and a local HTTP
// model stand-in. Nothing here calls a real model or GitHub.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { install } from "../bin/install-ontology.mjs";
import { withTempRepo } from "./helpers/temp-repo.mjs";

const HEAD = "a".repeat(40), HEAD2 = "d".repeat(40), BASE = "c".repeat(40), MERGE = "b".repeat(40);
const NS = "https://ontology.example/widgets#";
const REPO_URL = "https://github.example/owner/widgets";
const REPLY = { results: [{ node: ":node-job", quoted: "RemovalJob", item: "Entities:SessionRemoval",
  reason: "Job is not the ontology's word", suggestion: "SessionRemovalJob" }] };

async function modelStandIn(content) {
  const stand = { requests: 0 };
  const server = createServer((req, res) => {
    stand.requests++;
    req.resume();
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] }));
    });
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  stand.url = `http://127.0.0.1:${server.address().port}/v1`;
  stand.close = () => server.close();
  return stand;
}

function gitHubStandIn({ block, S, ttl }) {
  const markdown = "## Entities\n\n| Name | Description |\n| --- | --- |\n| `SessionRemoval` | removing a session |\n";
  const turtle = `@prefix : <${NS}> .\n@prefix owl: <http://www.w3.org/2002/07/owl#> .\n\n:SessionRemoval a owl:Class .\n`;
  const concept = block(":node-session-removal", "kit:GraphNode", [["kit:denotes", ":SessionRemoval"], ["kit:kind", "kit:concept"], ["rdfs:label", S("SessionRemoval")]]);
  const job = block(":node-job", "kit:GraphNode", [["kit:kind", "kit:source-symbol"], ["rdfs:label", S("RemovalJob")]]);
  const link = [
    block(":assertion-j", "kit:GraphAssertion", [["kit:basis", "kit:direct"], ["kit:evidence", ":evidence-j"], ["kit:object", ":node-session-removal"], ["kit:relationship", "kit:implements"], ["kit:subject", ":node-job"]]),
    block(":evidence-j", "kit:GraphEvidence", [["kit:blobId", S("e".repeat(40))], ["kit:endLine", 3], ["kit:path", S("src/RemovalJob.cs")], ["kit:role", "kit:role-implementation"], ["kit:startLine", 1]]),
  ];
  const blobs = new Map();
  const tree = (files) => ({ truncated: false, tree: Object.entries(files).map(([path, text]) => {
    const sha = `blob${blobs.size + 1}`;
    blobs.set(sha, text);
    return { path, type: "blob", sha };
  }) });
  const ontology = { "docs/ontology.md": markdown, "docs/ontology.ttl": turtle };
  const state = {
    pull: { number: 7, state: "open", changed_files: 1, user: { login: "author" }, merge_commit_sha: MERGE,
      head: { sha: HEAD, repo: { id: 1 } }, base: { sha: BASE, repo: { id: 1, html_url: REPO_URL } } },
    trees: { [BASE]: tree({ ...ontology, "g/nodes.ttl": ttl([concept]) }), [HEAD]: tree({ ...ontology, "g/nodes.ttl": ttl([concept, job, ...link]) }) },
    roles: { author: "write", reviewer: "write", visitor: "triage" },
    comments: [], issues: [], issueComments: [], statuses: [], labels: [],
  };
  let id = 100;
  const respond = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
  const notFound = () => respond({ message: "Not Found" }, 404);
  const addComment = (body, login) => {
    id += 1;
    const comment = { id, body, user: { login }, created_at: new Date(Date.UTC(2026, 10, 18, 0, 0, id)).toISOString(), html_url: `${REPO_URL}/pull/7#issuecomment-${id}` };
    state.comments.push(comment);
    return comment;
  };
  async function fetchImpl(url, init = {}) {
    const method = init.method ?? "GET";
    const body = init.body === undefined ? undefined : JSON.parse(init.body);
    const path = new URL(url).pathname.replace(/^\/repos\/owner\/widgets/, "");
    let m;
    if (method === "GET") {
      if (path === "/pulls/7") return respond(state.pull);
      if (path === "/pulls/7/files") return respond([{ filename: "g/nodes.ttl" }]);
      if ((m = /^\/git\/trees\/(\w+)$/.exec(path))) return state.trees[m[1]] ? respond(state.trees[m[1]]) : notFound();
      if ((m = /^\/git\/blobs\/(\w+)$/.exec(path))) return respond({ encoding: "base64", content: Buffer.from(blobs.get(m[1])).toString("base64") });
      if (path === "/issues/7/comments") return respond(state.comments);
      if ((m = /^\/collaborators\/([^/]+)\/permission$/.exec(path))) {
        const role = state.roles[decodeURIComponent(m[1])];
        return role ? respond({ role_name: role, permission: role === "triage" ? "triage" : "write" }) : notFound();
      }
      if (path === "/labels/graph-naming-deferred") return state.labels.includes("graph-naming-deferred") ? respond({ name: "graph-naming-deferred" }) : notFound();
      if (path === "/issues") return respond(state.issues.filter((issue) => issue.state === "open"));
    }
    if (method === "POST") {
      if (path === "/issues/7/comments") return respond(addComment(body.body, "github-actions[bot]"), 201);
      if ((m = /^\/statuses\/([0-9a-f]{40})$/.exec(path))) { state.statuses.push({ sha: m[1], ...body }); return respond({}, 201); }
      if (path === "/labels") { state.labels.push(body.name); return respond({ name: body.name }, 201); }
      if (path === "/issues") {
        const issue = { number: 501 + state.issues.length, state: "open", title: body.title, body: body.body, labels: body.labels.map((name) => ({ name })) };
        state.issues.push(issue);
        return respond(issue, 201);
      }
      if ((m = /^\/issues\/(\d+)\/comments$/.exec(path))) { state.issueComments.push({ issue: Number(m[1]), body: body.body }); return respond({}, 201); }
    }
    if (method === "PATCH" && (m = /^\/issues\/comments\/(\d+)$/.exec(path))) {
      const comment = state.comments.find((c) => c.id === Number(m[1]));
      comment.body = body.body;
      return respond(comment);
    }
    return respond({ message: `unexpected ${method} ${path}` }, 500);
  }
  return {
    state, fetchImpl,
    comment: (body, login) => addComment(body, login),
    pushHead(sha) { state.trees[sha] = state.trees[HEAD]; state.pull = { ...state.pull, head: { sha, repo: { id: 1 } }, merge_commit_sha: null }; },
    summary: () => state.comments.find((c) => c.user.login === "github-actions[bot]" && c.body.includes("<!-- ontology-graph-naming v1 ")),
    notifications: () => state.comments.filter((c) => c.body.startsWith("Graph naming review found")),
    statusOn: (sha) => state.statuses.filter((s) => s.sha === sha && s.context === "ontology/graph-naming").at(-1),
  };
}

async function installed(withStandIns) {
  const stand = await modelStandIn(JSON.stringify(REPLY));
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withSourceGraph: true, withGraphNamingReview: true });
      const load = (name) => import(pathToFileURL(join(repo.dir, "scripts", name)).href);
      const worker = await load("graph-naming-worker.mjs");
      const { createGitHubClient } = await load("semantic-review-github.mjs");
      const { createModelAuth } = await load("llm-auth.mjs");
      const gh = gitHubStandIn(await load("source-graph-test-helpers.mjs"));
      const client = createGitHubClient({ token: "t", repository: "owner/widgets", fetchImpl: gh.fetchImpl });
      const auth = createModelAuth({ env: { K: "k" }, staticKeyVar: "K" });
      const config = (namingReview) => ({ ontologyPath: "docs/ontology.md", sections: { required: ["Entities"], optional: [] },
        sourceGraph: { enabled: true, root: "g", evidence: {}, namingReview } });
      const review = (triggerRunId, namingReview = { enabled: true, model: "m", baseUrl: stand.url }) =>
        worker.runGraphNamingReview({ client, pull: gh.state.pull, config: config(namingReview), auth, env: {}, deps: { triggerRunId } });
      const settle = (comment) => worker.handleSettlementEvent({ client, event: { action: "created", issue: { number: 7, pull_request: {} }, comment } });
      await withStandIns({ gh, review, settle, stand });
    });
  } finally { stand.close(); }
}

test("an installed review reports a mismatch, takes one deferral and keeps it across a push", async () => {
  await installed(async ({ gh, review, settle }) => {
    const run = await review("81:1");
    assert.equal(run.outcome, "reviewed");
    assert.equal(gh.statusOn(HEAD).state, "failure");
    assert.equal(gh.statusOn(MERGE).state, "failure");
    assert.match(gh.summary().body, /### R1 — unsettled/);
    assert.match(gh.summary().body, /label "RemovalJob" with `:SessionRemoval`/);
    await settle(gh.comment("/graph-naming accept R1", "visitor"));
    assert.equal(gh.statusOn(HEAD).state, "failure");
    assert.match(gh.summary().body, /by @visitor was ignored: author does not have write access/);
    await settle(gh.comment("/graph-naming defer R1 ask the domain experts", "reviewer"));
    assert.equal(gh.state.issues.length, 1);
    assert.deepEqual(gh.state.issues[0].labels, [{ name: "graph-naming-deferred" }]);
    assert.equal(gh.statusOn(HEAD).state, "success");
    gh.pushHead(HEAD2);
    await review("82:1");
    assert.equal(gh.state.issues.length, 1);
    assert.equal(gh.statusOn(HEAD2).state, "success");
    assert.equal(gh.notifications().length, 1);
    assert.match(gh.summary().body, /### R1 — deferred by @reviewer to #501/);
  });
});

test("an installed review with the setting absent posts a disabled success and calls no model", async () => {
  await installed(async ({ gh, review, stand }) => {
    await review("81:1", { enabled: false, model: "", baseUrl: "" });
    assert.equal(gh.statusOn(HEAD).state, "success");
    assert.equal(gh.statusOn(HEAD).description, "Graph naming review disabled; not reviewed");
    assert.equal(stand.requests, 0);
  });
});
