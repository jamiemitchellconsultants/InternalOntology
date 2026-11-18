# 0023 — Graph naming review as a separate opt-in

- **Status:** accepted
- **Date:** 2026-11-18
- **Feature:** #122 (docs/features/agent-maintained-knowledge-graph/)

## Context

B31–B34 need the naming review to run on eligible same-repository pull requests with trusted model settings, never to block when it cannot review, and to be off unless an adopter opts in. The semantic review already solves trusted execution, credentials, request budgets and status semantics (ADR 0001, 0002, 0004, 0012, 0014). The analyst left the outcome values, status context, configuration key and installer flag to this phase (U13).

## Decision

- Three new workflows, `ontology-graph-naming-request.yml`, `-review.yml` and `-settle.yml`, with the same trust model as the semantic ones: a secret-free trigger with no path filter, a `workflow_run` worker and an `issue_comment` handler that check out only the default branch.
- A fixed status context `ontology/graph-naming`, published as ADR 0002 publishes `ontology/semantic-match`: pending at start, then failure while any current result is unsettled or accepted, otherwise success with a description of the outcome and counts.
- Outcomes reuse `SemanticOutcome` (`reviewed`, `partial`, `unavailable`, `disabled`, `out-of-scope`, `no-eligible`, `too-large`) with the same blocking rule: only results hold the merge.
- Configuration in `OntologyConfig` as `sourceGraph.namingReview` with `enabled`, `model` and `baseUrl`, validated like `semanticReview` and read from the default branch.
- The review job uses the `ontology-semantic-review` environment and the same secrets and variables, through `ModelAuthProvider` and `RequestBudget`.
- Installer flag `--with-graph-naming-review`, requiring `--with-source-graph`.

## Consequences

Adopters can run either review without the other, and a repository that already set up semantic review needs no new secret or environment. The environment's name mentions the semantic review although a second review uses it; the runbook says so. A change to the shared outcome enum now affects two reviews. Model and endpoint can differ between the two reviews, but the budget variables are shared.

## Alternatives considered

- Extend the semantic review to cover graph Turtle: couples two opt-ins and two statuses, and its Markdown passage model does not fit graph nodes.
- A separate environment and secret: cleaner naming, but extra setup for every adopter for no security gain, since both jobs run trusted default-branch code.
- A new outcome enum: duplicates seven identical values.
- Reuse `semanticReview.model` and `baseUrl`: forces both reviews onto one model.
