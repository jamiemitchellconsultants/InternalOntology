# 0021 — Settle graph naming results with short comment commands

- **Status:** accepted
- **Date:** 2026-11-18
- **Feature:** #122 (docs/features/agent-maintained-knowledge-graph/)

## Context

B36 requires a reviewer to accept, reject with a reason, or defer one result or all unsettled results in one action, without copying a hash, finding ID or SHA. The existing `/ontology-dismiss <64-hex-id> <40-hex-sha> <reason>` is the friction to improve on. B40 requires settlements to survive pushes, B41 lets a later settlement replace an earlier one, and B42 lets anyone with write access settle any result, including on their own pull request.

## Decision

A settlement is a PR comment whose first line is `/graph-naming accept|reject|defer <targets> [text]`. Targets are R labels (`R1`, `R1,R3`) or `all`, meaning every currently unsettled result. `reject` needs the text as its reason; `defer` takes it as an optional note. R labels are assigned per pull request, in order of first appearance, recorded in the bot ledger against the result key, and never reused, so `R2` means the same result on every revision. The handler applies valid commands in creation order, the latest per result key winning; edits and deletions are re-read on every recompute. Valid authors have a collaborator `role_name` of `write`, `maintain` or `admin`. The summary comment shows a ready-to-copy command for each result.

## Consequences

Settling is one comment with a short label, and a reviewer can settle everything at once. The command comments are the visible, accountable record, as `FindingDismissal` comments are. Because settlements are keyed by result key, a rejection does not expire on a push, unlike `/ontology-dismiss`. Wider permission than `/ontology-dismiss` means a write-role author can clear their own results; that is the owner's choice for single-maintainer repositories. An agent using a person's token cannot be told apart from that person, so "agents never settle" (B26) stays a protocol rule.

## Alternatives considered

- Task-list checkboxes in the summary comment: one click, but a checkbox cannot carry a rejection reason, editing a bot comment changes the trusted ledger, and the editor is only visible in edit history.
- Pull request reviews or review threads: heavier, tied to diff lines that nodes affected by an ontology change may not have, and resolving a thread has no reason.
- Reuse the `/ontology-dismiss` shape with result keys: the friction the vision asks to remove.
- Labels per decision: cannot say which result, and no reason.
