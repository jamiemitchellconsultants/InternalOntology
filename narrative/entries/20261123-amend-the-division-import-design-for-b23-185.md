---
date: 2026-11-23
slug: amend-the-division-import-design-for-b23-185
title: "Amend the division import design for B23 (#185)"
summary: "Keep the schema 2 source graph and exercise the division's C4 snapshot loader. Division-ontology delivers compatibility as a separate prerequisite."
kind: product
status: accepted
sequence: 2026-11-23T21:03:29.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/190; merge commit c5e834607475cccd6144042677ab9f18e41c1c5d"
---

## Context

During USER diagnostics, the kit validated the schema 2 graph at a pinned commit. The existing division importer rejected that commit with `invalid graph schema version`. A separate control exposed an evidence-role mismatch, and the importer projection omits design status and node evidence. [Acceptance evidence](https://github.com/jamiemitchellconsultants/InternalOntology/issues/185#issuecomment-7113497180)

## Decision

Keep the schema 2 source graph and exercise the division's C4 snapshot loader. Division-ontology delivers compatibility as a separate prerequisite. B23 compares the preserved design node and assertion fields and follows the imported links to code from a catalog-pinned JEPA-Speech commit. [ADR 0045](https://github.com/jamiemitchellconsultants/InternalOntology/blob/5aced415ab75b3496df3d06b7baff27c0c056603/docs/adr/0045-require-a-compatible-division-importer.md)

## Consequences

B23 acceptance waits for a verified compatible importer. Its acceptance record pins the importer revision, catalog commit and trial graph commit. The developer plan needs to replace its assumption that the current importer suffices. The kit producer and its existing checks and lookups stay independent of division delivery.
