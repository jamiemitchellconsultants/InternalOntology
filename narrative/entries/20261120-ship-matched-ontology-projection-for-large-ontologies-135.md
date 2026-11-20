---
date: 2026-11-20
slug: ship-matched-ontology-projection-for-large-ontologies-135
title: "Ship matched ontology projection for large ontologies (#135)"
summary: "- Read the pinned source through raw GitHub Contents with strict UTF-8 decoding and keep a Markdown fallback on a source 404."
kind: product
status: accepted
sequence: 2026-11-20T11:49:16.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/164; merge commit 0a5f6cf5aa3869ad86968ed001c1334716aee5ca"
---

## Context

The initial matched reviewer was pushed back after a broad file failed to fit against its whole-file projection. The next build review also exposed GitHub's inline Contents limit and the one-code-unit boundary for an indivisible Markdown character.

## Decision

- Read the pinned source through raw GitHub Contents with strict UTF-8 decoding and keep a Markdown fallback on a source 404. [ADRs 0029](docs/adr/0029-semantic-review-reads-the-ontology-source.md) and [0034](docs/adr/0034-semantic-review-reads-raw-ontology-contents.md)
- Plan by paragraph, line and piece using each piece's actual evidence. Keep whole Unicode code points and report the original line if an indivisible piece cannot fit. [ADRs 0030](docs/adr/0030-matched-planning-by-paragraph-in-the-projector.md) and [0035](docs/adr/0035-matched-planner-budgets-whole-code-points.md)
- Group the name index and send relationship rows for the selected keys. [ADR 0031](docs/adr/0031-relationships-only-and-grouped-name-index.md)

## Consequences

At the 200,000-character default budget, the local broad-file trial with 1,920 ontology entries took four requests. The developer's historical replay retained the evidence for all ten JEPA-Speech findings. All eight local walkthroughs and all 16 approved acceptance tests passed. The full suite passed 764 tests each on Docker Node 20, 22 and 24. The live consumer trial will verify how the deployed model cites the grouped index. [Acceptance](docs/features/matched-ontology-projection/feature.md#acceptance)
