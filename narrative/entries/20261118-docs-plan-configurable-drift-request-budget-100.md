---
date: 2026-11-18
slug: docs-plan-configurable-drift-request-budget-100
title: "docs: plan configurable drift request budget (#100)"
summary: "Seven tasks in an order that keeps every commit green: setting parser and default, typed budget error, timeout and skip path in `main`, workflow variables, docs, a large-ontology acceptance test run first against the old code to prove it…"
kind: product
status: accepted
sequence: 2026-11-18T11:19:42.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/103; merge commit fdfc3e61a9cfe285e12044514ce1f54c985307c0"
---

## Context

The design is merged; the plan turns it into reviewable, test-first tasks before any code exists.

## Decision

Seven tasks in an order that keeps every commit green: setting parser and default, typed budget error, timeout and skip path in `main`, workflow variables, docs, a large-ontology acceptance test run first against the old code to prove it reproduces the gap, then wrap-up. The plan also tells the builder to check `npm test`'s exit status explicitly. Rejected: one large commit, and testing `main` only through unit tests.

## Consequences

The build cannot start until this plan is reviewed and merged. The existing assertions for the old error messages are preserved by keeping the message prefixes.
