# 0012 — One shared `ModelAuthProvider` with a retrying fetch wrapper

- **Status:** accepted
- **Date:** 2026-11-18
- **Feature:** #92 (docs/features/oidc-token-provider-for-model-reviewers/)

## Context

The gateway accepts only short-lived Keycloak JWTs. The `DriftReviewer` reads a static key inside
`modelJson`; the `SemanticReviewWorker` passes a static string through `reviewFiles`. Both need the
same behaviour (B1 to B14), and installed scripts must stay byte-identical in every adopter.

## Decision

Add `templates/scripts/llm-auth.mjs`, a dependency-free module installed beside the reviewers. It
exports `createModelAuth({ env, staticKeyVar, fetchImpl, now })`, returning `{ mode, getBearer(),
invalidate() }`, and `authorizedFetch(auth, fetchImpl, url, init)`. `authorizedFetch` sets the
bearer, and on a 401 calls `invalidate()`, fetches a fresh token and repeats the request once (B3).
Both reviewers call `authorizedFetch`; `reviewFiles` takes an `auth` provider instead of `apiKey`.
The client secret is sent as an HTTP Basic header on a form-encoded `client_credentials` request.
The token is cached until 60 seconds before `expires_in`; concurrent callers share one in-flight
fetch; an unusable `expires_in` means no caching. Static key variable names stay per-reviewer,
passed in by the caller, so the module holds no reviewer-specific value.

## Consequences

One implementation and one test file cover both reviewers. The retry lives in one place, so neither
reviewer can forget it. `reviewFiles` and `runSemanticReview` change signature, so their tests are
updated. The installer must copy the new script with the reviewers.

## Alternatives considered

- Inline the logic in each reviewer: duplicates the cache and retry, and the two would drift.
- Fetch the token in the workflow and export it as the existing key variable: needs no script
  change, but the 300-second token could expire during a long semantic run and gives no 401 retry.
- Secret in the form body: it can end up in logs or proxies, so Basic auth was preferred.
