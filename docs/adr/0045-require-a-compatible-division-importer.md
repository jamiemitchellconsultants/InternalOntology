# 0045 — Require a compatible division importer for design links

- **Status:** accepted
- **Date:** 2026-11-23
- **Feature:** #185 (docs/features/graph-feature-document-links/)

## Context

[B23 and U12](../features/graph-feature-document-links/feature.md#outcome-5-a-division-can-follow-the-links) require the division to retain design nodes and links from a pinned JEPA-Speech graph and to traverse from a behaviour to code. [ADR 0041](0041-behaviour-and-decision-kinds-in-schema-version-2.md) gives the graph these core values in schema version 2. A local diagnostic run showed that the division importer rejects version 2 before reading the graph. A version 1 control with standard kit evidence also failed because the importer looked up prefixed evidence role names, and the importer's node records omit design status and node evidence. [Acceptance evidence](https://github.com/jamiemitchellconsultants/InternalOntology/issues/185#issuecomment-7113497180)

## Decision

Use division-ontology's C4 snapshot loader for B23. The kit produces the canonical schema version 2 graph in JEPA-Speech. Division-ontology owns delivery of a compatible importer as a separate prerequisite. The importer must read graph data and configuration from the catalog-pinned source commit, resolve the kit's evidence roles against that commit's configured selectors, and preserve design nodes and their assertions with the fields B23 names. It continues to support version 1 graphs.

## Consequences

The USER phase must demonstrate the import through the real snapshot loader, compare the imported fields and evidence with the pinned source graph, and traverse a behaviour's recorded assertions to a source file or symbol. Record the exact importer revision, catalog commit and JEPA-Speech graph commit. The B23 acceptance result stays pending until a compatible importer revision is available. The kit's graph format, installer, checker and reader are independent of that delivery.

## Alternatives considered

- Use the existing importer as-is. Its schema version guard rejects the trial graph and its current projection drops fields B23 requires.
- Down-convert or rewrite the trial graph for the importer. The result would lose the version 2 contract or bypass the exact Git revision that acceptance needs to prove.
- Add a separate parser or a dedicated division view for acceptance. A separate parser would exercise a different import path. A view can consume the imported graph later if needed.
