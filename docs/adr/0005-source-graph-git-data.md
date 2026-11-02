# 0005 — Store the source graph as Turtle in Git

- **Status:** accepted
- **Date:** 2026-11-02
- **Feature:** #35 (docs/features/source-knowledge-graph/)

## Context

The source graph must be owned by each repository, reviewable in a pull request, usable for agent
grounding and downstream views, and available without a hosted service or new runtime dependency.
In adopting repositories, the configured ontology Turtle file is canonical and its Markdown view
is generated from it. The graph must add evidence locations, coverage, inference labels, and
per-file review state. Embedding the commit hash in a file within that commit would be
self-referential.

## Decision

Store a versioned Turtle manifest, node file, and assertion and evidence shards in the source
repository. Use named RDF resources for assertions, evidence, coverage, and file review records;
concept nodes link to canonical IRIs from the same commit's ontology Turtle source. Require a
canonical, valid Turtle subset with fixed prefixes and ordering so diffs and dependency-free
validation are practical. The containing Git commit, supplied by a reader or consumer, is the graph's effective
source revision; graph files do not embed their own commit hash.

## Consequences

Ordinary PR diffs expose added, changed, and removed named resources and evidence. Git provides
revision identity and source blobs without another database. RDF consumers can combine the graph
with the ontology using shared IRIs. Consumers must pin a commit and understand the schema version.
The checker needs a graph-specific parser for the documented subset: the existing ontology parser
only reads Turtle emitted by its own writer and cannot validate arbitrary graph Turtle. The
restricted input form excludes some valid Turtle syntax, so the runbook and errors must be explicit
about that limit.

## Alternatives considered

- Store a JSON manifest and JSON Lines assertions: simpler metadata parsing and validation, but
  creates a second source format and forces ontology and downstream RDF consumers to translate it.
- Store a binary database such as SQLite: efficient local queries, but diffs are difficult to
  review and require another runtime dependency or export step.
- Embed a commit hash in the graph manifest: would change the commit being named and cannot
  identify itself reliably.
