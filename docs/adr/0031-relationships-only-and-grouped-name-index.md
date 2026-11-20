# 0031 — Relationships of matched entries, and a grouped name index

- **Status:** accepted
- **Date:** 2026-11-20
- **Feature:** #135 (docs/features/matched-ontology-projection/)
- **Amends:** ADR 0027 (stage 2, the one hop, and the rendering of the name index)

## Context

The amended B7 replaces the one hop with the relationships whose domain or range is a matched entry. It adds no far-end entries and no names mentioned in descriptions. B24 groups the name index by section in `matched` mode. U2 records the measurements: the median matched request was 79% of the full projection on JEPA-Speech with the hop and 52% with relationships only, and all ten recorded findings were kept.

The name index cost about 30 characters per entry, which filled the 200,000-character default at about 6,700 entries. The system prompt must not change, because the vision puts changing it out of scope and B21 requires `full` to stay byte for byte. Today's prompt says a key is copied from the Evidence keys list. `resolveEvidenceKey` already accepts a bare name, or a section prefix in any case, whenever the name identifies one entry.

## Decision

`catalogOntology` gains one more additive field, `relationships`. It holds one item per Relationships row, in ontology order, with the row's evidence key, its From name and its To name. Under ADR 0029, both names are rendered from `rdfs:domain` and `rdfs:range`.

Stage 2 of ADR 0027 becomes: for each base entry, select the evidence key of every relationship whose From or To is that entry's name. Every row of that key travels with it (B8). Nothing else is added. Stage 1 and the stop list are unchanged.

In `matched` mode the projection ends with the grouped name index:

```text
## Evidence keys

Each key is a section name, a colon, and one name listed under it, for example Entities:AuditEvent.

Entities: AuditEvent, StudySession, SessionRemoval
Enums: RemovalReason, SessionRemovalState
```

The example key in the sentence is the ontology's first evidence key. Sections and names follow ontology order. `full` mode keeps today's list, one key per line.

## Consequences

Measured with the shipped catalog, the grouped index is 40% to 49% smaller: about 17 to 20 characters per entry, against about 30. The ceiling at the default budget rises from about 6,700 entries to about 10,000 to 11,500. The model must form `Section:Name` itself. `resolveEvidenceKey` tolerates a bare or differently cased prefix, but only a live model run can show that findings still cite keys reliably, so user acceptance must include one.

A paraphrase caught today only because a neighbouring entry's rows were sent is no longer caught that way. The runbook's paraphrase caveat must say so.

## Alternatives considered

- **Keep the one hop:** most context, but it accounts for most of the request on real ontologies (79% against 52% on JEPA-Speech).
- **Relationships with their far-end entries:** wider context at a cost between those figures. The maintainer chose relationships only.
- **No hop:** almost the same size as relationships only (52%), but it loses relationship evidence when the domain entry is not named.
- **Keep one key per line and document the ceiling:** no risk to citations, but large adopters would have to raise the budget at about 6,700 entries.
- **Index only the entries near the selection:** no ceiling, but a finding could no longer cite any entry, which reverses U4 and B14.
