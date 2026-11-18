import { test } from "node:test";
import assert from "node:assert/strict";
import { STATUS_CONTEXT, DEFERRED_LABEL, BOT_LOGIN, MARKER_PREFIX, emptyLedger, encodeLedger, readLedger, assignLabels, statusFor,
  isNewerTrigger, publishPending, publishState } from "./graph-naming-ledger.mjs";
import { HEAD, HEAD2, MERGE, REPO_URL, pullFixture, namingResult, namingRun, fakeGitHub, summaryOf, lastStatus } from "./graph-naming-test-helpers.mjs";

const r1 = namingResult(1), r2 = namingResult(2), r3 = namingResult(3);
const team = { roles: { reviewer: "write", lead: "maintain", owner: "admin", triager: "triage", reader: "read" } };
const setup = async (results) => { const client = fakeGitHub(team); await publishState({ client, pull: client.state.pull, run: namingRun(results) }); return client; };
const recompute = (client) => publishState({ client, pull: client.state.pull });

test("the ledger round-trips through a bot comment and nothing else is trusted", () => {
  assert.deepEqual([STATUS_CONTEXT, DEFERRED_LABEL, BOT_LOGIN], ["ontology/graph-naming", "graph-naming-deferred", "github-actions[bot]"]);
  const ledger = { ...emptyLedger(7), labels: { k: "R1" }, next: 2 };
  const marker = encodeLedger(ledger);
  assert.ok(marker.startsWith(MARKER_PREFIX) && marker.endsWith(" -->"));
  const bot = { id: 1, user: { login: BOT_LOGIN }, body: `summary\n\n${marker}` };
  assert.deepEqual(readLedger([bot], 7), { ledger, comment: bot });
  assert.deepEqual(readLedger([{ ...bot, user: { login: "mallory" } }], 7), { ledger: emptyLedger(7), comment: null });
  assert.deepEqual(readLedger([bot], 8).ledger, emptyLedger(8));
  assert.deepEqual(readLedger([{ ...bot, body: `${MARKER_PREFIX}data=!!! -->` }], 7), { ledger: emptyLedger(7), comment: null });
  const later = { ...bot, id: 2, body: `later\n\n${encodeLedger({ ...ledger, next: 9 })}` };
  assert.equal(readLedger([later, bot], 7).comment.id, 1);
});

test("B35: R labels follow first appearance and are never reused", () => {
  const ledger = emptyLedger(7);
  assert.deepEqual(assignLabels(ledger, [r1, r2]), [r1.key, r2.key]);
  assert.deepEqual(assignLabels(ledger, [r2, r3]), [r3.key]);
  assert.deepEqual(assignLabels(ledger, [r1]), []);
  assert.deepEqual([ledger.labels, ledger.next], [{ [r1.key]: "R1", [r2.key]: "R2", [r3.key]: "R3" }, 4]);
});

test("B33 and B37: the status fails only for unsettled or accepted results and describes every outcome", () => {
  const none = { unsettled: [], accepted: [], rejected: [], deferred: [] };
  for (const [outcome, description] of Object.entries({
    reviewed: "Graph naming reviewed 2 node(s); no results",
    partial: "Partial graph naming review; 1 node(s) not reviewed",
    unavailable: "Graph naming not reviewed: service or configuration unavailable",
    "too-large": "Graph naming not reviewed: ontology too large for the configured budget (raise ONTOLOGY_MAX_REQUEST_CHARS)",
    disabled: "Graph naming review disabled; not reviewed",
    "out-of-scope": "Graph naming not reviewed: PR is out of scope",
    "no-eligible": "Graph naming: no eligible graph or ontology changes",
  })) assert.deepEqual(statusFor(namingRun([], { outcome, reviewed: 2, unreviewedCount: 1 }), none), { state: "success", description }, outcome);
  assert.deepEqual(statusFor(namingRun([]), { unsettled: [r1, r2], accepted: [r3], rejected: [namingResult(4)], deferred: [] }),
    { state: "failure", description: "2 unsettled, 1 accepted awaiting correction; 1 rejected, 0 deferred" });
  assert.deepEqual(statusFor(namingRun([]), { ...none, rejected: [r1], deferred: [r2] }),
    { state: "success", description: "Graph naming: no result holds the merge (1 rejected, 1 deferred)" });
  assert.throws(() => statusFor(namingRun([], { outcome: "bogus" }), none), /Unknown graph naming outcome/);
});

test("trigger order compares run id, then attempt", () => {
  for (const [left, right, newer] of [["82:1", "81:3", true], ["81:2", "81:1", true], ["81:1", "81:1", false], [null, "81:1", false], ["80:9", "81:1", false]]) {
    assert.equal(isNewerTrigger(left, right), newer, `${left} vs ${right}`);
  }
});

test("pending is posted on head and merge at the start of a review", async () => {
  const client = fakeGitHub();
  await publishPending(client, client.state.pull);
  assert.deepEqual(client.state.statuses.map((s) => [s.sha, s.state, s.context, s.description]),
    [[HEAD, "pending", "ontology/graph-naming", "Graph naming review in progress"], [MERGE, "pending", "ontology/graph-naming", "Graph naming review in progress"]]);
});

test("B35: a run publishes one summary, a notification for new results and a failing status on head and merge", async () => {
  const client = fakeGitHub(team), pull = client.state.pull;
  assert.deepEqual(await publishState({ client, pull, run: namingRun([r1, r2]) }), { published: true, newKeys: [r1.key, r2.key] });
  const summary = summaryOf(client);
  const [, notice] = client.state.comments;
  assert.match(notice.body, /^Graph naming review found 2 new result\(s\) \(R1, R2\) on aaaaaaa\. Settle them from the summary: https:\/\/github\.example\/owner\/widgets\/pull\/7#issuecomment-\d+$/);
  for (const sha of [HEAD, MERGE]) {
    assert.deepEqual(lastStatus(client, sha), { sha, state: "failure", context: "ontology/graph-naming",
      description: "2 unsettled, 0 accepted awaiting correction; 0 rejected, 0 deferred", target_url: summary.html_url });
  }
  await publishState({ client, pull, run: namingRun([r1, r2], { triggerRunId: "82:1" }) });
  assert.equal(client.state.comments.length, 2);
  await publishState({ client, pull, run: namingRun([r1, r2, r3], { triggerRunId: "83:1" }) });
  assert.equal(client.state.comments.length, 3);
  assert.match(client.state.comments[2].body, /found 1 new result\(s\) \(R3\)/);
  assert.equal(summaryOf(client).id, summary.id);
});

test("B35: the summary lists each result in plain language with ready-to-copy commands and the deferral count", async () => {
  const body = summaryOf(await setup([r1])).body;
  for (const line of ["## Graph naming review — reviewed", "### R1 — unsettled", "- Node: `:node-r1` in `g/nodes.ttl`",
    "- Compared: label \"Label1\" with `:SessionRemoval` (implements)", "- Ontology item: `Entities:SessionRemoval`", "- Reason: reason 1",
    "- Suggested correction: Suggestion1",
    "- Settle: `/graph-naming accept R1` · `/graph-naming reject R1 <reason>` · `/graph-naming defer R1 <optional note>`",
    `Open deferral issues: 0 — [list](${REPO_URL}/issues?q=is%3Aissue+is%3Aopen+label%3Agraph-naming-deferred)`,
    "Settle every unsettled result at once with `/graph-naming accept all`, `/graph-naming reject all <reason>` or `/graph-naming defer all <optional note>`.",
    "Anyone with write access may settle a result; agents never settle results."]) assert.ok(body.includes(line), line);
  assert.ok(body.trimEnd().split("\n").at(-1).startsWith(MARKER_PREFIX));
});

test("B37: an accepted result keeps holding the merge until a run no longer reports it", async () => {
  const client = await setup([r1, r2]);
  client.comment("/graph-naming accept R1");
  client.comment("/graph-naming reject R2 the ontology is wrong here");
  await recompute(client);
  assert.deepEqual([lastStatus(client).state, lastStatus(client).description], ["failure", "0 unsettled, 1 accepted awaiting correction; 1 rejected, 0 deferred"]);
  assert.match(summaryOf(client).body, /### R1 — accepted by @reviewer, awaiting correction/);
  assert.match(summaryOf(client).body, /### R2 — rejected by @reviewer: the ontology is wrong here/);
  await publishState({ client, pull: client.state.pull, run: namingRun([r2], { triggerRunId: "82:1" }) });
  assert.equal(lastStatus(client).state, "success");
});

test("B38: a rejection without a reason is not recorded and the summary says why", async () => {
  const client = await setup([r1]);
  const bad = client.comment("/graph-naming reject R1");
  await recompute(client);
  assert.equal(lastStatus(client).state, "failure");
  assert.ok(summaryOf(client).body.includes(`- [Command](${bad.html_url}) by @reviewer was ignored: a rejection needs a reason`));
});

test("B39: one defer action creates exactly one labelled issue with each result and links, and frees the merge", async () => {
  const client = await setup([r1, r2]);
  client.comment("/graph-naming defer R1,R2 ask the domain experts", "lead");
  await recompute(client);
  await recompute(client);
  assert.equal(client.state.issues.length, 1);
  assert.deepEqual(client.state.labels, ["graph-naming-deferred"]);
  const [issue] = client.state.issues;
  assert.equal(issue.title, "Deferred graph naming results from #7: R1, R2");
  assert.deepEqual(issue.labels, [{ name: "graph-naming-deferred" }]);
  for (const text of [`${REPO_URL}/pull/7`, HEAD, "@lead", "ask the domain experts", "`:node-r1`", "\"Label1\"", "`Entities:SessionRemoval`",
    "reason 2", "Suggestion2", `${REPO_URL}/blob/${HEAD}/g/nodes.ttl`, `${REPO_URL}/blob/${HEAD}/src/R1.cs`]) assert.ok(issue.body.includes(text), text);
  assert.equal(lastStatus(client).state, "success");
  assert.match(summaryOf(client).body, /### R1 — deferred by @lead to #501/);
  assert.match(summaryOf(client).body, /Open deferral issues: 1 — /);
});

test("B40: settlements survive a push that reports the same results, with no second issue or notification", async () => {
  const client = await setup([r1, r2]);
  client.comment("/graph-naming defer R1 later");
  client.comment("/graph-naming reject R2 fine");
  await recompute(client);
  client.state.pull = pullFixture({ head: { sha: HEAD2, repo: { id: 1 } }, merge_commit_sha: null });
  const before = client.state.comments.length;
  await publishState({ client, pull: client.state.pull, run: namingRun([r1, r2], { headSha: HEAD2, mergeSha: null, triggerRunId: "90:1" }) });
  assert.equal(client.state.comments.length, before);
  assert.equal(client.state.issues.length, 1);
  assert.equal(lastStatus(client, HEAD2).state, "success");
});

test("B41: replacing a deferral comments once on its issue, which stays open", async () => {
  const client = await setup([r1]);
  client.comment("/graph-naming defer R1");
  await recompute(client);
  const accept = client.comment("/graph-naming accept R1", "owner");
  await recompute(client);
  await recompute(client);
  assert.deepEqual(client.state.issueComments, [{ issue: 501, body: `R1 was accepted by @owner on ${REPO_URL}/pull/7: ${accept.html_url}` }]);
  assert.equal(client.state.issues[0].state, "open");
  assert.equal(lastStatus(client).state, "failure");
});

test("B42: write, maintain and admin may settle; triage, read and no role may not", async () => {
  for (const [login, held] of [["reviewer", false], ["lead", false], ["owner", false], ["triager", true], ["reader", true], ["stranger", true]]) {
    const client = await setup([r1]);
    client.comment("/graph-naming reject R1 no", login);
    await recompute(client);
    assert.equal(lastStatus(client).state === "failure", held, login);
  }
});

test("B43: settling a label whose result has gone records nothing and says it is no longer current", async () => {
  const client = await setup([r1, r2]);
  await publishState({ client, pull: client.state.pull, run: namingRun([r2], { triggerRunId: "82:1" }) });
  const late = client.comment("/graph-naming accept R1");
  await recompute(client);
  assert.ok(summaryOf(client).body.includes(`- [Command](${late.html_url}) by @reviewer: R1 is no longer current`));
  assert.equal(lastStatus(client).description, "1 unsettled, 0 accepted awaiting correction; 0 rejected, 0 deferred");
});

test("B44: publishing writes only comments, issues, labels and statuses", async () => {
  const client = await setup([r1]);
  client.comment("/graph-naming defer R1");
  await recompute(client);
  for (const [, path] of client.state.writes) assert.match(path, /^\/(issues(\/\d+\/comments|\/comments\/\d+)?|labels|statuses\/[0-9a-f]{40})$/, path);
});

test("a forged ledger in a reviewer's comment is not trusted", async () => {
  const client = fakeGitHub(team);
  client.comment(`text\n\n${encodeLedger({ ...emptyLedger(7), run: namingRun([]), labels: { [r1.key]: "R7" }, next: 8 })}`);
  assert.deepEqual((await publishState({ client, pull: client.state.pull, run: namingRun([r1]) })).newKeys, [r1.key]);
  assert.match(summaryOf(client).body, /### R1 — unsettled/);
});

test("a run for an old head publishes nothing, and a recompute after a push posts no status for the old run", async () => {
  const client = fakeGitHub(team);
  client.state.pull = pullFixture({ head: { sha: HEAD2, repo: { id: 1 } } });
  assert.deepEqual(await publishState({ client, pull: client.state.pull, run: namingRun([r1]) }), { published: false, newKeys: [] });
  assert.deepEqual(client.state.writes, []);
  client.state.pull = pullFixture();
  await publishState({ client, pull: client.state.pull, run: namingRun([r1]) });
  client.state.pull = pullFixture({ head: { sha: HEAD2, repo: { id: 1 } } });
  const statuses = client.state.statuses.length;
  client.comment("/graph-naming accept R1");
  await recompute(client);
  assert.equal(client.state.statuses.length, statuses);
  assert.match(summaryOf(client).body, /accepted by @reviewer/);
});

test("twenty maximal results fit in one GitHub comment", async () => {
  const cut = (text) => `${text.slice(0, 199)}…`;
  const long = "x".repeat(400);
  const results = Array.from({ length: 20 }, (_, i) => ({ ...namingResult(i, { node: `:node-${"n".repeat(60)}${i}` }),
    label: cut(long), value: cut(`:${long}`), reason: cut(long), suggestion: cut(long) }));
  const client = await setup(results);
  assert.ok(summaryOf(client).body.length <= 65_536);
});
