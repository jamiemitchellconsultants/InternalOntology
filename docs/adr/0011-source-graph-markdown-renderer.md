# 0011 — Reuse validated graph inputs for deterministic rendering

- **Status:** accepted
- **Date:** 2026-11-03
- **Feature:** #62 (docs/features/human-readable-source-knowledge-graph/)

## Context

B1–B14 require a faithful whole-graph view, understandable evidence/basis/coverage, safe failure and identical tooling across adopters. Existing modules already read immutable Git trees, parse the supported Turtle subset, expose resource locations/vocabulary and validate structure, evidence and current review records. Query-specific reader output is incomplete for whole-graph rendering, and its stale annotation is not full validation.

## Decision

Add one Kit-owned `GraphRenderer`, a dependency-free local Node.js command using existing Git/model modules and `GraphChecker` revision validation. Produce an ordered pure projection of a committed source snapshot after validation, then atomically replace only local generated output or compare expected bytes in committed/staged check mode. Require the source projection to match the candidate being checked, as described in ADR 0010.

Show recorded directed claims, all evidence links, explicit direct/tentative basis, source lookup, coverage and used local definitions. Keep raw identifiers/hashes secondary. Escape supplied text, and avoid automatically backticking source symbols that are not ontology concepts. Order every resource/claim/evidence/coverage/definition collection explicitly and omit execution metadata.

## Consequences

The graph retains one parser, vocabulary and validation contract. Invalid evidence or review records cannot become an apparently successful readable view. Valid empty/partial graphs still render. Atomic replacement preserves earlier output on failure; commands neither change canonical input nor silently stage files. The existing PR graph check independently retains refresh obligations and configuration locks.

Rendering uses local Git objects after checkout/setup, with no model, hosted service, package dependency or language-specific extractor. Installed tests cover completeness, labels/escaping, multiple evidence, inference, empty/partial/overlapping coverage, repeatability, historical links, invalid input and adopter configuration. A maintainer trial on JEPA-Speech still assesses actual readability and accuracy review.

## Alternatives considered

- A second parser or general RDF dependency duplicates the supported-subset contract without serving a required behaviour.
- Rendering reader search/neighbour output risks omitting assertions/isolated nodes and lacks full validation.
- Model-written summaries can omit/reinterpret claims and cannot provide deterministic projection.
- Streaming over the previous file risks partial output on failure.
- Diagrams and an interactive application are outside the accepted scope.
