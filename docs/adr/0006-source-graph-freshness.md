# 0006 — Check freshness with covered file blob records

- **Status:** accepted
- **Date:** 2026-11-02
- **Feature:** #35 (docs/features/source-knowledge-graph/)

## Context

The accepted behaviours require a PR to block when a changed file in declared coverage has not
been reviewed for graph impact. Review must remain visible even if the agent finds no fact change.
Coverage is partial and may itself change in the PR. A file timestamp or a changed graph file
alone cannot show which source paths were considered.

## Decision

Keep a named `GraphRefreshRecord` for each reviewed covered path in the Turtle manifest, recording
its current Git blob ID or deletion and whether assertions changed or remained valid. On a PR, the
checker compares base and proposed trees and applies the union of their covered scopes to changed
paths. It requires a matching changed record for each covered change, including new and deleted
files, and records for files newly brought into coverage. Coverage resources have explicit integer
priority because RDF triple order has no meaning. A scope reduction must state an unknown or
excluded status with a reason; it cannot remove review obligations for the same PR. The graph root
remains excluded from coverage so reviewing graph files does not require self-referential records.

## Consequences

The check can name the unreviewed path and runs locally without a model, secret, or network call.
An unchanged graph fact still produces a reviewable record change. Review records form a current
snapshot rather than a growing event log. The checker cannot establish that a human or agent
actually reasoned correctly about the file; maintainers inspect assertions, records, and source
diffs. Subsequent PRs follow the accepted new coverage scope.

## Alternatives considered

- Require any graph file to change when covered source changes: simple, but one unrelated edit
  could hide many omitted file reviews and no-fact-change decisions would be unclear.
- Compare file modification times: timestamps are not stable across Git checkouts and do not
  identify reviewed content.
- Apply only proposed coverage: a PR could exclude its own changed files and bypass the check.
- Regenerate every graph assertion in CI: conflicts with the accepted agent-before-PR workflow
  and requires semantic judgement inside the deterministic check.
