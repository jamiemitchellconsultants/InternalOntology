# Matched ontology projection — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps in the [detailed plan](../../../detailed-implementations/matched-ontology-projection/plan.md) use checkbox (`- [ ]`) syntax for tracking.

Amended on 2026-11-20 after the build review of #135. **Execute Tasks 18–21 only.** Tasks 1–9 shipped in PR #141. Tasks 10–16 are pushed through `148d96f` on the existing build branch. Task 21 replaces the unfinished Task 17 checkpoint.

**Goal:** each semantic review request carries the rows of the ontology entries its chunk deterministically selects, the relationships of those entries, and a name index grouped by section. A matched file is planned by paragraph, so a broad file is reviewed in several requests rather than being too-large. The reviewer reads `ontology.ttl`. `"full"` restores today's request byte for byte. Serves B1–B25 in [feature.md](../../../features/matched-ontology-projection/feature.md).

**Architecture:**
- `collectReviewInput` reads raw Contents bytes at the reviewed head SHA and decodes strict UTF-8. It renders `ontology.ttl` with the build tool’s renderer. A numeric source 404 triggers the raw Markdown fallback (ADRs 0029 and 0034, B25).
- `catalogOntology` gains an additive `relationships` field (ADR 0031).
- The matched projector builds an index once per catalog. It adds only the relationships of matched entries (B7) and ends with the grouped name index (B24, ADR 0031).
- The matched projector owns initial paragraph, line and piece budgeting and both too-large causes. Each piece preserves whole code points and fits with the projection of its own text. An indivisible over-budget piece rejects the file with the original line offset. `reviewFiles` retains its pre-send guard, 413 handling and full-mode path (ADRs 0030 and 0035, B17–B19, B21).
- The worker, ledger, configuration and installer are unchanged.

See ADRs [0026](../../../adr/0026-matched-projection-as-an-injected-projector.md), [0027](../../../adr/0027-deterministic-matching-rule-and-fixed-stop-list.md), [0028](../../../adr/0028-projection-setting-and-run-record-summary.md), [0029](../../../adr/0029-semantic-review-reads-the-ontology-source.md), [0030](../../../adr/0030-matched-planning-by-paragraph-in-the-projector.md), [0031](../../../adr/0031-relationships-only-and-grouped-name-index.md), [0034](../../../adr/0034-semantic-review-reads-raw-ontology-contents.md) and [0035](../../../adr/0035-matched-planner-budgets-whole-code-points.md).

**Tech stack:** Node 20/22/24 ES modules, `node:test`, no dependencies.

**Spec:** [feature.md](../../../features/matched-ontology-projection/feature.md) and ADRs 0026–0031 and 0034–0035.

## Global constraints

- Scripts stay byte-identical in every adopter. Do not add a repository-specific value.
- These stay exactly as they are:
  - the system prompt;
  - finding identity, `sha256(headSha, path, quote, evidenceKey)`;
  - evidence-key resolution against the whole catalog;
  - the dismissal flow;
  - every status description;
  - the record's `schema: 1` and its projection line;
  - `catalog.projection`, `entries`, `evidenceKeys`, `rows` and `groups`;
  - `chunkFiles` and the `full` request, byte for byte.
- `semantic-review-model.mjs` and its test must not import `ontology-projection.mjs`. `ontology-projection.mjs` may import `REQUEST_OVERHEAD` from `semantic-review-model.mjs`, so the dependency runs one way only.
- `semantic-review-github.mjs` may import `owl-ontology.mjs`, which every installation has. The drift reviewer and graph naming keep reading `ontology.md`.
- `docs/ontology.md` already describes the amended `OntologyProjection`. The amendment adds no domain term, so it needs no ontology change.
- Work test first, and end each task with its own commit and push. Before each commit:
  1. Run the focused test.
  2. Stage only the task's files and review `git diff --cached`.
  3. Run `node scripts/check-ontology-terms.mjs`.
  4. Run `npm test` and **check its exit status**. Never pipe it into a filter that hides a failure.
- Every commit leaves the full suite green. Resume the existing build branch and retain its published commits. Read these merged plans from main when necessary.

## Review focus

1. **Raw Turtle over 1 MiB.** The collector requests the raw media type at the reviewed head SHA, decodes and renders the source, and can plan a broad file. Only one ontology read occurs (Task 18).
2. **An ambiguous HTTP error or unreadable raw body.** A non-404 error mentioning 404, invalid UTF-8 and parse errors propagate. A numeric source 404 tries the raw Markdown once at the same revision. A configuration whose path has no Markdown extension is read once as Markdown (Task 18).
3. **A piece that matches more than its line.** The returned piece carries the new keys and exact size if it fits. An oversized piece is divided and reselected inside planning, without sending it over budget (Task 19).
4. **A surrogate pair with one code unit of room under the line's projection.** A pair that fits with its own projection is kept. Otherwise the planner reports the original line and emits no chunks for that file, including any chunks accumulated earlier (Task 19).
5. **An empty optional-only catalog.** The grouped index omits the example key and can still be budgeted (Task 20).

The shipped banned-alias, deterministic planning, full-mode, 413 and projection-count tests remain regression checks. Task 12's B25 equivalence and path-without-extension tests already passed on its original baseline.

## Tasks

| # | Task | Files | Behaviours | State |
| --- | --- | --- | --- | --- |
| 1 | Grouped rows in `catalogOntology` | `semantic-review-model.mjs` and its test | B8, B21 | done in #141 |
| 2 | `ontology-projection.mjs`, its shipped test, installer entries and CI line | new module and test, `bin/install-ontology.mjs`, `tests/install-ontology.test.mjs`, `.github/workflows/test.yml` | B1–B9, B11, B13, B20, B21 | done in #141; steps 4 and 5 (the one hop and the flat index in matched mode) are replaced by Task 14 |
| 3 | `reviewFiles` takes `project`, projects per request, guards the budget, returns `projections` | `semantic-review-model.mjs` and its test | B1, B10, B12–B14, B16–B19, B21 | done in #141; planning for a projector with `plan` is replaced by Task 13 |
| 4 | `semanticReview.projection` setting | `ontology-config.mjs`, `tests/ontology-config.test.mjs` | B20–B22 | done in #141 |
| 5 | Ledger prints the projection line | `semantic-review-ledger.mjs` and its test | B10, B15 | done in #141 |
| 6 | Worker builds the projector and records `projections` | `semantic-review-worker.mjs` and its test, `tests/semantic-budget-acceptance.test.mjs` | B6, B10, B12, B15, B18, B20, B21 | done in #141 |
| 7 | Runbook and README | `templates/docs/ontology-semantic-review.md`, `README.md` | B23 | done in #141; replaced by Task 16 |
| 8 | Acceptance against the installed reviewer | `tests/matched-projection-acceptance.test.mjs` | B1, B9, B10, B12–B16, B18, B20, B21, B23 | done in #141; one assertion changes in Task 14, one test grows in Task 16 |
| 9 | Wrap-up | none | all | done in #141 |
| 10 | `ttlPathFor` moves into `owl-ontology.mjs` | `owl-ontology.mjs`, `build-ontology.mjs`, new `tests/semantic-ontology-source.test.mjs` | B25 | pushed as `5097eda` |
| 11 | `catalogOntology` lists relationships | `semantic-review-model.mjs` and its test | B7, B21 | pushed as `7ed7ada` |
| 12 | `collectReviewInput` reads `ontology.ttl`, falling back to `ontology.md` | `semantic-review-github.mjs` and its test, `tests/semantic-ontology-source.test.mjs`, `tests/semantic-feature-acceptance.test.mjs` | B25, B12, B21 | pushed as `6eb866e` |
| 13 | `reviewFiles` uses the projector's `plan` when it has one | `semantic-review-model.mjs` and its test | B17, B18, B21 | pushed as `6cc0f62` |
| 14 | Per-catalog index, relationships only, grouped name index | `ontology-projection.mjs` and its test, `tests/matched-projection-acceptance.test.mjs` | B1, B7, B8, B13, B24 | pushed as `0050e91` |
| 15 | `plan`: paragraphs, then lines, then pieces, and the two too-large causes | `ontology-projection.mjs` and its test | B6, B9, B13, B17, B18 | pushed as `aed0cc0` |
| 16 | Runbook and README | `templates/docs/ontology-semantic-review.md`, `README.md`, `tests/matched-projection-acceptance.test.mjs` | B23 | pushed as `148d96f` |
| 17 | First wrap-up and re-measurement | none | all | superseded by Task 21 |
| 18 | Read pinned raw ontology contents | `semantic-review-github.mjs` and its test, `tests/semantic-ontology-source.test.mjs`, `tests/semantic-feature-acceptance.test.mjs` | B12, B17, B21, B25 | pending |
| 19 | Enforce piece budgets in matched planning | `ontology-projection.mjs` and its test | B17–B19, B21 | pending |
| 20 | Omit the example from an empty grouped index | `ontology-projection.mjs` and its test | B13, B24 | pending |
| 21 | Final verification, measurements, replay and handoff | none | all | pending |

### Interfaces between tasks

- **Task 10 produces** `ttlPathFor(ontologyPath)` exported from `owl-ontology.mjs`. `build-ontology.mjs` re-exports the same function. A path not ending in `.md` maps to itself.
- **Task 11 produces** `catalogOntology(...).relationships`: an array, one item per Relationships row in ontology order, `{ evidenceKey, from, to }`. `from` is the row's name and `to` its third cell without backticks. It is empty when the Relationships section is not configured.
- **Task 12 produces** `collectReviewInput(...).ontologyText`, rendered from `ontology.ttl` when that file exists at the reviewed revision, and read from `ontology.md` only on a 404.
- **Task 13 consumes** an optional `project.plan(catalog, files, maxRequestChars) → { chunks, unreviewed }`, which may be asynchronous. `chunks` items are `{ path, offset, text }` and may carry more fields. `unreviewed` items are `{ path, code: "too-large", reason }`.
- **Task 14 produces** these changes in the matched projector:
  - its selection adds only relationships (B7);
  - its text ends with the grouped name index (B24);
  - it builds its index once per catalog object, cached in a JavaScript WeakMap inside the projector.
  The `full` projector is unchanged.
- **Task 15 produces** `matched.plan(catalog, files, maxRequestChars)`. Each chunk is `{ path, offset, text, keys, chars }`, where `keys` and `chars` equal `project(catalog, text).keys` and `.text.length`. `createProjector({ mode: "full" })` has no `plan`.

- **Task 18 produces** `client.getContentText(path, ref) → Promise<string>` and numeric HTTP error status. The collector continues returning the same `ontologyText` field.
- **Task 19 preserves** the matched planner's result shape. Each returned chunk fits with its own projection. A file with an indivisible over-budget piece contributes one B18 unreviewed entry and zero chunks.
- **Task 20 preserves** the grouped name index for a catalog that has keys and omits the example for one with zero keys.

## Measurements

The build at `148d96f` reproduced the prototype's grouped-index reductions and median request shares on the same revisions. On the then-current InternalOntology checkout, 116 entries gave a 40.0% smaller index (3,920 to 2,353 characters) and a median matched request of 59.2% across 193 Markdown files. All ten recorded JEPA-Speech findings retained their cited rows. Task 21 repeats the measurement and replay with the completed build.

Measured on 2026-11-20 with the prototype of Tasks 10 to 15, at the 200,000-character default budget. The scratch scripts are not committed; Task 17’s detailed steps carry the script that Task 21 reuses.

**The grouped name index (B24).** The design estimate was 40% to 49% smaller.

| Ontology | Entries | One key per line | Grouped | Smaller by |
| --- | --- | --- | --- | --- |
| JEPA-Speech, rendered from its `ontology.ttl` | 180 | 6,150 characters (34.2 per entry) | 3,133 (17.4 per entry) | 49.1% |
| InternalOntology, from `ontology.md` | 107 | 3,584 (33.5 per entry) | 2,175 (20.3 per entry) | 39.3% |

InternalOntology falls just under the range, because its section names are short against its entry names.

**The ceiling.** This is the largest ontology whose name index still leaves room for one character. The design estimate was about 10,000 to 11,500 entries. With the synthetic row shape from the pushback (32 entries per bounded context), it is 6,688 entries with one key per line and 11,264 grouped. At the measured per-entry sizes, it is about 11,400 entries for JEPA-Speech's names and about 9,800 for InternalOntology's.

**Median matched request.** This is the largest planned chunk's projection as a share of the full projection, per file, over every tracked Markdown file. The design estimate for JEPA-Speech was about 52%.

| Repository | Files | One hop, one key per line (before) | Relationships only, one key per line | Relationships only, grouped (now) |
| --- | --- | --- | --- | --- |
| JEPA-Speech at b0fc577 | 285 | 74.5% | 46.7% | 42.0% (90th percentile 68.0%, largest 94.7%) |
| InternalOntology at 63c1e5b | 182 | 83.8% | 64.6% | 60.4% (90th percentile 87.6%, largest 94.3%) |

The design figures (52% and 65%) were for relationships only with one key per line, over 213 and 126 files. The like-for-like figures now are 46.7% and 64.6%. No file in either repository is too-large. Planning took 0.5 seconds for JEPA-Speech and 0.8 seconds for InternalOntology.

**The ten recorded findings.** Each finding was replayed at its own revision from JEPA-Speech pull requests #210 and #217, with `ontology.ttl` rendered as the reviewer now reads it. For all ten, the chunk that holds the quote carries the cited entry's full rows. At every one of those revisions the rendered source equals the committed `ontology.md` and gives the same catalog projection (B25). `docs/source-knowledge-graph/README.md`, the source of six findings, now projects 23,380 of 64,394 characters (36%), against 63% before.

**Scale.** In the 1,920-entry synthetic ontology:
- The broad file from the pushback (60 paragraphs, one name from each context) projects 307,901 characters as a whole. It is planned into 4 chunks, none too-large, in 29 milliseconds.
- Packing fills each chunk while it fits, so a broad file's chunks approach the budget: the largest was 195,860 characters.
- One paragraph naming three entries of one context still selects 155 entries (54,971 characters) through shared name words. That is U18, deferred.

**The known minor.** On `main`, a file that fits one chunk is projected twice: the Task 15 test fails with 2 projections against 1. With `plan` it is projected once.

**The prototype run.**
- `npm test` passed 744 of 744.
- The shipped tests passed 88 of 88 alone from `templates/scripts` on Node 20, 22 and 24.
- Against `main`, the new and changed tests give 22 failures, each for the behaviour it pins. The one new test that passes there is the `.md`-less path, which pins today's behaviour.
- With `plan` removed from the projector (the state after Task 14), every acceptance and reviewer test passed (492 of 492).

Details, steps and complete tests are in the [detailed plan](../../../detailed-implementations/matched-ontology-projection/plan.md).

## Build-review prototype

In a disposable snapshot of `148d96f`, Task 18's five new checks failed on the inline Contents path. Task 19's two positive cases passed before its change and its two over-budget cases failed. Task 20 failed on the undefined example. The unfiltered full suite passed after each task with 749, 753 and 754 tests, respectively. The four shipped tests passed individually from `templates/scripts` with 117 tests per runtime on Docker Node 20, 22 and 24. Task 21 repeats verification with the actual build.
