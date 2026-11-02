---
date: 2026-11-02
slug: docs-feature-architecture-for-source-knowledge-graph
title: "docs(feature): architecture for source knowledge graph"
summary: "Store the graph as canonical Turtle files with named resources and shared ontology concept IRIs."
kind: product
status: accepted
sequence: 2026-11-02T16:18:47.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/46; merge commit aee513407e22c61bff95bfdf927363eacd773497"
---

## Context

The accepted vision and behaviours require source-owned, reviewable facts for AI agent grounding, labeled inferences, explicit gaps, and a blocking PR freshness check within declared coverage. The design must work across C#, TypeScript, Java, and Python, permit selected documents as evidence, use only Terraform for JointBooking deployment evidence, and avoid a required external graph service or Graphify dependency. Adopting repositories already use `ontology.ttl` as the ontology source of truth.

## Decision

Store the graph as canonical Turtle files with named resources and shared ontology concept IRIs. Derive the effective revision from the containing Git commit ([ADR 0005](https://github.com/jamiemitchellconsultants/InternalOntology/blob/feature/source-knowledge-graph/architect/docs/adr/0005-source-graph-git-data.md)). Record reviewed source blob IDs and check changed paths against both base and proposed coverage ([ADR 0006](https://github.com/jamiemitchellconsultants/InternalOntology/blob/feature/source-knowledge-graph/architect/docs/adr/0006-source-graph-freshness.md)). Install an agent protocol, local reader and checker, and read-only workflow through an explicit option ([ADR 0007](https://github.com/jamiemitchellconsultants/InternalOntology/blob/feature/source-knowledge-graph/architect/docs/adr/0007-source-graph-opt-in-runtime.md)). Use a versioned core RDF vocabulary with defined adopter extensions ([ADR 0008](https://github.com/jamiemitchellconsultants/InternalOntology/blob/feature/source-knowledge-graph/architect/docs/adr/0008-source-graph-vocabulary.md)).

## Consequences

A PR exposes changes to assertions, evidence, coverage, and no-fact-change reviews. The deterministic checker validates a documented canonical Turtle subset, structure, and freshness without making semantic claims; maintainers judge whether evidence supports direct or inferred assertions. The source graph can be combined with the canonical ontology by RDF consumers without translating JSON. Repositories can participate with partial coverage, and downstream consumers derive only the views their pinned facts support. The first implementation must define and test the Turtle contract, coverage priority, reader output, and local/CI revision modes. Numeric grounding targets remain deferred until a representative baseline exists.
