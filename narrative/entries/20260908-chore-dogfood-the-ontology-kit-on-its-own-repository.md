---
date: 2026-09-08
slug: chore-dogfood-the-ontology-kit-on-its-own-repository
title: "chore: dogfood the ontology kit on its own repository"
summary: "Installed the kit into its own repository rather than leaving it undogfooded, and seeded the ontology from the kit's real code and docs rather than filling in the template's placeholder rows."
kind: product
status: accepted
sequence: 2026-09-08T09:28:31.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/10; merge commit 9d28c94717364d3f3615684325bb359da7d6b779"
---

## Context

The kit installs a vocabulary discipline into other repositories but had never run it against itself. Its own docs (`README.md`, `docs/how-it-works.md`, the `ontology-setup` skill's reference guides) already carry real domain vocabulary — `Installer`, `TargetRepository`, `OntologyConfig`, `Ownership`, and so on — with no mechanism keeping it from drifting the same way the kit warns adopters it will.

## Decision

Installed the kit into its own repository rather than leaving it undogfooded, and seeded the ontology from the kit's real code and docs rather than filling in the template's placeholder rows. Excluded `templates/` and `docs/superpowers/` from the check via `ignorePaths` instead of trying to make their contents (deliberately generic example terms meant for adopters, and an archived planning transcript full of test fixtures) pass as real domain vocabulary — forcing either into the ontology would have been decoration, not discipline.

## Consequences

This repository is now bound by its own protocol: any future change to the installer, the config shape, or the kit's own vocabulary must update `docs/ontology.md` in the same commit, and CI enforces it via `.github/workflows/ontology-lint.yml`. The allowlist currently holds 14 entries, all illustrative placeholders in reference docs rather than real drift — worth revisiting if that ratio grows as the kit's own documentation expands.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
