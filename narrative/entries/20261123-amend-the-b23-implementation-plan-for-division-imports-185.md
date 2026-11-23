---
date: 2026-11-23
slug: amend-the-b23-implementation-plan-for-division-imports-185
title: "Amend the B23 implementation plan for division imports (#185)"
summary: "Preserve the five kit increments and their completed tasks. After this plan merges, integrate the reviewed design and plan into the existing build branch with a normal merge."
kind: product
status: accepted
sequence: 2026-11-23T21:09:23.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/192; merge commit 14e4cb7672b888a275053bddfa6042243bd9f99e"
---

## Context

The original plan assumed the existing division importer could read the trial graph. ADR 0045 records the schema and evidence incompatibilities and the boundary between the kit producer and the division importer. [ADR 0045](https://github.com/jamiemitchellconsultants/InternalOntology/blob/c5e834607475cccd6144042677ab9f18e41c1c5d/docs/adr/0045-require-a-compatible-division-importer.md)

## Decision

Preserve the five kit increments and their completed tasks. After this plan merges, integrate the reviewed design and plan into the existing build branch with a normal merge. USER acceptance uses a separately delivered compatible importer and the real division C4 snapshot loader. It compares preserved design nodes, assertions and evidence with the pinned source graph, and traverses imported links from a behaviour to code.

## Consequences

The build branch can be integrated and verified while importer delivery is pending. B23 stays pending until acceptance verifies the importer, catalog and trial graph revisions together. The installed kit's end-to-end test establishes the producer behaviour.
