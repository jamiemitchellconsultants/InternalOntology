import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCommand, applyCommands, PERMITTED_ROLES } from "./graph-naming-commands.mjs";

test("B36: commands name an action and R labels or all, case-insensitively", () => {
  assert.deepEqual(parseCommand("/graph-naming accept R1"), { decision: "accepted", targets: ["R1"], text: "" });
  assert.deepEqual(parseCommand("  /Graph-Naming  ACCEPT  r1, r03,R3 \nthanks"), { decision: "accepted", targets: ["R1", "R3"], text: "thanks" });
  assert.deepEqual(parseCommand("/graph-naming reject all wrong layer\nmore detail"), { decision: "rejected", targets: "all", text: "wrong layer\nmore detail" });
  assert.deepEqual(parseCommand("/graph-naming defer R2"), { decision: "deferred", targets: ["R2"], text: "" });
  assert.deepEqual(parseCommand("/graph-naming defer R1,R2 ask the domain experts"), { decision: "deferred", targets: ["R1", "R2"], text: "ask the domain experts" });
});

test("B38: a rejection without a reason, and malformed commands, are invalid with a reason", () => {
  for (const [body, invalid] of [
    ["/graph-naming reject R2", "a rejection needs a reason"],
    ["/graph-naming reject R2   \n  ", "a rejection needs a reason"],
    ["/graph-naming", "name an action: accept, reject or defer"],
    ["/graph-naming approve R1", "unknown action approve; use accept, reject or defer"],
    ["/graph-naming accept", "name R labels, such as R1 or R1,R3, or all"],
    ["/graph-naming accept X1", "name R labels, such as R1 or R1,R3, or all"],
    ["/graph-naming accept all,R1", "name R labels, such as R1 or R1,R3, or all"],
  ]) assert.deepEqual(parseCommand(body), { invalid }, body);
});

test("text that is not a command is not parsed", () => {
  for (const body of [undefined, null, "", "thanks", "please /graph-naming accept R1", "> /graph-naming accept R1", "/graph-namingaccept R1", "/graph-naming-x accept R1"]) {
    assert.equal(parseCommand(body), null, String(body));
  }
});

const results = [{ key: "k1" }, { key: "k2" }, { key: "k3" }];
const labels = { k1: "R1", k2: "R2", k3: "R3", k9: "R9" };
let nextId = 1;
const cmd = (body, extra = {}) => { const id = nextId++; return { id, author: "reviewer", permitted: true, url: `https://example.test/c/${id}`, body, ...extra }; };
const fold = (commands) => applyCommands({ results, labels, commands, records: {} });
const decisions = (settlements) => Object.fromEntries([...settlements].map(([key, s]) => [key, s.decision]));

test("B36: accept, reject and defer each record a settlement with author and text", () => {
  const { settlements, records } = fold([cmd("/graph-naming accept R1"), cmd("/graph-naming reject R2 not a domain word"), cmd("/graph-naming defer R3 ask legal")]);
  assert.deepEqual(decisions(settlements), { k1: "accepted", k2: "rejected", k3: "deferred" });
  assert.deepEqual({ ...settlements.get("k2"), commandId: 0, url: "" }, { decision: "rejected", author: "reviewer", text: "not a domain word", commandId: 0, url: "", issue: null });
  assert.ok(Object.values(records).every((r) => /^[0-9a-f]{64}$/.test(r.hash) && Array.isArray(r.keys)));
});

test("B41: the latest valid command per result wins", () => {
  assert.equal(fold([cmd("/graph-naming defer R1"), cmd("/graph-naming reject R1 fine as is"), cmd("/graph-naming accept R1")]).settlements.get("k1").decision, "accepted");
});

test("B36: all settles only what is unsettled when the command is first seen", () => {
  assert.deepEqual(decisions(fold([cmd("/graph-naming reject R1 keep it"), cmd("/graph-naming defer all ask the experts")]).settlements),
    { k1: "rejected", k2: "deferred", k3: "deferred" });
});

test("B42: a command from someone without write access records nothing", () => {
  const { settlements, ignored } = fold([cmd("/graph-naming accept R1", { permitted: false, author: "visitor" })]);
  assert.equal(settlements.size, 0);
  assert.deepEqual(ignored.map((i) => [i.author, i.reason]), [["visitor", "author does not have write access"]]);
  assert.deepEqual(PERMITTED_ROLES, ["write", "maintain", "admin"]);
});

test("B38 and B43: invalid commands, unknown labels and labels with no current result are reported, not applied", () => {
  const { settlements, ignored, notCurrent } = fold([cmd("/graph-naming reject R1"), cmd("/graph-naming accept R12"), cmd("/graph-naming accept R2,R9")]);
  assert.deepEqual(decisions(settlements), { k2: "accepted" });
  assert.deepEqual(ignored.map((i) => i.reason), ["a rejection needs a reason", "unknown label R12"]);
  assert.deepEqual(notCurrent.map((n) => n.label), ["R9"]);
});

test("all with nothing unsettled is reported", () => {
  assert.deepEqual(fold([cmd("/graph-naming accept all"), cmd("/graph-naming reject all again")]).ignored.map((i) => i.reason), ["no unsettled results to settle"]);
});

test("B40: recorded resolutions survive a later run, so all never grows to new results", () => {
  const commands = [cmd("/graph-naming defer all ask the experts")];
  const first = fold(commands);
  const later = applyCommands({ results: [...results, { key: "k4" }], labels: { ...labels, k4: "R4" }, commands, records: first.records });
  assert.deepEqual(decisions(later.settlements), { k1: "deferred", k2: "deferred", k3: "deferred" });
});

test("an edited command resolves again and keeps its deferral issue; a deleted one stops applying", () => {
  const original = cmd("/graph-naming defer R1");
  const first = fold([original]);
  first.records[original.id].issue = 42;
  const edited = applyCommands({ results, labels, commands: [{ ...original, body: "/graph-naming defer R1,R2 both" }], records: first.records });
  assert.deepEqual(decisions(edited.settlements), { k1: "deferred", k2: "deferred" });
  assert.equal(edited.settlements.get("k2").issue, 42);
  assert.equal(applyCommands({ results, labels, commands: [], records: edited.records }).settlements.size, 0);
});
