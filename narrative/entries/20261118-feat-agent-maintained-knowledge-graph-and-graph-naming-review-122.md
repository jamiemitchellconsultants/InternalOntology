---
date: 2026-11-18
slug: feat-agent-maintained-knowledge-graph-and-graph-naming-review-122
title: "feat: agent-maintained knowledge graph and graph naming review (#122)"
summary: "The build follows the plan, with two rulings. - The existing installer option test now expects the new `withGraphNamingReview: false` default."
kind: product
status: accepted
sequence: 2026-11-18T20:30:22.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/127; merge commit 14fddf6bf07157ef6cda5d8119ce9b3573ed7486"
---

## Context

ADRs 0020–0025 and the plan (#125) fixed the design. This pull request delivers it: agents now name code against the `Ontology` and maintain the `SourceKnowledgeGraph` with the code, and a model-assisted naming check runs whose results only people settle.

## Decision

The build follows the plan, with two rulings.

- The existing installer option test now expects the new `withGraphNamingReview: false` default.
- A command ignored for lack of permission can carry its own reason, so a failed permission lookup is reported as such.

Two minor findings from the final self-review are deferred.

- Model reason and suggestion text reaches the summary and issues unchanged, apart from marker escaping, so an @mention in it would notify. The semantic reviewer behaves the same.
- If the review job fails, the follow-up job reports the credential as unavailable instead of saying the job failed. This mirrors the semantic reviewer.

The final review was a self-review by the implementer; no independent reviewer agent was run.

## Consequences

Adopters can upgrade with `--force` to get the stronger protocol and the `concept` lookup. The naming review stays off until `sourceGraph.namingReview` is enabled on the default branch, and until then every pull request gets a successful disabled status. `GraphChecker` and the renderer are unchanged. Adopters who install the naming review without the semantic reviewer also get `semantic-review-github` and `semantic-review-model` with their tests.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
