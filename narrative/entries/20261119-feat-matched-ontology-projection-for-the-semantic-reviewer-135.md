---
date: 2026-11-19
slug: feat-matched-ontology-projection-for-the-semantic-reviewer-135
title: "feat: matched ontology projection for the semantic reviewer (#135)"
summary: "Each request carries a deterministic matched projection by default: the full rows of the entries its chunk selects, plus the name index, so the model can still cite any entry and every citation is checked against the whole catalog ([ADR…"
kind: product
status: accepted
sequence: 2026-11-19T20:46:13.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/141; merge commit 6715de2cbe45dfebb930f4f24828ddec556b19e0"
---

## Context

The semantic reviewer sent the whole ontology projection with every request. The kit is to be rolled out to repositories with much larger ontologies, where the whole projection would no longer fit the request budget and every review would be too large. Today's repositories are small enough that the difference is slight.

## Decision

Each request carries a deterministic matched projection by default: the full rows of the entries its chunk selects, plus the name index, so the model can still cite any entry and every citation is checked against the whole catalog ([ADR 0026](docs/adr/0026-matched-projection-as-an-injected-projector.md), [ADR 0027](docs/adr/0027-deterministic-matching-rule-and-fixed-stop-list.md)). `"full"` restores the old request byte for byte, and the record shows each file's projection ([ADR 0028](docs/adr/0028-projection-setting-and-run-record-summary.md)). Rejected for now: embedding-based retrieval, which is deferred to a later feature.

## Consequences

Request size now grows with the entries a chunk selects rather than with the whole ontology, so larger ontologies stay reviewable. A matched review can miss a paraphrase that shares no name word with its entry; repositories that care more about that than about request size can set `"full"`. The stop list is fixed in the script for every adopter, so changing it changes every repository's requests.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
