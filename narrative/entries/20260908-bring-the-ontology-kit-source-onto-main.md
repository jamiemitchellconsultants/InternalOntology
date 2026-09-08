---
date: 2026-09-08
slug: bring-the-ontology-kit-source-onto-main
title: "Bring the Ontology Kit source onto main"
summary: "Rather than force-pushing over either branch's history, created a new branch from `main` and copied the kit's tree onto it file by file, checking each path for a collision first."
kind: product
status: accepted
sequence: 2026-09-08T07:07:38.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/2; merge commit 397135ef6a6b7cc63c22bfd581edf8f3d38b4e61"
---

## Context

`main` had governance and agent-instruction scaffolding installed (Project Narrative) but no
product code yet; the actual Ontology Kit implementation existed only on a branch whose history no
longer connected to `main`, so a normal PR/merge wasn't possible (GitHub refuses a PR between
branches with no common history).

## Decision

Rather than force-pushing over either branch's history, created a new branch from `main` and
copied the kit's tree onto it file by file, checking each path for a collision first. Only one
file (`README.md`) existed on both sides, and it was already identical, so nothing needed
reconciling by hand.

## Consequences

`main` now contains the full kit: installer, linter, templates, skill, and test suite, alongside
the existing Project Narrative scaffold. `feat/ontology-kit` (the orphaned branch) is left in
place, unmerged, for reference. No shared history exists between it and `main`; future work should
branch from `main` going forward.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
