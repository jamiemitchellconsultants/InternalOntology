# Source Graph Links to Feature Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a feature's behaviours and ADRs graph nodes that `GraphChecker` holds to their documents, link them to the code and tests that realise them, report links to retired behaviours and superseded decisions, and answer "what does this behaviour touch?" and "why does this code exist?" from the `GraphReader`.

**Architecture:** Graph schema version 2 adds `kit:behaviour` and `kit:decision`, a `kit:designStatus` node predicate, node-level `kit:evidence` for those two kinds, and `kit:replaced-by` and `kit:superseded-by`; each core value carries the version that introduced it, and manifests from version 1 stay valid (ADRs 0041, 0042). A new kit-owned `DesignDocumentReader` (`source-graph-design-docs.mjs`) reads behaviours files and ADRs from a Git tree; `GraphChecker` uses it to fail nodes that drift from their documents and lists each `RetiredDesignLink` in a non-failing report (ADRs 0043, 0044); `GraphReader` uses it for `behaviour` and `code` lookups. The renderer, check workflow, protocol and installer change to match. division-ontology does not change.

**Tech Stack:** Node.js >=18 standard library only, `node:test`, the kit's Turtle reader (`source-graph-turtle.mjs`, `source-graph-model.mjs`) and Git tree reader (`source-graph-git.mjs`), GitHub Actions on the existing Node 20 pattern. No npm dependency.

**Spec:** [feature.md](../../../features/graph-feature-document-links/feature.md) (vision, behaviours B1–B24, architecture), [ADR 0041](../../../adr/0041-behaviour-and-decision-kinds-in-schema-version-2.md), [ADR 0042](../../../adr/0042-accept-older-graph-manifests.md), [ADR 0043](../../../adr/0043-check-design-nodes-against-their-documents.md), [ADR 0044](../../../adr/0044-report-retired-design-links-without-failing.md). Read the [detailed plan](../../../detailed-implementations/graph-feature-document-links/00-overview.md) alongside this one; it holds the test files, the exact copy and the algorithms.

## Increments

| Increment | Behaviour ids | Tasks | Deployable when done |
| --- | --- | --- | --- |
| 1 — Schema version 2 skeleton | B22 | 1–2 | A kit upgrade ships schema version 2; every existing version 1 graph still passes; version 2 values are rejected in a version 1 graph. |
| 2 — Behaviour and decision nodes held to their documents | B1, B2, B5, B19, B21 | 3–6 | Repositories can record behaviour and decision nodes; ids, labels, statuses and evidence that drift from the documents fail the check. |
| 3 — Retirement, supersession and reports | B17, B18, B20 | 7–9 | Retired and superseded nodes link to their replacements; retired design links are reported in CI without failing; the rendered graph shows them. |
| 4 — Behaviour and code lookups | B3, B4, B6, B7, B24 | 10–11 | `behaviour <slug>#B<n>` and `code <node>` answer the two questions offline. |
| 5 — Agents record the links | B8, B9, B10, B11, B12, B13, B14, B15, B16, B23 | 12–13 | The protocol tells every agent what to record, the installer ships it, and an installed end-to-end run passes. B23 is proved in acceptance by importing the trial graph into a division ontology. |

Increment 1 is the walking skeleton: every later increment needs schema version 2, and it must land without turning any adopter's required check red. Stop at the end of each increment: CI green, a handoff naming the next increment, then a break.

## Global Constraints

- This is dev-plan for lite feature #185. Write no implementation until this plan pull request has been reviewed and merged. Build on `feature/graph-feature-document-links/build`, which the user phase shares.
- Installed scripts are byte-identical in every adopting repository. Per-repository values (graph root, namespace, evidence selectors) come from `OntologyConfig`. Never bake in JEPA-Speech or InternalOntology names.
- `GraphChecker`, `GraphReader` and `DesignDocumentReader` read only local Git objects, the graph, the ontology and feature documents; no model call, network or secret (B24). The check workflow keeps `contents: read`.
- `CORE.schemaVersion` is 2. Version 1 manifests pass while they use no version 2 value. `templates/source-graph/graph-schema.ttl` is always `renderSchema()` output; never hand-edit it.
- Behaviour node IRIs are exactly `:behaviour-<slug>-B<n>`; decision node IRIs are exactly `:decision-<NNNN>`. Labels are exactly `<slug>#B<n> <title>` and `ADR <NNNN> <title>`.
- The three declaration forms (`**B1 — Title.**`, `- **B1 Title.**`, `**B1. Title.**`), the `Retired behaviours` heading, the ADR title line `# NNNN — Title` and the Status line `- **Status:** <word> …` are a contract (ADR 0043). Do not widen them without a new decision.
- Retired design links never change the exit code or `ok` (ADR 0044). Missing, reused or mislabelled ids always do.
- Traceability rows are cited, never parsed (ADR 0043).
- Generated Markdown and protocol copy keep one line per paragraph or list item. Do not backtick a PascalCase word in tracked Markdown unless it is an `Ontology` term.
- Every task is test-first, independently reviewable and ends in its own commit and push. Before each commit, stage only the task's files, review `git diff --cached --name-only` and `git diff --cached`, run `node scripts/check-ontology-terms.mjs` and `npm test`, then commit and `git push -u origin feature/graph-feature-document-links/build`. Never hand-edit `Narrative.md`.
- Shipped tests import only shipped modules, never this repository's `tests/` helpers. Keep tests independent of the host's git defaults.
- No new domain term is needed beyond those the analyst and architect added: `FeatureBehaviour`, `BehaviourReference`, `BehaviourStatus`, `DesignDecision`, `DecisionStatus`, `RetiredDesignLink`, `FindBehaviourLinks`, `FindCodeDesignLinks`, `DesignDocumentReader`. JavaScript shapes such as the declaration and the report entry are implementation types.

## Review Focus

- A feature document with Windows line endings: declarations, titles and line numbers read the same as with LF (Task 3).
- A `**B9 — …**` line inside a fenced code block, or a table row naming B1, is not a declaration (Task 3).
- A behaviour title containing backticks, a question mark or a trailing full stop inside the bold run: the label is the title without the closing full stop and nothing else is altered (Task 3, Task 5).
- An ADR whose Status word is capitalised (`Accepted`) or followed by text (`accepted; amended by ADR 0030`) reads as `kit:accepted`; an ADR with no Status line fails as undeclared rather than defaulting (Task 6).
- A reference typed loosely (`payments#b3`, `payments#B03`, `payments # B3`, `#B3`) is rejected with the expected form, not silently matched (Task 10).

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `templates/scripts/source-graph-model.mjs`, `source-graph-model.test.mjs`, `templates/source-graph/graph-schema.ttl`, `templates/scripts/check-source-graph.mjs`, `check-source-graph.test.mjs` | Schema version 2 values, version tags, design statuses per kind, rendered schema; manifest version range and too-new values. | 1 |
| `templates/scripts/check-source-graph.mjs`, `check-source-graph.test.mjs` | `kit:designStatus` and node `kit:evidence` shapes. | 2 |
| `templates/scripts/source-graph-design-docs.mjs`, `source-graph-design-docs.test.mjs` | `DesignDocumentReader`: IRIs and references, declarations, retired entries, behaviours file by mode, ADR title and status. | 3 |
| `templates/scripts/source-graph-test-helpers.mjs` | `addDesignDocs` fixture: a lite or full feature, two ADRs, selectors, coverage, records, design nodes and links. | 4 |
| `templates/scripts/check-source-graph.mjs`, `check-source-graph.test.mjs` | Behaviour nodes held to their behaviours file. | 5 |
| same | Decision nodes held to their ADR. | 6 |
| same | Replacement and successor links required and kind-checked. | 7 |
| `templates/scripts/check-source-graph.mjs`, `check-source-graph.test.mjs`, `templates/github/workflows/source-graph-check.yml`, `tests/source-graph-templates.test.mjs` | `RetiredDesignLink` reports in text, `--json` and `--summary`; workflow writes the step summary. | 8 |
| `templates/scripts/source-graph-markdown.mjs`, `source-graph-markdown.test.mjs` | Phrases for the new relationships; status beside design node labels. | 9 |
| `templates/scripts/query-source-graph.mjs`, `query-source-graph.test.mjs` | `behaviour <slug>#B<n>` (`FindBehaviourLinks`). | 10 |
| same | `code <node>` (`FindCodeDesignLinks`) and the offline guarantee for both. | 11 |
| `templates/protocol/source-graph-protocol.md`, `bin/install-ontology.mjs`, `tests/source-graph-templates.test.mjs`, `tests/install-ontology.test.mjs` | The protocol paragraph and installing the new script and its test. | 12 |
| `tests/design-links-acceptance.test.mjs`, `docs/how-it-works.md`, `templates/docs/source-knowledge-graph.md` | Installed end-to-end run and adopter docs. | 13 |

## Interfaces and Planning Decisions

```js
// source-graph-model.mjs (Task 1)
export const CORE; // schemaVersion: 2; kinds += "kit:behaviour", "kit:decision"; relationships += "kit:replaced-by", "kit:superseded-by";
                   // designStatuses: ["kit:current", "kit:retired", "kit:proposed", "kit:accepted", "kit:superseded", "kit:deprecated"]
export const DESIGN_STATUSES; // { "kit:behaviour": ["kit:current", "kit:retired"], "kit:decision": ["kit:proposed", "kit:accepted", "kit:superseded", "kit:deprecated"] }
export function introducedIn(iri); // -> 2 for the kinds, relationships and design statuses added here, otherwise 1
export const NODE_PREDICATE_VERSIONS; // { "kit:designStatus": 2, "kit:evidence": 2 } — on a GraphNode only; assertion kit:evidence stays version 1

// source-graph-design-docs.mjs (Task 3)
export const BEHAVIOUR_IRI; // /^:behaviour-([a-z0-9]+(?:-[a-z0-9]+)*)-B([1-9][0-9]*)$/
export const DECISION_IRI;  // /^:decision-([0-9]{4})$/
export function behaviourIri(slug, id); // -> ":behaviour-<slug>-B<id>"
export function decisionIri(number);    // -> ":decision-<number>"
export function parseBehaviourReference(text); // "<slug>#B<n>" -> { slug, id: number } | null
export function readBehaviours(text, { lite = false } = {}); // -> Array<{ id, title, line, retired, replacement: number | null }>
export function behavioursFile(tree, slug); // -> { path, lite, conflict: null } | { path: null, lite: null, conflict: [fullPath, litePath] } | null
export function readDecision(tree, number); // -> { path, number, title, titleLine, status, statusLine, successor } | null; missing parts are null

// check-source-graph.mjs (Tasks 2, 5–8)
export function designFindings(graph, tree); // -> Finding[] for the design-* rules
export function retiredDesignLinks(graph);   // -> Array<{ assertion, subject, relationship, object, status, replacement }>
// main(): --summary <file> appends the report as Markdown; --json adds "reports"; exit code and ok depend on findings only

// query-source-graph.mjs (Tasks 10–11)
export function behaviourLinks(graph, tree, reference); // -> { reference, behaviour, replacement, declared, components, symbols, tests }
export function codeLinks(graph, id); // -> { node, behaviours, decisions, via: Array<{ component, behaviours, decisions }> }
// nodeView() gains designStatus; annotate() marks evidence in every new assertion list
```

New `GraphChecker` rules: `schema-version` (manifest outside 1..2 or schema file not at the core version), `schema-version-too-old`, `design-status`, `design-evidence`, `design-iri`, `design-undeclared`, `design-label`, `design-file-conflict`, `design-id-reused`, `design-replacement`, `design-link-kinds`.

Planning decisions that follow from the architecture without re-deciding it:

- Node-level evidence: the architecture gives each behaviour and decision node "one `GraphEvidence` on its declaration". `kit:GraphNode` therefore gains an optional `kit:evidence` predicate (version 2), required exactly once on the two design kinds and rejected on every other kind.
- A decision's single evidence item spans its title line to its Status line. A behaviour's evidence starts on its declaration line.
- The lite behaviours section is the text between `## Analyst: behaviours` and the next `## ` heading. A full-mode `02-behaviours.md` is read whole. Lines inside fenced code blocks are never declarations.
- A replacement is the first `replaced by B<n>` (optionally `replaced by <slug>#B<n>`) in a retired entry; a successor is `superseded by ADR <NNNN>` in the Status line.
- The report covers every assertion other than `kit:replaced-by` and `kit:superseded-by` whose subject or object is a retired behaviour or a superseded or deprecated decision.
- `code` follows only `kit:contains` assertions whose subject is a `kit:component` or `kit:system`.

---

## Increment 1 — Schema version 2 skeleton (B22)

### Task 1: Version 2 values and older manifests

**Files:** Modify `templates/scripts/source-graph-model.mjs`, `templates/scripts/check-source-graph.mjs` and their tests; regenerate `templates/source-graph/graph-schema.ttl`.

**Interfaces:** Produces `CORE`, `DESIGN_STATUSES`, `introducedIn`, `NODE_PREDICATE_VERSIONS`; `renderSchema()` writes `CORE.schemaVersion` and a `kit:GraphDesignStatus` section; the checker's `schema-version` range and `schema-version-too-old`. Raising the core version and accepting older manifests land together, because either alone turns the existing checker tests red.

- [ ] Write the failing tests (detailed plan, Task 1), and change the existing `schema-version` mutation from `s.version = 2` to `s.version = 3`.
- [ ] Run `node --test templates/scripts/source-graph-model.test.mjs templates/scripts/check-source-graph.test.mjs`; expect the six new tests to fail.
- [ ] Implement the values, definitions, `DESIGN_STATUSES`, `NODE_PREDICATE_VERSIONS` and `introducedIn`; make `renderSchema()` write `CORE.schemaVersion`; accept manifests from 1 to the core version and report values newer than the manifest.
- [ ] Regenerate the shipped schema with `node -e 'import("./templates/scripts/source-graph-model.mjs").then((m) => process.stdout.write(m.renderSchema()))' > templates/source-graph/graph-schema.ttl`.
- [ ] Run `npm test`; expect PASS, including "the shipped schema file equals the generated one".
- [ ] Commit `feat(graph): add schema version 2 values and accept version 1 manifests (#185)` and push.

### Task 2: Design node shapes

**Files:** Modify `templates/scripts/check-source-graph.mjs`, `templates/scripts/check-source-graph.test.mjs`.

**Interfaces:** Consumes `DESIGN_STATUSES`. Produces the `design-status` and `design-evidence` (shape part) rules and the node `kit:designStatus` and `kit:evidence` predicates.

- [ ] Write the failing tests (detailed plan, Task 2).
- [ ] Run `node --test templates/scripts/check-source-graph.test.mjs`; expect the two new tests to fail.
- [ ] Implement the node shape, the node evidence reference and the two design shape rules.
- [ ] Run `npm test`; expect PASS.
- [ ] Commit `feat(graph): check the shape of behaviour and decision nodes (#185)` and push. **End of increment 1: CI green, handoff, stop.**

## Increment 2 — Behaviour and decision nodes held to their documents (B1, B2, B5, B19, B21)

### Task 3: `DesignDocumentReader`

**Files:** Create `templates/scripts/source-graph-design-docs.mjs`, `templates/scripts/source-graph-design-docs.test.mjs`.

**Interfaces:** Produces every export listed for `source-graph-design-docs.mjs` above. Consumes only a tree with `has(path)`, `text(path)` and `paths()`.

- [ ] Write the failing test file (detailed plan, Task 3), covering the Review Focus lines on line endings, code fences, table rows and titles.
- [ ] Run `node --test templates/scripts/source-graph-design-docs.test.mjs`; expect failure (module missing).
- [ ] Implement the module with the algorithm contract in the detailed plan.
- [ ] Run `npm test`; expect PASS.
- [ ] Commit `feat(graph): read behaviours and ADRs for the source graph (#185)` and push.

### Task 4: Design fixture for shipped tests

**Files:** Modify `templates/scripts/source-graph-test-helpers.mjs`; add one smoke test to `templates/scripts/check-source-graph.test.mjs`.

**Interfaces:** Produces `DESIGN_FEATURE`, `DESIGN_ADRS`, `addDesignDocs(repo, spec, { mode = "lite" } = {})` returning `{ featurePath }`, and `rewriteDoc(repo, spec, path, text)`, which rewrites a covered document and refreshes the blob IDs of its evidence and refresh record.

- [ ] Write the smoke test: a widgets graph with `addDesignDocs` in each mode has no findings.
- [ ] Run it; expect failure (helper missing).
- [ ] Implement the helper exactly as the detailed plan specifies (fixed text, IRIs, evidence lines).
- [ ] Run `npm test`; expect PASS (the checker has no design rules yet, so the fixture is structurally valid).
- [ ] Commit `test(graph): add a feature document and ADR fixture (#185)` and push.

### Task 5: Behaviour nodes held to their behaviours file

**Files:** Modify `templates/scripts/check-source-graph.mjs`, `templates/scripts/check-source-graph.test.mjs`.

**Interfaces:** Consumes `BEHAVIOUR_IRI`, `behavioursFile`, `readBehaviours`. Produces `designFindings(graph, tree)` (behaviour part) and calls it from `checkTree`.

- [ ] Write the failing mutation tests (detailed plan, Task 5).
- [ ] Run them; expect failure.
- [ ] Implement the behaviour checks in the order the detailed plan gives.
- [ ] Run `npm test`; expect PASS.
- [ ] Commit `feat(graph): hold behaviour nodes to their feature documents (#185)` and push.

### Task 6: Decision nodes held to their ADR

**Files:** Modify `templates/scripts/check-source-graph.mjs`, `templates/scripts/check-source-graph.test.mjs`.

**Interfaces:** Consumes `DECISION_IRI`, `readDecision`. Extends `designFindings`.

- [ ] Write the failing mutation tests (detailed plan, Task 6), including the capitalised and annotated Status lines and a missing Status line.
- [ ] Run them; expect failure.
- [ ] Implement the decision checks.
- [ ] Run `npm test`; expect PASS.
- [ ] Commit `feat(graph): hold decision nodes to their ADRs (#185)` and push. **End of increment 2: CI green, handoff, stop.**

## Increment 3 — Retirement, supersession and reports (B17, B18, B20)

### Task 7: Replacement and successor links

**Files:** Modify `templates/scripts/check-source-graph.mjs`, `templates/scripts/check-source-graph.test.mjs`.

**Interfaces:** Extends `designFindings` with `design-replacement` and `design-link-kinds`.

- [ ] Write the failing tests (detailed plan, Task 7).
- [ ] Run them; expect failure.
- [ ] Implement: a retired behaviour whose entry names a replacement needs `kit:replaced-by` to that behaviour's node; a superseded decision whose Status line names a successor needs `kit:superseded-by` to it; both relationships join two nodes of the same design kind.
- [ ] Run `npm test`; expect PASS.
- [ ] Commit `feat(graph): require replacement and successor links (#185)` and push.

### Task 8: Retired design link reports

**Files:** Modify `templates/scripts/check-source-graph.mjs`, `templates/scripts/check-source-graph.test.mjs`, `templates/github/workflows/source-graph-check.yml`, `tests/source-graph-templates.test.mjs`.

**Interfaces:** Produces `retiredDesignLinks(graph)` and the `--summary <file>` option.

- [ ] Write the failing tests (detailed plan, Task 8): the fixture's link to `payments#B3` is reported, exit code 0, `ok: true`, JSON `reports`, summary Markdown, and the workflow passes `--summary "$GITHUB_STEP_SUMMARY"` in both steps.
- [ ] Run them; expect failure.
- [ ] Implement `retiredDesignLinks`, the text, JSON and summary output, and the workflow change.
- [ ] Run `npm test`; expect PASS.
- [ ] Commit `feat(graph): report retired design links without failing (#185)` and push.

### Task 9: Rendered graph shows design status and the new links

**Files:** Modify `templates/scripts/source-graph-markdown.mjs`, `templates/scripts/source-graph-markdown.test.mjs`.

- [ ] Write the failing test (detailed plan, Task 9).
- [ ] Run it; expect failure.
- [ ] Add `kit:replaced-by` → "is replaced by" and `kit:superseded-by` → "is superseded by" to `PHRASES`, and append the status's local name to a design node's kind text.
- [ ] Run `npm test`; expect PASS.
- [ ] Commit `feat(graph): render design status and replacement links (#185)` and push. **End of increment 3: CI green, handoff, stop.**

## Increment 4 — Behaviour and code lookups (B3, B4, B6, B7, B24)

### Task 10: `behaviour <slug>#B<n>`

**Files:** Modify `templates/scripts/query-source-graph.mjs`, `templates/scripts/query-source-graph.test.mjs`.

**Interfaces:** Consumes `parseBehaviourReference`, `behaviourIri`, `behavioursFile`, `readBehaviours`. Produces `behaviourLinks`.

- [ ] Write the failing tests (detailed plan, Task 10), including the loosely typed references from the Review Focus.
- [ ] Run them; expect failure.
- [ ] Implement `behaviourLinks`, the `behaviour` command, its text output and the gap messages.
- [ ] Run `npm test`; expect PASS.
- [ ] Commit `feat(graph): add the behaviour lookup (#185)` and push.

### Task 11: `code <node>` and the offline guarantee

**Files:** Modify `templates/scripts/query-source-graph.mjs`, `templates/scripts/query-source-graph.test.mjs`.

**Interfaces:** Produces `codeLinks`.

- [ ] Write the failing tests (detailed plan, Task 11), including the "via component" case and a run with `fetch` replaced by a thrower for both commands.
- [ ] Run them; expect failure.
- [ ] Implement `codeLinks`, the `code` command and its gap message.
- [ ] Run `npm test`; expect PASS.
- [ ] Commit `feat(graph): add the code lookup (#185)` and push. **End of increment 4: CI green, handoff, stop.**

## Increment 5 — Agents record the links (B8–B16, B23)

### Task 12: Protocol paragraph and installer

**Files:** Modify `templates/protocol/source-graph-protocol.md`, `bin/install-ontology.mjs`, `tests/source-graph-templates.test.mjs`, `tests/install-ontology.test.mjs`.

- [ ] Write the failing tests (detailed plan, Task 12).
- [ ] Run them; expect failure.
- [ ] Add the "Linking design documents" section with the exact copy, and add `"source-graph-design-docs"` to the installer's source graph script list.
- [ ] Run `npm test`; expect PASS.
- [ ] Commit `feat(graph): tell agents to link design documents and install the reader (#185)` and push.

### Task 13: Installed end-to-end run and adopter docs

**Files:** Create `tests/design-links-acceptance.test.mjs`; modify `templates/docs/source-knowledge-graph.md`, `docs/how-it-works.md`.

- [ ] Write the failing acceptance test (detailed plan, Task 13): install with `--with-source-graph` into a scratch repository, add a lite feature and an ADR, record nodes and links as the protocol says with the manifest at version 2, then check, retire a behaviour, check again for a report, and run both lookups.
- [ ] Run it; expect failure only where the docs assertions name missing text.
- [ ] Add the "Design documents" subsection to the installed runbook and one paragraph to `docs/how-it-works.md`, with the exact copy in the detailed plan.
- [ ] Run `npm test`; expect PASS.
- [ ] Commit `test(graph): installed end-to-end run for design links (#185)` and push. **End of increment 5: CI green, handoff to the user phase.**
