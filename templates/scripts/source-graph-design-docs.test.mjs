import { test } from "node:test";
import assert from "node:assert/strict";
import { BEHAVIOUR_IRI, DECISION_IRI, behaviourIri, decisionIri, parseBehaviourReference, readBehaviours, behavioursFile, readDecision } from "./source-graph-design-docs.mjs";

const tree = (files) => ({ paths: () => Object.keys(files).sort(), has: (p) => Object.hasOwn(files, p), text: (p) => files[p] });

test("B1: IRIs are built from the slug and id, or the ADR number, only", () => {
  assert.equal(behaviourIri("payments", 3), ":behaviour-payments-B3");
  assert.equal(decisionIri("0041"), ":decision-0041");
  assert.deepEqual(BEHAVIOUR_IRI.exec(":behaviour-zener-shape-tracing-motor-test-B12").slice(1), ["zener-shape-tracing-motor-test", "12"]);
  assert.deepEqual(DECISION_IRI.exec(":decision-0008").slice(1), ["0008"]);
  for (const bad of [":behaviour-Payments-B1", ":behaviour-payments-B0", ":behaviour-payments-b1", ":behaviour--B1", ":decision-41", ":decision-00410"]) {
    assert.equal(BEHAVIOUR_IRI.test(bad) || DECISION_IRI.test(bad), false, bad);
  }
});

test("B1: a reference is exactly <slug>#B<n>", () => {
  assert.deepEqual(parseBehaviourReference("payments#B3"), { slug: "payments", id: 3 });
  assert.deepEqual(parseBehaviourReference("zener-shape-tracing-motor-test#B12"), { slug: "zener-shape-tracing-motor-test", id: 12 });
  for (const bad of ["payments#b3", "payments#B03", "payments # B3", "#B3", "payments#B", "payments", "Payments#B3", " payments#B3"]) {
    assert.equal(parseBehaviourReference(bad), null, JSON.stringify(bad));
  }
});

const FORMS = [
  "**B1 — Present every claim.** Given a graph, then it is shown.",
  "- **B2 Look up before naming.** Given a name, then it is checked.",
  "**B3. Turning the motor test on.**",
];

test("B1: all three declaration forms are read with their title and line", () => {
  assert.deepEqual(readBehaviours(["# Behaviours", "", ...FORMS, ""].join("\n")), [
    { id: 1, title: "Present every claim", line: 3, retired: false, replacement: null },
    { id: 2, title: "Look up before naming", line: 4, retired: false, replacement: null },
    { id: 3, title: "Turning the motor test on", line: 5, retired: false, replacement: null },
  ]);
});

test("B1: CRLF line endings read the same as LF", () => {
  const lf = ["# Behaviours", "", ...FORMS].join("\n");
  assert.deepEqual(readBehaviours(lf.replaceAll("\n", "\r\n")), readBehaviours(lf));
});

test("B1: code fences, table rows and mentions inside a line are not declarations", () => {
  const text = ["**B1 — Real.** Body mentions **B2 — not here** inline.", "", "```", "**B9 — In a fence.**", "```", "", "| B4 | Ledger |",
    "See `**B5 — Example.**` in prose.", "Text then **B6 — Mid line.**"].join("\n");
  assert.deepEqual(readBehaviours(text).map((d) => d.id), [1]);
});

test("B1: a title keeps backticks and question marks and loses only its closing full stop", () => {
  const text = ["- **B1 Uses `GraphNode` labels.** Body.", "**B2 — Is it covered?** Body.", "**B3. Version 2.0 support.**"].join("\n");
  assert.deepEqual(readBehaviours(text).map((d) => d.title), ["Uses `GraphNode` labels", "Is it covered?", "Version 2.0 support"]);
});

test("B2: in lite mode only the Analyst section declares behaviours", () => {
  const text = ["# F", "", "## Product owner: vision", "", "**B7 — Not a behaviour.**", "", "## Analyst: behaviours", "", "- **B1 Pay.** Body.", "",
    "## Architect: structure", "", "**B8 — Not either.**"].join("\n");
  assert.deepEqual(readBehaviours(text, { lite: true }).map((d) => [d.id, d.line]), [[1, 9]]);
  assert.deepEqual(readBehaviours(text).map((d) => d.id), [7, 1, 8]);
});

test("B17 and B19: retired entries are marked, with the replacement they name", () => {
  const text = ["## Behaviours", "", "**B1 — Pay.**", "", "### Retired behaviours", "", "**B2 — Pay by cheque.** Retired; replaced by B1.", "",
    "**B3 — Pay by fax.** Retired with", "no replacement, see payments#B1 for context.", "", "**B4 — Pay by post.** Replaced by payments#B1.", "",
    "## Next", "", "**B5 — After.**"].join("\n");
  const byId = Object.fromEntries(readBehaviours(text).map((d) => [d.id, d]));
  assert.equal(byId[1].retired, false);
  assert.deepEqual([byId[2].retired, byId[2].replacement], [true, 1]);
  assert.deepEqual([byId[3].retired, byId[3].replacement], [true, null]);
  assert.deepEqual([byId[4].retired, byId[4].replacement], [true, 1]);
  assert.equal(byId[5].retired, false);
});

test("B2: the behaviours file follows the feature's mode, and two declaring files conflict", () => {
  const full = "docs/features/pay/02-behaviours.md", lite = "docs/features/pay/feature.md";
  const liteText = "## Analyst: behaviours\n\n- **B1 Pay.**\n", fullText = "**B1 — Pay.**\n";
  assert.deepEqual(behavioursFile(tree({ [full]: fullText }), "pay"), { path: full, lite: false, conflict: null });
  assert.deepEqual(behavioursFile(tree({ [lite]: liteText }), "pay"), { path: lite, lite: true, conflict: null });
  assert.deepEqual(behavioursFile(tree({ [full]: fullText, [lite]: liteText }), "pay"), { path: null, lite: null, conflict: [full, lite] });
  assert.deepEqual(behavioursFile(tree({ [full]: fullText, [lite]: "# Promoted\n" }), "pay"), { path: full, lite: false, conflict: null });
  assert.equal(behavioursFile(tree({}), "pay"), null);
});

test("B5: a decision's title, status and successor come from its ADR", () => {
  const t = tree({
    "docs/adr/0041-add-kinds.md": "# 0041 — Add kinds\n\n- **Status:** accepted\n- **Date:** 2026-11-23\n",
    "docs/adr/0030-old.md": "# 0030 — Old way\n\n- **Status:** Superseded by ADR 0041\n",
    "docs/adr/0031-amended.md": "# 0031 — Amended\n\n- **Status:** accepted; amended by ADR 0040 (planning)\n",
    "docs/adr/0032-none.md": "# 0032 — No status\n\nText.\n",
    "docs/adr/README.md": "# ADRs\n",
  });
  assert.deepEqual(readDecision(t, "0041"), { path: "docs/adr/0041-add-kinds.md", number: "0041", title: "Add kinds", titleLine: 1, status: "accepted", statusLine: 3, successor: null });
  assert.deepEqual(readDecision(t, "0030"), { path: "docs/adr/0030-old.md", number: "0030", title: "Old way", titleLine: 1, status: "superseded", statusLine: 3, successor: "0041" });
  assert.equal(readDecision(t, "0031").status, "accepted");
  assert.deepEqual([readDecision(t, "0032").status, readDecision(t, "0032").statusLine], [null, null]);
  assert.equal(readDecision(t, "0099"), null);
  const odd = tree({ "docs/adr/0050-dash.md": "# 0050 — Dash\n\n- **Status:** —\n", "docs/adr/0051-rejected.md": "# 0051 — Rejected\n\n- **Status:** Rejected\n" });
  assert.deepEqual([readDecision(odd, "0050").status, readDecision(odd, "0050").statusLine], [null, 3]);
  assert.equal(readDecision(odd, "0051").status, "rejected");
});
