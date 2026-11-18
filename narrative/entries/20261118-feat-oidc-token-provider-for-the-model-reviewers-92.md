---
date: 2026-11-18
slug: feat-oidc-token-provider-for-the-model-reviewers-92
title: "feat: OIDC token provider for the model reviewers (#92)"
summary: "One shared `ModelAuthProvider` used by both reviewers, with retry-once on 401 and static-key fallback ([ADR 0012](docs/adr/0012-shared-model-auth-provider.md)); workflows map the existing `KEYCLOAK_CLIENT_SECRET` so consumers re-set…"
kind: product
status: accepted
sequence: 2026-11-18T09:56:50.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/97; merge commit 88b604ad023850151268da6f31f5d787f87976e2"
---

## Context

The home lab gateway is now public and accepts only short-lived Keycloak JWTs, so the reviewers' static bearer key no longer works there. Installed scripts must stay byte-identical across adopters, so the change belongs in the kit templates. Design and plan were reviewed in PRs #93 and #95.

## Decision

One shared `ModelAuthProvider` used by both reviewers, with retry-once on 401 and static-key fallback ([ADR 0012](docs/adr/0012-shared-model-auth-provider.md)); workflows map the existing `KEYCLOAK_CLIENT_SECRET` so consumers re-set nothing ([ADR 0013](docs/adr/0013-reuse-keycloak-client-secret.md)). Rejected: duplicating the logic per reviewer, pre-fetching the token in the workflow, renaming the secret. The Narrative fragment is left to the post-merge automation, as for earlier PRs.

## Consequences

Static-key adopters keep working; OIDC wins when both are set. Consumers must reinstall with `--force`, set variables and, for semantic review, add the secret to its environment. Function signatures of `reviewFiles` and `runSemanticReview` changed (`auth` replaces `apiKey` and `secret`). Token-type checks, JWT validation and other grants stay out of scope. Live-gateway behaviour is open until a consumer runs it.
