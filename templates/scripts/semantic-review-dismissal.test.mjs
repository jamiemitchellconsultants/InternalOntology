import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDismissal, readDismissals, handleDismissal } from "./semantic-review-dismissal.mjs";
import { publishRun } from "./semantic-review-ledger.mjs";

const id = "f".repeat(64);
const otherId = "e".repeat(64);
const sha = "a".repeat(40);
const command = `/ontology-dismiss ${id} ${sha} False positive: historical quotation`;
const finding = { id, path: "docs/a.md", quote: "old", evidenceKey: "Entities:Invoice",
  reason: "wrong", suggestion: "use Invoice" };
const run = { schema: 1, prNumber: 7, headSha: sha, mergeSha: "b".repeat(40), triggerRunId: 81,
  outcome: "reviewed", eligible: ["docs/a.md"], reviewed: ["docs/a.md"], unreviewed: [], findings: [finding] };
const pull = { number: 7, head: { sha }, merge_commit_sha: run.mergeSha };

test("the dismissal command requires an ID, revision, and reason", () => {
  assert.deepEqual(parseDismissal(command), { findingId: id, headSha: sha,
    reason: "False positive: historical quotation" });
  assert.equal(parseDismissal(`/ontology-dismiss ${id} ${sha}`), null);
  assert.equal(parseDismissal(`I suggest ${command}`), null);
  assert.equal(parseDismissal(`> ${command}`), null);
});

test("only a current maintainer comment dismisses the current finding", async () => {
  const comments = [
    { user: { login: "maintainer" }, body: command },
    { user: { login: "admin" }, body: command },
    { user: { login: "author" }, body: command },
    { user: { login: "reader" }, body: command },
  ];
  const client = {
    getAll: async () => comments,
    get: async (path) => ({ role_name: path.includes("maintainer") ? "maintain" :
      path.includes("admin") ? "admin" : path.includes("author") ? "write" : "read" }),
  };
  const result = await readDismissals(client, pull, run);
  assert.deepEqual(result.map((item) => item.author), ["maintainer", "admin"]);
});

test("one dismissal leaves another finding active and survives same-SHA reruns", async () => {
  const second = { ...finding, id: otherId, quote: "another" };
  const client = { getAll: async () => [{ user: { login: "maintainer" }, body: command }],
    get: async () => ({ role_name: "maintain" }) };
  const dismissals = await readDismissals(client, pull, { ...run, findings: [finding, second] });
  assert.deepEqual(dismissals.map((item) => item.findingId), [id]);
  const rerun = await readDismissals(client, pull, { ...run, triggerRunId: 82, findings: [finding, second] });
  assert.deepEqual(rerun, dismissals);
  assert.deepEqual(await readDismissals(client, { ...pull, head: { sha: "c".repeat(40) } },
    { ...run, headSha: "c".repeat(40) }), []);
});

function workflowClient() {
  const comments = [];
  const statuses = [];
  return { comments, statuses,
    get: async (path) => path === "/pulls/7" ? pull : { role_name: "maintain" },
    getAll: async () => comments,
    post: async (path, body) => {
      if (path.includes("/statuses/")) statuses.push(body);
      else if (path === "/issues/7/comments") {
        const comment = { body: body.body, user: { login: "github-actions[bot]" },
          html_url: `https://example.test/${comments.length + 1}` };
        comments.push(comment);
        return comment;
      }
      return {};
    },
  };
}

test("created and deleted commands recompute the current status without a model call", async () => {
  const client = workflowClient();
  await publishRun(client, pull, run);
  client.comments.push({ user: { login: "maintainer" }, body: command });
  const event = { action: "created", issue: { number: 7, pull_request: {} },
    comment: { user: { login: "maintainer" }, body: command } };
  assert.deepEqual(await handleDismissal({ client, event }), { handled: true, reason: "status reconciled" });
  assert.equal(client.statuses.at(-1).state, "success");
  client.comments.pop();
  assert.deepEqual(await handleDismissal({ client, event: { ...event, action: "deleted" } }),
    { handled: true, reason: "status reconciled" });
  assert.equal(client.statuses.at(-1).state, "failure");
});

test("editing away a command restores failure, and a write-role author cannot dismiss", async () => {
  const client = workflowClient();
  await publishRun(client, pull, run);
  const comment = { user: { login: "maintainer" }, body: command };
  client.comments.push(comment);
  const event = { action: "created", issue: { number: 7, pull_request: {} }, comment };
  await handleDismissal({ client, event });
  assert.equal(client.statuses.at(-1).state, "success");
  comment.body = "This is a correction proposal";
  await handleDismissal({ client, event: { ...event, action: "edited" } });
  assert.equal(client.statuses.at(-1).state, "failure");
  const restricted = workflowClient();
  restricted.get = async (path) => path === "/pulls/7" ? pull : { role_name: "write" };
  assert.deepEqual(await handleDismissal({ client: restricted, event: { ...event, comment: { ...comment, body: command } } }),
    { handled: false, reason: "not a maintainer" });
  assert.deepEqual(restricted.statuses, []);
});

test("ordinary correction proposals do not trigger dismissal", async () => {
  const client = workflowClient();
  const result = await handleDismissal({ client, event: { action: "created", issue: { number: 7, pull_request: {} },
    comment: { user: { login: "agent" }, body: `Proposed correction for ${id}: use Invoice` } } });
  assert.deepEqual(result, { handled: false, reason: "not a dismissal command" });
  assert.deepEqual(client.statuses, []);
});
