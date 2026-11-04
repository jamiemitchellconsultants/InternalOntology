---
date: 2026-11-04
slug: feat-readable-current-state-source-knowledge-graph
title: "feat: readable current-state source knowledge graph"
summary: "Implement the accepted current-state Markdown projection in the repository and include it with canonical graph changes in the same PR."
kind: product
status: accepted
sequence: 2026-11-04T04:02:46.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/77; merge commit bb1f7c45b4f004175cb17b4d739857549fff554e"
---

## Context

The first live source graph use in JEPA-Speech showed that Turtle structure obscures the meaningful claims maintainers need to assess.

## Decision

Implement the accepted current-state Markdown projection in the repository and include it with canonical graph changes in the same PR. Pin every evidence and Turtle link to a validated source commit, and check exact rendering in read-only CI.

## Consequences

Maintainers review readable claims and evidence before merge. Authors commit canonical inputs before generating and committing the view. The renderer remains offline; checkout preparation retrieves a missing retained source snapshot. Structural validation does not establish semantic accuracy.
