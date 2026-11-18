# Configurable semantic reviewer request budget — task plan

**Goal:** the semantic reviewer reviews large ontologies, its budget and timeout are configurable
without editing a script, and an ontology that still does not fit is a distinct non-blocking
`too-large` outcome with an accurate status. Serves B1-B17 in
[feature.md](../../../features/semantic-request-budget/feature.md).

**Architecture:** a new shared module `templates/scripts/request-budget.mjs` (parser and defaults);
changes in `semantic-review-model.mjs`, `semantic-review-worker.mjs` and `semantic-review-ledger.mjs`;
a re-export in `review-ontology-drift.mjs`; workflow, installer, docs. See
[ADR 0016](../../../adr/0016-too-large-ontology-outcome.md),
[ADR 0017](../../../adr/0017-invalid-budget-setting-status.md) and
[ADR 0018](../../../adr/0018-shared-request-budget-module-and-timeout-default.md).

**Global constraints**

- Scripts stay byte-identical in every adopter; no repository-specific value.
- The dismissal flow, finding ids and every outcome other than the new one behave as before.
- The 413 split is unchanged except for coding the final failure as `too-large`.
- Test first; each task ends in its own commit. Before each commit run the focused test,
  `node scripts/check-ontology-terms.mjs`, then `npm test`, and **check the exit status of
  `npm test`** (never pipe it into a filter that hides a failure).
- Every commit must leave the full suite green, so the order below matters: a script must never
  import a file the installer does not yet copy, and the ledger must know an outcome before the worker
  can publish it.
- Tests must pass on Node 20, 22 and 24: any simulated hanging call needs a ref'd timer (see the
  `hangUntilAborted` helper in `review-ontology-drift.test.mjs`).

| # | Task | Behaviours |
| --- | --- | --- |
| 1 | Shared `request-budget.mjs`, drift re-exports, installer entries | B3, B4, B5, B12, B17 |
| 2 | Ledger: `too-large` status and record text | B7, B8 |
| 3 | Model module: budget and timeout parameters, `too-large` codes | B1, B2, B7, B9, B10, B12 |
| 4 | Worker: resolve the budget, junk handling, `too-large` outcome | B3, B5, B7, B8, B11 |
| 5 | Workflow template passes the variables | B6 |
| 6 | Runbook and README | B13, B16 |
| 7 | Large-ontology acceptance tests | B1, B7, B14, B15 |
| 8 | Wrap-up and build PR | all |

Details in the
[detailed plan](../../../detailed-implementations/semantic-request-budget/plan.md).
