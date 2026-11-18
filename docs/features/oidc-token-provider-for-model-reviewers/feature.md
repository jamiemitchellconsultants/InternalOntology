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
