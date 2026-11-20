# Semantic Repository Index — behaviours

The scenarios cover the four outcomes in the [accepted vision](01-vision.md). The uncertainty log
identifies analyst proposals for review and the choices passed to architecture.

## Behaviours

### Outcome 1 — Find relevant source from a plain-English query

**B1 — Return source locations.** Given a current `SemanticRepositoryIndex` and access to its matching `EmbeddingProfile`, when a developer or agent submits a non-empty natural-language query, then it receives a ranked list of zero or more `SemanticSearchResult`s. Every result identifies the full indexed Git commit, repository-relative path, and inclusive line range of the source passage at that commit. An empty list represents a successful search. Search works with or without a `SourceKnowledgeGraph`.

**B2 — Distinguish an unusable index from an empty result.** Given the local index is absent, stale, incompatible, or unreadable, when someone requests status or search, then the Kit identifies the condition and the relevant recovery action. A missing index prompts a download or build. A different indexed commit or changed `IndexSourceScope` prompts a refresh. A different embedding space prompts a download of a compatible `IndexSnapshot` or rebuild. Unreadable data prompts a fresh download or rebuild. For an unusable index, search reports the condition before embedding the query and returns no source locations.

**B3 — Measure retrieval on reviewed repository questions.** Given representative adopting repositories and a reviewed question set with expected source locations, when the same questions are run against semantic and keyword search at the same source commits, then the pilot records the proportion of questions with at least one relevant location in the first five results for each approach. It checks the revision, path, and line range of every semantic result returned in the trial. The baseline supplies the data for later targets.

### Outcome 2 — Reuse a teammate's index

**B4 — Search an exact downloaded snapshot.** Given an `IndexSnapshot` on a release in the adopting repository with the current checkout's commit, scope, and embedding space, when a developer with access downloads it into a fresh checkout and searches, then installation of the snapshot uses zero source embedding requests. Search submits the query to the configured model and uses the downloaded vectors. The pilot records compressed asset size and elapsed time to first successful search.

**B5 — Use an earlier snapshot as a refresh starting point.** Given no exact compatible snapshot is available and the developer explicitly selects a compatible `IndexSnapshot` from an ancestor commit of the same repository, when it is imported, then the Kit reports the indexed and current commit and requires an explicit refresh before searching. Refresh reuses compatible unchanged material under B10. If no suitable snapshot exists, the Kit indicates that a local build is available.

**B6 — Validate a snapshot before accepting it.** Given an asset has unknown format, damaged contents, invalid provenance, a different source repository, an incompatible model or scope, or a source commit that is neither the current commit nor an explicitly selected ancestor, when a developer tries to import it, then the Kit reports the mismatch and preserves the existing local index. A failed or interrupted transfer gives a download error and the same preservation guarantee.

**B7 — Upload for a pushed commit.** Given a complete current `SemanticRepositoryIndex`, a publisher the repository owner has authorised with repository write access, and a selected release in the adopting repository that can accept an asset, when the publisher explicitly requests an upload, then the Kit verifies that the indexed commit is pushed to that repository and that the release tag or draft target resolves to it. The resulting `IndexSnapshot` is downloadable by a teammate with release access. It identifies the source repository, commit, approved scope, and embedding space. The pilot exercises this upload and the download in B4 end to end.

**B8 — Preserve published assets on failure.** Given a publish request encounters missing authorisation or write permission, a commit that is unpushed or differs from the selected release, a published immutable release, an asset name collision, an oversized asset, or an upload failure, when the Kit attempts to publish, then it reports the cause and preserves any existing release assets. For an immutable release, the publisher can choose an eligible draft at the same commit. The Kit reports success only when the uploaded asset is available on the selected release.

### Outcome 3 — Refresh as the source changes

**B9 — Capture a defined source revision.** Given a checkout with a local Git commit and owner-approved indexing settings, when a developer explicitly builds or refreshes, then the index reads the approved files at the checkout's current commit and records that commit. A local unpushed commit is eligible for local search. If approved files have staged or unstaged changes, status and search identify the result as applying to committed content. An unborn checkout reports that it needs a commit.

**B10 — Refresh incrementally.** Given a complete index and a later checkout commit with an edit, addition, rename, and deletion, when a refresh finishes with the same `EmbeddingProfile` and `IndexSourceScope`, then searches use the later commit, unchanged files keep their existing embeddings, and changed or added content is searchable at its current location. Deleted paths and old rename paths disappear. A second refresh with the same inputs makes no source embedding requests. The pilot records changed passages embedded and elapsed time for both runs.

**B11 — Apply changes to approved coverage.** Given a repository owner changes `IndexSourceScope` after an index was built, when status or search is requested, then the old index is reported as stale for that scope. After refresh, newly approved eligible content is searchable, excluded content is absent, and the current scope is recorded with the index. Indexing and refresh state live in the checkout's Git-ignored storage.

**B12 — Preserve the last complete local index.** Given a complete prior index and a build or refresh that encounters a provider error, invalid vectors, interruption, or write failure, when the operation fails, then the Kit keeps the previous complete index available at its recorded commit and reports the error. If the checkout is on a newer commit, the preserved index reports as stale. With an empty checkout store, the same failure leaves it without a complete index. If the checkout advances during a successful operation, the new index records the revision actually read and reports as stale against the new checkout commit.

### Outcome 4 — Keep model and content under the owner's control

**B13 — Require owner configuration.** Given a `TargetRepository` with the feature disabled or with an incomplete `EmbeddingProfile` or `IndexSourceScope`, when an indexing, search, download, or upload operation is requested, then the Kit identifies the disabled feature or missing setting and makes no model or release request. Two adopters can enable different approved models and scopes through their own `OntologyConfig` with the same Kit scripts.

**B14 — Use the approved embedding space for both operations.** Given a complete owner-approved `EmbeddingProfile`, when a build and search run, then both use its model destination and compatible document and query settings. Exercise this with a local model and an approved remote model. Changing to another embedding space with the same vector dimensions invalidates the existing index for search and reuse. A model error is reported without contacting a fallback model.

**B15 — Send only eligible source to the model.** Given an `IndexSourceScope` with approvals and exclusions, when source indexing runs, then it embeds only explicitly approved tracked regular text files, with exclusions taking precedence. Exercise an approved source file, test, and `Ontology` document alongside an unapproved file, an excluded file, a Git-ignored untracked file, a symlink and a binary file. Only the three approved eligible files appear in source requests or index results. The Kit reads source from the chosen revision and uses the approved `EmbeddingProfile` for query text.

**B16 — Keep credentials and destination control local.** Given model and release credentials are supplied outside `OntologyConfig`, when the Kit builds, searches, imports, or uploads, then credentials stay outside the index, asset, and diagnostic output. An `IndexSnapshot` cannot change the approved embedding destination or expand the configured scope. Imports consume index data and do not execute content from the asset.

## Uncertainties

| ID | Question | Decision or deferral | Basis |
| --- | --- | --- | --- |
| U1 | Which files and revisions does local indexing cover? | The first release indexes approved tracked regular text at the current Git commit, including local commits. It reports when approved files have uncommitted edits. Indexing staged, unstaged, and untracked content is deferred (B9, B15). | Owner confirmed commits-only indexing, including unpushed local commits. |
| U2 | What does a query return and when is it usable? | Return ranked locations with commit, path, and line range. Search requires an index for the current commit and scope with a compatible model. Report missing, stale, incompatible, and unreadable states separately from a successful empty result. Graph access is optional (B1–B3). | Accepted evidence outcome, with the current-only search rule proposed by the analyst. |
| U3 | Can an older asset shorten setup? | Use an exact compatible snapshot immediately. A developer may explicitly import a compatible ancestor and refresh it. Snapshot lookup, format, and integrity mechanics go to architecture (B4–B6). | Accepted download and refresh workflow, with explicit ancestor selection proposed by the analyst. |
| U4 | Who may publish, and which commit and release receive the asset? | An owner-authorised publisher with repository write access explicitly selects a release in the adopting repository that resolves to the pushed indexed commit. Existing assets are preserved. Release naming, cadence, packaging, and how owner authorisation is represented go to architecture (B7–B8). | Accepted repository ownership and GitHub Release distribution, with publication checks proposed by the analyst. |
| U5 | What happens after a partial refresh or when the source advances mid-operation? | Keep the previous complete index on failure. A completed refresh records the revision it read and discloses staleness if the checkout advanced. Refresh timing is explicit and automatic scheduling is outside the pilot (B9–B12). | Analyst proposal to keep results reproducible and work visible. |
| U6 | What constitutes matching model access and approved content? | The owner selects the scope and embedding space, including settings that affect vector comparability. Same vector dimensions alone are insufficient. Credentials are separate. Provider interfaces, identity encoding, and the mechanism for resolving trusted owner settings go to architecture (B13–B16). | Owner-supplied embeddings and owner-approved inputs from the accepted vision. |
| U7 | How does the pilot judge success? | Compare top-five retrieval with keyword search, validate citations, exercise release upload and reuse, record asset size and refresh work, and test one local and one remote model. Numeric targets follow the baseline (B3–B4, B7, B10, B14–B16). | Accepted outcomes and measures. |
| U8 | Which interfaces and infrastructure are needed? | Ranking, vector storage format, chunking, developer and agent interfaces, and release tooling go to architecture. Hosted search, a shared vector service, multi-repository search, automatic graph assertions, and merge-gating use are out of scope. | Accepted scope boundaries. |

## Terms

The new terms are defined in the [canonical ontology](../../ontology.md).

- `SemanticRepositoryIndex` is the rebuildable checkout-local index.
- `IndexSourceScope` carries the owner's source approvals and exclusions.
- `EmbeddingProfile` identifies the approved destination and embedding space independently of credentials.
- `IndexSnapshot` is the copy distributed as a GitHub Release asset for a pushed commit.
- `SemanticSearchResult` identifies a ranked source location at the indexed commit.
