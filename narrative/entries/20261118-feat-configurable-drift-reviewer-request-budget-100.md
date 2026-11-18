---
date: 2026-11-18
slug: feat-configurable-drift-reviewer-request-budget-100
title: "feat: configurable drift reviewer request budget (#100)"
summary: "Default 200,000 characters, configurable by environment variable with strict validation ([ADR 0014](docs/adr/0014-configurable-request-budget.md)); an oversized ontology is a neutral skipped outcome with a comment, notice and exit 0 ([ADR…"
kind: product
status: accepted
sequence: 2026-11-18T11:33:48.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/105; merge commit 3ffaf3eb3dd314809206976dc45bcf06a7455062"
---

## Context

The fixed 24,000-character budget made the drift reviewer refuse to run for JEPA-Speech and Grooveloom, with an unexplained red job. Scripts must stay byte-identical, so adopters could not change it.

## Decision

Default 200,000 characters, configurable by environment variable with strict validation ([ADR 0014](docs/adr/0014-configurable-request-budget.md)); an oversized ontology is a neutral skipped outcome with a comment, notice and exit 0 ([ADR 0015](docs/adr/0015-skipped-outcome-for-oversized-ontology.md)). Rejected: config-file setting, notice without a comment, changing `max_tokens`.

## Consequences

Large-ontology adopters work after a reinstall; larger requests cost more and may need a longer timeout. Skipped runs leave a comment where clean runs stay silent. Splitting the projection stays out of scope. Live-gateway behaviour with large prompts is open until a consumer runs it.
