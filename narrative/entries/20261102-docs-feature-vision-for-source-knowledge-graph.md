---
date: 2026-11-02
slug: docs-feature-vision-for-source-knowledge-graph
title: "docs(feature): vision for source knowledge graph"
summary: "The product-owner vision makes agent grounding the primary outcome. An agent prepares a source-owned graph before a pull request; deterministic CI checks its structure and evidence, and maintainers review meaning."
kind: product
status: accepted
sequence: 2026-11-02T13:36:34.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/42; merge commit 7f224a4db509ad1c75030815643b152fdd70e7bf"
---

## Context

The current Kit gives agents a canonical vocabulary, while repository structure, dependencies, tests, and deployment facts remain scattered. A JointBooking Graphify spike showed useful file-and-line evidence but also an inferred path through test helpers. The target is a wider graph for agent grounding, with C4 diagrams as one downstream view. Corporate use requires a high bar for external dependencies.

## Decision

The product-owner vision makes agent grounding the primary outcome. An agent prepares a source-owned graph before a pull request; deterministic CI checks its structure and evidence, and maintainers review meaning. Repositories may declare partial coverage. Evaluation spans C#, TypeScript, Java, and Python. The JointBooking pilot considers Terraform alone for deployment evidence. Graphify remains a research aid and is not a Kit or CI dependency.

## Consequences

The analyst can define the observable behavior and coverage rules without assuming one graph schema or extraction method. The architect must preserve byte-identical installed scripts and repository-specific configuration. Division-ontology can later consume reviewed source facts at recorded commits and derive C4 views where evidence is available. Numeric grounding targets wait for a representative baseline.
