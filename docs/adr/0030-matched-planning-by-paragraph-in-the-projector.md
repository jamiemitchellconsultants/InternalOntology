# 0030 — Matched planning by paragraph, inside the projector

- **Status:** accepted
- **Date:** 2026-11-20
- **Feature:** #135 (docs/features/matched-ontology-projection/)
- **Amends:** ADR 0026 (the projector is also called once per file to plan chunks)
- **Amended by:** [ADR 0035](0035-matched-planner-budgets-whole-code-points.md) (piece sizing and the line too-large cause)

## Context

User acceptance of #135 found that planning a file against the projection of its whole text, B17 as first written, makes a broad file too-large in matched mode. A 3.4 KB file naming one entry from each of 60 contexts projected 330,898 of 331,071 characters, although each of its paragraphs projected about 74,500. The amended B17 plans by paragraph, then by line, then by pieces of a line, and checks each chunk against its own projection. The amended B18 names one of two too-large causes. In `full` mode, planning must stay as today (B21).

Packing calls for many projections per file. Today's projector rebuilds every entry's words and compiles a regular expression for every entry name on each call, which would be too slow for a large ontology.

## Decision

A projector becomes an object with:
- `mode`;
- `project(catalog, text)`, as today;
- in `matched` mode only, `plan(catalog, files, maxRequestChars)`, returning chunks and unreviewed entries in `chunkFiles`'s shape.

`reviewFiles` calls `plan` when the projector has one and `chunkFiles` otherwise, so the built-in full projector and `full` mode plan exactly as today. `ontology-projection.mjs` imports `REQUEST_OVERHEAD` from `semantic-review-model.mjs`; the model module still does not import the projection module.

The matched projector prepares an index once per catalog, cached by catalog identity. The index holds:
- each name word and enum value word, with the entries it selects;
- the entries' exact names;
- each entry's relationships.

`project` and `plan` use only the index.

`plan`:
1. Splits each file into paragraphs at blank lines, and selects for each paragraph once.
2. Forms chunks in file order. A chunk's selection is the union of its paragraphs' selections, plus any banned-alias phrase that matches across a paragraph break in the chunk's text. Paragraphs are added while the overhead, the projection size of that selection, the path and the text fit the budget. The size is computed from the selected rows, without rendering.
3. Divides a paragraph that does not fit on its own into lines, packed the same way.
4. Cuts a line whose text is too long for the room its own projection leaves at the last whitespace before the limit, or else at a character boundary, never inside a surrogate pair.

`reviewFiles` keeps its pre-send guard. It halves any chunk whose own projection outgrows the budget, so a cut that creates a new word can never send an oversized request.

`plan` returns `too-large` in two cases:
- **The name index does not fit.** The overhead, the path and the projection of an empty selection leave no room. The reason is "ontology name index too large for the configured budget (name index N characters, budget M; raise ONTOLOGY_MAX_REQUEST_CHARS)".
- **A line selects too much.** A line's own projection leaves no room for any of its text. The reason is "line at offset O selects too much of the ontology for the configured budget (projection N characters, budget M; raise ONTOLOGY_MAX_REQUEST_CHARS)".

The run's outcome and status descriptions are unchanged (B15).

## Consequences

A file whose paragraphs each fit is always reviewed, so the broad-file case becomes a few requests instead of too-large. A chunk's projection always equals `project` of the chunk's text, and the tests must assert this. The known minor, a file that fits in one chunk being projected twice, disappears, because `plan` is the only per-file pass.

Matched chunk boundaries differ from today's, so request counts can change, while every request still fits. Embedding retrieval (U13) can still be a projector: one without `plan` gets today's planner, and one with `plan` packs as it chooses.

## Alternatives considered

- **Pack in `semantic-review-model.mjs`:** the model module would need the selection rules, which ADR 0026 keeps out of it.
- **Re-project the whole candidate text for every paragraph added:** obviously correct, but quadratic in a chunk's length. The union, plus aliases that span a paragraph break, gives the same selection.
- **Plan against the largest paragraph's projection and let the guard halve:** a smaller change, but halves are cut at the midpoint rather than at paragraph breaks, and it costs many wasted projections on broad files.
- **A fixed chunk size:** predictable, but small files in small ontologies would send more requests than today for no gain.
