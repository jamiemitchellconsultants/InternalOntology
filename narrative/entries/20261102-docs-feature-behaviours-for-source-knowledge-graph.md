---
date: 2026-11-02
slug: docs-feature-behaviours-for-source-knowledge-graph
title: "docs(feature): behaviours for source knowledge graph"
summary: "Include selected design and architecture documents as evidence alongside code, tests, ontology terms, and eligible deployment files."
kind: product
status: accepted
sequence: 2026-11-02T14:49:46.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/44; merge commit 0d5c738c5dca834d2d20bfb02bd76fb52c2ad5d5"
---

## Context

The accepted vision in #42 calls for a source-owned graph that grounds AI agents and can support wider views than the ontology alone. A single repository need not contain every fact needed for all C4 levels. The analyst needed to decide which sources may supply evidence, when a changed file blocks the PR check, and whether inferred relationships can be published.

## Decision

Include selected design and architecture documents as evidence alongside code, tests, ontology terms, and eligible deployment files. A changed file inside declared graph coverage requires a graph refresh or an explicit record that review found no fact change; the deterministic pull-request check blocks when that review is missing. Publish inferred relationships only when they are clearly labeled and cite reviewable source observations, and present them as tentative to agents.

## Consequences

Maintainers can review direct assertions, inferences, evidence, and gaps in the same PR. CI can check structure and freshness but cannot establish semantic truth, so maintainers remain responsible for claims. Repositories can declare partial coverage; out-of-scope files do not trigger the freshness check. The recorded revision representation, graph schema, extraction method, and query interface remain for architecture to decide. The numeric grounding target remains deferred until a representative baseline exists.
