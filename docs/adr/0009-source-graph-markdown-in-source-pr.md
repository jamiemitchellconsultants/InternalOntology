# 0009 — Keep generated graph Markdown with its source PR

- **Status:** accepted
- **Date:** 2026-11-03
- **Feature:** #62 (docs/features/human-readable-source-knowledge-graph/)

## Context

Maintainers need an ordinary readable account of current claims to assess accuracy. The owner chose repository storage and inclusion in the same PR as graph changes, with CI checking freshness. B10–B14 require canonical input, repeatability, current-state replacement, visible failure and adopter configuration. The existing ontology workflow checks generated Markdown without writing commits.

## Decision

Commit generated graph Markdown with canonical changes and have a read-only `GraphRenderWorkflow` regenerate expected bytes and compare the document in that same Git snapshot. Default to `<sourceGraph.root>/README.md`, with optional `sourceGraph.markdownPath` constrained to the excluded graph root.

The author or coding agent commits canonical changes, generates from that snapshot, then commits Markdown as a follow-up in the same PR. Run `source-graph-markdown` on PRs/default-branch pushes alongside the existing graph check. Preserve an existing unmarked output file so the adopter can choose another path; keep the operating guide separate.

## Consequences

The document is available during source review and in repository history. CI needs no write permission, application token or update branch. Authors have an explicit generation/staging step, and an upgrade includes its first generated file before enabling the new required check. Stale/missing Markdown fails rather than being silently repaired after review.

## Alternatives considered

- A workflow download alone was rejected by the owner: the document belongs in the repository.
- Automatic updates after merge were not chosen: the view should accompany the source PR.
- Bot commits to source branches add write credentials and check-trigger complexity unnecessary to the chosen authoring flow.
- A fixed path outside the graph root introduces avoidable evidence/refresh concerns and ignores adopter root configuration.
