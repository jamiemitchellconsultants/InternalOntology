---
date: 2026-11-19
slug: docs-implementation-plans-for-matched-ontology-projection-135
title: "docs: implementation plans for matched ontology projection (#135)"
summary: "- **Guard against over-budget chunks.** `reviewFiles` checks each request's size after projecting its chunk. A chunk that would exceed the `RequestBudget` is split before it is sent, exactly as on a 413."
kind: product
status: accepted
sequence: 2026-11-19T20:00:20.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/138; merge commit 3f805d76caacde8b418a15e358f9822132dc9189"
---

## Context

The design for #135 (PR #136, ADRs 0026–0028) settled what a matched `OntologyProjection` contains and how the reviewer uses it. The plan step had to turn that into tasks without re-deciding anything. Two things the design assumed did not hold exactly:
- **B17's subset claim.** The design assumed a chunk never selects more ontology than its whole file. A chunk cut inside an oversized line can create a word or a whole-name match the file lacks, so its own projection can be larger than the one the plan was budgeted against.
- **The default changes an existing test.** Making `matched` the default changes what an existing #111 acceptance test exercises. That test relied on the full projection of a 60 KB ontology not fitting 24,000 characters, but the name index alone fits.

## Decision

- **Guard against over-budget chunks.** `reviewFiles` checks each request's size after projecting its chunk. A chunk that would exceed the `RequestBudget` is split before it is sent, exactly as on a 413. At one character it is reported `too-large` with the budget reason. Nothing over budget is ever sent, and the projector interface stays as ADR 0026 defines it.
- **Pin the #111 test to `"full"`.** That test now sets `projection: "full"`, so it keeps proving the full projection's too-large path. The new acceptance test covers the matched one (a budget below the name index).
- **Keep the model module's tests independent of the projector.** `semantic-review-model.mjs` and its test use stub projectors and never import the projection module, because graph-naming-only installs copy them without it.
- **Reject `null` explicitly.** `semanticReview.projection` defaults only when the key is absent. An explicit `null` is rejected like any other value.

## Consequences

- The build can proceed from the detailed plan without design questions. A smaller model can run it task by task, because every test it needs is written out and has already been run.
- The guard adds one size check per request and changes nothing when a chunk's projection fits, which is every case in `full` mode.
- The #111 acceptance suite now names its mode explicitly. A later change to the default does not silently change what it tests.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
