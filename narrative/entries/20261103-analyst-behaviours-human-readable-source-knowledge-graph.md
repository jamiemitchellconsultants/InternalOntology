---
date: 2026-11-03
slug: analyst-behaviours-human-readable-source-knowledge-graph
title: "[Analyst] Behaviours: human-readable source knowledge graph"
summary: "Define fourteen behaviours for a faithful current-state Markdown document with readable recorded names, accessible evidence at the input snapshot, clear direct or inferred basis, unambiguous references back to Turtle, and explicit…"
kind: product
status: accepted
sequence: 2026-11-03T20:27:52.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/71; merge commit c2c7abbcb3ccdde74d41bfc0732021fca54cd069"
---

## Context

The accepted vision addresses the readability problem exposed by JEPA-Speech's first live use: maintainers need to inspect current graph claims to assess accuracy without interpreting Turtle structure. Before architecture, the vision's outcomes need observable scenarios and explicit decisions about evidence presentation, graph limits, traceability, and generation failure.

## Decision

Define fourteen behaviours for a faithful current-state Markdown document with readable recorded names, accessible evidence at the input snapshot, clear direct or inferred basis, unambiguous references back to Turtle, and explicit coverage limits. Repeated generation from identical inputs is byte-identical. Invalid input fails visibly and cannot publish an apparently successful partial replacement; valid empty or partially covered graphs remain renderable. Use one canonical rendering use case, `RenderSourceKnowledgeGraph`.

## Consequences

The architect has a testable behavioural contract. Output location, document layout, snapshot representation, generation command and workflow publishing mechanics remain architecture decisions. The design must preserve stable evidence references without introducing a self-referential generated commit. The JEPA-Speech pilot supplies the initial readability trial, supplemented by inference, ambiguity, coverage, failure and configuration cases. Assertion-change reports, diagrams, extraction and semantic correctness judgement remain out of scope.
