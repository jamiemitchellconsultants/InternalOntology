---
date: 2026-10-30
slug: feat-install-feature-lifecycle-kit
title: "feat: install feature lifecycle kit"
summary: "Adopt the lifecycle files from the local `claude-plugins` source byte for byte. Keep repository-specific guidance in `AGENTS.md`. The CLI and CI workflow share the same gate rules."
kind: product
status: accepted
sequence: 2026-10-30T10:30:24.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/12; merge commit 39157d36ec8a0fd614ece533802fef62bfac4eba"
---

## Context

The Ontology Kit repository had no feature lifecycle kit, although the kit is shipped for adoption by other repositories. Installing it here lets this repository review and exercise the same persona workflow it distributes.

## Decision

Adopt the lifecycle files from the local `claude-plugins` source byte for byte. Keep repository-specific guidance in `AGENTS.md`. The CLI and CI workflow share the same gate rules.

## Consequences

The skills and workflow will be available after merge. GitHub lifecycle labels and a required `feature-gate` branch-protection check still need setup before the workflow is fully operational. Review also found source-kit gaps to resolve before full rollout: lite plan PRs are not classified by the CI gate; the persona instructions refer to an undefined `AI-Fingerprint` policy in this repository; and lite deployed-acceptance results lack a reviewed post-merge path. This PR is draft while those integration points are assessed.

AI-Fingerprint: sha256:54b04a159d0c
