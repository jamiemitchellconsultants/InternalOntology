# Semantic Repository Index — vision

## Problem

When a developer or coding agent joins an unfamiliar repository, they may know the behaviour they
need to change but have no idea what the implementation or its tests are called. The `Ontology`
gives them the team's vocabulary, and an optional `SourceKnowledgeGraph` helps them follow recorded
relationships. They still need a way to start from a plain-English question and find the relevant
code, tests, and documentation. A development team should be able to build that search index with
an embedding model it chooses and share the resulting vectors so each developer can start searching
without embedding the whole repository again.

## Users

- Developers finding implementations, tests, and documentation for a behaviour or domain concept.
- AI coding agents grounding their work in relevant repository files and line ranges.
- Repository owners who choose the embedding model, decide which content it can receive, and
  decide who may publish an index snapshot.

## Outcomes and measures

1. **Find relevant source from a plain-English query.** On a reviewed set of real repository
   questions, compare the share with a relevant implementation, test, or document in the first five
   results against keyword search. Check that returned paths and line ranges resolve at the
   reported Git revision.
2. **Reuse a teammate's index.** Publish a snapshot for a pushed commit and download it into a
   fresh checkout of that commit. Verify that a developer with access to the matching model can
   search without re-embedding the source files. Record download size and time to first search.
3. **Refresh as the source changes.** Measure refresh time and the number of source passages
   re-embedded after representative edits, additions, renames, and deletions. Check that removed
   content is absent after refresh and that readers can tell when a snapshot is out of date.
4. **Keep model and content under the owner's control.** Exercise an owner-chosen local model and
   an owner-approved remote endpoint. Verify that the selected model handles indexing and query
   embeddings, excluded files stay outside the index and its model requests, and credentials stay
   outside the published asset.

Set performance targets after measuring the baseline on representative adopting repositories.

## Scope

- Opt-in natural-language search for developers and coding agents over owner-approved tracked code,
  tests, and documentation, including the `Ontology` when approved for indexing.
- An embedding model supplied by the repository owner. Search reuses the same embedding space as
  the indexed source, with a clear indication when the configured model and snapshot are
  incompatible.
- A rebuildable vector store in a Git-ignored directory inside each checkout. Developers can
  refresh their working copy and see the indexed commit and freshness of their results.
- Shared snapshots as GitHub Release assets in the adopting repository. Developers with access can
  download and reuse a snapshot. A publisher with repository write access can upload a new snapshot
  for a pushed commit. The snapshot carries the source commit and embedding model identity.
- Search results that point to source evidence. Where a `SourceKnowledgeGraph` is available,
  developers and agents can use the results as starting points for following its recorded facts
  and relationships.

## Out of scope

- A hosted search service, a shared vector database server, and search across multiple repositories.
- Tracking the generated vector store in source history.
- Automated pull-request review, merge gates, and automatic creation of graph assertions.
- Choosing the vector format, embedding interfaces, search ranking, client interfaces, or release
  naming and publication cadence in this phase.

## Research

- Zilliz's Code Context combines keyword and vector retrieval, configurable embedding providers,
  and incremental indexing. Its Milvus and Zilliz Cloud storage choices illustrate the service
  dependency avoided by a portable local store. [Code Context project](https://github.com/zilliztech/claude-context#features)
- Infino's original Code Context, now SuperGrep, offers local keyword indexing and uses its
  hosted platform for semantic retrieval. An adopter-chosen model and local vector store let the
  Kit provide the semantic workflow within the developer's checkout. [SuperGrep project](https://github.com/infino-ai/supergrep)
- Greptile uses a repository graph to follow cross-file relationships and documents PostgreSQL
  with pgvector for its self-hosted index. The Kit already offers an optional graph of source-backed
  claims, which can complement retrieval when an adoption has graph coverage. [Greptile overview](https://www.greptile.com/docs/introduction),
  [Greptile self-hosting](https://www.greptile.com/content-library/self-hosted-ai-code-review),
  [Ontology Kit source knowledge graph](../../../README.md#optional-source-knowledge-graph)
- GitHub Releases supports binary assets with repository-level access. Each asset must be under
  2 GiB. A repository using immutable releases can attach its snapshot before publishing a draft.
  Measure compressed size in the pilot and assess whether teams need a release cadence for indexes
  independent of product releases. [Release limits](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases),
  [Release management](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)
