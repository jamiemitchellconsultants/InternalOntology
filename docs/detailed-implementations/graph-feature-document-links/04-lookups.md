# 04 — Behaviour and code lookups (Tasks 10–11)

[← Overview](00-overview.md) · [Ontology](../../ontology.md)

Delivers B3, B4, B6, B7 and B24. Depends on increment 3. When done, `node scripts/query-source-graph.mjs behaviour <slug>#B<n>` (`FindBehaviourLinks`) answers "what does this behaviour touch?" and `code <node>` (`FindCodeDesignLinks`) answers "why does this code exist?", offline, with the reader's existing text, `--json`, tentative and `STALE` conventions.

### Task 10: `behaviour <slug>#B<n>`

**Files:**
- Modify: `templates/scripts/query-source-graph.mjs`
- Test: `templates/scripts/query-source-graph.test.mjs`

**Interfaces:**
- Consumes: `parseBehaviourReference`, `behaviourIri`, `behavioursFile`, `readBehaviours` (Task 3); `addDesignDocs` (Task 4); the test file's existing `run(repo, argv)`.
- Produces:

```js
export function behaviourLinks(graph, tree, reference);
// -> { reference, behaviour: NodeView | null, replacement: NodeView | null,
//      declared: { path: string | null, declared: boolean } | null,   // set only when behaviour is null
//      components: AssertionView[], symbols: AssertionView[], tests: AssertionView[] }
// nodeView() gains designStatus (null for other kinds).
```

Grouping, one hop: `components` are `kit:implements` assertions whose object is the behaviour and whose subject is a `kit:component` or `kit:system`; `symbols` are those whose subject is a `kit:source-symbol` or `kit:source-file`; `tests` are `kit:tested-by` assertions whose subject is the behaviour. Each list is sorted by subject IRI, then assertion IRI. `annotate()` marks evidence in `components`, `symbols` and `tests`.

- [ ] **Step 1: Write the failing test**

Extend the imports of `query-source-graph.test.mjs` with `behaviourLinks` from `./query-source-graph.mjs` and `addDesignDocs` from `./source-graph-test-helpers.mjs`, and add:

```js
async function designRepo(body, extra) {
  await withScratchRepo(async (repo) => {
    const spec = widgets(repo);
    addDesignDocs(repo, spec);
    extra?.(spec, repo);
    writeGraph(repo, spec);
    repo.commit("graph");
    await body(repo, openGraph(repo.dir, "HEAD"));
  });
}
const symbolLink = block(":assertion-s1", "kit:GraphAssertion", [["kit:basis", "kit:inferred"], ["kit:evidence", ":evidence-d1"], ["kit:evidence", ":evidence-e5"],
  ["kit:object", ":behaviour-payments-B1"], ["kit:relationship", "kit:implements"], ["kit:subject", ":node-pay"]]);

test("B3: a behaviour lists its components, symbols and tests with evidence and status", async () => {
  await designRepo(async (repo, { graph, tree }) => {
    const result = behaviourLinks(graph, tree, "payments#B1");
    assert.equal(result.behaviour.iri, ":behaviour-payments-B1");
    assert.equal(result.behaviour.designStatus, "kit:current");
    assert.equal(result.replacement, null);
    assert.equal(result.declared, null);
    assert.deepEqual(result.components.map((a) => [a.iri, a.subject.iri]), [[":assertion-d3", ":node-ledger"]]);
    assert.equal(result.components[0].evidence.length, 2);
    assert.deepEqual(result.symbols.map((a) => [a.iri, a.tentative]), [[":assertion-s1", true]]);
    assert.deepEqual(result.tests.map((a) => [a.iri, a.object.iri]), [[":assertion-d5", ":node-test"]]);
    const text = run(repo, ["behaviour", "payments#B1"]);
    assert.equal(text.code, 0, text.err);
    assert.match(text.out, /^behaviour :behaviour-payments-B1 payments#B1 Pay an invoice \(current\)$/m);
    for (const heading of ["components", "symbols", "tests"]) assert.match(text.out, new RegExp(`^${heading}$`, "m"));
    assert.match(text.out, /^:node-ledger kit:implements :behaviour-payments-B1$/m);
    assert.match(text.out, /\(tentative\)/);
    const json = JSON.parse(run(repo, ["behaviour", "payments#B1", "--json"]).out);
    assert.equal(json.stale, false);
    assert.equal(json.components[0].evidence[0].status, "current");
  }, (spec) => {
    spec.nodes.push(block(":node-pay", "kit:GraphNode", [["kit:kind", "kit:source-symbol"], ["rdfs:label", S("PayInvoice")]]));
    spec.assertions.push(symbolLink);
  });
});

test("B3: a retired behaviour shows its status and replacement", async () => {
  await designRepo(async (repo, { graph, tree }) => {
    const result = behaviourLinks(graph, tree, "payments#B3");
    assert.equal(result.behaviour.designStatus, "kit:retired");
    assert.equal(result.replacement.iri, ":behaviour-payments-B2");
    assert.deepEqual(result.components.map((a) => a.iri), [":assertion-d4"]);
    const text = run(repo, ["behaviour", "payments#B3"]).out;
    assert.match(text, /^behaviour :behaviour-payments-B3 payments#B3 Pay by cheque \(retired\)$/m);
    assert.match(text, /^replaced by :behaviour-payments-B2 payments#B2 Refund a payment$/m);
  });
});

test("B4: a behaviour with no links says so and prints coverage, never that it is unimplemented", async () => {
  await designRepo(async (repo) => {
    const text = run(repo, ["behaviour", "payments#B2"]);
    assert.equal(text.code, 0, text.err);
    assert.match(text.out, /^No component, symbol or test is linked to payments#B2; that does not mean the behaviour is unimplemented or untested\.$/m);
    assert.match(text.out, /^src\/\*\*: kit:covered$/m);
  });
});

test("B4: an unknown reference says whether the feature document declares it", async () => {
  await designRepo(async (repo, { graph, tree }) => {
    assert.deepEqual(behaviourLinks(graph, tree, "payments#B9").declared, { path: "docs/features/payments/feature.md", declared: false });
    assert.match(run(repo, ["behaviour", "payments#B9"]).out, /^No graph node for payments#B9; docs\/features\/payments\/feature\.md does not declare B9\.$/m);
    assert.match(run(repo, ["behaviour", "payments#B2"]).out, /^No graph node for payments#B2; docs\/features\/payments\/feature\.md declares B2\.$/m);
    assert.match(run(repo, ["behaviour", "other#B1"]).out, /^No graph node for other#B1; no behaviours file declares behaviours for other\.$/m);
  }, (spec) => { spec.nodes = spec.nodes.filter((n) => n.subject !== ":behaviour-payments-B2"); });
});

test("B3, B4: a loosely typed reference is rejected with the expected form", async () => {
  await designRepo(async (repo) => {
    for (const bad of ["payments#b3", "payments#B03", "payments # B3", "#B3"]) {
      const result = run(repo, ["behaviour", bad]);
      assert.equal(result.code, 2, bad);
      assert.match(result.err, /is not a behaviour reference; use <slug>#B<n>/, bad);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test templates/scripts/query-source-graph.test.mjs`
Expected: FAIL (`behaviourLinks` is not exported; `behaviour` is an invalid query).

- [ ] **Step 3: Implement in `templates/scripts/query-source-graph.mjs`**

- `behaviourLinks`: resolve the node `behaviourIri(slug, id)`. Present: fill the three groups and `replacement` (the object of its `kit:replaced-by` assertion). Absent: `declared` is `{ path, declared }` from `behavioursFile(tree, slug)` and `readBehaviours`, or `{ path: null, declared: false }` when there is no file or it conflicts.
- `main()`: `behaviour` takes exactly one value; an invalid reference throws `<value> is not a behaviour reference; use <slug>#B<n>` (exit 2). Text output after the revision lines:
  - node present: `behaviour <iri> <label> (<status local name>)`, then `replaced by <iri> <label>` when there is a replacement, then the headings `components`, `symbols` and `tests`, each followed by its assertions printed with the existing `print`. After those, the headings `replaces` (assertions whose `kit:replaced-by` object is this behaviour) and `other` (every remaining assertion of the behaviour, including further `kit:replaced-by` links) print only when non-empty. When all three are empty, print `No component, symbol or test is linked to <reference>; that does not mean the behaviour is unimplemented or untested.` and the coverage inventory, as `concept` does.
  - node absent: `No graph node for <reference>; <path> declares B<n>.`, `… does not declare B<n>.`, or `No graph node for <reference>; no behaviours file declares behaviours for <slug>.`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit and push**

```
git add templates/scripts/query-source-graph.mjs templates/scripts/query-source-graph.test.mjs
git commit -m "feat(graph): add the behaviour lookup (#185)"
git push -u origin feature/graph-feature-document-links/build
```

### Task 11: `code <node>` and the offline guarantee

**Files:**
- Modify: `templates/scripts/query-source-graph.mjs`
- Test: `templates/scripts/query-source-graph.test.mjs`

**Interfaces:**
- Consumes: `designRepo` (Task 10 tests).
- Produces:

```js
export function codeLinks(graph, id);
// -> { node: NodeView | null, behaviours: AssertionView[], decisions: AssertionView[],
//      via: Array<{ component: NodeView, behaviours: AssertionView[], decisions: AssertionView[] }> }
```

`behaviours` are the node's `kit:implements` assertions whose object is a `kit:behaviour`; `decisions` are its `kit:documented-by` assertions whose object is a `kit:decision`. `via` has one entry per `kit:contains` assertion whose object is the node and whose subject is a `kit:component` or `kit:system`, with that component's own `behaviours` and `decisions`; it follows no further. Lists are sorted by assertion IRI; `via` by component IRI. `annotate()` marks evidence in all of them.

- [ ] **Step 1: Write the failing test**

Extend the reader import with `codeLinks`, and add:

```js
const contains = block(":assertion-v1", "kit:GraphAssertion", [["kit:basis", "kit:direct"], ["kit:evidence", ":evidence-e5"],
  ["kit:object", ":node-impl"], ["kit:relationship", "kit:contains"], ["kit:subject", ":node-ledger"]]);

test("B6: code lists the behaviours it implements and the decisions it is documented by", async () => {
  await designRepo(async (repo, { graph }) => {
    const result = codeLinks(graph, ":node-ledger");
    assert.deepEqual(result.behaviours.map((a) => a.iri), [":assertion-d3", ":assertion-d4"]);
    assert.deepEqual(result.decisions.map((a) => a.iri), [":assertion-d6"]);
    assert.deepEqual(result.via, []);
    const text = run(repo, ["code", ":node-ledger"]);
    assert.equal(text.code, 0, text.err);
    assert.match(text.out, /^code :node-ledger Ledger$/m);
    assert.match(text.out, /^:node-ledger kit:documented-by :decision-0001$/m);
  });
});

test("B6: code follows one kit:contains up to its component, labelled via component", async () => {
  await designRepo(async (repo, { graph }) => {
    const result = codeLinks(graph, "node-impl");
    assert.equal(result.node.iri, ":node-impl");
    assert.deepEqual(result.behaviours, []);
    assert.equal(result.via.length, 1);
    assert.equal(result.via[0].component.iri, ":node-ledger");
    assert.deepEqual(result.via[0].behaviours.map((a) => a.iri), [":assertion-d3", ":assertion-d4"]);
    assert.deepEqual(result.via[0].decisions.map((a) => a.iri), [":assertion-d6"]);
    assert.match(run(repo, ["code", "node-impl"]).out, /^via component :node-ledger Ledger$/m);
  }, (spec) => { spec.assertions.push(contains); });
});

test("B7: code with no design links says so and prints the coverage for its path", async () => {
  await designRepo(async (repo) => {
    const text = run(repo, ["code", ":node-impl"]);
    assert.equal(text.code, 0, text.err);
    assert.match(text.out, /^No behaviour or decision is linked to :node-impl, directly or via its component; that does not mean the code has no reason to exist\.$/m);
    assert.match(text.out, /^src\/[^:]+: kit:covered$/m);
    const missing = run(repo, ["code", ":node-nope"]);
    assert.equal(missing.code, 2);
    assert.match(missing.err, /:node-nope is not a graph node/);
  });
});

test("B24: the behaviour and code lookups make no network call", async () => {
  await designRepo(async (repo) => {
    const original = globalThis.fetch;
    globalThis.fetch = () => { throw new Error("network call"); };
    try {
      assert.equal(run(repo, ["behaviour", "payments#B1"]).code, 0);
      assert.equal(run(repo, ["code", ":node-ledger"]).code, 0);
    } finally { globalThis.fetch = original; }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test templates/scripts/query-source-graph.test.mjs`
Expected: FAIL (`codeLinks` is not exported; `code` is an invalid query).

- [ ] **Step 3: Implement in `templates/scripts/query-source-graph.mjs`**

- `code` takes exactly one value, resolved with `idFor`; a value that names no `kit:GraphNode` throws `<iri> is not a graph node; try: node scripts/query-source-graph.mjs search <words>` (exit 2).
- Text output after the revision lines: `code <iri> <label>`, the headings `behaviours` and `decisions` with their assertions, then for each `via` entry `via component <iri> <label>` followed by its own `behaviours` and `decisions` headings and assertions. When the node and every `via` entry have no behaviour or decision, print `No behaviour or decision is linked to <iri>, directly or via its component; that does not mean the code has no reason to exist.`, then the coverage for the node's label as a path when its kind is `kit:source-file` or `kit:test`, otherwise the coverage inventory.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit and push**

```
git add templates/scripts/query-source-graph.mjs templates/scripts/query-source-graph.test.mjs
git commit -m "feat(graph): add the code lookup (#185)"
git push -u origin feature/graph-feature-document-links/build
```

**End of increment 4.** Check that CI is green, post the handoff on #185 (increment 4 done: B3, B4, B6, B7, B24; next: increment 5), and stop.
