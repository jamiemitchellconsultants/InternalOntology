---
date: 2026-10-30
slug: docs-feature-define-semantic-review-architecture
title: "docs(feature): define semantic review architecture"
summary: "Use a secretless PR trigger followed by trusted default-branch code in a `workflow_run` worker. Read model settings from the default branch's `OntologyConfig` and use a default-branch-only Actions environment secret."
kind: product
status: accepted
sequence: 2026-10-30T12:26:15.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/27; merge commit f840d76751ec7fe0a32c1d9130c638db3b6c2758"
---

## Context

The accepted behaviours in PR #25 require a semantic finding to block a trusted collaborator's PR, while an unavailable later run permits merge and reports that review did not run. The reviewer needs model credentials, author-supplied Markdown as input, durable findings and dismissals, and a PR status that branch protection can require. The kit's existing advisory reviewer runs from the PR checkout and remains an optional separate path during the pilot.

## Decision

Use a secretless PR trigger followed by trusted default-branch code in a `workflow_run` worker. Read model settings from the default branch's `OntologyConfig` and use a default-branch-only Actions environment secret. Fetch PR contents as data, review all changed eligible Markdown in bounded requests, and validate grounded findings. Publish the latest result in a fixed required commit-status context, keeping each run and each reasoned dismissal visible in PR comments. Ship the blocking path as a separate opt-in so existing advisory installations do not become blocking on upgrade.

These decisions are recorded in [ADR 0001 — trusted workflow](https://github.com/jamiemitchellconsultants/InternalOntology/blob/feature/semantic-ontology-matching/architect/docs/adr/0001-trusted-semantic-review-workflow.md), [ADR 0002 — outcome status](https://github.com/jamiemitchellconsultants/InternalOntology/blob/feature/semantic-ontology-matching/architect/docs/adr/0002-semantic-outcome-status.md), [ADR 0003 — PR ledger](https://github.com/jamiemitchellconsultants/InternalOntology/blob/feature/semantic-ontology-matching/architect/docs/adr/0003-semantic-review-pr-ledger.md), and [ADR 0004 — opt-in rollout](https://github.com/jamiemitchellconsultants/InternalOntology/blob/feature/semantic-ontology-matching/architect/docs/adr/0004-semantic-review-opt-in.md).

## Consequences

The developer must implement and test both workflow halves, PR data validation, full-file coverage, status publication on the evaluated commit, and revision-scoped dismissal processing. Maintainers must configure the protected environment and require the fixed status context. A later unavailable run intentionally supersedes an earlier block while retaining its finding comment as history. Fork PR workflow approval and manual investigation remain tracked in #21. The deterministic `TermChecker` stays independent.

Verification: ontology term check passed (66 files, 31 terms); `npm test` passed (243 tests).

AI-Fingerprint: sha256:352d8fd55484
