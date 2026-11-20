---
date: 2026-11-20
slug: docs-feature-design-for-semantic-index-token-efficiency
title: "docs(feature): design for semantic index token efficiency"
summary: "Estimate tokens from characters and log counts only in a local file. Add a passage command that returns only the cited lines from the indexed commit, and a compact JSON form."
kind: product
status: accepted
sequence: 2026-11-20T21:06:47.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/181; merge commit 6eb83ce0a0e5bf2708e043378e99cef4069d7c26"
---

## Context

The semantic repository index reports no token cost, so nobody can tell whether it saves anything. Search results already carry no passage text, so the cost that remains is the reading agents do after a search, repeated searches, and the protocol loaded each session. The owner chose to reinterpret the vision's result-size outcomes in that light rather than raise pushback.

## Decision

Estimate tokens from characters and log counts only in a local file. Add a passage command that returns only the cited lines from the indexed commit, and a compact JSON form. Cap responses by estimated tokens, cut and marked rather than refused. Shorten the agent protocol and have agents consult the graph first. Rejected: a model tokenizer, excerpts in search results, refusing oversize requests, and having search consult the graph. Decisions are in [ADR 0037](docs/adr/0037-count-tokens-by-estimate-and-log-counts-locally.md), [ADR 0038](docs/adr/0038-add-a-passage-command-and-compact-output.md), [ADR 0039](docs/adr/0039-cap-responses-by-estimated-tokens.md) and [ADR 0040](docs/adr/0040-shorten-the-protocol-and-consult-the-graph-first.md).

## Consequences

The developer can plan from the traceability table without re-deciding structure. The default cap of 4000 estimated tokens is a placeholder until a baseline exists. Passage merge and any change to model, ranking, chunking or snapshot format remain out of scope. Nothing ships until the plan and build phases.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
