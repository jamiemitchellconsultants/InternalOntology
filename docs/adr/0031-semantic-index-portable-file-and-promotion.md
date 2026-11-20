# 0031 — Use a versioned portable index file

- **Status:** accepted
- **Date:** 2026-11-20
- **Feature:** #143 (docs/features/semantic-repository-index/)

## Context

B4–B6 and B12 require a portable vector store with validity checks and preservation of the last complete local index when a write or transfer fails. The same artifact should work in different checkouts and operating systems without a vector database service.

## Decision

Use UTF-8 newline-delimited JSON with a versioned header, ordered passage records, and a footer carrying the record count and SHA-256 of the header and record bytes. Passage records carry the source path, blob identity, inclusive line range, passage position and a base64-encoded little-endian Float32 vector. Scope, embedding space, repository identity and indexed commit accompany the vectors. Source text, runtime endpoints, and credentials stay outside the data file. Persist one file per checkout and gzip that file for release. Parse and score as streams. Enforce a 128 KiB record ceiling and a 2 GiB expanded ceiling in v1, with an error before promotion if a bound is exceeded. The release layer applies the separate compressed asset limit.

Serialize writers with a checkout-level lock. Write a uniquely named temporary sibling, validate the complete file, flush it and atomically rename it over the active file. A lock contains enough owner information for the runbook to recover it after an interrupted process. Readers pin one open version of the file. Validate the local file before search invokes the model, then score the same open file after the query returns. For an import, validate data shape, digest and committed source references before using the same promotion path.

## Consequences

The portable format can be inspected and rebuilt, with bounded memory during transfer and search. Atomic promotion preserves complete state on either side of an interruption. Float32 limits raw vector bytes to four per dimension, with base64 and record overhead in the local file. Validation and exact scoring can require two passes. Measure that cost and track asset size in the pilot. An internal checksum detects corruption. It does not authenticate publishers or validate model provenance independently of repository access and the approved profile.

## Alternatives considered

- SQLite with a vector extension. It would require shipping and supporting a reader or extension across the adopting repositories' Node environments.
- An ordinary JSON object loaded at once. Large snapshots would allocate the full decoded index before validation or search.
- Uncoordinated sidecar metadata and vector files. A failed multi-file update could expose metadata and vectors from different revisions.
