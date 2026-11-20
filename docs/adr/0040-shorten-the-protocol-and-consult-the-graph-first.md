# 0040 — Shorten the protocol and consult the graph first

- **Status:** accepted
- **Date:** 2026-11-20
- **Feature:** #178 (docs/features/semantic-index-token-efficiency/)

## Context

The agent protocol loads at the start of every session, so its length is a fixed cost. B13 to B16 ask for a shorter protocol that keeps every rule, and for agents to use the `SourceKnowledgeGraph` when it already answers a question.

## Decision

Rewrite the semantic index protocol template shorter, keeping each rule agents rely on and removing restated text, and add a rule that, when the graph reader is installed and the graph is enabled, agents ask it first and search the index only when it reports the area as unknown, excluded or empty. The index does not consult the graph. The text is installed by the existing splice, so it stays identical in every adopting repository.

## Consequences

No code changes in the index for the graph rule. Adopters get the new text on a normal upgrade. The protocol is more compressed, so the pilot checks that no followed rule is dropped (B14). The graph rule depends on the graph reader's existing coverage reporting.

## Alternatives considered

- **Search checks graph coverage.** Couples two tools and adds work to every search. Rejected.
- **Leave the protocol as is.** Keeps the fixed cost. Rejected.
