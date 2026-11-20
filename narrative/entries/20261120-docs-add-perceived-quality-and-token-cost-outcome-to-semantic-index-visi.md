---
date: 2026-11-20
slug: docs-add-perceived-quality-and-token-cost-outcome-to-semantic-index-visi
title: "docs: add perceived quality and token cost outcome to semantic index vision"
summary: "Record perceived benefit as the primary evidence for the new outcome, and token cost as a paired measure that shows whether the benefit is cheap or expensive. Outcome 5 starts as an observation with no target until a baseline exists."
kind: product
status: accepted
sequence: 2026-11-20T20:50:24.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/179; merge commit 66e112d4af36279a79d1bdffe7746178018132f3"
---

## Context

The vision measured retrieval quality, snapshot reuse, refresh cost and owner control, but not the reason the index was valued in use: better perceived quality and lower cognitive load. It also said nothing about token cost, which an agent-facing index affects in both directions.

## Decision

Record perceived benefit as the primary evidence for the new outcome, and token cost as a paired measure that shows whether the benefit is cheap or expensive. Outcome 5 starts as an observation with no target until a baseline exists. Rejected: setting a token-reduction target now, because no baseline has been measured.

## Consequences

Later work can cite outcome 5 when tuning result size and telemetry. A follow-up feature, semantic index token efficiency (#178), takes on the measurement and reduction work. Nothing in the shipped index changes.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
