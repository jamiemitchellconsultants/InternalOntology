# 0035 — Matched planner budgets whole code points

- **Status:** accepted
- **Date:** 2026-11-20
- **Feature:** #135 (docs/features/matched-ontology-projection/)
- **Amends:** [ADR 0030](0030-matched-planning-by-paragraph-in-the-projector.md) (piece sizing and the line too-large cause)

## Context

The matched planner measures text in UTF-16 code units and keeps a surrogate pair together. The build review found a file containing a single emoji with one code unit of room. The planner returned the intact pair and the pre-send guard correctly sent zero requests, but the resulting reason lacked the line offset and ONTOLOGY_MAX_REQUEST_CHARS required by B18. A cut inside a word can also add a match, which makes the piece's projection larger than the line's projection.

## Decision

The matched projector owns the complete budget decision for every chunk it plans. Keep paragraph and line packing from ADR 0030. When cutting a line into pieces, prefer whitespace, keep each code point whole, and evaluate each piece using its own selected keys and projection size. If a piece exceeds the budget, subdivide it at code point boundaries and reselect until it fits or is indivisible. A whole surrogate pair may fit with its own projection even when the line's projection left room for one code unit.

If the line's projection leaves no capacity, or an indivisible piece still exceeds the budget with its own projection, report B18's line cause. Use the original line's offset and the projection size of the attempted line or indivisible piece, respectively. The reason names ONTOLOGY_MAX_REQUEST_CHARS. Discard all planned chunks for that file before handing any to `reviewFiles`. Keep the separate name-index cause for the initial file-level budget check.

The model module keeps its independent pre-send guard for every actual request and applies its current handling after an endpoint responds with HTTP 413 (B19). Only the matched planner makes the initial line diagnosis. Full-mode planning, the system prompt, and the run's status descriptions follow their existing contracts.

## Consequences

Every chunk returned by matched planning fits the budget with the projection of its own text. When a line cannot be sent intact or in pieces, the pull request record identifies the line before any part of that file reaches the model. Extra selection work is confined to pieces of lines that exceed their available room. The file-level plan remains deterministic and uses the existing per-catalog index.

## Alternatives considered

- **Let the model module diagnose the final failed split.** The initial line offset and the decision to discard all chunks belong to planning. Deferring the diagnosis can send earlier chunks of a file that the planner should have rejected.
- **Reject whenever a cut reaches a surrogate pair with one code unit of room.** The pair can select fewer rows than its line and fit with its own projection.
- **Count Unicode code points throughout the request.** This changes the meaning of the existing character budget and affects full mode and its callers.
