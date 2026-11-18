// Acceptance tests for the live reply-parsing defect (JEPA-Speech#208): the INSTALLED semantic reviewer
// against a local HTTP stand-in that returns the reply the real gateway returned, verbatim in shape:
// fenced JSON with singular "Enum:" evidence keys. Nothing here calls a real model or GitHub.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { install } from "../bin/install-ontology.mjs";
import { withTempRepo } from "./helpers/temp-repo.mjs";

const head = "a".repeat(40);
const pull = { number: 7, head: { sha: head }, merge_commit_sha: "b".repeat(40) };
const sections = { required: ["Enums"], optional: [] };
const ontologyText = ["## Enums", "", "| Name | Values |", "| --- | --- |",
  "| `SessionRemovalState` | `Requested`, `Removing`, `Removed`, `Failed` |",
  "| `RemovalReason` | `TesterWithdrew`, `TestRecording`, `BadRecording`, `Other` |", ""].join("\n");
const fileText = "Removal states are pending, running, done and failed.\nReasons are tester left, test run, bad take or miscellaneous.\n";
const findings = [
  { quote: "pending, running, done and failed", evidenceKey: "Enum:SessionRemovalState",
    reason: "The file uses informal state names that conflict with the enum's defined values.",
    suggestion: "Requested, Removing, Removed and Failed" },
  { quote: "tester left, test run, bad take or miscellaneous", evidenceKey: "Enum:RemovalReason",
    reason: "The file uses informal reason labels that conflict with the enum's defined values.",
    suggestion: "tester withdrew, test recording, bad recording or other" },
];
const fenced = "```json\n" + JSON.stringify({ findings }, null, 2) + "\n```";

async function standIn(content) {
  const server = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] }));
    });
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

function fakeClient() {
  const comments = [];
  const statuses = [];
  return { comments, statuses, get: async () => pull, getAll: async () => comments,
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

async function runInstalled(content) {
  const stand = await standIn(content);
  let outcome;
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
      const load = (name) => import(pathToFileURL(join(repo.dir, "scripts", name)).href);
      const worker = await load("semantic-review-worker.mjs");
      const model = await load("semantic-review-model.mjs");
      const { createModelAuth } = await load("llm-auth.mjs");
      const client = fakeClient();
      const config = { ontologyPath: "docs/ontology.md", ignorePaths: [], sections,
        semanticReview: { enabled: true, model: "ontology-review", baseUrl: stand.url } };
      const run = await worker.runSemanticReview({ client, pull, config, env: {},
        auth: createModelAuth({ env: { K: "k" }, staticKeyVar: "K" }),
        deps: { isEligiblePull: async () => true, triggerRunId: "81:1",
          collectReviewInput: async () => ({ files: [{ path: "docs/removal.md", text: fileText }], ontologyText, unreviewed: [] }),
          reviewFiles: (input) => model.reviewFiles({ ...input, fetchImpl: fetch }) } });
      outcome = { run, client };
    });
    return outcome;
  } finally { stand.close(); }
}

test("a fenced reply with singular section keys yields blocking, grounded findings", async () => {
  const { run, client } = await runInstalled(fenced);
  assert.equal(run.outcome, "reviewed");
  assert.deepEqual(run.findings.map((item) => item.evidenceKey), ["Enums:SessionRemovalState", "Enums:RemovalReason"]);
  assert.equal(client.statuses.at(-1).state, "failure");
  assert.match(client.comments.at(-1).body, /Enums:SessionRemovalState/);
  assert.doesNotMatch(client.comments.at(-1).body, /Enum:SessionRemovalState/);
});

test("an unusable reply is reported with a specific fixed reason in the pull request comment", async () => {
  for (const [content, reason] of [["not json at all SECRET-TEXT", "model reply was not valid JSON"],
    ["", "model reply was empty"]]) {
    const { run, client } = await runInstalled(content);
    assert.equal(run.outcome, "unavailable");
    assert.equal(client.statuses.at(-1).state, "success");
    const comment = client.comments.at(-1).body;
    assert.match(comment, new RegExp(`Not reviewed: \`docs/removal\\.md\` — ${reason}`));
    assert.doesNotMatch(comment, /SECRET-TEXT/);
    assert.doesNotMatch(comment, /model assessment was unusable/);
  }
});

test("a finding that cites a name the ontology does not have is reported as an unknown evidence key", async () => {
  const bad = JSON.stringify({ findings: [{ ...findings[0], evidenceKey: "Enums:NoSuchEnum" }] });
  const { run, client } = await runInstalled(bad);
  assert.equal(run.outcome, "unavailable");
  assert.match(client.comments.at(-1).body, /finding cites an unknown evidence key/);
});
