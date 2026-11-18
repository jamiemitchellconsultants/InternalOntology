---
date: 2026-11-18
slug: docs-design-for-agent-maintained-knowledge-graph-122
title: "docs: design for agent-maintained knowledge graph (#122)"
summary: "This is a correction of `docs-feature-behaviours-for-source-knowledge-graph`: a model may now produce semantic results about the graph, and a result takes effect only when a person with write access accepts it."
kind: product
status: accepted
sequence: 2026-11-18T18:14:10.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/123; merge commit 294d42b29168b555e48910663c2e93dc286b8595"
---

## Context

Agents in kit-installed repositories kept the ontology current but not the source graph. In JEPA-Speech, two features added ontology concepts and code outside the graph's coverage, and the graph only had its blob IDs refreshed. The accepted decision `docs-feature-behaviours-for-source-knowledge-graph` (#35 B11) kept semantic review of the graph human and ruled out model involvement. Settling an ontology semantic finding today needs `/ontology-dismiss` with a 64-hex finding ID and a 40-hex SHA, and the dismissal expires on every push.

## Decision

This is a correction of `docs-feature-behaviours-for-source-knowledge-graph`: a model may now produce semantic results about the graph, and a result takes effect only when a person with write access accepts it. The deterministic graph check stays model-free, secret-free and offline ([ADR 0020](docs/adr/0020-model-graph-naming-results-take-effect-on-human-acceptance.md)). #62 stands.

Agents look names up in the ontology and graph before naming code. They record symbols and components with `kit:implements` in the same change, propose the narrowest coverage widening for code in unknown scope, and follow authoring guidance kept in the installed runbook ([ADR 0025](docs/adr/0025-graph-authoring-guidance-in-the-installed-runbook.md)). A concept-first `GraphReader` command answers "what implements this concept?".

The naming review is a separate opt-in with its own workflows and status. It reuses the semantic review's environment, `ModelAuthProvider`, `RequestBudget` and `SemanticOutcome` ([ADR 0023](docs/adr/0023-graph-naming-review-as-a-separate-opt-in.md)). It compares only added or changed nodes, chosen deterministically, and drops any name that contains the canonical term before the model sees it ([ADR 0024](docs/adr/0024-deterministic-selection-and-prefilter-for-graph-naming.md)). Results appear in one summary comment edited in place, holding a bot-written ledger ([ADR 0022](docs/adr/0022-one-summary-comment-with-a-bot-ledger-for-graph-naming.md)). Anyone with write access settles them with `/graph-naming accept|reject|defer <R labels|all> [text]`. Settlements survive pushes, and a deferral creates one labelled issue ([ADR 0021](docs/adr/0021-settle-graph-naming-results-with-short-comment-commands.md)).

Rejected alternatives: model calls inside `GraphChecker`, results that block or pass on their own, checkboxes or review threads for settling, a new comment per run, extending the semantic review to cover Turtle, and a separate secret.

## Consequences

Unsettled or accepted results hold the merge. A rejection or deferral lets the PR proceed, and a run that cannot review never blocks. A write-role author can clear their own results, and the rule that agents never settle results relies on the protocol, because agents use the human's token. Adopters with semantic review already set up need no new secret. Some real mismatches are missed by design. Still open as follow-ups: a model check of whether evidence supports each claim, a sweep of the whole graph, and showing earlier settlements on later PRs. The generated narrative fragment for this PR must have its kind set to `correction` on the narrative automation PR, citing `docs-feature-behaviours-for-source-knowledge-graph`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
