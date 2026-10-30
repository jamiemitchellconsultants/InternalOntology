# 0001 — Isolate model review in a trusted follow-up workflow

- **Status:** accepted
- **Date:** 2026-10-30
- **Feature:** #14 (docs/features/semantic-ontology-matching/)

## Context

The reviewer needs a model credential and write access to the PR, but it must assess author-supplied
Markdown and a proposed `Ontology`. The current advisory `DriftReviewer` runs from a PR checkout.
That boundary is unsuitable for a secret-bearing blocking reviewer. `OntologyConfig` in a PR or
an unprotected target branch is also author-supplied.

## Decision

Use a minimal, unprivileged `pull_request` `SemanticReviewTrigger` with no path filter and a
secret-bearing `workflow_run` `SemanticReviewWorker` from the default branch. The worker runs only
trusted kit code and treats PR files, the proposed `Ontology`, and model output as data. It reads
model and endpoint settings from the default branch's `OntologyConfig` and the credential from a
default-branch-only GitHub Actions environment secret. The worker references that environment
without creating a deployment. It verifies that the PR comes from the same repository and that
the author has current write, maintain, or admin access before invoking the model. Fork PRs get an out-of-scope
notice without model access after their trigger runs. No artifact or executable file crosses from
the trigger into the worker.

## Consequences

The workflow has an extra hop and must resolve the live PR and SHA through GitHub APIs. The
reviewer's code and model settings cannot be redirected by an unmerged PR change. The repository
still controls who may push branches and which other workflows may access repository secrets;
this design does not grant PR authors a model-setting override. The protected environment prevents
PR-ref workflows from receiving this credential. Some private-repository plans do not support
environment secrets; those adopters leave semantic review disabled until the boundary is
available. The kit must ship and test both workflows and document the setup.

## Alternatives considered

- Run the reviewer directly on `pull_request` with repository secrets: simpler, but the workflow
  and checkout can come from the PR, putting the credential in the author's execution context.
- Use `pull_request_target`: one workflow, but it requires careful separation of base code from
  PR data and may need an explicit Actions policy allowance in public repositories.
- Build a GitHub App: clear identity and richer checks, but adds app installation, key rotation,
  and hosting to an otherwise dependency-free kit.

GitHub documents the [trusted follow-up workflow](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)
and [environment branch restrictions](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments#deployment-branches-and-tags).
