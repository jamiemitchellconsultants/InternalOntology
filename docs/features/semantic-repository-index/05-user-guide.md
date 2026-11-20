# Semantic repository index user guide

## Set it up as a repository owner · B13–B16

Install the opt-in commands with `--with-semantic-index` and follow the [configuration example](../../../templates/docs/semantic-index.md#configure-the-adopter). Choose source selectors and explicit exclusions, the OpenAI-compatible model, and the repository and permitted publishers for release exchange. Commit these settings on your trusted branch. Each adopting repository supplies its own settings; the installed commands are identical.

The scope accepts exact Git-relative paths and directory prefixes ending in `/`. Exclusions take precedence. Approved tracked regular UTF-8 source, tests, and the `Ontology` are eligible. Untracked files, symbolic links, and binary files are skipped. Give the model only approved material, keep tokens in the environment or GitHub CLI authentication, and advance the embedding revision when the model changes. Both source and query embeddings use the approved destination. Imported assets carry vectors and provenance and are read as data.

## Find code or tests · B1, B2, B9

```bash
node scripts/semantic-index.mjs status --json
node scripts/semantic-index.mjs search --query 'Where do we reject a late cancellation?' --limit 5 --json
```

Each `SemanticSearchResult` includes the full commit, repository-relative path, inclusive start and end lines, and score. Resolve the citation with `git show <commit>:<path>` before using it as evidence. Developers can open the cited file at that commit. Coding agents can consume the JSON directly and follow related evidence in the `SourceKnowledgeGraph` when available.

An empty results array is a successful search over an empty index. A nonzero search with `missing`, `stale`, `incompatible`, or `unreadable` gives recovery instructions. Search requires a compatible index for the current Git commit. Local commits are eligible. A dirty notice means the results describe committed content while approved paths have pending edits.

## Build or update your checkout · B9–B12

```bash
node scripts/semantic-index.mjs refresh --json
```

The first refresh builds a `SemanticRepositoryIndex` in `.ontology-index/`. Later refreshes reuse compatible vectors for unchanged files. Edits, additions, and renames update search results and deletions disappear. A repeat refresh with the same commit and policy reports zero new source embeddings. When scope changes, refresh to apply the change. If a refresh fails, the previous complete index remains at its recorded commit. Check status before using it and retry once the fault is resolved.

## Reuse or publish an index · B4–B8

```bash
node scripts/semantic-index.mjs download --release v1.2.3 --json
node scripts/semantic-index.mjs download --release v1.2.2 --allow-ancestor --json
node scripts/semantic-index.mjs upload --release v1.2.3 --json
```

Use the release whose commit matches your checkout to search immediately after download. You still need the configured model to embed a query. To seed a later commit from an older `IndexSnapshot`, select an ancestor release explicitly and refresh before searching. The downloader checks the source repository, commit, coverage, and model, and preserves your current store on a rejected import or failed transfer. You can use refresh when there is no suitable snapshot.

To publish, use an authorised GitHub login with write access and an index for the exact pushed commit of the selected release. Existing assets are retained. If GitHub protects published releases from changes, attach the index to an eligible draft before publishing. Confirm upload success before sharing the release link.

## Measure retrieval in a pilot · B3

Choose a full commit and review questions and expected source locations before collecting results. Run each query with `--limit 5 --json`, save its results, and use the [acceptance walkthrough](05-acceptance.md#b3--measure-retrieval) to compare semantic and keyword top-five hit rates. The measurement command checks cited files and lines at the pinned commit. Record the rates, elapsed times, counts, and asset size before setting performance targets.
