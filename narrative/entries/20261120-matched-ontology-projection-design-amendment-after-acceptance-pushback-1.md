---
date: 2026-11-20
slug: matched-ontology-projection-design-amendment-after-acceptance-pushback-1
title: "Matched ontology projection: design amendment after acceptance pushback (#135)"
summary: "- **Plan by paragraph ([ADR 0030](docs/adr/0030-matched-planning-by-paragraph-in-the-projector.md)).** - The matched projector gains a `plan` step."
kind: product
status: accepted
sequence: 2026-11-20T07:36:36.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/150; merge commit 7c922ab1611052cfb8a6f9360f600c077b7ecca0"
---

## Context

User acceptance of #135 passed every behaviour as written, but showed that the matched `OntologyProjection` would not keep large ontologies inside the `RequestBudget`, which is the reason the feature exists. Measured with the shipped projector:
- **Broad files.** Planning a file against the projection of its whole text made a broad file too-large in matched mode, exactly as in full. In a 1,920-entry synthetic ontology, a 3.4 KB file naming one entry per context projected 330,898 of 331,071 characters, although each paragraph projected about 74,500. JEPA-Speech's graph README already projects 63% of its full projection, and six of the ten recorded findings came from it.
- **The one hop.** It accounted for most of each request on real ontologies: the median matched request was 79% of the full projection on JEPA-Speech, and 52% with relationships only.
- **The name index.** At about 30 characters per entry, it alone filled the 200,000-character default at about 6,700 entries.

Separately, `ontology.ttl` is the source of truth and `ontology.md` is generated from it, but the reviewer read only the generated file.

## Decision

- **Plan by paragraph ([ADR 0030](docs/adr/0030-matched-planning-by-paragraph-in-the-projector.md)).**
  - The matched projector gains a `plan` step. It indexes the catalog once, selects for each paragraph once, and packs paragraphs, then lines, then pieces of a line, while each request fits with its own projection.
  - `full` mode keeps today's planner, so it stays byte for byte.
  - The two too-large causes, the name index or a line that selects too much, get their own reasons.
  - Rejected: packing in the model module, re-projecting the whole candidate text for every paragraph, planning against the largest paragraph's projection, and a fixed chunk size.
- **Relationships only, and a grouped name index ([ADR 0031](docs/adr/0031-relationships-only-and-grouped-name-index.md)).**
  - A matched entry adds the relationships whose domain or range it is, and nothing else.
  - In matched mode the name index lists the names under each section, introduced by one explanatory sentence. The system prompt is unchanged.
  - Rejected: keeping the hop, adding far-end entries, no hop at all, keeping one key per line, and indexing only nearby entries.
- **Read the ontology source ([ADR 0029](docs/adr/0029-semantic-review-reads-the-ontology-source.md)).**
  - The reviewer reads `ontology.ttl` at the reviewed revision and renders it exactly as `build-ontology.mjs` does, so evidence keys, rows and finding identities are unchanged.
  - It falls back to `ontology.md` when the source is absent, as on a fresh install before its first build.
  - Rejected: selecting from the triples directly, and making the run unavailable without a `.ttl`.
- **Deferred with measurements:** limiting name words that many entries share, and matching alternative labels.

## Consequences

- **Broad files.** A file whose paragraphs each fit is always reviewed. Matched requests on JEPA-Speech should shrink from a median of 79% to about 52% of the full projection, and all ten recorded findings are kept.
- **Ontology ceiling.** The grouped index is 40% to 49% smaller, which lifts the ceiling at the default budget to about 10,000 to 11,500 entries. Above that, raising `ONTOLOGY_MAX_REQUEST_CHARS` remains the remedy.
- **Live check needed.** The model must now form `Section:Name` from the grouped index. `resolveEvidenceKey` tolerates a bare name, but acceptance must include a live model run.
- **Paraphrase caveat.** A paraphrase caught only through a neighbouring entry's rows is no longer caught. The runbook caveat must say so.
- **Fallback.** A repository whose `ontology.md` is stale is reviewed against its `ontology.ttl`. One without a `.ttl` keeps today's behaviour.
- **Later phases to regenerate:** the plan, the build, the runbook, and the acceptance tests (b1a2a41 on `feature/matched-ontology-projection/user`). Once this merges, run `node scripts/feature.mjs clear-pushback --feature 135 --phase analyst`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
