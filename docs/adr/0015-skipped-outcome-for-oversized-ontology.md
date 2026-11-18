# 0015 — An oversized ontology is a neutral skipped outcome

- **Status:** accepted
- **Date:** 2026-11-18
- **Feature:** #100 (docs/features/drift-request-budget/)

## Context

Today an ontology that leaves no room for added lines throws a plain error and the job goes red
with no explanation on the pull request. The reviewer is advisory and AGENTS.md reserves a red job
for infrastructure or configuration failures, so "could not review" must be visible but must not
block.

## Decision

A typed BudgetExceededError (carrying the projection size, the budget and a reason) is thrown by
`buildBatches` when too little room remains, and by `reviewResilient` when the token limit persists
for a single added line. `main` catches it, posts or updates the marker comment with a "skipped:
ontology too large for the configured budget" message naming the sizes and the variable to raise,
prints a GitHub `notice` line and returns normally, so the job exits 0. In dry-run mode it prints the
message and calls nothing. A malformed setting is not caught: it is a configuration error and exits 1.

## Consequences

The maintainer sees the reason on the pull request and the job is not red. Skipped runs create a
comment where an unchanged clean run stays silent, deliberately, because silence would hide that
nothing was reviewed. `reviewResilient` callers must handle the new error type.

## Alternatives considered

- Warning exit code: GitHub Actions has no neutral exit, so it would still be red.
- Notice only, no comment: easy to miss in logs, and the pull request would look reviewed.
- Keep the plain error: the current unexplained failure this feature removes.
