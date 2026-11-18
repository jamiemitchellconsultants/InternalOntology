---
date: 2026-11-18
slug: docs-design-configurable-semantic-reviewer-request-budget-111
title: "docs: design configurable semantic reviewer request budget (#111)"
summary: "Raise the default to 200,000 characters and make budget and timeout configurable with the #100 variables and validation, through one shared module ([ADR 0018](docs/adr/0018-shared-request-budget-module-and-timeout-default.md), which also…"
kind: product
status: accepted
sequence: 2026-11-18T12:23:03.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/112; merge commit e663fd6ab90c4fb98389369f2b333bac4b3a592b"
---

## Context

The semantic reviewer plans requests against a fixed 24,000-character budget, so for ontologies as large as JEPA-Speech's (58,094 characters) or Grooveloom's (73,517) it never calls the model and publishes a success status reading "service or configuration unavailable", which blames the wrong thing and says nothing about the size. Feature #100 fixed only the advisory drift reviewer.

## Decision

Raise the default to 200,000 characters and make budget and timeout configurable with the #100 variables and validation, through one shared module ([ADR 0018](docs/adr/0018-shared-request-budget-module-and-timeout-default.md), which also raises the semantic request timeout default from 30,000 ms to 300,000 ms). A too-large ontology becomes its own non-blocking outcome ([ADR 0016](docs/adr/0016-too-large-ontology-outcome.md)). A junk setting publishes an explained unavailable run and then fails the job ([ADR 0017](docs/adr/0017-invalid-budget-setting-status.md)). Rejected: a failing status, a semantic-only variable name, keeping the 30,000 ms timeout.

## Consequences

Large-ontology adopters can review after a reinstall with `--force`. A hung model call can now hold a semantic request for up to five minutes. The 300,000 ms figure and the 200,000 default are unmeasured for the semantic reviewer on the live gateway. Splitting the projection and capping semantic output stay out of scope.
