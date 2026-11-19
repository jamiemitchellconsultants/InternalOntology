# Matched ontology projection — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps in the [detailed plan](../../../detailed-implementations/matched-ontology-projection/plan.md) use checkbox (`- [ ]`) syntax for tracking.

**Goal:** each semantic review request carries the rows of the ontology entries its chunk
deterministically selects plus the whole name index, rather than the whole projection. `"full"`
restores today's request byte for byte, and each reviewed file's `OntologyProjection` shows in the pull
request record. Serves B1–B23 in [feature.md](../../../features/matched-ontology-projection/feature.md).

**Architecture:**
- A new kit-owned `templates/scripts/ontology-projection.mjs` exports `createProjector({ mode, bannedAliases })`.
- `reviewFiles` in `semantic-review-model.mjs` takes it as an optional `project` argument. It defaults to a built-in full projector, so graph naming is untouched.
- `catalogOntology` gains an additive `groups` field.
- `ontology-config.mjs` validates `semanticReview.projection`.
- The `SemanticReviewWorker` builds the projector and records `projections`.
- The ledger prints one line per reviewed file.

See [ADR 0026](../../../adr/0026-matched-projection-as-an-injected-projector.md),
[ADR 0027](../../../adr/0027-deterministic-matching-rule-and-fixed-stop-list.md) and
[ADR 0028](../../../adr/0028-projection-setting-and-run-record-summary.md).

**Tech stack:** Node 20/22/24 ES modules, `node:test`, no dependencies.

**Spec:** [feature.md](../../../features/matched-ontology-projection/feature.md) and ADRs 0026–0028.

## Global constraints

- Scripts stay byte-identical in every adopter. Do not add a repository-specific value; the stop list is fixed in the script.
- These stay exactly as they are:
  - the system prompt;
  - finding identity, `sha256(headSha, path, quote, evidenceKey)`;
  - evidence-key resolution against the whole catalog;
  - the dismissal flow;
  - every status description;
  - the record's `schema: 1`.
- `semantic-review-model.mjs` must not import `ontology-projection.mjs`, and neither may its test file. Graph-naming-only installs copy both files without the projection module.
- `catalog.projection`, `entries`, `evidenceKeys` and `rows` keep their current values. New code uses `groups`.
- Work test first, and end each task with its own commit and push. Before each commit:
  1. Run the focused test.
  2. Stage only the task's files and review `git diff --cached`.
  3. Run `node scripts/check-ontology-terms.mjs`.
  4. Run `npm test` and **check its exit status**. Never pipe it into a filter that hides a failure.
- Every commit leaves the full suite green. Order matters: an installed script must never import a file the installer does not yet copy.
- `docs/ontology.md` already has `OntologyProjection`, `ProjectionMode` and the `OntologyConfig` and `SemanticReviewRun` wording. Change it only if wording becomes stale.

## Review focus

Things the spec implies but no behaviour states, each pinned by a test in the owning task:

1. **A chunk cut inside a word selects more than its file.**
   - Cause: a mid-line split of an oversized line can create a word or a whole-name match that the file lacks, so B17's subset assumption fails.
   - Expected: no request over the `RequestBudget` is ever sent. The chunk is split before sending, as on a 413, and it is `too-large` at one character (Task 3).
2. **Ontology names with regex metacharacters or spaces.** For example `Data.Item` or `C++Type`. They must match literally and never throw (Task 2).
3. **A banned alias whose `nameInstead` names no entry.** It selects nothing and does not throw (Task 2).
4. **An empty changed file.**
   - Expected: it is sent once with the name index (B13), counts as reviewed, and records zero entries sent (Task 3).
5. **Records from earlier kit versions, or with a malformed `projections` value.**
   - Expected: they render exactly as before, and `readLatestRun` still reads them (Task 5).

## Tasks

| # | Task | Files | Behaviours |
| --- | --- | --- | --- |
| 1 | Grouped rows in `catalogOntology` | `semantic-review-model.mjs` and its test | B8, B21 |
| 2 | `ontology-projection.mjs`, its shipped test, the installer entries and the CI line | new module and test, `bin/install-ontology.mjs`, `tests/install-ontology.test.mjs`, `.github/workflows/test.yml` | B1–B9, B11, B13, B20, B21 |
| 3 | `reviewFiles` takes `project`, plans per file, projects per request, guards the budget, returns `projections` | `semantic-review-model.mjs` and its test | B1, B10, B12–B14, B16–B19, B21 |
| 4 | `semanticReview.projection` setting | `ontology-config.mjs`, `tests/ontology-config.test.mjs` | B20–B22 |
| 5 | Ledger prints the projection line | `semantic-review-ledger.mjs` and its test | B10, B15 |
| 6 | Worker builds the projector and records `projections` | `semantic-review-worker.mjs` and its test, `tests/semantic-budget-acceptance.test.mjs` | B6, B10, B12, B15, B18, B20, B21 |
| 7 | Runbook and README | `templates/docs/ontology-semantic-review.md`, `README.md` | B23 |
| 8 | Acceptance against the installed reviewer | `tests/matched-projection-acceptance.test.mjs` | B1, B9, B10, B12–B16, B18, B20, B21, B23 |
| 9 | Wrap-up and build PR | none | all |

### Interfaces between tasks

- **Task 1 produces** `catalogOntology(...).groups`, a `Map<string, { section: string, name: string, rows: string[] }>`:
  - it is keyed by evidence key, in order of first appearance;
  - `rows` holds every table line or invariant bullet with that key, in source order;
  - an invariant row is its bullet plus continuation lines, joined with `"\n"`.
- **Task 2 produces** these exports of `ontology-projection.mjs`:
  - `createProjector({ mode = "matched", bannedAliases = [] }) → project`. It throws `unknown projection mode: <JSON>` for any mode other than `"matched"` or `"full"`.
  - `project(catalog, text) → { text: string, keys: string[] }`, where `keys` are the evidence keys sent with full rows, in ontology order.
  - `project.mode`, which is `"matched"` or `"full"`.
  - Also exported: `STOP_WORDS` (a JavaScript Set), `nameWords(name) → string[]`, `markdownWords(text) → Set<string>`.
  - In `"full"` mode, `text` is `catalog.projection` and `keys` is every evidence key.
- **Task 3 produces** these changes in `semantic-review-model.mjs`:
  - `reviewFiles({ ..., project })` returns `{ reviewed, unreviewed, findings, projections }`.
  - Each `projections` item is `{ path, mode, entriesSent, entriesTotal, largestChars, fullChars }`, one per reviewed file in `files` order.
  - `chunkFiles(files, catalog, maxRequestChars, projectionChars = new Map())` gains an optional fourth argument: a Map from path to that file's projection length.
- **Task 4 produces** `config.semanticReview.projection`, always `"matched"` or `"full"`.
- **Task 5 consumes** `run.projections`, which is optional.
- **Task 6 consumes** Tasks 2, 3, 4 and 5, and passes `project` to `reviewFiles`. It copies `result.projections` into `run.projections` only when it is an array.

Details, steps and complete tests are in the
[detailed plan](../../../detailed-implementations/matched-ontology-projection/plan.md).
