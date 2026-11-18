# OIDC token provider for model reviewers

## Product owner: vision

### Problem

The Ontology Kit's model-backed reviewers (drift review and semantic review) authenticate to the
model gateway with a static bearer key held as a repository secret. The home lab gateway is now
public at `https://gateway.tqaentry.com/v1` and rejects the static master key on that name: it
accepts only short-lived Keycloak-issued JWTs. Consumer repositories' GitHub Actions therefore
cannot run the reviewers against it. Because installed scripts must stay byte-identical in every
adopting repository, the fix has to ship in the kit's templates, not in any one consumer.

### Users

- Maintainers of repositories that adopt the kit and run the reviewers in GitHub Actions
  (JEPA-Speech first; DiveVolkTelemetry, Grooveloom, EventBooking and BrightFlagCFS later).
- The home lab operator, who issues the Keycloak client and wants no long-lived model credential
  sitting in consumer repositories.
- Existing adopters on a static key, who must not be broken.

### Outcomes and measures

1. A consumer workflow reaches the gateway with a short-lived JWT. Measure: a run against the live
   gateway returns a model response (not verified in the kit's own pull request).
2. No long-lived gateway credential is needed in consumer repositories. Measure: only the Keycloak
   client secret and public vars are configured.
3. Existing static-key adopters keep working unchanged. Measure: the existing tests pass untouched
   in behaviour, plus a fallback test.
4. Credentials never leak. Measure: tests assert the secret, token and token-endpoint body appear
   in no error text or log.
5. Rollout per consumer is mechanical. Measure: reinstall with `--force`, set vars, enable the
   reviewer in config; no script edits.

### Scope

- A shared async bearer provider used by both reviewers: client-credentials token fetch, caching
  until shortly before expiry, one re-fetch on a 401, fallback to the static key variables, a clear
  error for partial configuration.
- Both workflow templates pass the OIDC variables and secret; the static key becomes optional; the
  configuration check accepts either auth mode.
- Runbooks, README and how-it-works updated with the real gateway values.
- A Narrative entry and the pull request with its sections.

### Out of scope

- Editing any consumer repository (follow-ups are listed in the pull request).
- Changes to Keycloak, LiteLLM or the gateway.
- Other grant types, token introspection or JWT validation on the client.
- Changing model choice, prompts or reviewer behaviour beyond authentication.

### Research

None commissioned: the gateway, issuer, audience, client and model facts come from the home lab
owner's brief and are unverified from this repository.

## Analyst: behaviours

Terms are the ontology names added in this phase: `ModelAuthProvider`, `OidcClientConfig`,
`AuthMode`. The OIDC variables are `ONTOLOGY_OIDC_TOKEN_URL`, `ONTOLOGY_OIDC_CLIENT_ID` and
`ONTOLOGY_OIDC_CLIENT_SECRET`; the static variables are `ONTOLOGY_LLM_API_KEY` (drift review) and
`ONTOLOGY_SEMANTIC_LLM_API_KEY` (semantic review).

### Outcome 1: reviewers reach the gateway with a short-lived JWT

- **B1 Token fetch.** Given all three OIDC variables are set and no token is cached, when a reviewer
  asks the `ModelAuthProvider` for a bearer, then it POSTs a form-encoded
  `grant_type=client_credentials` request to the token URL, authenticating with the client id and
  secret via HTTP Basic, and returns the `access_token`.
- **B2 Token used.** Given a token was obtained, when the reviewer calls the model endpoint, then
  the request carries `Authorization: Bearer <token>`.
- **B3 401 retry once.** Given a cached token, when the model endpoint answers 401, then the
  provider discards the cached token, fetches a new one and the reviewer repeats the request once;
  a second 401 is reported as an ordinary model failure with no further retry.
- **B4 Both reviewers.** Given the `DriftReviewer` or the `SemanticReviewWorker` runs with the OIDC
  variables set, when it calls the model, then B1 to B3 apply to it identically.

### Outcome 2: no long-lived gateway credential in consumers

- **B5 OIDC only.** Given only the OIDC variables are set (no static key), when a reviewer runs,
  then it completes authentication without any static key being read or required.
- **B6 Workflows.** Given an installed workflow template, when it runs, then it passes the OIDC
  vars and the client secret as `ONTOLOGY_OIDC_*` environment variables, treats the static key as
  optional, and its configuration check passes when either `AuthMode` is complete and fails,
  naming what is missing, when neither is. The semantic secret stays in the
  `ontology-semantic-review` environment.
- **B7 Existing secret reused.** Given a consumer already holds `KEYCLOAK_CLIENT_SECRET`, when the
  workflow runs, then it maps that secret to `ONTOLOGY_OIDC_CLIENT_SECRET`, so no consumer re-sets
  it.

### Outcome 3: existing static-key adopters keep working

- **B8 Static fallback.** Given none of the OIDC variables is set and the static key variable is
  set, when a reviewer asks for a bearer, then it returns the static key and makes no token
  request.
- **B9 No credentials.** Given neither mode is configured, when the `DriftReviewer` asks for a
  bearer, then it returns none and sends no `Authorization` header, as today; the
  `SemanticReviewWorker` keeps its existing requirement for its secret.
- **B10 Precedence.** Given both OIDC and a static key are set, when a reviewer asks for a bearer,
  then OIDC is used.

### Outcome 4: credentials never leak

- **B11 Partial config.** Given one or two of the three OIDC variables are set, when a reviewer asks
  for a bearer, then it fails before any network call with an error naming the missing variable
  names, never their values, and does not fall back to the static key.
- **B12 Token endpoint failure.** Given the token endpoint answers a non-2xx status, or a 2xx
  without a usable `access_token`, when a bearer is requested, then it fails with an error holding
  the HTTP status only; the response body is never included.
- **B13 No leakage.** Given any failure path, when the error text is produced or logged, then it
  contains neither the client secret, the token, nor the token endpoint's response body.

### Outcome 5: mechanical rollout

- **B14 Caching.** Given a token with `expires_in` N seconds, when a bearer is requested again
  while more than 60 seconds of validity remain, then the cached token is returned with no new
  request; once 60 seconds or fewer remain, a new token is fetched. Concurrent requests share one
  in-flight fetch.
- **B15 Docs.** Given the runbooks, README and how-it-works, when an adopter reads them, then they
  state the gateway values (`https://gateway.tqaentry.com/v1`, model `ontology-review`, the Keycloak
  token URL, client `litellm-ci`), the secret mapping, and the per-consumer steps.
- **B16 Byte-identical scripts.** Given the change, then no repository-specific value appears in any
  script; all variation is in `OntologyConfig`, repository vars and secrets.

### Uncertainties

| # | Question | Decision |
| --- | --- | --- |
| U1 | Secret in body or Basic auth? | Basic auth, so the secret is never in a form body that could be logged. |
| U2 | Partial OIDC config: fall back or fail? | Fail clearly (B11); silent fallback would hide a misconfiguration. |
| U3 | Both modes set? | OIDC wins (B10). |
| U4 | How many 401 retries? | Exactly one (B3). |
| U5 | Token endpoint failure handling? | Status only, no body, no retry loop (B12). |
| U6 | Missing or invalid `expires_in`? | Do not cache; fetch each time. |
| U7 | Is `max_tokens` affected? | No; unchanged. The reasoning model needs it generous, so this feature leaves it alone. |
| U8 | Rename the secret or map the existing one? | Map `KEYCLOAK_CLIENT_SECRET` (B7); architect to record as an ADR. |
| U9 | Check `token_type`, validate the JWT, other grants? | Deferred as out of scope. |
| U10 | Does it work against the live gateway? | Cannot be decided here; unverified until a consumer runs it. |
