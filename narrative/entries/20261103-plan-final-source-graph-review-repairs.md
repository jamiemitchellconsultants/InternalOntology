---
date: 2026-11-03
slug: plan-final-source-graph-review-repairs
title: "Plan final source graph review repairs"
summary: "Compare each base covered selector by its literal pattern with proposed coverage declarations."
kind: product
status: accepted
sequence: 2026-11-03T09:57:52.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/56; merge commit 6c5a2484b8e710e6e19184db00e77c9e26d0b3b7"
---

## Context

Final review of the pushed build found that an empty evidence path with line zero produced no findings, graph opt-in beside an existing custom-namespace config wrote starter files in a different namespace, and removing a covered selector with its evidence and assertions escaped the PR check when source files did not change. The architecture requires removed coverage to remain explicitly unknown or excluded with a reason. GitHub branch-protection integration remains unverified.

## Decision

Compare each base covered selector by its literal pattern with proposed coverage declarations. Retain the selector as covered, or retain it as unknown or excluded with a non-empty reason; narrowing uses a reasoned old-scope marker plus a higher-priority covered selector for the retained area. Validate evidence paths and line bounds independently. Generate new starter graph files from a preserved config's namespace during normal opt-in or force; explicit reset replaces config and starters together. Append one Task 11 repair commit to the existing build branch without rewriting its ten task commits.

## Consequences

Coverage removal is visible even without changed source files. Literal pattern comparison avoids guessing glob equivalence from tracked files, so a selector rewrite must retain an explicit old-scope marker. The existing base/head review-record rule still applies to changed files. The installed checker, installer and acceptance tests receive focused regressions. The build handoff remains blocked until the plan amendment is reviewed and merged, the pushback is cleared, and Task 11 passes. Branch-protection integration remains for user acceptance.
