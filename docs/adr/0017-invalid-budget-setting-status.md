# 0017 — An invalid budget setting publishes an explained unavailable run, then fails the job

- **Status:** accepted (for review on the design pull request)
- **Date:** 2026-11-18
- **Feature:** #111 (docs/features/semantic-request-budget/)

## Context

Open question OQ2. A junk `ONTOLOGY_MAX_REQUEST_CHARS` or `ONTOLOGY_MODEL_TIMEOUT_MS` should fail
before any model call, as in the drift reviewer. In the semantic flow a thrown error in the review job
publishes nothing; the finalize job then finds no run for that trigger and re-runs the review with an
empty environment, which records "semantic model credential is unavailable". The pull request would
therefore carry a status that names the wrong cause, hiding the typo.

## Decision

`runSemanticReview` resolves the budget first. On a malformed setting it records the run as
`unavailable` with a reason that names the variable and the offending value, publishes it through the
normal path (so the status and the pull request record say the configuration is invalid and why), and
then rethrows, so the review job is red. The finalize job sees a run for its trigger and only
reconciles the status. The status description for `unavailable` ("service or configuration
unavailable") is accurate for this cause.

## Consequences

A typo is visible on the pull request and in the job result, and does not block merging, consistent
with ADR 0002. The review step publishes before throwing, which the unit tests must cover. Failing the
job (rather than only publishing) keeps a configuration error noisy for the maintainer.

## Alternatives considered

- Throw without publishing: leaves the misleading credential message described above.
- Publish and return normally: the job stays green and the typo is easy to miss.
- Fall back to the default on junk: hides the error, rejected in #100 for the same reason.
