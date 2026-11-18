# OIDC token provider for model reviewers — task plan

**Goal:** both model-backed reviewers authenticate to the gateway with a short-lived Keycloak JWT,
with the static key as a fallback. Serves behaviours B1-B16 in
[feature.md](../../../features/oidc-token-provider-for-model-reviewers/feature.md).

**Architecture:** one dependency-free module `templates/scripts/llm-auth.mjs` (`createModelAuth`,
`authorizedFetch`), used by `modelJson` and `reviewFiles`/`runSemanticReview`; workflow templates
map the secret. See [ADR 0012](../../../adr/0012-shared-model-auth-provider.md) and
[ADR 0013](../../../adr/0013-reuse-keycloak-client-secret.md).

**Global constraints**

- Scripts stay byte-identical in every adopter; no repository-specific value in a script.
- Never log or include the client secret, the token, or the token endpoint body in any error.
- `max_tokens` and the reviewers' timeouts are untouched.
- Test first; each task ends in its own commit. Run the focused test, then
  `node scripts/check-ontology-terms.mjs`, then `npm test` before each commit.
- Bash does not change; no new dependencies.

| # | Task | Behaviours |
| --- | --- | --- |
| 1 | `llm-auth.mjs` and `llm-auth.test.mjs` | B1, B3, B5, B8-B14 |
| 2 | Use the provider in `modelJson` (drift reviewer) | B2, B4, B9 |
| 3 | Use the provider in `reviewFiles`, `runSemanticReview` and the worker | B2, B4, B9, B12 |
| 4 | Installer copies `llm-auth.mjs` and its test with each reviewer | B16 |
| 5 | Workflow templates (drift and semantic) | B6, B7 |
| 6 | Runbooks, README, how-it-works | B15 |
| 7 | Narrative label and sections, full `npm test`, PR | all |

Each task lists its files, interface and tests in the
[detailed plan](../../../detailed-implementations/oidc-token-provider-for-model-reviewers/plan.md).
