---
date: 2026-10-30
slug: docs-feature-define-semantic-matching-behaviours
title: "docs(feature): define semantic matching behaviours"
summary: "Accept B1–B14 in `docs/features/semantic-ontology-matching/02-behaviours.md`. Review the full current contents of changed eligible Markdown files against the PR's proposed ontology."
kind: product
status: accepted
sequence: 2026-10-30T12:05:37.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/25; merge commit 5af2377fd595e79ec3233edfc488ce550a571776"
---

## Context

The accepted vision in #14 and PR #22 calls for blocking semantic findings on trusted collaborators' same-repository PRs. The existing optional reviewer is advisory and examines added lines only. The analyst phase had to make the check's observable behavior explicit, including outage, partial review, correction, and dismissal cases.

## Decision

Accept B1–B14 in `docs/features/semantic-ontology-matching/02-behaviours.md`. Review the full current contents of changed eligible Markdown files against the PR's proposed ontology. An active finding blocks merge; the author's agent may correct the branch under the author's identity, while another agent proposes a correction. A maintainer may dismiss a specific finding with a recorded reason for the current revision. The latest run controls the check, so an unavailable or unusable model permits merge with an explicit not-reviewed notice, even after an earlier blocking finding. A partial run blocks if it returned a finding; otherwise it permits merge with incomplete-coverage notice. Repository maintainers control model configuration and credentials. Fork PRs remain outside the automated scope under #21.

## Consequences

The architect must design trusted execution, model configuration, run and dismissal persistence, and PR-visible findings and notices around these behaviors. The outage policy intentionally allows a later failed run to clear an earlier semantic block; the prior finding stays visible as history. The deterministic term check remains independent. This PR introduces behavior and vocabulary only; it does not turn on a semantic check.

Verification: ontology term check passed (60 files, 27 terms); `npm test` passed (243 tests).

AI-Fingerprint: sha256:9a0a869685df
