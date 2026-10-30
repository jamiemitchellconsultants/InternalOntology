# 0002 — Publish the latest semantic outcome as a commit status

- **Status:** accepted
- **Date:** 2026-10-30
- **Feature:** #14 (docs/features/semantic-ontology-matching/)

## Context

B4 requires a finding to block merge. B10 requires a later unavailable run to unblock the same
revision and report that review did not run. The follow-up `workflow_run` job itself executes on
the default branch, so its own job check is not the PR's required result. A path-filtered workflow
could also leave a required check pending on a PR with no eligible Markdown.

## Decision

`SemanticStatusPublisher` writes a fixed `ontology/semantic-match` commit-status context. It posts
`pending` when a run begins, then `failure` when an active finding remains and `success` for clean,
empty-scope, unavailable, incomplete-without-findings, disabled, and out-of-scope outcomes. The
description and linked PR run comment distinguish these success cases. The most recent status in
the context controls the same SHA; a later unavailable run can therefore supersede an earlier
failure. The publisher verifies the current head SHA before updating and publishes to a verified
test-merge commit when GitHub is evaluating that commit. Updates for one PR are serialized.

## Consequences

Maintainers must configure this exact context as a required status check. The trigger must run on
every PR, including code-only PRs, to produce an explicit empty-scope result. The UI's green state
alone is insufficient to tell whether review ran; the status description and PR comment must say
so. A failure to publish a status can leave the required context pending and needs operational
attention. GitHub statuses are commit-scoped, so an unusual case where one SHA is used by multiple
PRs can collide; a future GitHub App could provide a stronger PR-specific check model.

## Alternatives considered

- Rely on the `workflow_run` job result: it does not reliably serve as a required PR check on the
  PR's evaluated commit.
- Use only a PR label or comment: visible to humans but cannot enforce branch protection.
- Create a Checks API run: supports richer output, but requires GitHub App credentials and
  installation for this kit.

GitHub documents [commit status semantics](https://docs.github.com/en/rest/commits/statuses)
and [head versus test-merge status requirements](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks#conflicts-between-head-commit-and-test-merge-commit).
