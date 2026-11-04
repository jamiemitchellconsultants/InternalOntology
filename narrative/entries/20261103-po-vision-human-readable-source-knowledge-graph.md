---
date: 2026-11-03
slug: po-vision-human-readable-source-knowledge-graph
title: "[PO] Vision: human-readable source knowledge graph"
summary: "Provide an ordinary generated Markdown document of the current whole graph, produced from canonical Turtle through a Git workflow."
kind: product
status: accepted
sequence: 2026-11-03T20:14:39.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/69; merge commit 6ff5d15bcf082a2048b73e4f72059f9dc58291b5"
---

## Context

JEPA-Speech was the first live use of the source knowledge graph introduced by feature #35. Its maintainer found meaningful content embedded in structural Turtle elements and needed a readable document to judge accuracy, much as generated ontology Markdown exposes the ontology's content.

## Decision

Provide an ordinary generated Markdown document of the current whole graph, produced from canonical Turtle through a Git workflow. Preserve readable claims, supporting evidence, direct or inferred basis, coverage limits, and terms or references for finding the corresponding Turtle assertions. Exclude added/changed/removed reports, diagrams, and an interactive browser from this feature.

## Consequences

Maintainers will be able to inspect the graph's current meaning without decoding Turtle. Detailed change investigation remains in Turtle, using terms found in Markdown. The analyst must turn the outcomes into observable behaviors; layout, output path, command, and workflow publishing mechanics remain for later phases. A passing structural check continues to make no claim of semantic accuracy.
