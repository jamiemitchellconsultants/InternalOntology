# 0029 — Semantic review reads the ontology source, falling back to Markdown

- **Status:** accepted
- **Date:** 2026-11-20
- **Feature:** #135 (docs/features/matched-ontology-projection/)

## Context

U15 and B25, added when user acceptance pushed back on #135, make `ontology.ttl` the ontology the semantic reviewer selects from. `ontology.ttl` is the source of truth, and `ontology.md` is generated from it. Evidence keys, rows, the full projection and finding identity must not change (B25, B12, B21).

`collectReviewInput` in `semantic-review-github.mjs` reads `ontology.md` through the contents API at the reviewed revision. `build-ontology.mjs` already writes `ontology.md` as `renderOntologyMarkdown(triplesToModel(parseTurtle(ttl)))`, using functions from `owl-ontology.mjs`, which every installation has. A fresh installation has only `ontology.md` until `build-ontology.mjs` is run, because the installer only prints that as its next step.

## Decision

`collectReviewInput` first reads the ontology source at the reviewed revision, at the path `ttlPathFor(config.ontologyPath)`. It parses the source with `parseTurtle` and `triplesToModel`, renders it with `renderOntologyMarkdown`, and returns that text as `ontologyText`. Everything downstream, from `catalogOntology` on, is unchanged.

When the source is absent at that revision (HTTP 404), it reads `ontology.md` as today. When the source exists but cannot be read or parsed, the run is handled exactly as an unreadable proposed ontology is today: the run is unavailable with the fixed reason "PR files or proposed ontology could not be read".

`ttlPathFor` moves from `build-ontology.mjs` to `owl-ontology.mjs`, and `build-ontology.mjs` re-exports it. The reviewer then imports no module with a command-line entry point.

The drift reviewer and graph naming keep reading `ontology.md`. They are out of scope (U14).

## Consequences

When `ontology.md` is current, B25 holds by construction: the reviewer renders exactly the text `build-ontology.mjs` writes. When it is stale, the reviewer follows the source of truth, and the existing `build-ontology.mjs --check` in CI reports the stale Markdown. Relationships reach the projector as rows rendered from `rdfs:domain` and `rdfs:range`, so their From and To are typed data, not hand-written cells.

Each run makes one more contents request; when the source exists, it replaces the Markdown request. A repository that never builds its source keeps today's behaviour. The runbook must say which file the reviewer reads.

## Alternatives considered

- **Select directly from the triples, without rendering:** the projector would need a second representation of entries and rows, kept in step with `catalogOntology` to satisfy B25. Rendering reuses the one path that already defines `ontology.md`.
- **Make the run unavailable when the source is missing:** strict, but a fresh installation's first semantic review would then fail until someone runs `build-ontology.mjs`. The maintainer chose the fallback.
- **Keep reading `ontology.md` only:** B25 would hold trivially, but the reviewer would depend on a generated file being current, against U15.
