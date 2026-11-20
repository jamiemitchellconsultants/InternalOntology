---
date: 2026-11-20
slug: docs-plan-the-matched-projection-build-review-amendment-135
title: "Docs: plan the matched projection build-review amendment (#135)"
summary: "- Task 18 adds the pinned raw read, verifies strict decoding and numeric 404 behaviour, and exercises a valid source over 1 MiB through the collector and planner. JSON API operations and full-mode request bytes retain their existing tests."
kind: product
status: accepted
sequence: 2026-11-20T11:03:55.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/162; merge commit f0420c35a23c8d3dc96f1db387e8548b0d66b584"
---

## Context

The first build was green and retained all ten recorded findings. Task 17 exposed two remaining limitations. GitHub's inline Contents representation could make a large ontology unavailable before planning. An indivisible character could reach the model guard and lose B18's line-specific reason. The new architecture specifies raw Contents reads and complete piece budgeting in the matched planner. [Build pushback](https://github.com/jamiemitchellconsultants/InternalOntology/issues/135#issuecomment-7035269602)

## Decision

- Task 18 adds the pinned raw read, verifies strict decoding and numeric 404 behaviour, and exercises a valid source over 1 MiB through the collector and planner. JSON API operations and full-mode request bytes retain their existing tests. [ADR 0034](docs/adr/0034-semantic-review-reads-raw-ontology-contents.md)
- Tasks 19 and 20 cover reselecting a piece after a cut, handling the original line when a whole code point cannot fit, and rendering an empty grouped index without a sample key. The build keeps its existing pre-send and 413 checks. [ADRs 0035](docs/adr/0035-matched-planner-budgets-whole-code-points.md) and [0031](docs/adr/0031-relationships-only-and-grouped-name-index.md)
- Task 21 is the final build verification, measurement, recorded-finding replay and user handoff. The published Task 10–16 commits remain the starting point.

## Consequences

A disposable prototype verified the expected failures before each change and passed the unfiltered full suite after each change. It finished with 754 tests passing. The four shipped files passed individually on Node 20, 22 and 24, with 117 tests per runtime. The developer will repeat the checks on the build branch after this plan merges. The user phase still owns the installed acceptance run and the live model check in JEPA-Speech.
