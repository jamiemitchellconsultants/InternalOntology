---
date: 2026-10-30
slug: docs-feature-plan-semantic-matching-implementation
title: "docs(feature): plan semantic matching implementation"
summary: "Implement the feature in eight independently testable, individually committed tasks: strict configuration; GitHub PR input and eligibility; lossless file batching; grounded model assessment; run ledger and status publication; maintainer…"
kind: product
status: accepted
sequence: 2026-10-30T12:49:23.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/29; merge commit aa5bff06f9563372b572ceb0b4650dea4a2b17aa"
---

## Context

PR #27 accepted a trusted follow-up workflow, complete changed-file review, commit-status outcomes, PR-visible finding and dismissal records, and a separate opt-in from the existing advisory reviewer. The developer phase now needs a test-first sequence that another agent can execute without re-deciding that structure.

## Decision

Implement the feature in eight independently testable, individually committed tasks: strict configuration; GitHub PR input and eligibility; lossless file batching; grounded model assessment; run ledger and status publication; maintainer dismissals; trusted workflow orchestration; and opt-in installation with runbook and end-to-end proof. The detailed plan pins interfaces, fixtures, exact files, and failure outcomes. Every task runs the ontology check and `npm test` before its commit. The accepted architecture and ADRs remain the design authority.

## Consequences

The build can proceed one task and one commit at a time after this plan is reviewed and merged. It must preserve the byte-identical installed-script rule, keep PR data out of secret-bearing execution, and verify the required status on the evaluated GitHub commit in a disposable repository. No implementation code is introduced by this PR. If live branch-protection behavior cannot be verified, the build PR must state that limitation for acceptance rather than claim it passed.

Verification: ontology term check passed (68 files, 31 terms); `npm test` passed (243 tests).

AI-Fingerprint: sha256:6ba7b750f4a7
