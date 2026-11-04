# Human-Readable Source Knowledge Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give maintainers a generated, readable current-state Markdown view of the canonical source graph, committed in the source PR and checked for freshness with immutable evidence links.

**Architecture:** The existing Git/tree model and `GraphChecker` validate a pinned source commit and the current candidate. One `GraphRenderer` component projects the complete graph into deterministic Markdown, preserving evidence, basis, source lookup and coverage. Source and generated-document commits share one PR; `GraphRenderWorkflow` retrieves missing source objects during checkout/bootstrap and performs a read-only comparison.

**Tech Stack:** Existing Node.js >=18 and Git, `node:test`, Node.js standard library, GitHub Actions using the existing Node.js 20 setup pattern; no npm/RDF/model dependency.

**Spec:** [Vision](../../../features/human-readable-source-knowledge-graph/01-vision.md), [behaviours B1–B14](../../../features/human-readable-source-knowledge-graph/02-behaviours.md), [architecture](../../../features/human-readable-source-knowledge-graph/03-architecture.md), [ADR 0009](../../../adr/0009-source-graph-markdown-in-source-pr.md), [ADR 0010](../../../adr/0010-source-graph-markdown-revision-context.md), [ADR 0011](../../../adr/0011-source-graph-markdown-renderer.md). Read the [detailed plan](../../../detailed-implementations/human-readable-source-knowledge-graph/plan.md) alongside this task plan.

## Global Constraints

- This is dev-plan for feature #62. Write no implementation until this plan PR has been reviewed and merged. Build on `feature/human-readable-source-knowledge-graph/dev-build`.
- Installed scripts are byte-identical in every adopting repository. All repository-specific paths, namespace and browser identity come from `OntologyConfig`; never bake in JEPA-Speech names or the pilot's assertion count.
- Reuse the existing supported Turtle parser/model and `checkRevision(tree)`; keep the independent PR base/proposed graph check and its configuration locks. A successful render does not prove semantic truth.
- Canonical changes are committed as source S; generated Markdown is committed as D in the same PR. Validate S and the current candidate and require equal complete input projections. No moving-branch or relative evidence/Turtle URL is allowed.
- The renderer is local-only: no model, secret, source execution, package dependency or network request. Only workflow checkout/bootstrap may fetch a missing source object, by strictly validated full SHA from the fixed remote.
- Default output is `<sourceGraph.root>/README.md`; an override remains strictly inside the excluded graph root. Preserve authored files, canonical input and the last successful document on failure.
- Hashes and full graph identifiers stay outside the main reading flow. Evidence links show source file/line range. Preserve direct/tentative basis, all claims/evidence, isolated nodes, local definitions and coverage limits.
- Use explicit ordinal ordering, LF newlines, no run metadata, and one source line per prose paragraph/list item. Escape supplied text, including HTML and backticks; do not generate unknown backticked ontology terms from source symbols.
- Every task is test-first, independently reviewable and ends in its own commit and push. Before each commit stage only its files, review `git diff --cached --name-only` and `git diff --cached`, run `node scripts/check-ontology-terms.mjs` and `npm test`, then commit and push. Never hand-edit `Narrative.md` or accepted phase artefacts.
- This repository's canonical ontology is `docs/ontology.md`; the approved use case and component names already exist. No allowlist entry or new domain name is needed by this plan. Shipped tests import only shipped relative modules, never this repository's `tests/` helpers.

## File Structure

| File | Responsibility |
| --- | --- |
| `templates/scripts/ontology-config.mjs`, `tests/ontology-config.test.mjs` | Optional renderer settings, normalization and existing graph-only compatibility. |
| `templates/scripts/source-graph-render-input.mjs`, matching `.test.mjs` | Validated input inventory/fingerprint, bounded provenance and pinned source selection/comparison. Internal to `GraphRenderer`. |
| `templates/scripts/source-graph-render-test-helpers.mjs` | Renderer fixture wrapper over the existing widgets fixture; ships with tests. |
| `templates/scripts/source-graph-markdown.mjs`, matching `.test.mjs` | Pure ordered whole-graph Markdown, escaping, source permalinks and readable layout. Internal to `GraphRenderer`. |
| `templates/scripts/render-source-graph.mjs`, matching `.test.mjs` | CLI modes, offline orchestration, source reuse, safe atomic file replacement and diagnostics. |
| `templates/github/workflows/source-graph-render.yml`, `tests/source-graph-render-workflow.test.mjs` | Read-only workflow and functional missing-source bootstrap proof. |
| `bin/install-ontology.mjs`, `tests/install-ontology.test.mjs`, `tests/source-graph-render-install.test.mjs` | Ship all runtime/test files, preserve ownership and exercise installed commands. |
| `templates/protocol/source-graph-protocol.md`, `templates/docs/source-knowledge-graph.md`, `README.md`, `docs/ai-agent-install.md` | Extend existing installation/authoring instructions for the approved source-then-document sequence. Feature-user owns the feature runbook/user guide and hosted acceptance record. |

## Interfaces and Planning Decisions

These are implementation contracts within the accepted components, not new services or domain types. Complete test files and the shared fixture contract appear in the detailed plan.

```js
// source-graph-render-input.mjs
export const FORMAT_VERSION = 1;
export const PROVENANCE_PREFIX = '<!-- ontology-kit-source-graph ';
export class RenderError extends Error { code; } // constructor(message, code = 2)
export function readRenderInput(tree); // -> { tree, config, graph, markdownPath, repositoryUrl, inventory, fingerprint }
export function encodeProvenance({ sourceRevision, fingerprint }); // complete first comment line + LF
export function parseProvenance(markdown); // -> { format: 1, sourceRevision, fingerprint }, or RenderError(2)
export function chooseSource({ cwd, candidate, explicitSourceRev }); // -> validated source input; see detailed selection algorithm
// source-graph-markdown.mjs
export function renderMarkdown(input); // committed input -> complete Markdown string
export function sourceLink(input, path, startLine, endLine = startLine); // commit permalink
// render-source-graph.mjs
export function main(argv, { cwd = process.cwd(), stdout = process.stdout, stderr = process.stderr, beforePublish = () => {} } = {}); // integer code
export function publishMarkdown({ cwd, markdownPath, markdown, beforeReplace = () => {} }); // atomic, no staging; throws on failure
```

| Topic | Exact decision |
| --- | --- |
| Configuration defaults | Always normalize `sourceGraph.markdownPath` to `<normalized root>/README.md` and absent `repositoryUrl` to `""`. Graph-only commands accept an absent or blank URL normalized to an empty string; the renderer requires a non-empty one. Update old default-object expectations. |
| Browser base | A non-blank supplied URL must be HTTPS, have no credentials/query/fragment, and have exactly owner/repository path segments. Accept GitHub and Enterprise hostnames, trim a trailing slash, and reject encoded separators/dot segments. Do not fetch or infer it from a remote. |
| Output | A normalized `.md` descendant of the root, distinct from canonical ontology paths. Marker ownership and filesystem containment are also checked at publication time. |
| Inventory | Sorted unique pairs `[path, blobId]` for config, ontology Markdown/Turtle, every graph-root `.ttl` including schema, and every existing file with effective covered status. Exclude output. Fingerprint is SHA-256 of `JSON.stringify([FORMAT_VERSION, inventory])`. |
| Provenance | First line is `PROVENANCE_PREFIX + JSON.stringify({format:1, sourceRevision, fingerprint}) + ' -->\n'`. Bound metadata to 4096 UTF-8 bytes, require one marker, exactly those keys, format 1, 40/64 lowercase hex commit ID and 64 lowercase hex fingerprint. Never execute JSON or interpolate it into a shell. |
| Source reuse | Reuse a recorded, available S only after validating S and comparing its inventory/fingerprint with HEAD. Changed relevant input selects HEAD; explicit `--source-rev` must match HEAD. An unavailable recorded S fails with retrieval/explicit-source recovery. |
| Currentness | Validate the current tree independently and compare its actual inventory with S, not only an untrusted recorded digest. Then require canonical regenerated bytes, including provenance, to equal tracked Markdown. |
| CLI | Default writes from committed source; `--source-rev REV` is write-only. `--check [--rev REV \| --staged]` compares without writes, default HEAD. `--print-source-rev [--rev REV]` reads bounded provenance without requiring S locally and prints only SHA plus LF for bootstrap. Help exits 0; incompatible/unknown flags exit 2. |
| Exit codes | 0 successful write/equality; 1 missing/stale output or candidate/source projection mismatch in check mode; 2 invalid input/provenance, missing source object, unsafe publication or bad arguments. Preserve underlying graph finding names in diagnostics. |
| Repair | Explicit `--source-rev HEAD` may replace a marked generated file whose provenance is malformed; it still refuses unmarked authored content. Default/check modes report malformed provenance. |
| Runtime boundaries | Three small runtime files implement one renderer component. No change to the canonical graph schema or existing parser/checker behaviour is required. |

## Review Focus

- A source permalink must still resolve to the original Git blob after its branch advances; Task 3 follows each URL's SHA/path against Git objects, and feature-user later follows actual hosted links.
- Squash/rebase can leave S outside normal clone history; Task 5 uses a fresh clone and a retained PR ref to exercise the actual fixed-remote fetch step, including unavailable S.
- Changed covered source or newly covered files must not be hidden behind unchanged assertions or an old fingerprint; Tasks 2 and 4 exercise inventory changes and validation before comparison.
- Graph text can contain Markdown/HTML/backticks, duplicate labels and encoded path punctuation; Task 3 proves readable escaping, unambiguous source references and term-check compatibility.
- An output symlink, authored file, concurrent index change or replacement failure must preserve existing bytes; Task 4 exercises each publication boundary, including a symlinked ancestor.

## Tasks

### Task 1: Validate renderer configuration without breaking graph-only adopters

**Files:** Modify `templates/scripts/ontology-config.mjs`, `tests/ontology-config.test.mjs`.

**Interfaces:** Consume existing path/config validation. Produce normalized `sourceGraph.markdownPath` and `sourceGraph.repositoryUrl` with the rules above. Preserve optional URL compatibility for reader/checker.

- [ ] **Step 1:** Append the complete Task 1 tests from the detailed plan and update existing deep-equal defaults.
- [ ] **Step 2:** Run `node --test tests/ontology-config.test.mjs`; expect failures for unsupported settings/defaults, not fixture/import failures.
- [ ] **Step 3:** Extend allowed keys, normalization and typedefs only; do not add an installer flag or new mandatory graph-only setting.
- [ ] **Step 4:** Rerun the focused file; expect pass. Apply the global commit checks.
- [ ] **Step 5:** Commit `feat: validate source graph Markdown settings` and push the build branch.

### Task 2: Bind rendering to validated immutable source inputs

**Files:** Create `templates/scripts/source-graph-render-input.mjs`, `source-graph-render-input.test.mjs`, `source-graph-render-test-helpers.mjs`.

**Interfaces:** Consume `treeFromRevision`, `treeFromIndex`, `loadCheckConfig`, `checkRevision`, `loadGraph`, `resolveCoverage`. Produce the input/provenance/source-selection exports above for Tasks 3–5.

- [ ] **Step 1:** Create the complete shared fixture and Task 2 test file in the detailed plan. Test graph validation, inventory inclusion/exclusion, 4096-byte provenance bound, unsupported/duplicate fields, source reuse and stale/missing snapshots.
- [ ] **Step 2:** Run `node --test templates/scripts/source-graph-render-input.test.mjs`; expect missing-export or unimplemented-behaviour failures.
- [ ] **Step 3:** Implement the inventory and source-selection algorithms specified in the detailed plan. Parse metadata as data; return only fully validated input objects to formatting.
- [ ] **Step 4:** Rerun the focused tests; expect pass. Apply global commit checks.
- [ ] **Step 5:** Commit `feat: bind graph rendering to validated source snapshots` and push.

### Task 3: Render complete readable Markdown with immutable source references

**Files:** Create `templates/scripts/source-graph-markdown.mjs`, `source-graph-markdown.test.mjs`.

**Interfaces:** Consume validated inputs and provenance encoding from Task 2. Produce `renderMarkdown` and `sourceLink`; never read the worktree/network or validate only a subset of assertions.

- [ ] **Step 1:** Add the complete Task 3 tests. Cover every current claim across shards, direct/inferred basis, all evidence, isolated/shared-label nodes, local definitions, coverage/reasons/precedence, empty graphs, escaping, ordinal ordering and source links after branch advancement.
- [ ] **Step 2:** Run `node --test templates/scripts/source-graph-markdown.test.mjs`; expect missing module/behaviour failures.
- [ ] **Step 3:** Implement the approved document sections and sorting. Use escaped plain text for labels, stable per-assertion navigation anchors, numeric line anchors and the committed input ID in every source URL. Tests must assert each claim's complete directed meaning, basis and associated evidence/Turtle references, not merely aggregate occurrence. Keep raw IDs/hashes in secondary detail. Do not add diagrams or an assertion diff.
- [ ] **Step 4:** Rerun focused tests; expect pass. Apply global commit checks.
- [ ] **Step 5:** Commit `feat: render the current source graph as readable Markdown` and push.

### Task 4: Add offline CLI checking and safe atomic output

**Files:** Create `templates/scripts/render-source-graph.mjs`, `render-source-graph.test.mjs`.

**Interfaces:** Consume Tasks 2–3. Produce `main` and `publishMarkdown`, including exact CLI modes/codes, bounded SHA-only inspection and the `beforeReplace` test seam for the final input recheck.

- [ ] **Step 1:** Add the complete Task 4 tests, including S→D generation, repeatability, historical checks, changed/removed claims, source/index mismatches, malformed metadata repair, invalid graph, unmarked files, symlink ancestors, replacement failure and index changes before replacement.
- [ ] **Step 2:** Run `node --test templates/scripts/render-source-graph.test.mjs`; expect missing command/behaviour failures.
- [ ] **Step 3:** Implement argument parsing, current/source validation and exact comparison. For writes compare HEAD and index projections before rendering and again in `beforeReplace`, then replace only marked output atomically. Invoke the optional `beforePublish` test seam immediately before the final index recheck; production defaults to a no-op. Follow existing realpath-aware command entry guards so a symlinked command executes.
- [ ] **Step 4:** Rerun focused tests; expect pass. Apply global commit checks.
- [ ] **Step 5:** Commit `feat: check and atomically publish source graph Markdown` and push.

### Task 5: Check Markdown in CI and retrieve missing source objects during bootstrap

**Files:** Create `templates/github/workflows/source-graph-render.yml`, `tests/source-graph-render-workflow.test.mjs`.

**Interfaces:** Consume Task 4's `--print-source-rev` and `--check`. Workflow uses a fixed `origin`, full-history checkout, source SHA as an argument, no custom secret/write permission, and stable job name `source-graph-markdown`.

- [ ] **Step 1:** Add the complete Task 5 workflow test file and its local bare-remote fixture. Prove bootstrap really fetches S in a fresh clone after a squash-like rewrite with retained PR history; unavailable/invalid metadata fails and never runs a success check.
- [ ] **Step 2:** Run `node --test tests/source-graph-render-workflow.test.mjs`; expect missing template/step failures.
- [ ] **Step 3:** Write the exact workflow skeleton from the detailed plan. Keep Git fetch in bootstrap and out of the renderer; do not weaken the existing source-graph check or add path filters.
- [ ] **Step 4:** Rerun focused tests; expect pass. Apply global commit checks. Actual GitHub/Enterprise permalink retention is a hosted acceptance obligation, not something the local bare-remote test proves.
- [ ] **Step 5:** Commit `feat: verify source graph Markdown in read-only CI` and push.

### Task 6: Ship the renderer and prove the installed authoring loop

**Files:** Modify `bin/install-ontology.mjs`, `tests/install-ontology.test.mjs`, `tests/templates.test.mjs`, `tests/source-graph-acceptance.test.mjs`, `templates/protocol/source-graph-protocol.md`, `templates/docs/source-knowledge-graph.md`, `README.md`, `docs/ai-agent-install.md`; create `tests/source-graph-render-install.test.mjs`.

**Interfaces:** Add the three runtime modules and their tests plus the renderer test helper to the source-graph plan as Kit-owned, unsubstituted files. Add the substituted render workflow. Preserve config/Turtle ownership and source-graph opt-in. Print a configuration/regeneration hint without inventing a repository URL.

- [ ] **Step 1:** Add the complete Task 6 tests and extend existing destination/byte-identical loops. Test core install unchanged, alternate root/URL, separate operating guide, preserved authored README/Turtle/config, normal upgrade, installed shipped tests and term-check compatibility.
- [ ] **Step 2:** Run `node --test tests/install-ontology.test.mjs tests/templates.test.mjs tests/source-graph-render-install.test.mjs`; expect missing shipping/protocol behaviour failures.
- [ ] **Step 3:** Extend installation and existing instructions. Explain configure URL → commit canonical input → generate → stage/review/validate → document commit → same PR. Do not create a placeholder view or auto-commit in the installer. Preserve feature-user ownership of the future feature runbook, user guide and acceptance record.
- [ ] **Step 4:** Run focused tests and the full suite; expect pass. Verify installed tests run without repository-root test helpers. Apply global commit checks.
- [ ] **Step 5:** Commit `feat: ship the source graph Markdown authoring workflow` and push.

## Behaviour Coverage and Completion

| Behaviour | Proof tasks |
| --- | --- |
| B1–B3 | 2–3, 6: complete model, sharding, names/local definitions, empty/isolated nodes. |
| B4–B7 | 2–5: every evidence/source reference, immutable links, basis and exact lookup. Hosted click-through remains feature-user acceptance. |
| B8–B9 | 2–3: effective coverage, priorities/reasons and missing-knowledge notice. |
| B10 | 4–6: generated marker, source preservation, same-PR loop and read-only check. |
| B11–B12 | 2–4: stable source reuse/bytes and complete replacement of current claims. |
| B13 | 2, 4–5: invalid input, output protection and visible bootstrap/check failures. |
| B14 | 1, 3, 6: configurable roots/URLs, identical installed files and no pilot constants. |

The plan self-review checks all three accepted spec documents, B1–B14 and ADRs 0009–0011 against these tasks; every public signature used by another task is defined above. No new domain term is introduced. After all build tasks, perform one whole-branch review, rerun required checks only after necessary fixes, open the build phase PR closing #67 and hand off to feature-user. Do not claim a JEPA-Speech trial, hosted workflow, branch-protection or actual browser navigation passed until that environment is exercised.

## Execution Handoff

This plan PR closes #66 and must merge before build. The execution method is to be chosen by the owner: native execution by the current coding agent or subagent-driven execution using the supplied contracts. Native execution is recommended because the six tasks share tightly coupled interfaces and a final independent review can assess the complete authoring loop. Stop at this checkpoint; do not begin Task 1 in the plan session.
