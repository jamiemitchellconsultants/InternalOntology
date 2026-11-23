# 03 — Retirement, supersession and reports (Tasks 7–9)

[← Overview](00-overview.md) · [Ontology](../../ontology.md)

Delivers B17, B18 and B20. Depends on increment 2. When done, retired behaviours and superseded decisions must link to the replacement or successor their documents name, every `RetiredDesignLink` is reported in text, JSON and the CI step summary without failing the check, and the rendered graph shows design status and the new links.

### Task 7: Replacement and successor links

**Files:**
- Modify: `templates/scripts/check-source-graph.mjs`
- Test: `templates/scripts/check-source-graph.test.mjs`

**Interfaces:**
- Consumes: `designFindings`, the declarations and decisions it already reads (Tasks 5–6); `behaviourIri`, `decisionIri` (Task 3); `design`, `has`, `LITE`, `DESIGN_FEATURE`, `DESIGN_ADRS`, `ADR1` (Tasks 4–6 tests).
- Produces: rules `design-replacement` (subject: the behaviour or decision node) and `design-link-kinds` (subject: the assertion).

- [ ] **Step 1: Write the failing test**

```js
const ADR2 = "docs/adr/0002-keep-cheques.md";
const linkOf = (id, subject, relationship, object) => block(`:assertion-${id}`, "kit:GraphAssertion", [["kit:basis", "kit:direct"],
  ["kit:evidence", ":evidence-e5"], ["kit:object", object], ["kit:relationship", relationship], ["kit:subject", subject]]);

const replacementMutations = [
  ["design-replacement", ":behaviour-payments-B3", (s) => { s.assertions = s.assertions.filter((a) => a.subject !== ":assertion-d1"); }],
  ["design-replacement", ":behaviour-payments-B3", (s) => { setPair(find(s.assertions, ":assertion-d1"), "kit:object", ":behaviour-payments-B1"); }],
  ["design-replacement", ":behaviour-payments-B3", (s, r) => { rewriteDoc(r, s, LITE, DESIGN_FEATURE.replace("; replaced by B2.", ".")); }],
  ["design-replacement", ":behaviour-payments-B1", (s) => { s.assertions.push(linkOf("x0", ":behaviour-payments-B1", "kit:replaced-by", ":behaviour-payments-B2")); }],
  ["design-replacement", ":decision-0002", (s) => { s.assertions = s.assertions.filter((a) => a.subject !== ":assertion-d2"); }],
  ["design-replacement", ":decision-0002", (s, r) => { rewriteDoc(r, s, ADR2, DESIGN_ADRS[ADR2].replace("superseded by ADR 0001", "superseded")); }],
  ["design-link-kinds", ":assertion-x1", (s) => { s.assertions.push(linkOf("x1", ":node-ledger", "kit:replaced-by", ":behaviour-payments-B2")); }],
  ["design-link-kinds", ":assertion-x2", (s) => { s.assertions.push(linkOf("x2", ":behaviour-payments-B1", "kit:superseded-by", ":behaviour-payments-B2")); }],
];

for (const [rule, subject, mutate] of replacementMutations) {
  test(`B17, B18: a missing, extra or misdirected replacement link reports ${rule} on ${subject}`, async () => {
    const findings = await design(mutate);
    assert.ok(has(findings, rule, subject), `expected ${rule} on ${subject}, got ${JSON.stringify(findings)}`);
  });
}

test("B17: a retired entry that names no replacement needs no link", async () => {
  assert.deepEqual(await design((s, r) => {
    rewriteDoc(r, s, LITE, DESIGN_FEATURE.replace("; replaced by B2.", "."));
    s.assertions = s.assertions.filter((a) => a.subject !== ":assertion-d1");
  }), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test templates/scripts/check-source-graph.test.mjs`
Expected: FAIL on the eight mutations.

- [ ] **Step 3: Implement in `designFindings`**

1. For each behaviour node that passed every Task 5 step: the expected object is `behaviourIri(slug, declaration.replacement)` for a retired declaration with a replacement, otherwise none. Its `kit:replaced-by` assertions (as subject) must be exactly one to the expected object when there is one, and none otherwise; any difference is `design-replacement`, message `<node> expects kit:replaced-by <expected>` or `<node> has kit:replaced-by <object> that its document does not name`.
2. The same for each decision node that passed every Task 6 step, with `kit:superseded-by`, expected `decisionIri(successor)` when its status is `superseded` and its Status line names a successor.
3. For every assertion with `kit:replaced-by`, `design-link-kinds` unless subject and object are both `kit:behaviour` nodes; with `kit:superseded-by`, unless both are `kit:decision` nodes.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit and push**

```
git add templates/scripts/check-source-graph.mjs templates/scripts/check-source-graph.test.mjs
git commit -m "feat(graph): require replacement and successor links (#185)"
git push -u origin feature/graph-feature-document-links/build
```

### Task 8: Retired design link reports

**Files:**
- Modify: `templates/scripts/check-source-graph.mjs`
- Modify: `templates/github/workflows/source-graph-check.yml`
- Test: `templates/scripts/check-source-graph.test.mjs`, `tests/source-graph-templates.test.mjs`

**Interfaces:**
- Produces: `export function retiredDesignLinks(graph)` returning `Report[]` sorted by assertion IRI; `main()` accepts `--summary <file>`, prints the reports after the result, adds `reports` to `--json`, and never lets them change `ok` or the exit code.

- [ ] **Step 1: Write the failing test**

In `templates/scripts/check-source-graph.test.mjs`, the file already imports `main` and defines `cli(repo, argv)`; reuse them. Extend the existing `import { checkPullRequest, checkRevision, main } from "./check-source-graph.mjs"` with `retiredDesignLinks`, extend the existing `import { refreshIdFor } from "./source-graph-model.mjs"` with `loadGraph`, add `import { readFileSync, writeFileSync } from "node:fs"` and `import { join } from "node:path"` at the top, and add:

```js
test("B20: a link to a retired behaviour or superseded decision is reported and the check passes", async () => {
  await withScratchRepo(async (repo) => {
    const spec = widgets(repo);
    addDesignDocs(repo, spec);
    spec.assertions.push(block(":assertion-d7", "kit:GraphAssertion", [["kit:basis", "kit:direct"], ["kit:evidence", ":evidence-d5"],
      ["kit:evidence", ":evidence-e5"], ["kit:object", ":decision-0002"], ["kit:relationship", "kit:documented-by"], ["kit:subject", ":node-ledger"]]));
    writeGraph(repo, spec);
    repo.commit("graph");
    const tree = treeFromRevision(repo.dir, "HEAD"), config = loadCheckConfig(tree);
    assert.deepEqual(checkTree({ tree, config }), []);
    assert.deepEqual(retiredDesignLinks(loadGraph(tree, config)), [
      { assertion: ":assertion-d4", subject: ":node-ledger", relationship: "kit:implements", object: ":behaviour-payments-B3", status: "kit:retired", replacement: ":behaviour-payments-B2" },
      { assertion: ":assertion-d7", subject: ":node-ledger", relationship: "kit:documented-by", object: ":decision-0002", status: "kit:superseded", replacement: ":decision-0001" },
    ]);
  });
});

test("B20: text, JSON and summary output carry the report without changing the result", async () => {
  await withScratchRepo(async (repo) => {
    const spec = widgets(repo);
    addDesignDocs(repo, spec);
    writeGraph(repo, spec);
    repo.commit("graph");
    const text = cli(repo, ["--rev", "HEAD"]);
    assert.equal(text.code, 0, text.err);
    assert.match(text.out, /^source graph ok: /m);
    assert.match(text.out, /^retired design links: 1$/m);
    assert.match(text.out, /^:assertion-d4: :node-ledger kit:implements :behaviour-payments-B3 \(retired, replaced by :behaviour-payments-B2\)$/m);
    const json = JSON.parse(cli(repo, ["--rev", "HEAD", "--json"]).out);
    assert.equal(json.ok, true);
    assert.deepEqual(json.findings, []);
    assert.equal(json.reports.length, 1);
    const summary = join(repo.dir, "summary.md");
    writeFileSync(summary, "existing\n");
    assert.equal(cli(repo, ["--rev", "HEAD", "--summary", summary]).code, 0);
    assert.equal(readFileSync(summary, "utf8"), "existing\n### Retired design links\n\n" +
      "- `:assertion-d4`: `:node-ledger` kit:implements `:behaviour-payments-B3` (retired, replaced by `:behaviour-payments-B2`)\n");
  });
});

test("B20: a graph with no retired links prints nothing extra and writes None to the summary", async () => {
  await withScratchRepo(async (repo) => {
    writeGraph(repo, widgets(repo));
    repo.commit("graph");
    const summary = join(repo.dir, "summary.md");
    const text = cli(repo, ["--rev", "HEAD", "--summary", summary]);
    assert.equal(text.code, 0, text.err);
    assert.doesNotMatch(text.out, /retired design links/);
    assert.equal(readFileSync(summary, "utf8"), "### Retired design links\n\nNone.\n");
  });
});
```

In `tests/source-graph-templates.test.mjs` add:

```js
test("B20: the check workflow writes reports to the step summary in both steps and stays read-only", () => {
  const workflow = template("github/workflows/source-graph-check.yml");
  assert.equal(workflow.match(/--summary "\$GITHUB_STEP_SUMMARY"/g)?.length, 2);
  assert.match(workflow, /^permissions:\n  contents: read\n/m);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test templates/scripts/check-source-graph.test.mjs tests/source-graph-templates.test.mjs`
Expected: FAIL on the four new tests.

- [ ] **Step 3: Implement**

`retiredDesignLinks(graph)`: the inactive nodes are those with `kit:designStatus` `kit:retired`, `kit:superseded` or `kit:deprecated`; a node's replacement is the object of its `kit:replaced-by` or `kit:superseded-by` assertion, or `null`. For every other assertion, in IRI order, whose object (checked first) or subject is inactive, report that end as `object` (keeping the assertion's own subject in `subject` when the object is inactive, and the assertion's object in `subject` when only the subject is inactive), with its status and replacement.

`main()`: accept `--summary <file>` (missing value: the existing "invalid option" error, exit 2). After computing findings, compute the reports from the head tree's graph. Text mode: after the existing output, when there is at least one report, print `retired design links: <n>` and one line per report, `<assertion>: <subject> <relationship> <object> (<status local name>[, replaced by <replacement>])`. JSON mode: add `reports`. With `--summary`, append to the file `### Retired design links\n\n` followed by one list item per report, with IRIs in backticks as in the test, or `None.\n`. The exit code and `ok` still depend on findings alone.

In `templates/github/workflows/source-graph-check.yml`, append ` --summary "$GITHUB_STEP_SUMMARY"` to both `run:` lines. Change nothing else.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit and push**

```
git add templates/scripts/check-source-graph.mjs templates/scripts/check-source-graph.test.mjs templates/github/workflows/source-graph-check.yml tests/source-graph-templates.test.mjs
git commit -m "feat(graph): report retired design links without failing (#185)"
git push -u origin feature/graph-feature-document-links/build
```

### Task 9: Rendered graph shows design status and the new links

**Files:**
- Modify: `templates/scripts/source-graph-markdown.mjs`
- Test: `templates/scripts/source-graph-markdown.test.mjs`

- [ ] **Step 1: Write the failing test**

Extend the helper import of `source-graph-markdown.test.mjs` with `addDesignDocs`, and add:

```js
test('B17, B18, B22: design nodes show their status and the new links read as phrases', async () => {
  await withScratchRepo(async r => {
    const f = seedRenderRepo(r, { mutate(spec, repo) { addDesignDocs(repo, spec); } });
    const md = renderMarkdown(readRenderInput(treeFromRevision(r.dir, f.source)));
    assert.match(md, /^- payments\\#B1 Pay an invoice \(behaviour, current\)/m);
    assert.match(md, /^- payments\\#B3 Pay by cheque \(behaviour, retired\)/m);
    assert.match(md, /^- ADR 0002 Keep cheques \(decision, superseded\)/m);
    assert.match(md, /^- Ledger \(component\)/m);
    assert.match(md, /is replaced by/);
    assert.match(md, /is superseded by/);
  });
});
```

The renderer escapes `#` in labels, so the expected text is `payments\#B1`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test templates/scripts/source-graph-markdown.test.mjs`
Expected: FAIL (no status in the kind text; the new relationships fall back to their local names).

- [ ] **Step 3: Implement in `templates/scripts/source-graph-markdown.mjs`**

Add `"kit:replaced-by": "is replaced by"` and `"kit:superseded-by": "is superseded by"` to `PHRASES`. In the node list, when a node has `kit:designStatus`, write the kind text as `<kind>, <status local name>`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit and push**

```
git add templates/scripts/source-graph-markdown.mjs templates/scripts/source-graph-markdown.test.mjs
git commit -m "feat(graph): render design status and replacement links (#185)"
git push -u origin feature/graph-feature-document-links/build
```

**End of increment 3.** Check that CI is green, post the handoff on #185 (increment 3 done: B17, B18, B20; next: increment 4), and stop.
