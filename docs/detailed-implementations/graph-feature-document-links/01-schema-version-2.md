# 01 — Schema version 2 skeleton (Tasks 1–2)

[← Overview](00-overview.md) · [Ontology](../../ontology.md)

Delivers B22. Depends on nothing. When done, a kit upgrade ships graph schema version 2, every existing version 1 graph still passes, a version 2 value in a version 1 graph fails with the version it needs, and behaviour and decision nodes have a checked shape.

Raising `CORE.schemaVersion` and accepting older manifests land in one task: either alone turns the existing checker tests red.

### Task 1: Version 2 values and older manifests

**Files:**
- Modify: `templates/scripts/source-graph-model.mjs`
- Modify: `templates/source-graph/graph-schema.ttl` (regenerated)
- Modify: `templates/scripts/check-source-graph.mjs`
- Test: `templates/scripts/source-graph-model.test.mjs`, `templates/scripts/check-source-graph.test.mjs`

**Interfaces:**

```js
// source-graph-model.mjs
export const CORE = {
  schemaVersion: 2,
  kinds: [/* the nine version 1 kinds */, "kit:behaviour", "kit:decision"],
  relationships: [/* the eight version 1 relationships */, "kit:replaced-by", "kit:superseded-by"],
  designStatuses: ["kit:current", "kit:retired", "kit:proposed", "kit:accepted", "kit:superseded", "kit:deprecated"],
  roles, bases, statuses, outcomes, // unchanged
};
export const DESIGN_STATUSES = { "kit:behaviour": ["kit:current", "kit:retired"], "kit:decision": ["kit:proposed", "kit:accepted", "kit:superseded", "kit:deprecated"] };
export const NODE_PREDICATE_VERSIONS = { "kit:designStatus": 2, "kit:evidence": 2 }; // GraphNode predicates only
export function introducedIn(iri); // 2 for the two kinds, two relationships and six design statuses; 1 for every other core value
export function renderSchema(); // writes `kit:schemaVersion ${CORE.schemaVersion}` and renders designStatuses as kit:GraphDesignStatus after relationships
```

- Produces in `check-source-graph.mjs`: rule `schema-version` (schema file not at `CORE.schemaVersion`, or manifest not an integer from 1 to `CORE.schemaVersion`) and rule `schema-version-too-old`.

Definitions to add to `CORE_DEFINITIONS`, exactly:

| IRI | Definition |
| --- | --- |
| `kit:behaviour` | A behaviour an analyst declares in a feature document, identified by its feature slug and id. |
| `kit:decision` | An architecture decision record under docs/adr, identified by its number. |
| `kit:replaced-by` | A retired behaviour is replaced by the named behaviour. |
| `kit:superseded-by` | A superseded decision is superseded by the named decision. |
| `kit:current` | The behaviour is declared in its feature's behaviours. |
| `kit:retired` | The behaviour is listed under Retired behaviours. |
| `kit:proposed` | The decision is proposed. |
| `kit:accepted` | The decision is accepted. |
| `kit:superseded` | A later decision supersedes this one. |
| `kit:deprecated` | The decision no longer applies. |

- [ ] **Step 1: Write the failing tests**

In `templates/scripts/source-graph-model.test.mjs`, extend the import with `DESIGN_STATUSES`, `NODE_PREDICATE_VERSIONS` and `introducedIn`, change the last assertion of "the generated schema names every core iri and its version" from `kit:schemaVersion 1` to `kit:schemaVersion 2`, and add:

```js
test("B22: schema version 2 adds the design kinds, statuses and links", () => {
  assert.equal(CORE.schemaVersion, 2);
  for (const kind of ["kit:behaviour", "kit:decision"]) assert.ok(CORE.kinds.includes(kind), kind);
  for (const rel of ["kit:replaced-by", "kit:superseded-by"]) assert.ok(CORE.relationships.includes(rel), rel);
  assert.deepEqual(CORE.designStatuses, ["kit:current", "kit:retired", "kit:proposed", "kit:accepted", "kit:superseded", "kit:deprecated"]);
  assert.deepEqual(DESIGN_STATUSES, {
    "kit:behaviour": ["kit:current", "kit:retired"],
    "kit:decision": ["kit:proposed", "kit:accepted", "kit:superseded", "kit:deprecated"],
  });
  assert.deepEqual(NODE_PREDICATE_VERSIONS, { "kit:designStatus": 2, "kit:evidence": 2 });
});

test("B22: every value added in version 2 says so, and version 1 values stay at 1", () => {
  for (const iri of ["kit:behaviour", "kit:decision", "kit:replaced-by", "kit:superseded-by", ...CORE.designStatuses]) {
    assert.equal(introducedIn(iri), 2, iri);
  }
  for (const iri of ["kit:concept", "kit:component", "kit:implements", "kit:tested-by", "kit:documented-by", "kit:role-selected-document", "kit:direct", "kit:covered"]) {
    assert.equal(introducedIn(iri), 1, iri);
  }
});

test("B22: the schema defines each new value in words", () => {
  const schema = renderSchema();
  assert.match(schema, /^kit:behaviour a kit:GraphKind ;\n    rdfs:comment "A behaviour an analyst declares in a feature document, identified by its feature slug and id\." \.$/m);
  assert.match(schema, /^kit:superseded-by a kit:GraphRelationship ;\n    rdfs:comment "A superseded decision is superseded by the named decision\." \.$/m);
  assert.match(schema, /^kit:retired a kit:GraphDesignStatus ;\n    rdfs:comment "The behaviour is listed under Retired behaviours\." \.$/m);
});
```

In `templates/scripts/check-source-graph.test.mjs`, change the mutation `["schema-version", (s) => { s.version = 2; }]` to `["schema-version", (s) => { s.version = 3; }]`, and add:

```js
const rulesOf = (findings) => new Set(findings.map((f) => f.rule));

test("B22: a version 1 manifest that uses no version 2 value passes against the version 2 schema", async () => {
  assert.deepEqual(await run((s) => { s.version = 1; }), []);
});

test("B22: a manifest below 1 or above the core version fails", async () => {
  for (const version of [0, 3]) {
    assert.ok(rulesOf(await run((s) => { s.version = version; })).has("schema-version"), String(version));
  }
});

test("B22: a version 2 value in a version 1 graph fails and names the version it needs", async () => {
  const findings = await run((s) => { setPair(find(s.assertions, ":assertion-a5"), "kit:relationship", "kit:replaced-by"); });
  const hit = findings.find((f) => f.rule === "schema-version-too-old");
  assert.ok(hit, JSON.stringify(findings));
  assert.equal(hit.subject, ":assertion-a5");
  assert.match(hit.message, /kit:replaced-by needs kit:schemaVersion 2/);
  assert.ok(!(await run((s) => { s.version = 2; setPair(find(s.assertions, ":assertion-a5"), "kit:relationship", "kit:replaced-by"); }))
    .some((f) => f.rule === "schema-version-too-old"), "allowed at version 2");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test templates/scripts/source-graph-model.test.mjs templates/scripts/check-source-graph.test.mjs`
Expected: FAIL on the six new tests (`DESIGN_STATUSES` is not exported; the version is 1; the checker knows no `schema-version-too-old`).

- [ ] **Step 3: Implement the vocabulary in `templates/scripts/source-graph-model.mjs`**

Add the values, the definitions, `DESIGN_STATUSES`, `NODE_PREDICATE_VERSIONS` and `introducedIn` (2 for the ten values in the table, otherwise 1). In `renderSchema()`, replace the literal `kit:schemaVersion 1` with `CORE.schemaVersion` and add `["designStatuses", "GraphDesignStatus"]` after `["relationships", "GraphRelationship"]`.

- [ ] **Step 4: Implement the version range in `templates/scripts/check-source-graph.mjs`**

The schema file's version must equal `CORE.schemaVersion`; the manifest's must be an integer from 1 to `CORE.schemaVersion`; either failure is `schema-version` with the existing message. With `m` the manifest's version (skip this when the manifest's version is itself invalid), report `schema-version-too-old` on the resource, message `<value> needs kit:schemaVersion <n>`, for each node kind, node `kit:designStatus` value and assertion relationship whose `introducedIn` exceeds `m`, and for each node predicate in `NODE_PREDICATE_VERSIONS` present on a node when its version exceeds `m` (for example `kit:designStatus needs kit:schemaVersion 2`). Report each value once per resource. Node `kit:designStatus` and `kit:evidence` stay "unknown predicate" until Task 2 adds them to the node shape; the too-old scan reads them regardless.

- [ ] **Step 5: Regenerate the shipped schema**

Run: `node -e 'import("./templates/scripts/source-graph-model.mjs").then((m) => process.stdout.write(m.renderSchema()))' > templates/source-graph/graph-schema.ttl`

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, including "the shipped schema file equals the generated one" and "the starter graph passes the checker with no coverage but the graph root" in `tests/source-graph-templates.test.mjs`.

- [ ] **Step 7: Commit and push**

```
git add templates/scripts/source-graph-model.mjs templates/scripts/source-graph-model.test.mjs templates/source-graph/graph-schema.ttl templates/scripts/check-source-graph.mjs templates/scripts/check-source-graph.test.mjs
git commit -m "feat(graph): add schema version 2 values and accept version 1 manifests (#185)"
git push -u origin feature/graph-feature-document-links/build
```

### Task 2: Design node shapes

**Files:**
- Modify: `templates/scripts/check-source-graph.mjs`
- Test: `templates/scripts/check-source-graph.test.mjs`

**Interfaces:**
- Consumes: `DESIGN_STATUSES` from Task 1; `rulesOf` from Task 1's tests.
- Produces: rules `design-status` and `design-evidence` (shape part). The `kit:GraphNode` shape gains `"kit:designStatus": "iri?"` and `"kit:evidence": "iri*"`, and a node's `kit:evidence` must reference a `kit:GraphEvidence` (`dangling-reference` otherwise).

- [ ] **Step 1: Write the failing test**

Add to `templates/scripts/check-source-graph.test.mjs`:

```js
const designNode = (pairs) => block(":behaviour-widgets-B1", "kit:GraphNode",
  [["kit:kind", "kit:behaviour"], ["rdfs:label", S("widgets#B1 Post an invoice")], ...pairs]);

test("B22: a design node needs one status from its kind's list and one evidence item, in a version 2 graph", async () => {
  const shaped = async (pairs, version = 2) => rulesOf(await run((s) => { s.version = version; s.nodes.push(designNode(pairs)); }));
  const ok = await shaped([["kit:designStatus", "kit:current"], ["kit:evidence", ":evidence-e4"]]);
  for (const rule of ["design-status", "design-evidence", "schema-version-too-old", "dangling-reference", "bad-value"]) assert.ok(!ok.has(rule), rule);
  assert.ok((await shaped([["kit:evidence", ":evidence-e4"]])).has("design-status"), "missing status");
  assert.ok((await shaped([["kit:designStatus", "kit:accepted"], ["kit:evidence", ":evidence-e4"]])).has("design-status"), "decision status on a behaviour");
  assert.ok((await shaped([["kit:designStatus", "kit:current"]])).has("design-evidence"), "missing evidence");
  assert.ok((await shaped([["kit:designStatus", "kit:current"], ["kit:evidence", ":evidence-e4"], ["kit:evidence", ":evidence-e1"]])).has("design-evidence"), "two evidence items");
  assert.ok((await shaped([["kit:designStatus", "kit:current"], ["kit:evidence", ":evidence-missing"]])).has("dangling-reference"), "dangling evidence");
  assert.ok((await shaped([["kit:designStatus", "kit:current"], ["kit:evidence", ":evidence-e4"]], 1)).has("schema-version-too-old"), "version 1");
});

test("B22: kit:designStatus and node kit:evidence are rejected on other kinds", async () => {
  const findings = await run((s) => {
    s.version = 2;
    find(s.nodes, ":node-ledger").pairs.push(...block("", "", [["kit:designStatus", "kit:current"], ["kit:evidence", ":evidence-e4"]]).pairs);
  });
  const rules = findings.filter((f) => f.subject === ":node-ledger").map((f) => f.rule);
  assert.ok(rules.includes("design-status"), JSON.stringify(findings));
  assert.ok(rules.includes("design-evidence"), JSON.stringify(findings));
});
```

These tests check named rules only. Increment 2 adds document rules that this hand-made node will also trigger.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test templates/scripts/check-source-graph.test.mjs`
Expected: FAIL on the two new tests (the node predicates are reported as unknown and no design rule exists).

- [ ] **Step 3: Implement the shapes in `templates/scripts/check-source-graph.mjs`**

Add the two predicates to the `kit:GraphNode` shape and `"kit:evidence": "kit:GraphEvidence"` to the node reference map. For a node whose kind is a key of `DESIGN_STATUSES`: `design-status` when it has no `kit:designStatus` or one outside its kind's list; `design-evidence` when it has not exactly one `kit:evidence`. For any other node: `design-status` when it has `kit:designStatus`, and `design-evidence` when it has `kit:evidence`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit and push**

```
git add templates/scripts/check-source-graph.mjs templates/scripts/check-source-graph.test.mjs
git commit -m "feat(graph): check the shape of behaviour and decision nodes (#185)"
git push -u origin feature/graph-feature-document-links/build
```

**End of increment 1.** Check that CI is green, post the handoff on #185 (increment 1 done: B22; next: increment 2), and stop.
