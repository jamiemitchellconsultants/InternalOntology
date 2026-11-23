---
date: 2026-11-23
slug: plan-source-graph-links-to-feature-documents-185
title: "Plan: source graph links to feature documents (#185)"
summary: "Slice the build into five increments, each delivering a set of behaviour ids end to end and leaving the kit releasable, with schema version 2 and older-manifest acceptance first as the walking skeleton."
kind: product
status: accepted
sequence: 2026-11-23T15:40:38.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/188; merge commit b83edcfdf82c04ab8d62d39fb1a9b0a7492ac18d"
---

## Context

The design for #185 adds behaviour and decision nodes to the source graph, a checker that holds them to their documents, non-failing reports of retired links, two lookups and a protocol change. It touches the vocabulary, checker, reader, renderer, workflow, installer and protocol, and raising the schema version could break every existing graph if it landed in the wrong order. The build may be run by a smaller model from the detailed plan, so each step has to be unambiguous and each increment safe to stop after.

## Decision

Slice the build into five increments, each delivering a set of behaviour ids end to end and leaving the kit releasable, with schema version 2 and older-manifest acceptance first as the walking skeleton. Hold every later increment to one shared, fixed fixture (a lite `payments` feature and two ADRs) so checker, renderer, reader and the installed end-to-end run test the same documents. Rejected: slicing by component (checker, then reader, then protocol), which would leave behaviours half delivered between sessions, and a separate fixture per test file, which would let the documents drift apart.

## Consequences

Work can stop safely after any increment, and adopters can take increment 1 alone without a red check. The fixture's line numbers become part of the test contract, so editing it means updating the tests that cite them. The plan is long because it carries complete tests for a smaller model; the protocol paragraph, runbook section and how-it-works paragraph are fixed copy, and the trial and division import remain for the user phase.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
