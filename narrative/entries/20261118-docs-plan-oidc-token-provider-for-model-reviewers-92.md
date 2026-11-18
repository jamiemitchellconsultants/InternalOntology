---
date: 2026-11-18
slug: docs-plan-oidc-token-provider-for-model-reviewers-92
title: "docs: plan OIDC token provider for model reviewers (#92)"
summary: "Seven tasks: shared `llm-auth.mjs` with full test contract, drift reviewer, semantic reviewer, installer entries (the installer lists scripts explicitly), workflow templates, docs, wrap-up."
kind: product
status: accepted
sequence: 2026-11-18T09:29:59.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/95; merge commit 860fed80fb16f4b0a2c69e865c63d490453dd18b"
---

## Context

The design (PR #93) is merged; the plan turns it into reviewable, test-first tasks before any code exists.

## Decision

Seven tasks: shared `llm-auth.mjs` with full test contract, drift reviewer, semantic reviewer, installer entries (the installer lists scripts explicitly), workflow templates, docs, wrap-up. The provider reads the environment at call time so a module-level default serves one cache across all batches. Rejected: splitting the provider per reviewer.

## Consequences

The build cannot start until this plan is reviewed and merged. Reviewer function signatures change (`apiKey` and `secret` become `auth`) and their existing tests are updated.
