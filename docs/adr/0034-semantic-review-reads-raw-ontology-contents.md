# 0034 — Semantic review reads raw ontology contents

- **Status:** accepted
- **Date:** 2026-11-20
- **Feature:** #135 (docs/features/matched-ontology-projection/)
- **Amends:** [ADR 0029](0029-semantic-review-reads-the-ontology-source.md) (transport for ontology reads)

## Context

The build of #135 requested the ontology source through GitHub's default Contents JSON response and expected inline Base64. GitHub requires the raw media type to return a file body above 1 MB. The kit generated 1,091,379 bytes of Turtle and 556,367 bytes of Markdown from a 3,840-entry fixture. The matched name-index projection used 67,657 of the 200,000-character default budget, and the planner could divide the broad fixture into 16 requests when it received the rendered ontology. The collector's transport could make this review unavailable before planning, well below the measured name-index ceiling. [GitHub Contents API limits](https://docs.github.com/en/rest/repos/contents#get-repository-content)

## Decision

The GitHub adapter supplies a dedicated raw Contents read for the ontology files used by `collectReviewInput`. Request the raw media type from the same repository API and pin both paths to the reviewed head SHA. Decode the returned file bytes as strict UTF-8. Keep the existing JSON operations for other API calls and the existing Git blob reads for changed Markdown.

Try the Turtle path first when it differs from the configured Markdown path. Only an HTTP 404 on that read permits a Markdown fallback. Use the numeric response status for this decision. Propagate other read, decoding and parsing failures through the existing unavailable outcome. When the two paths are the same, read the configured path once as Markdown.

Render Turtle with the same parser and renderer as the ontology build tool, then pass the rendered Markdown through the existing catalog path. The raw transport also reads the Markdown fallback so large Markdown-only ontologies can use the same planner. B25 equivalence, B12 finding identity and B21 full-mode request contents follow from consuming the same Markdown text.

## Consequences

The reviewer still needs one request for an existing ontology source and one additional request on fallback. GitHub's existing Contents read permission and 100 MB endpoint ceiling apply. Neither the ontology's size on disk nor the transport changes the model request budget. Graph naming and drift review keep their existing reads.

## Alternatives considered

- **Read metadata and then the Git blob.** The blob is pinned to the same revision, but the second request exists only to recover bytes the Contents endpoint can supply directly.
- **Retry with raw after a default JSON request fails.** This retains two representations of the same file and requires distinguishing an inline-content limit from other failures. A raw read handles small and large files through the same path.
- **Follow the download URL from the metadata.** This adds a request to a separate endpoint and has different URL lifetime and authentication rules.
