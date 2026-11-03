---
date: 2026-11-03
slug: build-the-source-knowledge-graph-opt-in
title: "Build the source knowledge graph opt-in"
summary: "Validate evidence path syntax and line bounds independently. Compare base covered selectors by literal pattern with proposed declarations; retain a removed scope as reasoned unknown or excluded coverage."
kind: product
status: accepted
sequence: 2026-11-03T11:50:58.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/58; merge commit addb3c0793b33e503516e1e0f5906e56a9a8d7ff"
---

## Context

The accepted architecture requires changed files in either base or proposed covered scope to have valid, reviewable records. Final review found empty evidence paths and line zero could pass, starter graph files could use the wrong namespace beside an existing config, and a covered selector could disappear without a reasoned gap. The independent code review also reproduced malformed or unreferenced records passing when a changed file left coverage, because the head-only exemption skipped record validation.

## Decision

Validate evidence path syntax and line bounds independently. Compare base covered selectors by literal pattern with proposed declarations; retain a removed scope as reasoned unknown or excluded coverage. Use the preserved config's namespace for newly installed starter graph files, while explicit reset replaces config and starters together. Apply full review-record validation to changed paths covered by either the base or proposed graph, including paths that leave coverage in the proposed graph; continue ignoring old records for unchanged paths outside current coverage. Keep all repairs in the one Task 11 commit after the ten pushed task commits.

## Consequences

Graph-only scope removal is visible, and a transition PR cannot satisfy its remaining review obligation with a malformed record. Literal selector comparison avoids inferring glob equivalence from a finite file list, so a selector rewrite retains an explicit old-scope marker. Normal installation and force preserve adopter-owned config and graph data; reset discards them together. The checker still validates structure and review records, while maintainers judge semantic truth. GitHub branch-protection integration remains unverified for the user acceptance phase.
