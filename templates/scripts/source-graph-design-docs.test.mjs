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
    { id: 1, title: "Present every claim", line: 3, retired: false, replacement: null, replacementSlug: null },
    { id: 2, title: "Look up before naming", line: 4, retired: false, replacement: null, replacementSlug: null },
    { id: 3, title: "Turning the motor test on", line: 5, retired: false, replacement: null, replacementSlug: null },
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
  assert.deepEqual([byId[2].replacementSlug, byId[4].replacementSlug], [null, "payments"]);
});

test("B17: a replacement in another feature keeps that feature's slug", () => {
  const text = ["### Retired behaviours", "", "**B2 — Pay by cheque.** Retired; replaced by refunds#B3."].join("\n");
  const [d] = readBehaviours(text);
  assert.deepEqual([d.replacement, d.replacementSlug], [3, "refunds"]);
});

test("B5: a successor may be written as a Markdown link", () => {
  const t = tree({ "docs/adr/0030-old.md": "# 0030 — Old way\n\n- **Status:** Superseded by [ADR 0041](0041-add-kinds.md)\n" });
  assert.equal(readDecision(t, "0030").successor, "0041");
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
  assert.deepEqual(readDecision(t, "0041"), { path: "docs/adr/0041-add-kinds.md", number: "0041", title: "Add kinds", titleLine: 1, status: "accepted", statusLine: 3, successor: null, duplicates: [] });
  assert.deepEqual(readDecision(t, "0030"), { path: "docs/adr/0030-old.md", number: "0030", title: "Old way", titleLine: 1, status: "superseded", statusLine: 3, successor: "0041", duplicates: [] });
  assert.equal(readDecision(t, "0031").status, "accepted");
  assert.deepEqual([readDecision(t, "0032").status, readDecision(t, "0032").statusLine], [null, null]);
  assert.equal(readDecision(t, "0099"), null);
  const odd = tree({ "docs/adr/0050-dash.md": "# 0050 — Dash\n\n- **Status:** —\n", "docs/adr/0051-rejected.md": "# 0051 — Rejected\n\n- **Status:** Rejected\n" });
  assert.deepEqual([readDecision(odd, "0050").status, readDecision(odd, "0050").statusLine], [null, 3]);
  assert.equal(readDecision(odd, "0051").status, "rejected");
});

const ids = (text, opts) => readBehaviours(text, opts).map((d) => d.id);

test("A1: a declaration after a closed fence is read; tilde and indented fences hide declarations", () => {
  assert.deepEqual(ids(["```", "**B1 — In.**", "```", "**B2 — Out.**"].join("\n")), [2]);
  assert.deepEqual(ids(["~~~", "**B1 — In.**", "~~~", "**B2 — Out.**"].join("\n")), [2]);
  assert.deepEqual(ids(["   ```", "**B1 — In.**", "   ```", "**B2 — Out.**"].join("\n")), [2]);
  assert.deepEqual(ids(["````", "```", "**B1 — In.**", "```", "````", "**B2 — Out.**"].join("\n")), [2]);
  assert.deepEqual(ids(["~~~", "```", "**B1 — In.**", "~~~", "**B2 — Out.**"].join("\n")), [2]);
  assert.deepEqual(ids(["    ```", "**B1 — Indented code, not a fence.**"].join("\n")), [1]);
});

test("A1: a heading inside a fence is not a heading", () => {
  assert.deepEqual(readBehaviours(["### Retired behaviours", "~~~", "## Next", "~~~", "**B1 — Still retired.**"].join("\n")).map((d) => d.retired), [true]);
});

test("A2: a decision matches only docs/adr/<number>-<name>.md with no slash in the name", () => {
  const t = tree({ "docs/adr/00410-x.md": "# 0041 — Wrong\n", "docs/adr/0041-x/notes.md": "# 0041 — Notes\n" });
  assert.equal(readDecision(t, "0041"), null);
  assert.equal(readDecision(tree({ "docs/adr/0041-x/notes.md": "# 0041 — Notes\n", "docs/adr/0041-x.md": "# 0041 — Real\n" }), "0041").path, "docs/adr/0041-x.md");
});

test("A3: retired regions survive deeper headings, ignore fenced headings and work in lite mode", () => {
  const deeper = ["### Retired behaviours", "", "#### Old payments", "", "**B1 — Old.**", "", "### Current", "", "**B2 — New.**"].join("\n");
  assert.deepEqual(readBehaviours(deeper).map((d) => d.retired), [true, false]);
  const fenced = ["```", "### Retired behaviours", "```", "**B1 — Live.**"].join("\n");
  assert.deepEqual(readBehaviours(fenced).map((d) => d.retired), [false]);
  const lite = ["## Analyst: behaviours", "", "**B1 — Live.**", "", "### Retired behaviours", "", "**B2 — Old.** Replaced by B1."].join("\n");
  assert.deepEqual(readBehaviours(lite, { lite: true }).map((d) => [d.id, d.retired, d.replacement]), [[1, false, null], [2, true, 1]]);
});

test("A4: a replacement named only inside a fence in a retired entry is ignored", () => {
  const text = ["### Retired behaviours", "", "**B2 — Old.** Retired.", "```", "replaced by B9", "```", "", "**B3 — Older.** Retired.", "~~~", "replaced by B8", "~~~", "Replaced by B1."].join("\n");
  assert.deepEqual(readBehaviours(text).map((d) => d.replacement), [null, 1]);
});

test("A5: a successor ADR number must be exactly four digits", () => {
  const t = tree({ "docs/adr/0030-old.md": "# 0030 — Old\n\n- **Status:** superseded by ADR 00410\n", "docs/adr/0031-old.md": "# 0031 — Old\n\n- **Status:** superseded by [ADR 0041](x.md)\n" });
  assert.equal(readDecision(t, "0030").successor, null);
  assert.equal(readDecision(t, "0031").successor, "0041");
});

test("A6: a title may contain balanced inner bold", () => {
  const [d] = readBehaviours("**B1 — Use **bold** here.** Body.");
  assert.equal(d.title, "Use **bold** here");
  assert.equal(readBehaviours("**B2 — **Start** bold.** Body.")[0].title, "**Start** bold");
  assert.equal(readBehaviours("**B3 — Plain.** and **more** text.")[0].title, "Plain");
});

test("A7: in lite mode a level-2 Retired behaviours section after the Analyst section is still analyst and retired", () => {
  const text = ["## Analyst: behaviours", "", "**B1 — Live.**", "", "## Retired behaviours", "", "**B2 — Old.** Replaced by B1.", "", "## Architect: structure", "", "**B3 — Not a behaviour.**"].join("\n");
  assert.deepEqual(readBehaviours(text, { lite: true }).map((d) => [d.id, d.retired, d.replacement]), [[1, false, null], [2, true, 1]]);
});

test("A8: lines under Uncertainties and Terms headings are not declarations", () => {
  const text = ["# F", "**B1 — Live.**", "## Uncertainties", "**B2 — Question.**", "### Sub", "**B3 — Sub question.**", "## Next", "**B4 — Live.**", "#### terms", "**B5 — Term.**", "#### Other", "**B6 — Live.**"].join("\n");
  assert.deepEqual(ids(text), [1, 4, 6]);
  const lite = ["## Analyst: behaviours", "**B1 — Live.**", "### Uncertainties", "**B2 — Question.**", "### Behaviours", "**B3 — Live.**", "### Terms", "**B4 — Term.**"].join("\n");
  assert.deepEqual(ids(lite, { lite: true }), [1, 3]);
});

test("A9: duplicate ADR files are listed, sorted, beside the first", () => {
  const t = tree({ "docs/adr/0041-b.md": "# 0041 — B\n", "docs/adr/0041-a.md": "# 0041 — A\n", "docs/adr/0041-c.md": "# 0041 — C\n" });
  const d = readDecision(t, "0041");
  assert.deepEqual([d.path, d.duplicates], ["docs/adr/0041-a.md", ["docs/adr/0041-b.md", "docs/adr/0041-c.md"]]);
});
