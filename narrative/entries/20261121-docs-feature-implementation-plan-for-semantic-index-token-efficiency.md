---
date: 2026-11-21
slug: docs-feature-implementation-plan-for-semantic-index-token-efficiency
title: "docs(feature): implementation plan for semantic index token efficiency"
summary: "Build the estimator and log first so that a baseline exists before anything is tuned. Then add the cap, the passage reader, search, `show`, `usage`, the protocol and the pilot measures."
kind: product
status: accepted
sequence: 2026-11-21T04:58:47.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/183; merge commit 3c56991f5c14b3143f2ca72ec83bd6660eab20be"
---

## Context

The architecture (PR #181, ADRs 0037 to 0040) left four questions to the developer: the task order, how to keep default search output unchanged while adding `--compact`, how to test the shortened protocol's rule fidelity, and how the pilot gets per-task discovery cost from session records. B2 requires an estimate on every response, while ADR 0038 requires default output to stay byte-identical, so the two had to be reconciled.

## Decision

Build the estimator and log first so that a baseline exists before anything is tuned. Then add the cap, the passage reader, search, `show`, `usage`, the protocol and the pilot measures. The owner chose to make output append-only: every existing field and line is unchanged, and responses only gain trailing `truncated`, `tokens` and `tokenLog` items. `status`, `refresh`, `download` and `upload` stay fully byte-identical. Rule fidelity is a test that checks each protocol rule by pattern and asserts the estimate is below the previous 588 tokens. Discovery cost is read from Claude Code session transcripts up to the first edit, and figures from other agents can be entered by hand.

## Consequences

Callers that compare default search output byte for byte will see trailing items, but no existing field changes. The pilot's transcript reader depends on the Claude Code transcript format. The build can be run by another agent from the detailed plan without further decisions. The build criteria stay open until that work is committed.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
