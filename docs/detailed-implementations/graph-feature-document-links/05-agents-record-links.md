# 05 — Agents record the links (Tasks 12–13)

[← Overview](00-overview.md) · [Ontology](../../ontology.md)

Delivers B8–B16. Depends on increment 4. When done, the installed `GraphAgentProtocol` tells every agent what to record and when, the installer ships `DesignDocumentReader` with its test, the installed runbook explains design documents, and an installed end-to-end run passes. The kit produces the graph for B23. Division-ontology owns the compatible C4 snapshot importer B23 requires in USER acceptance ([ADR 0045](../../adr/0045-require-a-compatible-division-importer.md)).

### Task 12: Protocol paragraph and installer

**Files:**
- Modify: `templates/protocol/source-graph-protocol.md`
- Modify: `bin/install-ontology.mjs`
- Test: `tests/source-graph-templates.test.mjs`, `tests/install-ontology.test.mjs`

- [ ] **Step 1: Write the failing tests**

Add to `tests/source-graph-templates.test.mjs`:

```js
test("B8–B15, B20, B21: the graph protocol links design documents in the same change", () => {
  const protocol = template("protocol/source-graph-protocol.md");
  const start = protocol.indexOf("### Linking design documents");
  assert.ok(start > 0, "section missing");
  const section = protocol.slice(start, protocol.indexOf("\n### ", start + 1) === -1 ? undefined : protocol.indexOf("\n### ", start + 1));
  for (const needle of ["same change", ":behaviour-<slug>-B<n>", ":decision-<NNNN>", "`kit:designStatus`", "Keep the IRI", "`kit:replaced-by`",
    "`kit:superseded-by`", "traceability table", "citing the table row and the code", "`kit:documented-by`",
    "only when that one symbol carries out the behaviour", "`kit:tested-by`", "Record nothing for code that does not exist yet",
    "never all of `docs/features/**`", "`kit:schemaVersion` to 2", "pull request body", "retired design links",
    "query-source-graph.mjs behaviour <slug>#B<n>", "code <node>"]) {
    assert.ok(section.includes(needle), needle);
  }
});
```

Add to `tests/install-ontology.test.mjs`:

```js
test("B16: --with-source-graph installs the design document reader and its test as kit files", () => {
  const entries = buildPlan({ withSourceGraph: true });
  for (const dest of ["scripts/source-graph-design-docs.mjs", "scripts/source-graph-design-docs.test.mjs"]) {
    const entry = entries.find((e) => e.dest === dest);
    assert.ok(entry, dest);
    assert.equal(entry.ownedBy, "kit");
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/source-graph-templates.test.mjs tests/install-ontology.test.mjs`
Expected: FAIL on the two new tests.

- [ ] **Step 3: Add the section to `templates/protocol/source-graph-protocol.md`, exactly, immediately before the first `### ` heading that follows `### Recording what you build`**

```markdown
### Linking design documents

When a change adds, rewords or retires a behaviour in a feature document, or adds an ADR or changes its status, record it in the graph in the same change: a `kit:behaviour` node `:behaviour-<slug>-B<n>` labelled `<slug>#B<n>` and the title as written, or a `kit:decision` node `:decision-<NNNN>` labelled `ADR <NNNN>` and its title, each with `kit:designStatus` and one `kit:evidence` item on the declaration, or on the ADR's title through Status lines. Keep the IRI when a title is reworded and relabel the node; when a behaviour moves to Retired behaviours or an ADR is superseded, change its status, move its evidence and add `kit:replaced-by` or `kit:superseded-by` to the replacement the document names. When a component's code is first added, assert `kit:implements` from it to each behaviour its feature's traceability table gives it, citing the table row and the code; assert `kit:documented-by` from a component or symbol to an ADR that names it; assert `kit:implements` from a symbol only when that one symbol carries out the behaviour; and assert `kit:tested-by` from a behaviour to a test written to prove it. Record nothing for code that does not exist yet. Cover only the files that hold this evidence (the behaviours file, `03-architecture.md` and `docs/adr/**`), never all of `docs/features/**`. Raise the manifest's `kit:schemaVersion` to 2 in the change that records the first behaviour or decision. List these nodes and links in the pull request body, with any retired design links the check reports, and in an amendment's handoff. Run `node scripts/query-source-graph.mjs behaviour <slug>#B<n>` to see what a behaviour touches and `code <node>` to see why code exists.
```

In `bin/install-ontology.mjs`, add `"source-graph-design-docs"` to the list of source graph script names (the loop installs the `.mjs` and `.test.mjs`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, including "the graph protocol keeps one line per paragraph" and "no installed graph markdown contains a backticked PascalCase term".

- [ ] **Step 5: Commit and push**

```
git add templates/protocol/source-graph-protocol.md bin/install-ontology.mjs tests/source-graph-templates.test.mjs tests/install-ontology.test.mjs
git commit -m "feat(graph): tell agents to link design documents and install the reader (#185)"
git push -u origin feature/graph-feature-document-links/build
```

### Task 13: Installed end-to-end run and adopter docs

**Files:**
- Create: `tests/design-links-acceptance.test.mjs`
- Modify: `templates/docs/source-knowledge-graph.md`, `docs/how-it-works.md`

- [ ] **Step 1: Write the failing test**

Create `tests/design-links-acceptance.test.mjs`:

```js
// Acceptance for #185, source graph links to feature documents. Every test installs the kit into a scratch repository and
// drives the INSTALLED protocol, runbook, checker and reader, with fetch replaced so that any network call fails. The graph
// is built with the installed test helpers, so the fixture is the one the shipped tests use.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { install } from "../bin/install-ontology.mjs";
import { withTempRepo } from "./helpers/temp-repo.mjs";

const OFFLINE = "data:text/javascript,globalThis.fetch=()=>{throw new Error('network call')}";
const flat = (text) => text.replace(/\s+/g, " ");

async function installed(body) {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withSourceGraph: true });
    const helpers = await import(pathToFileURL(join(repo.dir, "scripts/source-graph-test-helpers.mjs")).href);
    const scratch = { ...repo, commit: (message) => { repo.git("add", "-A"); repo.git("commit", "-q", "-m", message); return repo.git("rev-parse", "HEAD").trim(); } };
    await body(scratch, helpers);
  });
}

function run(repo, script, args) {
  const result = spawnSync(process.execPath, ["--import", OFFLINE, `scripts/${script}.mjs`, ...args], { cwd: repo.dir, encoding: "utf8", env: { PATH: process.env.PATH } });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

test("B8–B16: the installed protocol and runbook tell every agent to link design documents in the same change", async () => {
  await installed(async (repo) => {
    const agents = flat(readFileSync(join(repo.dir, "AGENTS.md"), "utf8"));
    assert.match(agents, /record it in the graph in the same change: a `kit:behaviour` node `:behaviour-<slug>-B<n>`/);
    assert.match(agents, /assert `kit:implements` from a symbol only when that one symbol carries out the behaviour/);
    assert.match(agents, /Record nothing for code that does not exist yet/);
    assert.match(agents, /Raise the manifest's `kit:schemaVersion` to 2 in the change that records the first behaviour or decision/);
    const runbook = flat(readFileSync(join(repo.dir, "docs/source-knowledge-graph.md"), "utf8"));
    assert.match(runbook, /## Link design documents/);
    assert.match(runbook, /node scripts\/query-source-graph\.mjs behaviour <slug>#B<n>/);
  });
});

test("B1, B5, B17, B20, B22: the installed checker passes a linked graph and reports its retired link without failing", async () => {
  await installed(async (repo, h) => {
    const spec = h.widgets(repo);
    h.addDesignDocs(repo, spec);
    h.writeGraph(repo, spec);
    repo.commit("design graph");
    const check = run(repo, "check-source-graph", ["--rev", "HEAD"]);
    assert.equal(check.code, 0, check.err);
    assert.match(check.out, /^retired design links: 1$/m);
  });
});

test("B3, B6, B24: the installed reader answers both questions offline", async () => {
  await installed(async (repo, h) => {
    const spec = h.widgets(repo);
    h.addDesignDocs(repo, spec);
    h.writeGraph(repo, spec);
    repo.commit("design graph");
    const behaviour = run(repo, "query-source-graph", ["behaviour", "payments#B1"]);
    assert.equal(behaviour.code, 0, behaviour.err);
    assert.match(behaviour.out, /^:node-ledger kit:implements :behaviour-payments-B1$/m);
    const code = run(repo, "query-source-graph", ["code", ":node-ledger"]);
    assert.equal(code.code, 0, code.err);
    assert.match(code.out, /^:node-ledger kit:documented-by :decision-0001$/m);
  });
});

test("B22: an upgraded version 1 graph with no design nodes still passes the installed checker", async () => {
  await installed(async (repo, h) => {
    const spec = h.widgets(repo);
    h.writeGraph(repo, spec);
    repo.commit("version 1 graph");
    assert.equal(spec.version, 1);
    const check = run(repo, "check-source-graph", ["--rev", "HEAD"]);
    assert.equal(check.code, 0, check.err);
  });
});

test("B19: reusing a retired id in a pull request fails the installed check", async () => {
  await installed(async (repo, h) => {
    const spec = h.widgets(repo);
    h.addDesignDocs(repo, spec);
    h.writeGraph(repo, spec);
    const base = repo.commit("design graph");
    h.rewriteDoc(repo, spec, "docs/features/payments/feature.md", h.DESIGN_FEATURE.replace("- **B3 Pay by cheque.**", "- **B2 Pay by cheque.**"));
    h.writeGraph(repo, spec);
    repo.commit("reuse B2");
    const check = run(repo, "check-source-graph", ["--base", base, "--head", "HEAD"]);
    assert.equal(check.code, 1, check.out);
    assert.match(check.err, /design-id-reused/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/design-links-acceptance.test.mjs`
Expected: FAIL only on the runbook assertions in the first test; the other four pass on the work of increments 1–4.

- [ ] **Step 3: Add the docs, exactly**

In `templates/docs/source-knowledge-graph.md`, before `## Recover a source snapshot`:

```markdown
## Link design documents

Behaviours and ADRs are graph nodes from schema version 2. A behaviour node is `:behaviour-<slug>-B<n>`, labelled `<slug>#B<n>` and its title, with `kit:designStatus` `kit:current` or `kit:retired` and one evidence item on its declaration in `02-behaviours.md`, or in the Analyst section of `feature.md` for a lite feature. A decision node is `:decision-<NNNN>`, labelled `ADR <NNNN>` and its title, with the first word of its Status line as its `kit:designStatus` and one evidence item from its title line to its Status line. The check fails a node whose id, label, status or evidence no longer matches its document, an id that is both current and retired, and a feature with both behaviours files. It reports, without failing, every link to a retired behaviour or to a superseded or deprecated decision; CI writes that list to the job summary.

To see what a behaviour touches, run `node scripts/query-source-graph.mjs behaviour <slug>#B<n>`. To see why code exists, run `node scripts/query-source-graph.mjs code <node>`; it also shows the links of the component that contains the node.
```

In `docs/how-it-works.md`, after the paragraph that begins "The optional graph naming review":

```markdown
Feature documents join the source knowledge graph too. From schema version 2, a feature's behaviours and its ADRs can be graph nodes, linked to the components, symbols and tests that realise them, so a reader can ask what a behaviour touches or why a piece of code exists. The source-graph check holds those nodes to their documents and reports links to retired behaviours and superseded decisions without failing; whether a link is true remains a reviewer's judgement.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit and push**

```
git add tests/design-links-acceptance.test.mjs templates/docs/source-knowledge-graph.md docs/how-it-works.md
git commit -m "test(graph): installed end-to-end run for design links (#185)"
git push -u origin feature/graph-feature-document-links/build
```

**End of increment 5.** Check that CI is green, tick the build criteria on #185, post the handoff to the user phase, and stop.

## Integrate the amended design and plan

1. Once the plan amendment has merged, fetch `origin/main` and confirm it contains the reviewed design and plan. Confirm the feature checkout is clean. Switch to `feature/graph-feature-document-links/build` and confirm its pushed tip is an ancestor of the local branch before integrating.
2. If the build branch does not already contain the reviewed main commit, merge it with `git merge --no-ff --no-commit origin/main`. Review the staged paths and diff, confirming the merged B23, ADR 0045 and plan are present and the shipped kit changes are intact. Run `node scripts/check-ontology-terms.mjs` and `npm test` before committing the merge. Push normally so the existing build commits and their reviews remain in history.
3. Verify the build branch and tests, then hand off to USER. Tasks 1–13 retain their existing commits. Carry the three B23 inputs and the importer dependency into the handoff.

## B23 acceptance inputs and checks

- Use the real `loadSnapshot({divisionRoot, catalogCommit, checkouts})` in division-ontology's `src/c4/snapshot.mjs`. Record the exact importer revision, catalog commit and source graph commit. The source checkout must be clean, match its catalog source identity and contain the pinned Git objects. The catalog must pin the exact graph commit used for the comparison.
- Verify the importer revision supports schema 2 and resolves standard kit evidence roles against the pinned configuration while retaining schema 1 support. Run the snapshot loader first on a local schema 1 fixture with standard kit evidence and on a local schema 2 fixture with design nodes and links. Then use the pinned JEPA-Speech trial graph for deployed acceptance. Read the expected values from the canonical Turtle at each source commit.
- Compare the imported design nodes by IRI against the full expected set of IRIs, kinds, labels, statuses and evidence. For assertions incident on those nodes, compare the full expected set of assertion IRIs, ordered endpoints, relationships, basis and evidence. Evidence must resolve to the same role, path, blob and line range at the pinned commit.
- From a behaviour with linked code, follow the incoming `kit:implements` assertion to its source symbol or component. For a component, follow an outgoing `kit:contains` assertion to a source file or symbol. Compare the resulting node with the pinned graph. The USER walkthrough and executable test both use the imported snapshot for this traversal.
- If no compatible importer revision is available, record B23 as pending and keep that dependency visible in the USER handoff. The kit's installed end-to-end test covers the producer checks and lookups. B23's pass requires the imported field comparison and traversal.
