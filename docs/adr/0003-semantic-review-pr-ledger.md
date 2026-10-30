# 0003 — Keep findings and dismissals in PR comments

- **Status:** accepted
- **Date:** 2026-10-30
- **Feature:** #14 (docs/features/semantic-ontology-matching/)

## Context

The author and maintainer need actionable evidence on the PR. B8–B9 require a reasoned dismissal
of one `SemanticFinding` to survive reruns of one revision but expire on the next. B10 requires an
earlier finding to remain visible after a later unavailable run supersedes it.

## Decision

`SemanticStatusPublisher` creates a separate, machine-marked PR comment for each
`SemanticReviewRun`, including SHA, coverage, outcome, stable finding IDs, exact passages,
ontology evidence, and suggested corrections. It does not overwrite prior run comments.
`SemanticDismissalHandler` accepts a documented comment command naming one current finding ID
and a non-empty reason from a verified owner, admin, or maintainer. The maintainer's comment is
the visible `FindingDismissal`. The handler and later runs recompute the current result from the
latest workflow-bot-authored run and valid dismissal comments for the same SHA; a new SHA ignores
old dismissals.

## Consequences

No external database is needed. PR history shows both superseded findings and reasons for
dismissal. The worker must validate model anchors so IDs are reproducible across same-revision
reruns. Comment pagination, edited or deleted dismissal comments, and concurrent run updates need
explicit handling. Ordinary correction proposals from agents do not match the dismissal command
and cannot alter the status.

## Alternatives considered

- Keep only one edited bot comment: concise, but it erases the earlier finding when a later run
  cannot review, violating the required visible history.
- Store dismissals in repository files: a maintainer would have to commit a policy exception to
  the author's branch, and an unchanged revision could not be dismissed cleanly.
- Use an external database: stronger transactional control, but adds deployment and retention
  work to a reversible pilot.
