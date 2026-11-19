# 0028 — The projection setting and the run record summary

- **Status:** accepted
- **Date:** 2026-11-19
- **Feature:** #135 (docs/features/matched-ontology-projection/)

## Context

B20 to B22 add `semanticReview.projection`. `validateModelReview` in `ontology-config.mjs` is shared
by `semanticReview` and `sourceGraph.namingReview`, and rejects unknown keys. B10 and B15 add a
projection summary per reviewed file to the `SemanticReviewRun` record and the pull request record.
`readLatestRun` must keep reading records that earlier kit versions published.

## Decision

`validateModelReview` takes an option that lets the `semanticReview` call alone accept `projection`.
The parsed config always carries `semanticReview.projection`, set to `"matched"` when the key is
absent. Any value other than `"matched"` or `"full"` throws, naming the key and the value, and the
worker treats that like any other invalid trusted config. The `namingReview` call does not pass the
option, so the key stays unknown there.

`reviewFiles` returns a `projections` list with one entry per reviewed file:
- the path;
- the mode;
- the entries sent in full, counted once across all the file's chunks;
- the total number of entries;
- the largest projection's characters;
- the full projection's characters.

The worker copies the list into the run record as an optional field. The record stays `schema: 1`.
`renderRun` prints one line per reviewed file, and `statusFor` is unchanged.

## Consequences

A repository that sets `"full"` before updating the kit gets an invalid-config run, so the runbook
says to update first (B23). Earlier records without `projections` still parse, and their rendering is
unchanged. The record grows by a few dozen characters per reviewed file, which existing part
splitting already handles.

## Alternatives considered

- **A separate top-level config key:** it splits semantic review settings across two places.
- **Bump the record schema to 2:** `readLatestRun` would skip every earlier record, and an optional
  field already keeps compatibility.
- **Put the summary in the status description:** B15 keeps the status texts unchanged, and the
  140-character limit on descriptions cannot hold it per file.
