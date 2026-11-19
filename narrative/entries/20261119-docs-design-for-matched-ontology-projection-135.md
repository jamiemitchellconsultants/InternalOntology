---
date: 2026-11-19
slug: docs-design-for-matched-ontology-projection-135
title: "docs: design for matched ontology projection (#135)"
summary: "The semantic reviewer now sends, by default, only the entries deterministically matched to the Markdown."
kind: product
status: accepted
sequence: 2026-11-19T15:36:53.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/136; merge commit 0fe6639ccea3c5fff58196a876fff5697ce7df1b"
---

## Context

Every semantic review request resent the whole ontology projection: 64,394 characters for JEPA-Speech's 202 entries. A growing ontology runs into the `RequestBudget` and is reported as `too-large`. Raising `ONTOLOGY_MAX_REQUEST_CHARS` only moves that limit, every resend costs time and tokens, and the model has to find the relevant rows among hundreds. All ten recorded findings were paraphrases, such as "AuditRecord" for an entity named differently, so matching exact names would have missed every one of them.

## Decision

The semantic reviewer now sends, by default, only the entries deterministically matched to the Markdown. An entry matches through its exact name, a banned alias, or the words of its name or enum values, and each match adds one hop of references. Every request also carries the name index of every entry, and `semanticReview.projection: "full"` restores today's request byte for byte.

The selection lives in a new `ontology-projection.mjs` that the worker injects into `reviewFiles`, so the graph naming reviewer is untouched ([ADR 0026](docs/adr/0026-matched-projection-as-an-injected-projector.md)). The matching rule and a fixed stop list of generic modelling words are in [ADR 0027](docs/adr/0027-deterministic-matching-rule-and-fixed-stop-list.md). The setting is validated for `semanticReview` only, and the per-file projection summary is an optional field in the run record, which stays at schema 1 ([ADR 0028](docs/adr/0028-projection-setting-and-run-record-summary.md)).

Rejected alternatives:
- matching exact names only, which found none of the ten;
- matching rare words only, which found four;
- relationship rows only for "related";
- a configurable stop list;
- embedding retrieval, which is deferred to a later feature.

## Consequences

Adopters get smaller requests after reinstalling with `--force`, but the saving is modest, mostly because of the one hop. A paraphrase that shares no name word with its entry is reviewed against the name index only. The pull request record now shows, for each reviewed file, what it was checked against. Setting `"full"` before updating the kit gives an invalid-config run. The stop list is fixed, so changing it needs a kit release. Embedding retrieval can later replace the projector without reshaping the reviewer.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
