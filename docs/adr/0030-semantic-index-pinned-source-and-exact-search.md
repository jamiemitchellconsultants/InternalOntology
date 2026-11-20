# 0030 — Index a committed tree and search it locally

- **Status:** accepted
- **Date:** 2026-11-20
- **Feature:** #143 (docs/features/semantic-repository-index/)

## Context

B1, B3 and B9–B12 require valid line references, useful ranked retrieval, and refresh that reuses
unchanged content. B15 restricts input to approved tracked text. The owner confirmed that local
commits are eligible and that uncommitted edits are outside the first release.

## Decision

Capture `HEAD` once per refresh and enumerate its Git tree. Extend the existing revision helper
to preserve entry modes and support bounded, non-caching blob reads, keeping its graph caller
contract. Select regular blobs by exact repository-relative path or directory prefix ending in `/`,
with exclusions taking precedence. Accept valid UTF-8 text without NUL. Read bytes from Git so
checkout filters and working-tree edits cannot alter the indexed source locations. Check staged and
unstaged changes separately for the notice on status and results.

Use a versioned line-window chunker for code, tests, and docs. Start with a 2,048 UTF-8 byte limit
and up to eight preceding lines of overlap within that limit. Each new window consumes new source,
and an oversized line is split at UTF-8 character boundaries. Preserve its line number and use
passage position to break ties between windows. For a compatible index, key whole-file reuse by
path, Git blob identity, and recipe version. Emit records for the currently approved Git tree.
Search streams an exact cosine scan over compatible normalized vectors and keeps the best `k`
matches, breaking ties by repository-relative path, line range, and passage position.

## Consequences

The same source and recipe yield stable chunk locations for citations and a repeatable refresh
comparison. Renames and deletions lose their old paths. A rename that changes the path may need
re-embedding, and the pilot will capture that cost. Whole-file reuse avoids embedding unchanged
files. A linear scan costs work proportional to the index size. Measure search and refresh before
choosing an approximate index or changing the chunk recipe.

## Alternatives considered

- Parse each language's syntax tree for chunking. This adds parser dependencies and language-specific failure modes before the pilot measures whether line windows suffice.
- Index the working tree or stage. That would require a separate identity for evidence and would expand the first release beyond the agreed revision boundary.
- Combine approximate or keyword ranking with vector ranking immediately. An exact vector scan gives the pilot a simple semantic baseline with deterministic ties. Keyword search remains the comparison baseline.
