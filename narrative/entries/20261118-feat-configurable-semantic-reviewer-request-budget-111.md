---
date: 2026-11-18
slug: feat-configurable-semantic-reviewer-request-budget-111
title: "feat: configurable semantic reviewer request budget (#111)"
summary: "One shared settings module with the #100 defaults and conventions ([ADR 0018](docs/adr/0018-shared-request-budget-module-and-timeout-default.md)); a distinct non-blocking `too-large` outcome rather than a failing status or a re-worded…"
kind: product
status: accepted
sequence: 2026-11-18T12:38:51.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/116; merge commit de4596b9b9b54202c955102e9263465c890cd601"
---

## Context

The semantic reviewer kept a fixed 24,000-character budget, so for ontologies as large as JEPA-Speech's and Grooveloom's it never called the model and published a success status blaming the service or configuration. Feature #100 had fixed only the advisory drift reviewer.

## Decision

One shared settings module with the #100 defaults and conventions ([ADR 0018](docs/adr/0018-shared-request-budget-module-and-timeout-default.md)); a distinct non-blocking `too-large` outcome rather than a failing status or a re-worded outage ([ADR 0016](docs/adr/0016-too-large-ontology-outcome.md)); an invalid setting is published with its cause, then fails the job ([ADR 0017](docs/adr/0017-invalid-budget-setting-status.md)). Rejected: a failing status (contradicts ADR 0002), semantic-only variable names, keeping the 30,000 ms timeout.

## Consequences

Large-ontology adopters can run the semantic pilot after a reinstall with `--force`. A hung semantic model call can now hold a request for up to five minutes. A too-large ontology passes the status with a clear message instead of blocking; a repository that wants a hard stop must add its own check. Splitting the projection and capping semantic output stay out of scope.
