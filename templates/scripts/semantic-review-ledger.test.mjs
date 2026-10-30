import { test } from "node:test";
import assert from "node:assert/strict";
import { STATUS_CONTEXT, statusFor, publishPending, publishRun, readLatestRun, reconcileStatus } from "./semantic-review-ledger.mjs";

const sha = "a".repeat(40);
const finding = { id: "f".repeat(64), path: "docs/a.md", quote: "wrong term",
  evidenceKey: "Entities:Invoice", reason: "wrong", suggestion: "use Invoice" };
const run = { schema: 1, prNumber: 7, headSha: sha, mergeSha: "b".repeat(40),
  triggerRunId: 81, outcome: "reviewed", eligible: ["docs/a.md"],
  reviewed: ["docs/a.md"], unreviewed: [], findings: [finding] };
const pull = { number: 7, head: { sha }, merge_commit_sha: run.mergeSha };

function mockClient(currentPull = pull) {
  const posts = [];
  const comments = [];
  return { posts, comments,
    get: async (path) => {
      assert.equal(path, "/pulls/7");
      return currentPull;
    },
    getAll: async (path) => {
      assert.match(path, /\/issues\/7\/comments/);
      return comments;
    },
    post: async (path, body) => {
      posts.push({ path, body });
      if (path === "/issues/7/comments") {
        const comment = { id: comments.length + 1, body: body.body, user: { login: "github-actions[bot]" },
          html_url: `https://github.example/comment/${comments.length + 1}` };
        comments.push(comment);
        return comment;
      }
      return {};
    },
  };
}

test("an active finding fails; dismissing only that finding succeeds", () => {
  assert.equal(statusFor(run, []).state, "failure");
  assert.equal(statusFor(run, [{ findingId: finding.id, headSha: sha }]).state, "success");
});

test("later unavailable, disabled and no-eligible outcomes say what happened", () => {
  const later = { ...run, triggerRunId: 82, outcome: "unavailable", reviewed: [],
    unreviewed: [{ path: "docs/a.md", reason: "model offline" }], findings: [] };
  assert.equal(statusFor(later, []).state, "success");
  assert.match(statusFor(later, []).description, /not reviewed/i);
  assert.match(statusFor({ ...later, outcome: "disabled" }, []).description, /disabled/i);
  assert.match(statusFor({ ...later, outcome: "no-eligible" }, []).description, /no eligible/i);
  assert.match(statusFor({ ...later, outcome: "partial" }, []).description, /partial/i);
});

test("publication writes immutable record and fixed context on verified current head and merge SHA", async () => {
  const client = mockClient();
  await publishPending(client, pull, run);
  await publishRun(client, pull, run);
  const statuses = client.posts.filter((item) => item.path.includes("/statuses/"));
  assert.deepEqual(statuses.map((item) => item.body.state), ["pending", "pending", "failure", "failure"]);
  assert.deepEqual(statuses.map((item) => item.body.context), Array(4).fill(STATUS_CONTEXT));
  assert.match(client.comments[0].body, /wrong term/);
  assert.match(client.comments[0].body, /Entities:Invoice/);
  assert.match(client.comments[0].body, /use Invoice/);
  assert.equal(statuses[2].body.target_url, client.comments[0].html_url);
  assert.deepEqual(await readLatestRun(client, pull), run);
});

test("a stale run neither posts a comment nor changes status", async () => {
  const client = mockClient({ ...pull, head: { sha: "c".repeat(40) } });
  await assert.rejects(() => publishRun(client, pull, run), /stale/);
  assert.deepEqual(client.posts, []);
});

test("a changed test-merge SHA is not given a stale result", async () => {
  const client = mockClient({ ...pull, merge_commit_sha: "c".repeat(40) });
  await publishRun(client, pull, run);
  assert.deepEqual(client.posts.filter((item) => item.path.includes("/statuses/")).map((item) => item.path),
    [`/statuses/${sha}`]);
});

test("readLatestRun ignores forged markers and reads every comment page", async () => {
  const client = mockClient();
  await publishRun(client, pull, run);
  client.comments.push({ id: 99, user: { login: "author" }, body: client.comments[0].body });
  let pages = 0;
  client.getAll = async (path) => { pages++; assert.match(path, /per_page=100/); return client.comments; };
  assert.deepEqual(await readLatestRun(client, pull), run);
  assert.equal(pages, 1);
});

test("large run records split into parts and are reconstructed", async () => {
  const client = mockClient();
  const large = { ...run, findings: Array.from({ length: 200 }, (_, index) => ({ ...finding,
    id: index.toString(16).padStart(64, "0"), reason: "reason ".repeat(100) })) };
  await publishRun(client, pull, large);
  assert.ok(client.comments.length > 1);
  assert.deepEqual(await readLatestRun(client, pull), large);
});

test("a later unavailable run supersedes an earlier failure on the same SHA", async () => {
  const client = mockClient();
  await publishRun(client, pull, run);
  const later = { ...run, triggerRunId: 82, outcome: "unavailable", reviewed: [],
    unreviewed: [{ path: "docs/a.md", reason: "model offline" }], findings: [] };
  await publishRun(client, pull, later);
  assert.deepEqual(await readLatestRun(client, pull), later);
  assert.equal(client.posts.at(-1).body.state, "success");
  assert.match(client.posts.at(-1).body.description, /not reviewed/i);
  assert.equal(client.comments.length, 2);
});

test("reconciliation updates statuses without invoking a new model run or comment", async () => {
  const client = mockClient();
  await reconcileStatus(client, pull, run, [{ findingId: finding.id, headSha: sha }]);
  assert.equal(client.comments.length, 0);
  assert.deepEqual(client.posts.map((item) => item.body.state), ["success", "success"]);
});
