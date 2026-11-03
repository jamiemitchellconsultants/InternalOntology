# 0010 — Pin the readable graph to a committed source snapshot

- **Status:** accepted
- **Date:** 2026-11-03
- **Feature:** #62 (docs/features/human-readable-source-knowledge-graph/)

## Context

B4, B6, B7 and B11 require immutable evidence references, an identifiable snapshot, exact Turtle lookup and repeatability. The owner wants Markdown in the same PR as graph changes; this does not require one commit. Relative links viewed through a branch can move between opening the document and following evidence, contrary to U6. A document cannot embed its own future containing hash.

## Decision

Commit canonical source changes as S, generate from S, and commit Markdown as D in the same PR. Record S's full commit ID in secondary provenance and use it in evidence/Turtle permalinks built from `sourceGraph.repositoryUrl`. Validate S and the current candidate, require identical rendering-input projections, and regenerate expected bytes from S before accepting the document.

Fingerprint the format version and sorted input path/blob inventory, excluding generated Markdown and execution metadata. Reuse a recorded source commit when its input still matches, preventing document-only commits from churning links. An explicit source revision permits recovery or deliberate regeneration. The graph retains its containing-commit convention; its readable view records actual input S and proves relevant content still matches the current graph/source.

On squash/rebase or branch deletion, checkout/bootstrap fetches missing S from the fixed repository remote using a strictly validated SHA from bounded generated metadata. The renderer remains local-only. Missing source objects fail visibly and require retrieval or regeneration from an available matching source commit; there is no moving-link fallback.

## Consequences

Evidence remains pinned even if a branch advances after the document is opened. Canonical changes and readable output are reviewed in one PR, using a source commit followed by a document commit. Rendering configuration needs the repository browser URL. CI may need another read-only fetch before validation after history rewriting; acceptance tests squash/rebase, source retrieval and links after branch movement. Canonical source modifications must be committed before generation, and changed input requires regeneration.

GitHub describes [commit-based file permalinks](https://docs.github.com/en/repositories/working-with-files/using-files/getting-permanent-links-to-files) and [retrieving stored PR commits](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/checking-out-pull-requests-locally). These support the chosen mechanism; integration acceptance verifies source availability on the supported host. A fingerprint does not establish semantic accuracy or prove a remote link is available.

## Alternatives considered

- Relative links with a containing-revision notice do not pin destinations when a document is read through a moving branch or PR reference.
- Embedding the document's own commit hash is self-referential.
- One combined source/document commit cannot supply that commit's future immutable URL during generation.
- Accepting provenance without comparing S's input with the current candidate permits stale or unrelated source references.
- Automatically reanchoring to the current document commit on every run creates unnecessary churn.
