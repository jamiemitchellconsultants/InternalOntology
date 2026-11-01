---
date: 2026-11-01
slug: docs-complete-semantic-matching-user-acceptance
title: "docs: complete semantic matching user acceptance"
summary: "Accept the user-phase walkthroughs on their recorded evidence. All B1–B14 local and deployed walkthrough steps passed, and all 14 matching executable cases passed against both the local kit and the installed trial scripts."
kind: product
status: accepted
sequence: 2026-11-01T16:54:05.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/33; merge commit 2a3a5be1fdb6374ad47fd243798642acda996460"
---

## Context

The merged semantic matching build in #31 needed user acceptance against a real hosted model, protected environment secret and required commit status. The owner authorized Codex to act as tester and selected `muse-spark-1.3-contributor` for the disposable trial repository. The owner also approved using `github-actions[bot]` as the non-maintainer identity for B8 because the trial has no write-role collaborator.

## Decision

Accept the user-phase walkthroughs on their recorded evidence. All B1–B14 local and deployed walkthrough steps passed, and all 14 matching executable cases passed against both the local kit and the installed trial scripts. The hosted model produced grounded findings, blocked merge on active findings, respected reasoned dismissals, treated a later unavailable run as nonblocking, and reported partial coverage explicitly. The B8 bot attempt was rechecked by a trusted rerun and did not dismiss either finding.

## Consequences

Maintainers have a deployment and recovery runbook and a user guide. The pilot remains opt-in and disabled by default in the shipped template; the trial repository retains the protected Meta configuration for evidence. Meta Contributor mode may use submitted trial ontology and PR content to train future models. Fork PR investigation remains tracked in #21. Subjective value still needs a maintainer judgment before wider enablement.

Verification: `npm test` passed 317/317; `node scripts/check-ontology-terms.mjs` passed 73 files against 31 terms; installed acceptance suite passed 14/14. See [the results](docs/features/semantic-ontology-matching/05-acceptance.md) and [trial repository](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030).

AI-Fingerprint: sha256:317f3269861e
