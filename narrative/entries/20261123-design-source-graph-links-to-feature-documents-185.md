---
date: 2026-11-23
slug: design-source-graph-links-to-feature-documents-185
title: "Design: source graph links to feature documents (#185)"
summary: "Make behaviours and decisions core graph node kinds in schema version 2, identified by `<slug>#B<n>` and by ADR number, with a design status and links to a replacement or successor ([ADR…"
kind: product
status: accepted
sequence: 2026-11-23T14:36:32.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/186; merge commit fbb23f6d181f140347f1fa1f423489378cf49078"
---

## Context

The `SourceKnowledgeGraph` links code to ontology concepts, but nothing links it to the feature documents that explain why the code exists: the analyst's behaviours, the architect's components and the ADRs. When pushback changes a behaviour, nobody can ask what code and tests it affects; a reader of a class cannot find the behaviour it serves or the decision that shaped it; and a division ontology cannot follow a feature to its code. The graph vocabulary already defined `kit:implements` as realising "a concept or behaviour", but had no behaviour or decision kind, and [ADR 0008](docs/adr/0008-source-graph-vocabulary.md) makes adopter-local kinds opaque to cross-repository consumers. Behaviour ids had also been free to change on amendment until claude-plugins made them permanent.

## Decision

Make behaviours and decisions core graph node kinds in schema version 2, identified by `<slug>#B<n>` and by ADR number, with a design status and links to a replacement or successor ([ADR 0041](docs/adr/0041-behaviour-and-decision-kinds-in-schema-version-2.md)). Keep existing graphs valid by accepting manifests at an older schema version ([ADR 0042](docs/adr/0042-accept-older-graph-manifests.md)). Hold behaviour and decision nodes to their documents with a deterministic `DesignDocumentReader`, without parsing traceability rows ([ADR 0043](docs/adr/0043-check-design-nodes-against-their-documents.md)). Report links to retired behaviours and superseded decisions without failing the check, so an analyst's amendment is never blocked by code it may not yet change ([ADR 0044](docs/adr/0044-report-retired-design-links-without-failing.md)). Record only direct links, in the same change as what they describe, under the `GraphAgentProtocol`. Rejected: links in code comments, inferred symbol-to-behaviour links, deleting retired nodes, requiring every adopter to bump their manifest, and covering all of `docs/features/**` by default.

## Consequences

Developers and agents gain behaviour-first and code-first lookups, and amendments get a list of affected code and tests. Adopters upgrade without a failing check and move to schema version 2 only when they record their first behaviour or decision. The checker now reads feature documents and ADRs, so the three behaviour declaration forms become a contract. Whether a link is true remains a maintainer's judgement, retired links are visible but not enforced, persona-skill hooks and a dedicated division view are left for later, and the division import is verified in acceptance rather than changed.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
