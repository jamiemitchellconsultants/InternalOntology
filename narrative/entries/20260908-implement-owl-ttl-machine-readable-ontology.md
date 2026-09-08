---
date: 2026-09-08
slug: implement-owl-ttl-machine-readable-ontology
title: "Implement OWL/TTL machine-readable ontology"
summary: "Implemented the plan as written, with two corrections discovered during implementation where the plan contradicted itself: (1) `modelToTriples` emits `kit:invariant` triples inline with their concept's class triples rather than in a…"
kind: product
status: accepted
sequence: 2026-09-08T08:55:41.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/8; merge commit 75d8211432df7449f6082ad92eb36ef0d2dd76ed"
---

## Context

PR #6 merged the approved spec and implementation plan making `ontology.ttl` the authoritative ontology source with `ontology.md` generated from it. The kit was still Markdown-only: nothing machine-readable, and the `.md` hand-maintained. This PR is the implementation of that plan (all ten tasks), verified by `npm test` (243 pass) plus an end-to-end install-migrate-check run in a scratch repo.

## Decision

Implemented the plan as written, with two corrections discovered during implementation where the plan contradicted itself: (1) `modelToTriples` emits `kit:invariant` triples inline with their concept's class triples rather than in a trailing loop, because subject-grouped Turtle serialization otherwise breaks the specified `parse(serialize(x)) === x` round trip; (2) the plan's entity-triple test expectation was updated to include the invariant annotation the spec mandates on the same subject. Also registered the new `NAMESPACE_URI`/`ONTOLOGY_TTL_PATH` placeholders in `tests/templates.test.mjs` and refreshed README's installed-file list, which the plan left stale. Rejected alternative: weakening the round-trip tests to order-insensitive comparison — kept them exact and fixed the implementation instead.

## Consequences

Adopting repositories edit `ontology.ttl` and regenerate `ontology.md` via `node scripts/build-ontology.mjs`; CI fails on a stale `.md` before the term check runs. The shipped example `ontology.md` lost its section guidance prose (it cannot round-trip through TTL) — that material now lives only in the skill references. The `kit:` vocabulary is now a design commitment: widening it later breaks the parser/renderer pair. `ontology-setup` is a Claude Code skill, so generic agents use the new `docs/ai-agent-install.md` runbook instead.
