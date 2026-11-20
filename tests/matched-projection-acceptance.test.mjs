// Acceptance tests for feature #135 (docs/features/matched-ontology-projection/): the INSTALLED
// semantic reviewer sends matched projections to a local stand-in for the model endpoint.
// Nothing here calls a real model, GitHub or the gateway.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { install } from "../bin/install-ontology.mjs";
import { withTempRepo } from "./helpers/temp-repo.mjs";

const KIT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const head = "a".repeat(40);
const pull = { number: 7, head: { sha: head }, merge_commit_sha: "b".repeat(40) };
const sections = { required: ["Entities", "Enums", "Relationships"], optional: [] };
const ontology = [
  "## Entities", "",
  "| Name | Description |", "| --- | --- |",
  "| `AuditEvent` | One metadata record. |",
  "| `SessionRemoval` | Removes a `StudySession`. |",
  "| `StudySession` | One stored session. |",
  "| `Microphone` | Unrelated. |",
  "",
  "## Enums", "",
  "| Name | Values | Description |", "| --- | --- | --- |",
  "| `SessionRemovalState` | `Requested`, `Removing`, `Removed`, `Failed` | Where a `SessionRemoval` stands. |",
  "",
  "## Relationships", "",
  "| From | Relationship | To | Cardinality |", "| --- | --- | --- | --- |",
  "| `SessionRemoval` | removes | `StudySession` | 1 → 1 |",
  "",
].join("\n");
const passage = "the removal moves through the states pending, running, done and failed";

async function modelStandIn(findings = []) {
  const state = { bodies: [] };
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      state.bodies.push(body);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ findings }) } }] }));
    });
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return { state, url: `http://127.0.0.1:${server.address().port}/v1`, close: () => server.close() };
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
  const { createModelAuth } = await installed(repo, "llm-auth.mjs");
  return { model: await installed(repo, "semantic-review-model.mjs"), worker: await installed(repo, "semantic-review-worker.mjs"),
    config: await installed(repo, "ontology-config.mjs"), auth: createModelAuth({ env: { K: "k" }, staticKeyVar: "K" }) };
}

async function workerRun(modules, url, semanticReview, text = passage, env = {}) {
  const client = fakeClient();
  const config = { ontologyPath: "docs/ontology.md", ignorePaths: [], sections, bannedAliases: [],
    semanticReview: { enabled: true, model: "m", baseUrl: url, ...semanticReview } };
  const run = await modules.worker.runSemanticReview({ client, pull, config, auth: modules.auth, env,
    deps: { isEligiblePull: async () => true, triggerRunId: "81:1",
      collectReviewInput: async () => ({ files: [{ path: "docs/a.md", text }], ontologyText: ontology, unreviewed: [] }) } });
  return { run, client };
}

const system = (body) => JSON.parse(body).messages[0].content;

test("B1 B10 B15 B20 an unchanged config sends a matched projection and records it", async () => {
  const stand = await modelStandIn();
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
      const modules = await load(repo);
      const parsed = modules.config.validateConfig({ ontologyPath: "docs/ontology.md",
        semanticReview: { enabled: true, model: "m", baseUrl: stand.url } }, { ontologyExists: () => true });
      assert.equal(parsed.semanticReview.projection, "matched");
      const { run, client } = await workerRun(modules, stand.url, { projection: parsed.semanticReview.projection });
      const prompt = system(stand.state.bodies[0]);
      assert.match(prompt, /\| `SessionRemovalState` \|/);
      assert.match(prompt, /\| `SessionRemoval` \| Removes/);
      assert.doesNotMatch(prompt, /\| `Microphone` \|/);
      assert.match(prompt, /\nEntities: AuditEvent, SessionRemoval, StudySession, Microphone\n/);
      assert.equal(run.outcome, "reviewed");
      const catalog = modules.model.catalogOntology(ontology, sections);
      assert.deepEqual(run.projections.map(({ path, mode, entriesTotal, fullChars }) => ({ path, mode, entriesTotal, fullChars })),
        [{ path: "docs/a.md", mode: "matched", entriesTotal: catalog.evidenceKeys.size, fullChars: catalog.projection.length }]);
      assert.ok(run.projections[0].largestChars < catalog.projection.length);
      assert.match(client.comments.at(-1).body, /- Ontology projection for `docs\/a\.md`: matched, \d+ of 6 entries with full rows/);
      assert.equal(client.statuses.at(-1).description, "Semantic match reviewed 1 file(s); no active findings");
    });
  } finally { stand.close(); }
});

test("B21 projection full sends today's request byte for byte", async () => {
  const stand = await modelStandIn();
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
      const modules = await load(repo);
      const { run } = await workerRun(modules, stand.url, { projection: "full" });
      await modules.model.reviewFiles({ files: [{ path: "docs/a.md", text: passage }], ontologyText: ontology, sections,
        model: "m", baseUrl: stand.url, auth: modules.auth, headSha: head });
      assert.equal(stand.state.bodies.length, 2);
      assert.equal(stand.state.bodies[0], stand.state.bodies[1]);
      assert.equal(run.projections[0].mode, "full");
      assert.equal(run.projections[0].largestChars, run.projections[0].fullChars);
    });
  } finally { stand.close(); }
});

test("B9 B12 B14 a name-only citation is accepted with the same identity in both modes, and runs repeat exactly", async () => {
  const stand = await modelStandIn([{ quote: "pending, running, done and failed", evidenceKey: "Entities:Microphone", reason: "r", suggestion: "s" }]);
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
      const modules = await load(repo);
      const matched = await workerRun(modules, stand.url, {});
      const again = await workerRun(modules, stand.url, {});
      const full = await workerRun(modules, stand.url, { projection: "full" });
      assert.doesNotMatch(system(stand.state.bodies[0]), /\| `Microphone` \|/);
      assert.equal(stand.state.bodies[0], stand.state.bodies[1]);
      assert.equal(matched.run.findings.length, 1);
      assert.equal(matched.run.findings[0].id, full.run.findings[0].id);
      assert.equal(again.run.findings[0].id, matched.run.findings[0].id);
      assert.equal(matched.client.statuses.at(-1).state, "failure");
    });
  } finally { stand.close(); }
});

test("B16 a key outside the name index is still rejected", async () => {
  const stand = await modelStandIn([{ quote: "pending", evidenceKey: "Entities:Nowhere", reason: "r", suggestion: "s" }]);
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
      const { run } = await workerRun(await load(repo), stand.url, {});
      assert.deepEqual(run.unreviewed, [{ path: "docs/a.md", reason: "finding cites an unknown evidence key" }]);
    });
  } finally { stand.close(); }
});

test("B13 B18 a budget below the name index is too-large; a matchless file is reviewed with the name index", async () => {
  const stand = await modelStandIn();
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
      const modules = await load(repo);
      const nothing = await workerRun(modules, stand.url, {}, "Plain words only.");
      assert.equal(nothing.run.outcome, "reviewed");
      assert.equal(nothing.run.projections[0].entriesSent, 0);
      assert.doesNotMatch(system(stand.state.bodies[0]), /\| `/);
      const tooLarge = await workerRun(modules, stand.url, {}, "Plain words only.", { ONTOLOGY_MAX_REQUEST_CHARS: "1100" });
      assert.equal(tooLarge.run.outcome, "too-large");
      assert.equal(stand.state.bodies.length, 1);
    });
  } finally { stand.close(); }
});

test("B20 the projection module is installed with the semantic reviewer only", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
    for (const name of ["ontology-projection.mjs", "ontology-projection.test.mjs"]) {
      assert.equal(readFileSync(join(repo.dir, "scripts", name), "utf8"), readFileSync(join(KIT, "templates/scripts", name), "utf8"));
    }
  });
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withSourceGraph: true, withGraphNamingReview: true });
    assert.equal(existsSync(join(repo.dir, "scripts/ontology-projection.mjs")), false);
    await installed(repo, "semantic-review-model.mjs");
    await installed(repo, "graph-naming-worker.mjs");
  });
});

test("B23 the installed runbook describes the modes, the record line and the caveats", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
    const doc = readFileSync(join(repo.dir, "docs/ontology-semantic-review.md"), "utf8");
    for (const expected of ['"matched"', '"full"', "Ontology projection for", "paraphrase", "update the kit first",
      "ontology.ttl", "ontology.md", "other end", "Each key is a section name", "paragraph",
      "ontology name index too large for the configured budget", "selects too much of the ontology for the configured budget",
      "data, info, item, kind, list, name, type, value, values, state, status, record, result, config, event, events"]) {
      assert.ok(doc.includes(expected), `runbook lacks ${expected}`);
    }
  });
});
