---
date: 2026-11-24
slug: ship-source-graph-links-to-feature-documents-185
title: "Ship source graph links to feature documents (#185)"
summary: "Ship behaviour and decision nodes as schema 2 core vocabulary, with stable identities, statuses and evidence. Add offline queries in both directions and deterministic document checks."
kind: product
status: accepted
sequence: 2026-11-24T04:59:51.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/194; merge commit 48d9232b3da8b1d412ab9123a262e7c212323fd5"
---

## Context

Feature behaviours and architecture decisions lacked stable links to the source and tests that implement them. When a behaviour changed or retired, reviewers had to work out which code and tests were affected.

## Decision

Ship behaviour and decision nodes as schema 2 core vocabulary, with stable identities, statuses and evidence. Add offline queries in both directions and deterministic document checks. Fail missing or reused behaviour ids and report inactive links without failing the graph check. Continue to accept version 1 manifests while their graphs use version 1 values. [Design and ADRs](https://github.com/jamiemitchellconsultants/InternalOntology/blob/630ae29017577fa53cd0b70762c169ad89f5c554/docs/features/graph-feature-document-links/feature.md#architect-structure)

## Consequences

Maintainers can trace code, tests and design decisions at a named revision and judge the evidence. Repositories regenerate their graph Markdown after upgrading. B23 acceptance uses a separate compatible importer and a disposable catalog that pins the source graph. [ADR 0045](https://github.com/jamiemitchellconsultants/InternalOntology/blob/630ae29017577fa53cd0b70762c169ad89f5c554/docs/adr/0045-require-a-compatible-division-importer.md)
