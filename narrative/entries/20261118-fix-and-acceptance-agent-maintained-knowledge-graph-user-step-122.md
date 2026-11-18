---
date: 2026-11-18
slug: fix-and-acceptance-agent-maintained-knowledge-graph-user-step-122
title: "fix and acceptance: agent-maintained knowledge graph user step (#122)"
summary: "- A disabled run publishes only the status, on head and merge, and posts no comment. A run that cannot read the trusted configuration at all stays `unavailable`."
kind: product
status: accepted
sequence: 2026-11-18T21:20:19.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/129; merge commit f9e8bac30c141e2733a6bb397d7b74e017d57053"
---

## Context

The user phase's acceptance tests found that an installed but not-opted-in naming review still posted a summary comment on every pull request. B34 and the installed runbook say only a disabled status is posted. The tests also found that the outcome was `partial` instead of `too-large` when the ontology exceeded the budget, so the status did not name the variable to raise. The pushback also claimed that an absent setting reported `unavailable`. That was wrong: `loadConfig` already turns an absent `sourceGraph.namingReview` into `enabled: false`.

## Decision

- A disabled run publishes only the status, on head and merge, and posts no comment. A run that cannot read the trusted configuration at all stays `unavailable`.
- When every name bound for the model was too large for the budget and no model call succeeded, the outcome is `too-large`. Names settled without the model, because they contain their canonical term or are of a skipped kind, no longer make it `partial`.
- The review half is accepted locally through executable tests only. A walkthrough run by hand would need GitHub, so those behaviours are walked through in the JEPA-Speech trial.

## Consequences

Repositories that install `--with-graph-naming-review` and never opt in see no comments from it. If a repository disables the review partway through a pull request, the summary comment from the earlier enabled run stays as it was, while the status turns to a disabled success. The runbook's Outcomes table now matches what a run reports. The deployed acceptance in JEPA-Speech, and the JEPA-Speech reinstall it needs, wait for this merge.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
