// Acceptance tests for feature #111 (docs/features/semantic-request-budget/): the INSTALLED semantic
// reviewer against a roughly 60 KB ontology, over real HTTP to a local stand-in for the model endpoint.
// Nothing here calls a real model, GitHub or the gateway.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { install } from "../bin/install-ontology.mjs";
import { withTempRepo } from "./helpers/temp-repo.mjs";

const KIT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const head = "a".repeat(40);
const pull = { number: 7, head: { sha: head }, merge_commit_sha: "b".repeat(40) };
const sections = { required: ["Entities"], optional: [] };

function largeOntology(rows) {
  const entities = Array.from({ length: rows }, (_, index) =>
    `| \`Entity${index}\` | A canonical entity number ${index} with a reasonably long one line description of its role. |`);
  return ["## Entities", "", "| Name | Description |", "| --- | --- |", ...entities, ""].join("\n");
}

async function modelStandIn() {
  const state = { requests: 0, sizes: [] };
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      state.requests += 1;
      state.sizes.push(body.length);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ findings: [] }) } }] }));
    });
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return { state, url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

function fakeClient() {
  const comments = [];
  const statuses = [];
  return { comments, statuses,
    get: async () => pull,
    getAll: async () => comments,
    post: async (path, body) => {
      if (path === "/issues/7/comments") {
        const comment = { id: comments.length + 1, body: body.body, user: { login: "github-actions[bot]" },
          html_url: `https://github.example/c/${comments.length + 1}` };
        comments.push(comment);
        return comment;
      }
      statuses.push(body);
      return {};
    } };
}

const installed = async (repo, name) => import(pathToFileURL(join(repo.dir, "scripts", name)).href);

async function load(repo) {
  const model = await installed(repo, "semantic-review-model.mjs");
  const worker = await installed(repo, "semantic-review-worker.mjs");
  const { createModelAuth } = await installed(repo, "llm-auth.mjs");
  return { model, worker, auth: createModelAuth({ env: { K: "k" }, staticKeyVar: "K" }) };
}

const review = (model, auth, baseUrl, extra = {}) => model.reviewFiles({
  files: [{ path: "docs/a.md", text: "A plain sentence." }], ontologyText: largeOntology(600), sections,
  model: "ontology-review", baseUrl, auth, headSha: head, ...extra });

test("B1 B15 a 60 KB ontology reaches the model with the default budget and the file is reviewed", async () => {
  const stand = await modelStandIn();
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
      const { model, auth } = await load(repo);
      const result = await review(model, auth, stand.url);
      assert.deepEqual(result.reviewed, ["docs/a.md"]);
      assert.deepEqual(result.unreviewed, []);
    });
    assert.ok(stand.state.requests >= 1);
    assert.ok(stand.state.sizes.every((size) => size <= 200_000));
  } finally { stand.close(); }
});

test("B7 a budget the ontology cannot fit makes no request and codes the file too-large", async () => {
  const stand = await modelStandIn();
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
      const { model, auth } = await load(repo);
      const result = await review(model, auth, stand.url, { maxRequestChars: 24_000 });
      assert.deepEqual(result.reviewed, []);
      assert.equal(result.unreviewed[0].code, "too-large");
      assert.match(result.unreviewed[0].reason, /ontology too large for the configured budget/);
    });
    assert.equal(stand.state.requests, 0);
  } finally { stand.close(); }
});

test("B7 B8 a too-large run publishes success naming the budget, never an outage", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
    const { model, worker, auth } = await load(repo);
    const client = fakeClient();
    const config = { ontologyPath: "docs/ontology.md", ignorePaths: [], sections,
      semanticReview: { enabled: true, model: "m", baseUrl: "http://127.0.0.1:1/v1" } };
    const run = await worker.runSemanticReview({ client, pull, config, auth, env: { ONTOLOGY_MAX_REQUEST_CHARS: "24000" },
      deps: { isEligiblePull: async () => true, triggerRunId: "81:1",
        collectReviewInput: async () => ({ files: [{ path: "docs/a.md", text: "A plain sentence." }],
          ontologyText: largeOntology(600), unreviewed: [] }),
        reviewFiles: model.reviewFiles } });
    assert.equal(run.outcome, "too-large");
    const last = client.statuses.at(-1);
    assert.equal(last.state, "success");
    assert.match(last.description, /ontology too large for the configured budget/);
    assert.match(last.description, /ONTOLOGY_MAX_REQUEST_CHARS/);
    assert.doesNotMatch(last.description, /service or configuration unavailable/);
    assert.match(client.comments.at(-1).body, /permits merge/);
  });
});

test("B5 a junk budget setting publishes an explained unavailable run and fails the job", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
    const { worker, auth } = await load(repo);
    const client = fakeClient();
    const config = { ontologyPath: "docs/ontology.md", ignorePaths: [], sections,
      semanticReview: { enabled: true, model: "m", baseUrl: "http://127.0.0.1:1/v1" } };
    await assert.rejects(worker.runSemanticReview({ client, pull, config, auth, env: { ONTOLOGY_MAX_REQUEST_CHARS: "abc" },
      deps: { isEligiblePull: async () => true, triggerRunId: "81:1",
        collectReviewInput: async () => ({ files: [{ path: "docs/a.md", text: "x" }], ontologyText: largeOntology(5), unreviewed: [] }),
        reviewFiles: async () => { throw new Error("must not call the model"); } } }),
      /ONTOLOGY_MAX_REQUEST_CHARS must be a positive integer, got "abc"/);
    assert.equal(client.statuses.at(-1).state, "success");
    assert.match(client.comments.at(-1).body, /ONTOLOGY_MAX_REQUEST_CHARS must be a positive integer, got "abc"/);
  });
});

test("B17 the installed budget module is the template, and both reviewers import it", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true, withDriftReview: true });
    for (const file of ["request-budget.mjs", "request-budget.test.mjs", "semantic-review-model.mjs",
      "semantic-review-worker.mjs", "semantic-review-ledger.mjs", "review-ontology-drift.mjs"]) {
      assert.equal(readFileSync(join(repo.dir, "scripts", file), "utf8"), readFileSync(join(KIT, "templates/scripts", file), "utf8"), file);
    }
    for (const file of ["semantic-review-model.mjs", "semantic-review-worker.mjs", "review-ontology-drift.mjs"]) {
      assert.match(readFileSync(join(repo.dir, "scripts", file), "utf8"), /from "\.\/request-budget\.mjs"/, file);
    }
  });
});

test("B6 B16 the installed workflow and runbook carry the variables", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
    const yaml = readFileSync(join(repo.dir, ".github/workflows/ontology-semantic-review.yml"), "utf8");
    assert.match(yaml, /ONTOLOGY_MAX_REQUEST_CHARS: \$\{\{ vars\.ONTOLOGY_MAX_REQUEST_CHARS \}\}/);
    assert.match(yaml, /ONTOLOGY_MODEL_TIMEOUT_MS: \$\{\{ vars\.ONTOLOGY_MODEL_TIMEOUT_MS \}\}/);
    const doc = readFileSync(join(repo.dir, "docs/ontology-semantic-review.md"), "utf8");
    for (const expected of ["200,000 characters", "ontology too large for the configured budget", "was 30,000 ms"]) {
      assert.ok(doc.includes(expected), `runbook lacks ${expected}`);
    }
  });
});
