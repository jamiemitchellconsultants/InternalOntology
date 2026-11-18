---
date: 2026-11-18
slug: docs-plan-agent-maintained-knowledge-graph-122
title: "docs: plan agent-maintained knowledge graph (#122)"
summary: "There are 13 test-first tasks. Tasks 1–3 are the agent half: the `GraphReader` `concept` command, the stronger `GraphAgentProtocol`, and \"Authoring graph entries\" in the installed runbook."
kind: product
status: accepted
sequence: 2026-11-18T19:47:40.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/125; merge commit 6fd4568985e29161606b1a32554e0f6458b87135"
---

## Context

The design pull request (#123) is merged with ADRs 0020–0025. The Architect's handoff left the developer to decide how to split the worker, what to reuse from the semantic reviewer, the prefilter's word rule, the ledger and command grammar edge cases, the acceptance approach, and the order of the plan.

## Decision

There are 13 test-first tasks. Tasks 1–3 are the agent half: the `GraphReader` `concept` command, the stronger `GraphAgentProtocol`, and "Authoring graph entries" in the installed runbook. They can be trialled in JEPA-Speech before the review half starts. Tasks 4–13 build the review half as six small modules: select, model, commands, github, ledger and worker, then the three workflows, the installer flag, an installed integration test and the docs.

- Reuse: the semantic modules only export `decodeBlob`, `stripFence` and `resolveEvidenceKey`, and `catalogOntology` gains a `rows` map, so the semantic reviewer behaves exactly as before. The naming review installs `semantic-review-github` and `semantic-review-model` without the rest of the semantic reviewer.
- Prefilter: words are PascalCase, acronym, lower-case or digit runs, compared case-insensitively. A label contains a name when the name's words appear in it in order and next to each other.
- Settlement: each command's targets are resolved once, when it is first seen or edited, and recorded in the ledger. So `all` never widens to results that appear later. Unknown labels are ignored, and labels whose result has gone are reported as no longer current.
- Bounds: at most 20 results per run, with stored text cut to 200 characters. The stored run keeps counts and at most 20 not-reviewed entries, so the summary comment stays under GitHub's limit.
- Acceptance: the integration test runs the installed scripts against a local model stand-in and the real GitHub client with an in-memory `fetch`.

Rejected: one large worker script, and a whole-graph naming sweep (deferred by U6).

## Consequences

The build cannot start until this plan is reviewed and merged. The existing `sourceGraph` deep-equal expectations in the config tests gain a `namingReview` default. Adopters who install `--with-graph-naming-review` without the semantic reviewer get two of its modules and their tests. Not verified: GitHub's `issue_comment` behaviour and the collaborator `role_name` values, which the user phase exercises in the deployed trial.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
