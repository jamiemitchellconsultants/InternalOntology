---
date: 2026-11-18
slug: docs-design-oidc-token-provider-for-model-reviewers-92
title: "docs: design OIDC token provider for model reviewers (#92)"
summary: "Add one shared `ModelAuthProvider` (client-credentials token, Basic auth, cache until 60s before expiry, one retry on 401, static-key fallback, partial config rejected) used by both reviewers ([ADR…"
kind: product
status: accepted
sequence: 2026-11-18T09:26:04.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/93; merge commit 6542d2f3086e4889dd017f6e1e1b7ee6a15aae25"
---

## Context

The home lab gateway is public at https://gateway.tqaentry.com/v1 and accepts only short-lived Keycloak JWTs, so the model-backed reviewers' static bearer key no longer works there. Installed scripts must stay byte-identical across adopters, so the change has to live in the kit templates.

## Decision

Add one shared `ModelAuthProvider` (client-credentials token, Basic auth, cache until 60s before expiry, one retry on 401, static-key fallback, partial config rejected) used by both reviewers ([ADR 0012](docs/adr/0012-shared-model-auth-provider.md)). Workflows map the existing `KEYCLOAK_CLIENT_SECRET` to `ONTOLOGY_OIDC_CLIENT_SECRET` so consumers re-set nothing ([ADR 0013](docs/adr/0013-reuse-keycloak-client-secret.md)). Rejected: duplicating logic per reviewer, pre-fetching the token in the workflow, renaming the secret.

## Consequences

Static-key adopters keep working. The semantic reviewer needs the secret added to its `ontology-semantic-review` environment in each consumer. Reviewer function signatures change. Token_type checks, JWT validation and other grants stay out of scope.
