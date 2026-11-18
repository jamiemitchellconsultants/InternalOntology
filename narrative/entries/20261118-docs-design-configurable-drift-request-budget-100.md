---
date: 2026-11-18
slug: docs-design-configurable-drift-request-budget-100
title: "docs: design configurable drift request budget (#100)"
summary: "Raise the default to 200,000 characters (about 50,000 to 67,000 tokens, at most half of a 131,072-token window), make the budget and the model timeout environment settings fed from repository variables with strict validation ([ADR…"
kind: product
status: accepted
sequence: 2026-11-18T11:18:06.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/101; merge commit 159de41dea75d98c445fdef1abbf1bc8ced9a559"
---

## Context

The drift reviewer's fixed 24,000-character budget makes it refuse to run for repositories with larger ontologies (JEPA-Speech, Grooveloom), failing with an unexplained red job. Scripts must stay byte-identical, so adopters cannot change the cap.

## Decision

Raise the default to 200,000 characters (about 50,000 to 67,000 tokens, at most half of a 131,072-token window), make the budget and the model timeout environment settings fed from repository variables with strict validation ([ADR 0014](docs/adr/0014-configurable-request-budget.md)), and turn an oversized ontology into a neutral skipped outcome: marker comment, notice, exit 0 ([ADR 0015](docs/adr/0015-skipped-outcome-for-oversized-ontology.md)). The 413 split stays the fallback. Rejected: config-file setting, deriving from a context-window setting, notice without a comment.

## Consequences

Large-ontology adopters work after a reinstall; larger requests cost more and the 300,000 ms timeout is unmeasured for them, so it is configurable and documented. Skipped runs leave a comment where clean runs stay silent. Splitting the ontology projection and changing `max_tokens` stay out of scope.
