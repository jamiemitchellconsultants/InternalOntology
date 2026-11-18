---
date: 2026-11-18
slug: docs-plan-configurable-semantic-reviewer-request-budget-111
title: "docs: plan configurable semantic reviewer request budget (#111)"
summary: "Eight tasks ordered so every commit leaves the suite green: the shared settings module with its installer entries first (a script must never import a file the installer does not copy, the mistake that left an earlier commit red in #92)…"
kind: product
status: accepted
sequence: 2026-11-18T12:25:16.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/114; merge commit 36e6f7408108dcac99c8c067dc94d7c83fa75b99"
---

## Context

The design is merged, including the decision that a too-large ontology is a distinct non-blocking outcome. The plan turns it into reviewable tasks before any code exists.

## Decision

Eight tasks ordered so every commit leaves the suite green: the shared settings module with its installer entries first (a script must never import a file the installer does not copy, the mistake that left an earlier commit red in #92), then the ledger (it must know `too-large` before the worker can publish it), the model module, the worker, workflow, docs, a large-ontology acceptance test shown failing on the old code, and wrap-up including a Node 20, 22 and 24 Docker run. The plan reminds the builder to check `npm test`'s exit status and to keep simulated hangs on a ref'd timer. Rejected: one large commit, and putting the installer change last.

## Consequences

The build cannot start until this plan is reviewed and merged. Existing drift tests keep working through the re-exports. The semantic request timeout default change from 30,000 ms to 300,000 ms is carried into the docs and the per-consumer notes.
