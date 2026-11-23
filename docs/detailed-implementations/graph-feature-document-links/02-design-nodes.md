# 02 — Behaviour and decision nodes held to their documents (Tasks 3–6)

[← Overview](00-overview.md) · [Ontology](../../ontology.md)

Delivers B1, B2, B5, B19 and B21. Depends on increment 1. When done, a repository can record behaviour and decision nodes, and `GraphChecker` fails any whose IRI, evidence, label, status or id no longer matches its feature document or ADR.

### Task 3: `DesignDocumentReader`

**Files:**
- Create: `templates/scripts/source-graph-design-docs.mjs`
- Test: `templates/scripts/source-graph-design-docs.test.mjs`

**Interfaces:**
- Consumes: a tree with `has(path)`, `text(path)` and `paths()` (the `source-graph-git.mjs` tree, or an in-memory one in tests).
- Produces:

```js
export const BEHAVIOUR_IRI = /^:behaviour-([a-z0-9]+(?:-[a-z0-9]+)*)-B([1-9][0-9]*)$/;
export const DECISION_IRI = /^:decision-([0-9]{4})$/;
export function behaviourIri(slug, id);          // ":behaviour-<slug>-B<id>"
export function decisionIri(number);             // ":decision-<number>"
export function parseBehaviourReference(text);   // /^([a-z0-9]+(?:-[a-z0-9]+)*)#B([1-9][0-9]*)$/ -> { slug, id: Number } | null
export function readBehaviours(text, { lite = false } = {}); // Declaration[]
export function behavioursFile(tree, slug);      // BehavioursFile
export function readDecision(tree, number);      // Decision | null
```

- [ ] **Step 1: Write the failing test**

Create `templates/scripts/source-graph-design-docs.test.mjs`:

```js
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test templates/scripts/source-graph-design-docs.test.mjs`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement `templates/scripts/source-graph-design-docs.mjs`**

Algorithm contract:

- Split text on `/\r?\n/`; line numbers are 1-based.
- A line beginning with three backticks toggles a fence; lines inside a fence (and the fence lines) are never declarations.
- A declaration matches `/^\s*(?:[-*]\s+)?\*\*B([1-9][0-9]*)(?: — |\. | )(.+?)\.?\*\*/`; the title is the second group.
- In lite mode only lines after a line equal to `## Analyst: behaviours` and before the next line starting `## ` are read.
- A heading matching `/^(#{2,6})\s+Retired behaviours\s*$/i` starts the retired region, which ends at the next heading whose `#` count is at most that heading's.
- A retired entry runs from its declaration to the line before the next declaration or heading. Its replacement is the first match of `/replaced by (?:[a-z0-9-]+#)?B([1-9][0-9]*)/i` in the entry, as a number.
- `behavioursFile`: the full path is `docs/features/<slug>/02-behaviours.md` and the lite path is `docs/features/<slug>/feature.md`; a file counts only when it exists and `readBehaviours` (with `lite` for the lite path) finds at least one declaration. Both count: conflict; one: that file; neither: `null`.
- `readDecision`: the path is the first, in sorted order, of `tree.paths()` starting `docs/adr/<number>-` and ending `.md` (none: `null`). The title line is the first matching `/^# ([0-9]{4}) — (.+?)\s*$/` with the same number. The Status line is the first matching `/^- \*\*Status:\*\*\s*(.+?)\s*$/`; its status is the first word, lower-cased, letters only; its successor is the number in `/superseded by ADR ([0-9]{4})/i`, if any. Parts not found are `null`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit and push**

```
git add templates/scripts/source-graph-design-docs.mjs templates/scripts/source-graph-design-docs.test.mjs
git commit -m "feat(graph): read behaviours and ADRs for the source graph (#185)"
git push -u origin feature/graph-feature-document-links/build
```

### Task 4: Design fixture for shipped tests

**Files:**
- Modify: `templates/scripts/source-graph-test-helpers.mjs`
- Test: `templates/scripts/check-source-graph.test.mjs`

**Interfaces:**
- Consumes: `block`, `S`, `blobId`, `refreshRecord`, `setPair` (same module); a `widgets` spec.
- Produces: `DESIGN_FEATURE`, `DESIGN_ADRS`, `addDesignDocs(repo, spec, { mode = "lite" } = {})` returning `{ featurePath }`, and `rewriteDoc(repo, spec, path, text)`.

- [ ] **Step 1: Write the failing test**

Extend the import of `check-source-graph.test.mjs` with `addDesignDocs`, and add:

```js
test("the design fixture is structurally valid in both modes", async () => {
  for (const mode of ["lite", "full"]) assert.deepEqual(await run((s, r) => { addDesignDocs(r, s, { mode }); }), [], mode);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test templates/scripts/check-source-graph.test.mjs`
Expected: FAIL (`addDesignDocs` is not exported).

- [ ] **Step 3: Add the helper to `templates/scripts/source-graph-test-helpers.mjs`, exactly**

```js
export const DESIGN_FEATURE = [
  "# Payments", "", "## Product owner: vision", "", "Pay invoices.", "", "## Analyst: behaviours", "",
  "### Outcome 1: invoices are paid", "",
  "- **B1 Pay an invoice.** Given an open invoice, when it is paid, then it closes.",
  "- **B2 Refund a payment.** Given a paid invoice, when it is refunded, then it reopens.", "",
  "### Retired behaviours", "",
  "- **B3 Pay by cheque.** Retired because cheques are no longer accepted; replaced by B2.", "",
  "## Architect: structure", "", "| Behaviour | Components |", "| --- | --- |", "| B1 | Ledger |", "| B2 | Ledger |", "",
].join("\n");
export const DESIGN_ADRS = {
  "docs/adr/0001-use-a-ledger.md": "# 0001 — Use a ledger\n\n- **Status:** accepted\n- **Date:** 2026-11-23\n",
  "docs/adr/0002-keep-cheques.md": "# 0002 — Keep cheques\n\n- **Status:** superseded by ADR 0001\n",
};
export function addDesignDocs(repo, spec, { mode = "lite" } = {}) {
  const featurePath = `docs/features/payments/${mode === "lite" ? "feature.md" : "02-behaviours.md"}`;
  repo.write(featurePath, DESIGN_FEATURE);
  for (const [path, text] of Object.entries(DESIGN_ADRS)) repo.write(path, text);
  spec.config.sourceGraph.evidence["selected-document"].push(featurePath, "docs/adr/**");
  repo.write("ontology.config.json", JSON.stringify(spec.config, null, 2) + "\n");
  spec.version = 2;
  spec.coverage.push(...[featurePath, "docs/adr/**"].map((selector, i) => block(`:coverage-d${i}`, "kit:GraphCoverage",
    [["kit:pathSelector", S(selector)], ["kit:priority", 10], ["kit:status", "kit:covered"]])));
  spec.records.push(...[featurePath, ...Object.keys(DESIGN_ADRS)].map((path) => refreshRecord(repo, path)));
  const ev = (id, path, start, end) => block(`:evidence-${id}`, "kit:GraphEvidence", [["kit:blobId", S(blobId(repo.dir, path))],
    ["kit:endLine", end], ["kit:path", S(path)], ["kit:role", "kit:role-selected-document"], ["kit:startLine", start]]);
  const [adr1, adr2] = Object.keys(DESIGN_ADRS);
  spec.evidence.push(ev("d1", featurePath, 11, 11), ev("d2", featurePath, 12, 12), ev("d3", featurePath, 16, 16),
    ev("d4", adr1, 1, 3), ev("d5", adr2, 1, 3), ev("d6", featurePath, 22, 22));
  const design = (iri, kind, label, status, evidence) => block(iri, "kit:GraphNode",
    [["kit:designStatus", status], ["kit:evidence", `:evidence-${evidence}`], ["kit:kind", kind], ["rdfs:label", S(label)]]);
  spec.nodes.push(
    design(":behaviour-payments-B1", "kit:behaviour", "payments#B1 Pay an invoice", "kit:current", "d1"),
    design(":behaviour-payments-B2", "kit:behaviour", "payments#B2 Refund a payment", "kit:current", "d2"),
    design(":behaviour-payments-B3", "kit:behaviour", "payments#B3 Pay by cheque", "kit:retired", "d3"),
    design(":decision-0001", "kit:decision", "ADR 0001 Use a ledger", "kit:accepted", "d4"),
    design(":decision-0002", "kit:decision", "ADR 0002 Keep cheques", "kit:superseded", "d5"));
  const link = (id, subject, relationship, object, evidence) => block(`:assertion-${id}`, "kit:GraphAssertion", [["kit:basis", "kit:direct"],
    ...evidence.map((e) => ["kit:evidence", `:evidence-${e}`]), ["kit:object", object], ["kit:relationship", relationship], ["kit:subject", subject]]);
  spec.assertions.push(
    link("d1", ":behaviour-payments-B3", "kit:replaced-by", ":behaviour-payments-B2", ["d3"]),
    link("d2", ":decision-0002", "kit:superseded-by", ":decision-0001", ["d5"]),
    link("d3", ":node-ledger", "kit:implements", ":behaviour-payments-B1", ["d6", "e5"]),
    link("d4", ":node-ledger", "kit:implements", ":behaviour-payments-B3", ["d3", "e5"]),
    link("d5", ":behaviour-payments-B1", "kit:tested-by", ":node-test", ["d1", "e2"]),
    link("d6", ":node-ledger", "kit:documented-by", ":decision-0001", ["d4", "e5"]));
  return { featurePath };
}
export function rewriteDoc(repo, spec, path, text) {
  repo.write(path, text);
  const id = S(blobId(repo.dir, path));
  for (const e of spec.evidence) if (e.pairs.some((p) => p.predicate === "kit:path" && p.object === path)) setPair(e, "kit:blobId", id);
  spec.records = spec.records.map((r) => (r.pairs.some((p) => p.predicate === "kit:path" && p.object === path) ? refreshRecord(repo, path) : r));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS. The checker has no document rules yet, so the fixture is structurally valid.

- [ ] **Step 5: Commit and push**

```
git add templates/scripts/source-graph-test-helpers.mjs templates/scripts/check-source-graph.test.mjs
git commit -m "test(graph): add a feature document and ADR fixture (#185)"
git push -u origin feature/graph-feature-document-links/build
```

### Task 5: Behaviour nodes held to their behaviours file

**Files:**
- Modify: `templates/scripts/check-source-graph.mjs`
- Test: `templates/scripts/check-source-graph.test.mjs`

**Interfaces:**
- Consumes: `BEHAVIOUR_IRI`, `behavioursFile`, `readBehaviours`, `behaviourIri` (Task 3); `addDesignDocs`, `rewriteDoc`, `DESIGN_FEATURE` (Task 4).
- Produces: `export function designFindings(graph, tree)`, called from `checkTree`; rules `design-iri`, `design-evidence`, `design-undeclared`, `design-label`, `design-status`, `design-file-conflict`, `design-id-reused`.

- [ ] **Step 1: Write the failing test**

Extend the helper import with `rewriteDoc` and `DESIGN_FEATURE`, and add:

```js
const LITE = "docs/features/payments/feature.md";
const design = (mutate, mode = "lite") => run(async (s, r) => { addDesignDocs(r, s, { mode }); await mutate?.(s, r); });
const has = (findings, rule, subject) => findings.some((f) => f.rule === rule && (subject === undefined || f.subject === subject));

const behaviourMutations = [
  ["design-iri", ":behaviour-payments-1", (s) => { find(s.nodes, ":behaviour-payments-B1").subject = ":behaviour-payments-1"; }],
  ["design-undeclared", ":behaviour-payments-B1", (s) => { setPair(find(s.evidence, ":evidence-d1"), "kit:startLine", 12); setPair(find(s.evidence, ":evidence-d1"), "kit:endLine", 12); }],
  ["design-undeclared", ":behaviour-payments-B9", (s) => { s.nodes.push(block(":behaviour-payments-B9", "kit:GraphNode", [["kit:designStatus", "kit:current"],
    ["kit:evidence", ":evidence-d2"], ["kit:kind", "kit:behaviour"], ["rdfs:label", S("payments#B9 Pay twice")]])); }],
  ["design-label", ":behaviour-payments-B1", (s) => { setPair(find(s.nodes, ":behaviour-payments-B1"), "rdfs:label", S("payments#B1 Pay invoice")); }],
  ["design-label", ":behaviour-payments-B2", (s) => { setPair(find(s.nodes, ":behaviour-payments-B2"), "rdfs:label", S("payments#B2")); }],
  ["design-status", ":behaviour-payments-B3", (s) => { setPair(find(s.nodes, ":behaviour-payments-B3"), "kit:designStatus", "kit:current"); }],
  ["design-status", ":behaviour-payments-B1", (s) => { setPair(find(s.nodes, ":behaviour-payments-B1"), "kit:designStatus", "kit:retired"); }],
  ["design-evidence", ":behaviour-payments-B1", (s) => { setPair(find(s.nodes, ":behaviour-payments-B1"), "kit:evidence", ":evidence-e4"); }],
  ["design-evidence", ":behaviour-payments-B1", (s) => { setPair(find(s.evidence, ":evidence-d1"), "kit:role", "kit:role-implementation"); }],
  ["design-id-reused", ":behaviour-payments-B2", (s, r) => { rewriteDoc(r, s, LITE, DESIGN_FEATURE.replace("- **B3 Pay by cheque.**", "- **B2 Pay by cheque.**")); }],
];

for (const [rule, subject, mutate] of behaviourMutations) {
  test(`B1, B19: a behaviour node that drifts from its document reports ${rule} on ${subject}`, async () => {
    const findings = await design(mutate);
    assert.ok(has(findings, rule, subject), `expected ${rule} on ${subject}, got ${JSON.stringify(findings)}`);
  });
}

test("B1: behaviour nodes that match their declarations pass in lite and full mode with the same IRIs", async () => {
  for (const mode of ["lite", "full"]) assert.deepEqual(await design(null, mode), [], mode);
});

test("B2: a feature with both behaviours files fails once, naming both", async () => {
  const findings = await design((s, r) => { r.write("docs/features/payments/02-behaviours.md", DESIGN_FEATURE); });
  const hits = findings.filter((f) => f.rule === "design-file-conflict");
  assert.equal(hits.length, 1, JSON.stringify(findings));
  assert.match(hits[0].message, /docs\/features\/payments\/02-behaviours\.md and docs\/features\/payments\/feature\.md both declare behaviours/);
});

test("B19: a behaviour whose feature has no behaviours file is undeclared", async () => {
  const findings = await design((s, r) => { r.remove(LITE); });
  assert.ok(has(findings, "design-undeclared", ":behaviour-payments-B1"), JSON.stringify(findings));
});

test("B21: rewording a title keeps the IRI; the check passes once the label follows the new title", async () => {
  const reworded = DESIGN_FEATURE.replace("**B1 Pay an invoice.**", "**B1 Pay an open invoice.**");
  assert.ok(has(await design((s, r) => { rewriteDoc(r, s, LITE, reworded); }), "design-label", ":behaviour-payments-B1"));
  assert.deepEqual(await design((s, r) => {
    rewriteDoc(r, s, LITE, reworded);
    setPair(find(s.nodes, ":behaviour-payments-B1"), "rdfs:label", S("payments#B1 Pay an open invoice"));
  }), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test templates/scripts/check-source-graph.test.mjs`
Expected: FAIL on the new behaviour tests (no `design-*` document rule exists).

- [ ] **Step 3: Implement the behaviour part of `designFindings(graph, tree)` in `templates/scripts/check-source-graph.mjs`**

For each `kit:GraphNode` of kind `kit:behaviour`, in this order, stopping at the first failure for that node:

1. `design-iri` when the IRI does not match `BEHAVIOUR_IRI`.
2. Resolve `behavioursFile(tree, slug)`. `null`: `design-undeclared`, message `no behaviours file declares behaviours for <slug>`. Conflict: one `design-file-conflict` per slug (file the full path, subject empty), message `<full> and <lite> both declare behaviours`; stop for every node of that slug.
3. With exactly one node `kit:evidence` resource (Task 2 has already reported anything else): `design-evidence` unless its role is `kit:role-selected-document` and its path is the behaviours file.
4. Read `readBehaviours(tree.text(path), { lite })`. `design-id-reused` when the node's id is declared more than once in the file (current, retired, or both).
5. `design-undeclared` unless a declaration of the node's id is on the evidence's `kit:startLine`, message `<path>:<line> does not declare B<id>`.
6. `design-label` unless the label equals `<slug>#B<id> <title>`.
7. `design-status` unless `kit:designStatus` is `kit:retired` for a retired declaration and `kit:current` otherwise.

Call `designFindings(graph, tree)` from `checkTree` and add its findings.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit and push**

```
git add templates/scripts/check-source-graph.mjs templates/scripts/check-source-graph.test.mjs
git commit -m "feat(graph): hold behaviour nodes to their feature documents (#185)"
git push -u origin feature/graph-feature-document-links/build
```

### Task 6: Decision nodes held to their ADR

**Files:**
- Modify: `templates/scripts/check-source-graph.mjs`
- Test: `templates/scripts/check-source-graph.test.mjs`

**Interfaces:**
- Consumes: `DECISION_IRI`, `readDecision` (Task 3); `design`, `has`, `DESIGN_ADRS`, `rewriteDoc` (Tasks 4–5).
- Produces: the decision part of `designFindings`.

- [ ] **Step 1: Write the failing test**

Extend the helper import with `DESIGN_ADRS`, and add:

```js
const ADR1 = "docs/adr/0001-use-a-ledger.md";

const decisionMutations = [
  ["design-iri", ":decision-1", (s) => { find(s.nodes, ":decision-0001").subject = ":decision-1"; }],
  ["design-undeclared", ":decision-0001", (s) => { setPair(find(s.evidence, ":evidence-d4"), "kit:startLine", 2); }],
  ["design-undeclared", ":decision-0001", (s, r) => { rewriteDoc(r, s, ADR1, "# 0001 — Use a ledger\n\nNo status yet.\n"); }],
  ["design-undeclared", ":decision-0003", (s) => { s.nodes.push(block(":decision-0003", "kit:GraphNode", [["kit:designStatus", "kit:accepted"],
    ["kit:evidence", ":evidence-d4"], ["kit:kind", "kit:decision"], ["rdfs:label", S("ADR 0003 Missing")]])); }],
  ["design-label", ":decision-0001", (s) => { setPair(find(s.nodes, ":decision-0001"), "rdfs:label", S("ADR 0001 Use the ledger")); }],
  ["design-status", ":decision-0001", (s) => { setPair(find(s.nodes, ":decision-0001"), "kit:designStatus", "kit:superseded"); }],
  ["design-evidence", ":decision-0001", (s) => { setPair(find(s.nodes, ":decision-0001"), "kit:evidence", ":evidence-e4"); }],
];

for (const [rule, subject, mutate] of decisionMutations) {
  test(`B5: a decision node that drifts from its ADR reports ${rule} on ${subject}`, async () => {
    const findings = await design(mutate);
    assert.ok(has(findings, rule, subject), `expected ${rule} on ${subject}, got ${JSON.stringify(findings)}`);
  });
}

test("B5: a capitalised or annotated Status word still reads as its status", async () => {
  for (const status of ["Accepted", "accepted; amended by ADR 0002 (planning)"]) {
    const text = DESIGN_ADRS[ADR1].replace("- **Status:** accepted", `- **Status:** ${status}`);
    assert.deepEqual(await design((s, r) => { rewriteDoc(r, s, ADR1, text); }), [], status);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test templates/scripts/check-source-graph.test.mjs`
Expected: FAIL on the decision mutations.

- [ ] **Step 3: Implement the decision part of `designFindings`**

For each `kit:GraphNode` of kind `kit:decision`, in this order, stopping at the first failure for that node:

1. `design-iri` when the IRI does not match `DECISION_IRI`.
2. `readDecision(tree, number)`. `null`: `design-undeclared`, message `no ADR <number> in docs/adr`.
3. `design-evidence` unless the node's evidence has role `kit:role-selected-document` and the ADR's path.
4. `design-undeclared` unless the title line and Status line were both found and the evidence runs from the title line (`kit:startLine`) to the Status line (`kit:endLine`), message `<path> does not declare ADR <number> on lines <start>-<end>`.
5. `design-label` unless the label equals `ADR <number> <title>`.
6. `design-status` unless `kit:designStatus` equals `kit:<status>`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit and push**

```
git add templates/scripts/check-source-graph.mjs templates/scripts/check-source-graph.test.mjs
git commit -m "feat(graph): hold decision nodes to their ADRs (#185)"
git push -u origin feature/graph-feature-document-links/build
```

**End of increment 2.** Check that CI is green, post the handoff on #185 (increment 2 done: B1, B2, B5, B19, B21; next: increment 3), and stop.
