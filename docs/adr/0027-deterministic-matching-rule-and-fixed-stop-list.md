# 0027 — Deterministic matching rule, name index and fixed stop list

- **Status:** accepted; amended by ADR 0031 (relationships only, grouped name index)
- **Date:** 2026-11-19
- **Feature:** #135 (docs/features/matched-ontology-projection/)

## Context

B2 to B9, B11 and B13 to B14 define the selection. U11 left the stop list to the architect: it must
be fixed in the script, the same in every repository, and must not stop any of the recorded findings.
Selecting too much costs only request size, but selecting too little can silently lose a finding, so
the rule leans towards recall.

## Decision

The selection runs in two stages over the catalog's grouped rows.

1. **Base match.** An entry is selected when any of these holds for the Markdown text:
   - its exact name is a whole word, case-sensitive;
   - a `BannedAlias` phrase pointing to it appears as whole words, in any case;
   - one of its name words, or one of its enum value words, appears among the Markdown words,
     alone or with "s" or "es" added.
2. **One hop.** Each base entry adds every entry named in backticks in its rows, and every
   Relationships row whose From or To is that entry, with the entry at the other end. Entries added
   this way add nothing further.

A name of several sections selects every entry with that name. Name words are at least four letters
and not on this fixed stop list: `data`, `info`, `item`, `kind`, `list`, `name`, `type`, `value`,
`values`, `state`, `status`, `record`, `result`, `config`, `event`, `events`. The projection is
rendered in ontology order, with the section headings and rows of the selected entries, then the full
name index. The system prompt is not changed.

## Consequences

All ten recorded JEPA-Speech findings keep their cited entry. Measured with this rule and stop list
over each repository's tracked Markdown, the median request, name index included, is about 74% of the
full projection for JEPA-Speech, 78% for InternalOntology and 95% for EventBooking. Most of that comes
from the one hop, which the maintainer chose knowingly. Narrowing it later needs a change to B7. The
analyst's U2 figures (104 to 148 entries) also counted reverse references; B7 counts forward
references only. Changing the stop list changes every adopter's requests, so it needs a kit release
and the B11 fixtures to keep passing.

## Alternatives considered

- **No stop list:** most recall, but generic suffixes like "type" and "state" select large parts of
  most ontologies.
- **English filler words only:** the four-letter minimum already drops most of them, so it would
  change almost nothing.
- **Words shared by at most three entry names:** much smaller, but it kept the cited entry for only
  four of the ten recorded findings.
- **A configurable stop list:** per-repository tuning the vision does not ask for, and a setting that
  silently trades away recall.
