# Configurable drift request budget — task plan

**Goal:** the drift reviewer runs for large ontologies, its budget and timeout are configurable
without editing the script, and an oversized ontology is a neutral skipped outcome. Serves B1-B15 in
[feature.md](../../../features/drift-request-budget/feature.md).

**Architecture:** all code changes are in `templates/scripts/review-ontology-drift.mjs` (setting
parser, typed `BudgetExceededError`, skip path in `main`) plus the workflow template and docs. See
[ADR 0014](../../../adr/0014-configurable-request-budget.md) and
[ADR 0015](../../../adr/0015-skipped-outcome-for-oversized-ontology.md).

**Global constraints**

- The script stays byte-identical in every adopter; no repository-specific value.
- `max_tokens` (8,192) and the `modelJson` default timeout (300,000 ms) are unchanged.
- The 413 split in `reviewResilient` is unchanged except for the final single-line error type.
- Test first; each task ends in its own commit. Before each commit run the focused test, then
  `node scripts/check-ontology-terms.mjs`, then `npm test`, and **check the exit status of
  `npm test`** (do not pipe it into a filter that hides a failure).
- Keep the commit order of this plan so no commit leaves the suite red.

| # | Task | Behaviours |
| --- | --- | --- |
| 1 | Setting parser and 200,000 default | B1, B3, B4, B5, B11 |
| 2 | BudgetExceededError from `buildBatches` and `reviewResilient` | B2, B7, B8, B9 |
| 3 | `reviewBatch` timeout and `main` skip path | B7, B8, B10, B11 |
| 4 | Workflow template passes the variables | B6 |
| 5 | Runbook and README | B12, B14 |
| 6 | Large-ontology acceptance test | B1, B10, B13, B15 |
| 7 | Wrap-up and build PR | all |

Details in the
[detailed plan](../../../detailed-implementations/drift-request-budget/plan.md).
