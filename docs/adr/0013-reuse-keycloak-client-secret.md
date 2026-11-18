# 0013 — Workflows map the existing `KEYCLOAK_CLIENT_SECRET`

- **Status:** accepted
- **Date:** 2026-11-18
- **Feature:** #92 (docs/features/oidc-token-provider-for-model-reviewers/)

## Context

The `litellm-ci` client secret is already stored in consumer repositories as
`KEYCLOAK_CLIENT_SECRET` (JEPA-Speech now, others later). The scripts read
`ONTOLOGY_OIDC_CLIENT_SECRET` from the environment. B7 requires no consumer re-set.

## Decision

The workflow templates read `secrets.KEYCLOAK_CLIENT_SECRET` and map it to the
`ONTOLOGY_OIDC_CLIENT_SECRET` environment variable. The token URL and client id come from repository
variables `ONTOLOGY_OIDC_TOKEN_URL` and `ONTOLOGY_OIDC_CLIENT_ID`. The semantic reviewer reads the
secret from the existing `ontology-semantic-review` environment, so the secret must exist there as
well as, or instead of, at repository level. The static key secrets become optional.

## Consequences

No consumer needs to re-set a secret for the repository-level drift reviewer. The semantic reviewer
needs the same secret added to its environment once, which is a consumer follow-up. The workflow
names a secret that is not ontology-specific; the runbooks must say so.

## Alternatives considered

- Rename to `ONTOLOGY_OIDC_CLIENT_SECRET` in every consumer: cleaner naming but forces a re-set in
  five repositories and a coordinated rollout.
- Accept both names inside the script: puts a repository-specific secret name in a byte-identical
  script, which AGENTS.md forbids.
