# Semantic Repository Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement the approved plan task by task. Track each step with its checkbox in the detailed plan.

**Goal:** Give adopters opt-in local semantic search over committed repository content and let authorised developers exchange compatible indexes as GitHub Release assets.

**Architecture:** An installed CLI reads owner policy from a trusted Git revision and reads source from the checkout’s captured commit. One OpenAI-compatible adapter supplies embeddings. The checkout-local store uses one versioned file with atomic replacement and exact cosine search. GitHub Releases carry compressed snapshots tied to pushed commits.

**Tech stack:** Node 20+, Git, Node built-ins, GitHub CLI for release operations, and the owner’s OpenAI-compatible endpoint.

**Spec:** [Vision](../../../features/semantic-repository-index/01-vision.md), [behaviours](../../../features/semantic-repository-index/02-behaviours.md), [architecture and ADRs](../../../features/semantic-repository-index/03-architecture.md). [Detailed plan and test files](../../../detailed-implementations/semantic-repository-index/plan.md).

## Global constraints

- Branch `feature/semantic-repository-index/dev-build` from the reviewed plan on `main`, inside the dedicated feature worktree. Open the build PR against `main` after the build checkpoint passes its tests.
- Keep installed scripts byte-identical. `OntologyConfig` holds adopter variation. Runtime uses Git and Node 20+ with built-in modules. `gh` is needed for the two release transfer commands.
- Read approved, tracked regular UTF-8 text at a captured commit. A local unpushed commit is eligible. Release publishing requires a verified pushed commit. Select files by exact repository-relative path or directory prefix ending in `/`, with exclusions taking precedence.
- Use a single owner-supplied OpenAI-compatible embedding interface. Keep credentials separate. Search and upload use a complete compatible index for the current commit. Downloading a compatible ancestor seeds an explicit refresh.
- Use versioned UTF-8 JSON Lines with base64 little-endian Float32 vectors, a 128 KiB record ceiling, a 2 GiB expanded ceiling, and one atomic promotion point. GitHub assets must be under 2 GiB compressed. Preserve existing assets on failure.
- Follow the repository’s staged ontology check and run `npm test` before every commit. Run the focused test red, then green. Commit and push each detailed task independently. Normal tests use temporary Git repos and injected model and release responses. Live pilot data and credentials are supplied by owners in the acceptance phase.

## Review focus

- A branch changes the embedding endpoint or scope. T2 pins trusted configuration separately from source, and T6 verifies upload against current release-repository policy.
- A malformed indexed batch repeats a response index or yields a zero vector after Float32 conversion. T3 rejects the complete response and keeps provider output out of diagnostics.
- A corrupt footer or an interrupted writer leaves the active index usable. T4 pins one reader to its original file and verifies promotion and recovery.
- `HEAD` moves while a refresh or query is waiting for embeddings. T5 checks stored provenance and reports staleness before showing search results.
- A matching asset filename carries forged paths, a moved tag, or a different embedding space. T6 verifies provenance and source evidence before promotion and preserves the prior index or existing release asset.

## Tasks

| Task | Files and interface | Tests and behaviours | Commit |
| --- | --- | --- | --- |
| T1 · Validate owner settings | `templates/scripts/ontology-config.mjs`, `tests/semantic-index-config.test.mjs`. Extend `validateConfig(raw, deps)` with normalized `semanticIndex`. | Absent and disabled settings, unknown keys, path normalization, endpoint restrictions, adopter-specific values. B13–B16. | `feat: validate semantic index settings` |
| T2 · Read approved committed source | `templates/scripts/source-graph-git.mjs`, `templates/scripts/semantic-index-source.mjs`, `tests/semantic-index-source.test.mjs`. Add `entryMode` and `readBounded` to the Git tree. Export `resolveIndexContext`, `listIndexEntries`, `readIndexPassages`, and `hasIndexEdits`. | Trusted ref versus worktree, modes and exclusions, bounds, deterministic line ranges, staged and unstaged edits, existing graph callers. B9–B11, B13, B15. | `feat: read semantic index source from committed Git trees` |
| T3 · Make embedding requests | `templates/scripts/semantic-index-embed.mjs`, `tests/semantic-index-embed.test.mjs`. Export `createEmbeddingAdapter(profile, options)`. | Purpose-specific inputs, response ordering, numeric and dimensional validity, request limits, redirects and safe errors. B4, B12, B14–B16. | `feat: add OpenAI-compatible embedding adapter` |
| T4 · Write and read portable index | `templates/scripts/semantic-index-store.mjs`, `tests/semantic-index-store.test.mjs`. Export `openIndex(root, options)` and `withIndexWriter(root, write, options)`. | Encoding, digests and resource bounds, interrupted candidates, writer contention, pinned readers, complete promotion. B1, B2, B6, B9–B12. | `feat: persist semantic indexes atomically` |
| T5 · Search and refresh locally | `templates/scripts/semantic-index.mjs`, `tests/semantic-index-cli.test.mjs`. Export `runIndexCommand(argv, options)` and wire local CLI commands. | Missing, changed, corrupt and incompatible indexes, stable citations, exact search, incremental reuse, scope and `HEAD` changes. B1, B2, B9–B16. | `feat: search and refresh semantic indexes locally` |
| T6 · Exchange release snapshots | `templates/scripts/semantic-index-release.mjs`, `templates/scripts/semantic-index.mjs`, `tests/semantic-index-release.test.mjs`. Export `createReleaseTransport`, `downloadIndex`, and `uploadIndex`. | Fresh and ancestor imports, provenance and payload rejection, private access through `gh`, publishing checks and failure preservation. B4–B8, B13, B16. | `feat: exchange semantic indexes through GitHub releases` |
| T7 · Install and measure the workflow | `bin/install-ontology.mjs`, `README.md`, `templates/docs/semantic-index.md`, `scripts/measure-semantic-index.mjs`, `tests/semantic-index-install.test.mjs`, `tests/semantic-index-pilot.test.mjs`. Wire the install option and paired-checkout trial. | Byte-identical opt-in installation, ignore rule and upgrade, deterministic pilot reports, first-search and refresh metrics. B3, B4, B7, B10, B13–B16. | `feat: install and measure the optional semantic index` |

## Build checkpoint

Run the focused tests from the detailed plan and the full suite. Verify the 16 behaviour IDs against the recorded evidence and retain the measured results for the acceptance phase. Use the feature issue and its build sub-issue to record the task commits and review handoff.
