---
date: 2026-11-03
slug: architect-structure-human-readable-source-knowledge-graph
title: "[Architect] Structure: human-readable source knowledge graph"
summary: "Keep generated Markdown with the source PR, defaulting to a README inside the excluded graph root, and use a read-only freshness workflow ([ADR…"
kind: product
status: accepted
sequence: 2026-11-03T20:56:29.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/73; merge commit 9d0d3e528a6d93c59e47e9b66a03c867efe49875"
---

## Context

JEPA-Speech's first live use exposed how Turtle structure obscures the claims maintainers need to assess. The accepted behaviours require a faithful readable view with evidence, explicit basis, coverage limits and trustworthy source references. Architecture must provide those outcomes while preserving identical installed scripts and avoiding a self-referential generated commit hash.

## Decision

Keep generated Markdown with the source PR, defaulting to a README inside the excluded graph root, and use a read-only freshness workflow ([ADR 0009](https://github.com/jamiemitchellconsultants/InternalOntology/blob/feature/human-readable-source-knowledge-graph/architect/docs/adr/0009-source-graph-markdown-in-source-pr.md)). Pin links to an existing source commit, compare its complete input projection with the current candidate, and retrieve missing source objects during checkout/bootstrap after history rewriting ([ADR 0010](https://github.com/jamiemitchellconsultants/InternalOntology/blob/feature/human-readable-source-knowledge-graph/architect/docs/adr/0010-source-graph-markdown-revision-context.md)). Use one deterministic renderer with the existing parser/model/checker, explicit ordering, escaped readable text and atomic local replacement ([ADR 0011](https://github.com/jamiemitchellconsultants/InternalOntology/blob/feature/human-readable-source-knowledge-graph/architect/docs/adr/0011-source-graph-markdown-renderer.md)).

## Consequences

Maintainers can review the generated document alongside graph changes. Authors commit canonical changes, generate from that snapshot, then commit the document in the same PR. Rendering requires a configured repository browser URL; the generated path is configurable within the graph root. CI checks source projection equality and exact Markdown bytes with read-only permissions. Squash/rebase source retrieval and links after branch movement need explicit acceptance coverage. Developer planning follows this phase; implementation is not part of this PR.
