# 0022 — One summary comment with a bot ledger for graph naming

- **Status:** accepted
- **Date:** 2026-11-18
- **Feature:** #122 (docs/features/agent-maintained-knowledge-graph/)

## Context

B35 asks for one current, plain-language view of the results and their settlements, updated in place, with a notification only when something new appears. ADR 0003 chose a new comment per semantic run so history survives a later unavailable run. The graph naming review also needs durable state between runs: R label assignments, processed deferral commands and the issues they created, without a database.

## Decision

`GraphNamingPublisher` keeps one machine-marked summary comment per pull request, written by the workflow's bot identity and edited in place. It holds the readable summary and a hidden JSON ledger: the latest run (head SHA, `SemanticOutcome`, results and keys), the R label for each key ever seen on the pull request, and a map from defer command comment ID to deferral issue number. Only a ledger in a bot-authored comment is trusted. When a run reports a key with no R label yet, the publisher also posts a short comment linking to the summary, so subscribers are notified. Settlements are not copied into the ledger; they are re-read from the command comments (ADR 0021).

## Consequences

Reviewers see one current view; the history of results lives in the comment's edit history, the command comments and the deferral issues. A later run that cannot review has no current results and permits merge, as ADR 0002 decides for the semantic review; the ledger keeps every R label, so a result that reappears on a later reviewed run keeps its label and its settlement. A person able to edit the bot's comment could alter the ledger; that person already has write access and could settle every result anyway, and the edit is visible in the comment's history. Losing the summary comment loses label assignments; the next run re-creates it and assigns fresh labels, and the command comments remain.

## Alternatives considered

- A new comment per run, as ADR 0003: complete history, but every push adds a long comment and the reviewer has to find the latest one, against B35.
- State in repository files on the branch: the bot would have to commit to the author's branch, which the kit never does.
- An external store: extra deployment for a reversible feature.
