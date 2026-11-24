# Ontology Kit — Application Ontology

> **AI instructions:** Read this file in full before starting any task that touches domain
> concepts. Update it after any task that adds, modifies, or removes one. This file must never lag
> behind the code. See the Ontology protocol section in this repository's agent-instruction file.

Every domain concept is named here exactly once, as a backticked PascalCase term. Code, specs,
plans and prose use those names; this file is the source, they are the consumers. A term that
appears in Markdown but not here fails the deterministic check in
`scripts/check-ontology-terms.mjs`.

This repository is the Ontology Kit itself, not an adopter of it. Its domain is the installer, the
files it writes, and the discipline they enforce — not a business domain. `templates/` and
`docs/superpowers/` are excluded from the check (`ignorePaths` in `ontology.config.json`): they
hold either shipped starter content addressed to whichever repository installs the kit, or an
archived planning document full of illustrative test fixtures — neither is this repository's own
prose.

---

## External Systems

Third-party or otherwise not-ours systems this repository integrates with. Naming them here is
what makes the banned-alias check meaningful: add each paraphrase people reach for to
`bannedAliases` in `ontology.config.json`.

| Name | What it is | Description |
|------|-----------|-------------|
| `ProjectNarrative` | The `jamiemitchellconsultants/Narrative` GitHub Action | Runs on every merged pull request and on any change to `.project-narrative.json`, `narrative/**`, or `Narrative.md`; compiles the fragments under `narrative/entries/` (opted in via the `narrative-required` label and the pull request template's Narrative Context / Narrative Decision / Narrative Consequences headings) into `Narrative.md`. Owns its own vocabulary — fragment, label, heading names — which this repository uses but does not define. |

---

## Subsystems

Internal components that are ours to build. Named so that specs can describe the boundaries
*between* them without designing their internals.

| Name | What it is | Responsibility | Boundary |
|------|-----------|----------------|----------|
| `Installer` | `bin/install-ontology.mjs` | Copies the kit's templates into a `TargetRepository` and splices `OntologyProtocol`, and optionally `GraphAgentProtocol`, into its `AgentInstructionFile`. Mechanical only — it writes no repository-specific domain content. | Reads `templates/` and computes a `PlanEntry` list. Copies optional graph and semantic index tooling when requested. The semantic index opt-in ensures the local storage directory is Git-ignored. |
| `TermChecker` | `scripts/check-ontology-terms.mjs`, installed byte-identical into every adopting repository | Derives the canonical vocabulary from `Ontology` and scans tracked Markdown for an unknown backticked term or a paraphrase of a named `External System`. Runs in CI on every pull request. | Reads `Ontology` and `OntologyConfig`; produces `Violation`s. |
| `DriftReviewer` | `scripts/review-ontology-drift.mjs`, installed only with `--with-drift-review` | Advisory, model-assisted second pass that catches unbackticked paraphrase the `TermChecker` cannot see (e.g. "approved" drifting to "sent" in running prose). Never blocks a merge. | Not installed in this repository. |
| `ModelAuthProvider` | `templates/scripts/llm-auth.mjs`, installed byte-identical with the reviewers | Supplies the bearer for model requests for the `DriftReviewer` and `SemanticReviewWorker`: a cached, auto-refreshed OIDC client-credentials token when an `OidcClientConfig` is complete, otherwise the static key. Retries once after a 401. | Reads environment variables; calls the token endpoint; never logs the secret, the token or the token response body. |
| `SemanticReviewTrigger` | kit-owned PR workflow, installed with `--with-semantic-review` | Runs without secrets or path filtering so a trusted follow-up review can produce a result for each PR revision. | Its completion triggers `SemanticReviewWorker`; it passes no executable PR artefact. |
| `SemanticReviewWorker` | kit-owned trusted follow-up workflow and script | Assesses the full contents of changed eligible Markdown against the proposed `Ontology`, using maintainer-owned model settings and an environment secret; records incomplete coverage rather than silently dropping files. | Executes from the default branch; treats PR files and model output as data. |
| `SemanticStatusPublisher` | kit-owned status and PR-comment logic | Publishes the latest `SemanticReviewRun` outcome as a fixed commit status and preserves each run's visible PR record. | Reads `SemanticFinding`s and `FindingDismissal`s; writes GitHub statuses and comments. |
| `SemanticDismissalHandler` | kit-owned issue-comment workflow and script | Verifies a maintainer's reasoned dismissal of one current `SemanticFinding` and recomputes the current status. | Reads PR comments and repository permissions; does not invoke the model. |
| `GraphNamingTrigger` | kit-owned PR workflow, installed with `--with-graph-naming-review` | Runs on every pull request without secrets, checkout or path filtering so the trusted `GraphNamingWorker` can produce a result for each revision. | Its completion starts `GraphNamingWorker`; it passes no executable PR artefact. |
| `GraphNamingWorker` | kit-owned trusted follow-up workflow and script | Selects the added or changed `GraphNode`s of a pull request deterministically, drops names that contain the canonical term, asks the configured model about the rest, and grounds the replies into one `GraphNamingRun`. | Executes from the default branch with maintainer-owned settings from `OntologyConfig`; reads PR graph Turtle and `Ontology` through the GitHub API as data; never changes the graph or `GraphChecker`. |
| `GraphNamingPublisher` | kit-owned status and PR-comment logic | Publishes the fixed `ontology/graph-naming` status and keeps one summary comment, with its bot-written ledger of result labels and deferral issues, edited in place; posts a short notification when new results appear. | Reads `GraphNamingResult`s and `NamingSettlement`s; writes GitHub statuses and comments. |
| `GraphNamingSettlementHandler` | kit-owned issue-comment workflow and script | Applies `/graph-naming accept`, `reject` and `defer` commands from people with write access, creates and annotates deferral issues, and recomputes the status and summary. | Reads PR comments and repository permissions; writes issues; does not invoke the model. |
| `OntologySetupSkill` | `skills/ontology-setup` | The agent skill that installs the mechanism, then supplies the judgement the mechanism cannot: which sections apply, and the real seeded content of an adopting repository's `Ontology`. | Drives `Installer`, then edits `Ontology` and `OntologyConfig` directly. |
| `GraphReader` | kit-owned local reader script | Finds nodes, assertions, bounded paths, evidence, and coverage in a `SourceKnowledgeGraph` at a named Git revision, including the nodes that denote or implement a named `Ontology` concept. Reports gaps and stale results without creating new assertions. | Reads adopter-owned graph files and local Git objects; produces grounded query results for an agent or downstream consumer. |
| `GraphChecker` | kit-owned local checker script | Deterministically validates graph structure, evidence locations, declared coverage, and review of covered file changes before a pull request merges. | Reads adopter-owned graph data, `OntologyConfig`, and local base and proposed Git trees; reports failures without judging semantic truth. |
| `GraphCheckWorkflow` | kit-owned pull-request and default-branch workflow | Runs `GraphChecker` with read-only access to the checked-out Git history and publishes a stable check result. | Reads graph data and Git trees after checkout; has no model, secret, or post-checkout network requirement. |
| `GraphRenderer` | kit-owned local Markdown generation script | Renders every current graph claim, evidence reference, basis and coverage declaration into a deterministic human-readable document after validating one Git input snapshot. | Reads `SourceKnowledgeGraph`, `OntologyConfig` and local Git objects through the existing graph model and `GraphChecker`; writes only the generated Markdown view or checks its freshness. A previously pinned source is validated using its supported schema version so an upgrade can refresh the view. |
| `GraphRenderWorkflow` | kit-owned pull-request and default-branch workflow | Regenerates the expected readable graph view and checks that the same revision contains matching Markdown, so maintainers can review it with the source changes. | Runs `GraphRenderer` with read-only repository permission; publishes a freshness result and makes no commits or changes to canonical Turtle. |
| `DesignDocumentReader` | kit-owned local script | Finds a feature's behaviours file, its `FeatureBehaviour` declarations and Retired behaviours entries, and a `DesignDecision`'s title and status, in a Git tree. | Reads adopter-owned feature documents and ADRs from local Git objects; used by `GraphChecker` and `GraphReader`; never writes. |

---

## Entities

| Name | Properties | Description |
|------|------------|-------------|
| `TargetRepository` | `path` | The git repository (must already contain `.git`) the `Installer` writes into. Identity persists across repeated installs and upgrades of the same repository. |
| `Ontology` | `ontologyPath`, one Markdown table per section | The canonical vocabulary document a `TargetRepository` maintains (`docs/ontology.md` by default). Identity persists as sections and rows are added, renamed, or removed over the repository's life; this file, in this repository, is one instance of it. |
| `OntologyConfig` | `ontologyPath`, `sections`, `allowlist`, `bannedAliases`, `ignorePaths`, optional `semanticReview`, optional `sourceGraph`, optional `semanticIndex` | The one per-repository file (`ontology.config.json`) every installed script reads its repository-specific settings through. Identity persists as its fields change; it is what lets the scripts themselves stay identical across repositories. The `semanticReview` settings are read from the trusted default branch, not an unmerged PR. The optional `sourceGraph` settings locate adopter-owned graph data, select eligible evidence roles, and configure a repository browser URL and optional generated Markdown path within the excluded graph root. The optional `semanticReview.projection` setting chooses the `ProjectionMode` of the semantic reviewer and is accepted only under `semanticReview`. The optional `semanticIndex` settings describe the adopter's `IndexSourceScope`, `EmbeddingProfile` and release publishing policy without storing credentials. |
| `SemanticRepositoryIndex` | checkout, source revision, effective `IndexSourceScope`, embedding space identity, searchable passages | A rebuildable local vector store belonging to one checkout of a `TargetRepository`. A successful build, refresh or import replaces its contents while keeping its identity within that checkout. Reports whether it can be used to search the requested source revision under the owner's current scope and model settings. |
| `SearchTokenLog` | checkout, time, command, results or lines returned, `TokenEstimate` | A Git-ignored local record in the checkout's index storage of what each search or passage response cost. It holds counts and estimates only, never query text or source text, and supports a baseline report of token use. |
| `SourceKnowledgeGraph` | source repository, effective Git revision, Turtle resources for assertions, declared coverage, file review records | A reviewable, versioned account of repository facts and clearly marked inferences that extends beyond the canonical vocabulary in `Ontology`. It is stored as Turtle with the source repository; its effective revision is the Git commit containing it, not a hash embedded in its own files. An agent prepares it before a pull request; its assertions ground later agent work and may support downstream views. Missing coverage is explicit. |
| `GraphNode` | stable identity, kind, label, canonical ontology IRI when kind is concept | A repository concept, source element, dependency, or other subject or object named by a `GraphAssertion`. A concept node links to its canonical `Ontology` IRI instead of reusing the ontology class IRI as a graph node. Its identity remains stable when a label or source location changes. |
| `GraphAssertion` | stable identity, subject, relationship, object, basis, evidence | One reviewable claim in a `SourceKnowledgeGraph` about a repository fact or relationship. Its basis distinguishes a directly evidenced claim from an inference supported by source observations. Its identity persists when the same claim is refreshed at a later source revision. |
| `AgentInstructionFile` | one of `AGENTS.md`, `CLAUDE.md` | Whichever file a `TargetRepository` already treats as authoritative for agent instructions (`AGENTS.md` preferred, `CLAUDE.md` otherwise, `AGENTS.md` created if neither exists). Carries the spliced `OntologyProtocol` and optionally `GraphAgentProtocol`. |
| `SemanticReviewRun` | pull request, revision, eligible files, reviewed files, `OntologyProjection` summary per reviewed file, outcome | One attempt to assess changed Markdown against the ontology. Its outcome controls the current semantic check; a later run supersedes it even when that later run cannot review. |
| `GraphNamingRun` | pull request, revision, eligible graph nodes, reviewed nodes, outcome | One model-assisted comparison of the names of a pull request revision's added or changed `GraphNode`s, and of nodes whose denoted ontology item the revision renames or removes, with its proposed `Ontology`. Separate from `GraphChecker`, which it never changes; a run that cannot review permits merge. |
| `FeatureBehaviour` | feature slug, behaviour id, title, `BehaviourStatus`, replacement | One behaviour an analyst declares in a feature document, as a `GraphNode` of the core behaviour kind whose identity derives only from its `BehaviourReference`. Its id is permanent: never renumbered or reused, and retired rather than deleted. |
| `DesignDecision` | ADR number, title, `DecisionStatus`, successor | One architecture decision record under `docs/adr/` named `NNNN-<title>.md`, as a `GraphNode` of the core decision kind whose identity derives only from its number. |

---

## Value Objects

| Name | Properties | Description |
|------|------------|-------------|
| `PlanEntry` | `template`, `dest`, `substitute`, `ownedBy` | One file an install would write, described before anything touches disk — what `--dry-run` prints. Defined entirely by these four values; a new one is computed on every run. |
| `AllowlistEntry` | `term`, `reason` | One term excused from the unknown-term check, with the written reason a reviewer would need to accept it. |
| `BannedAlias` | `phrase`, `nameInstead` | One paraphrase of a named `External System` that prose must not use, and the canonical name(s) to use instead. |
| `OntologyProtocol` | Markdown body between `<!-- ontology-protocol:start -->` / `<!-- ontology-protocol:end -->` | The instructions bound into an `AgentInstructionFile`: read `Ontology` before writing anything domain-touching, use its exact names, add a missing concept there first, update it in the same commit as the code change. Replaced wholesale on every install — re-running is what keeps it current, not an edit history of its own. |
| `GraphAgentProtocol` | marked Markdown body in an `AgentInstructionFile` | Optional instructions to read the graph with its evidence and gaps, look up the `Ontology` and graph before naming code, record implemented components and symbols with their concept links in the same change as the code, propose wider `GraphCoverage` for new code in unknown scope, author entries on request, write graph changes in Turtle and regenerate the readable Markdown from it rather than editing it, review covered source changes before a pull request, and update assertions or record no fact change. Replaced as a Kit-owned block on install or upgrade. |
| `GraphEvidence` | source path, line range, Git blob ID, role, effective Git revision | A source reference supporting one `GraphAssertion`, whether the source is code, a test, a selected design document, the `Ontology`, or an eligible deployment file. For an inferred assertion it identifies the observations behind the inference, not direct proof of the relationship. Its effective revision comes from the containing graph commit. |
| `GraphCoverage` | repository-relative selector, status, priority, reason | The portion of a `TargetRepository` that a `SourceKnowledgeGraph` declares covered, unknown, or excluded. The highest matching priority wins; unmatched paths remain unknown. Missing coverage remains visible rather than being inferred from absent assertions. |
| `GraphVocabulary` | schema version, core kind and relationship IRIs, defined local extensions | The shared meanings allowed for `GraphNode` kinds and `GraphAssertion` relationships. The Kit versions a small core of `kit:` IRIs; an adopter may declare additional IRIs in its own namespace with definitions in its Turtle manifest. |
| `GraphRefreshRecord` | covered path, current Git blob ID or deletion, review outcome | The current review of one covered source path for graph impact, including a decision that no graph fact changed. Replaced when that path changes; it is a snapshot rather than an event log. |
| `IndexSourceScope` | approved repository-relative selectors, exclusions | The repository owner's rules for choosing source files for the `SemanticRepositoryIndex`. A file must be approved by a selector and eligible for indexing, and an exclusion takes precedence over an approval. |
| `EmbeddingProfile` | owner-approved model destination, transport approval, embedding space identity, vector dimensions | The model selection for indexing source and embedding queries. Transport approval can expressly permit private LAN HTTP for the configured destination. The embedding space identity distinguishes model versions and settings that change comparability, including the document and query modes where applicable. Credentials are provided separately from this profile. |
| `IndexSnapshot` | source repository, indexed Git commit, effective `IndexSourceScope`, embedding space identity, packaged index | A portable copy of a complete `SemanticRepositoryIndex` for a pushed commit, distributed as a GitHub Release asset by the adopting repository. Carries the provenance needed to decide whether it can be reused. |
| `SemanticSearchResult` | indexed Git commit, repository-relative path, start and end lines | A ranked source location returned from the `SemanticRepositoryIndex`. The line range refers to the file at the indexed commit. |
| `TokenEstimate` | characters returned, estimated tokens | A deterministic estimate of the tokens in one response, derived from its character count and always labelled as an estimate. The same response always gives the same figure. |
| `ResponseCap` | maximum estimated tokens, default applies when unset | The owner's limit on the `TokenEstimate` of one search or passage response, set under `semanticIndex` in `OntologyConfig` and read from trusted committed settings. A response over the cap is cut and marked truncated, not failed. |
| `PassageExtract` | indexed Git commit, repository-relative path, start and end lines, text, `TokenEstimate`, truncation marker | The text of the cited lines of one `SemanticSearchResult`, read from the indexed commit and bounded by the `ResponseCap`. A truncated extract states the lines returned and the first line not returned. |
| `OidcClientConfig` | `ONTOLOGY_OIDC_TOKEN_URL`, `ONTOLOGY_OIDC_CLIENT_ID`, `ONTOLOGY_OIDC_CLIENT_SECRET` | The three settings that select OIDC client-credentials authentication. All or none must be set; a partial set is an error, never a silent fallback. |
| `RequestBudget` | `ONTOLOGY_MAX_REQUEST_CHARS`, `ONTOLOGY_MODEL_TIMEOUT_MS` | The complete-request character budget and the model timeout the `DriftReviewer` and the `SemanticReviewWorker` run with. Defaults apply when a setting is unset or empty; a non-integer or non-positive value is an error. When the system prompt plus ontology projection leave too little room, the review is skipped with an explanation rather than failed. |
| `OntologyProjection` | `ProjectionMode`, name index, full rows, entries sent | The ontology evidence in one `SemanticReviewWorker` request. It always contains the name index, the evidence key of every ontology entry, and adds the full rows of every entry (`full`), or of the entries selected for that Markdown together with the relationships whose domain or range is one of them (`matched`). In `matched` mode the name index is grouped by section. The same Markdown, ontology and mode always give the same projection. |
| `Violation` | `file`, `line`, `column`, `message` | One flagged occurrence the `TermChecker` reports: an unknown backticked term, or a banned-alias paraphrase. |
| `SemanticFinding` | revision, file, passage, ontology evidence, suggested correction | A claim made by a `SemanticReviewRun` that changed Markdown conflicts with the ontology. Its identity is stable across reruns of the same revision and is reconsidered on a new revision. |
| `FindingDismissal` | `SemanticFinding`, revision, maintainer, reason | A maintainer's recorded decision to disregard one `SemanticFinding` for one PR revision. It survives reruns of that revision and expires when the PR changes. |
| `GraphNamingResult` | graph node, compared values, ontology item, reason, suggested correction | A likely mismatch a `GraphNamingRun` reports between a `GraphNode`'s label, `kit:denotes` target or implemented concept and the `Ontology`. Its identity derives from the node, the compared values and the ontology item, not the revision or the model's wording, so the same mismatch on a later revision is the same result. It takes effect only when a permitted reviewer accepts it. |
| `NamingSettlement` | `GraphNamingResult`, pull request, `SettlementDecision`, reviewer, reason, deferral issue | A permitted reviewer's decision on one `GraphNamingResult` for one pull request. It survives later revisions that produce the same result; the latest settlement on the pull request applies. A rejection carries a reason; a deferral links the new issue that records the result. |
| `BehaviourReference` | feature slug, behaviour id | The permanent name `<slug>#B<n>` of a `FeatureBehaviour`, used outside its own feature documents because every feature has its own B1. |
| `RetiredDesignLink` | assertion, retired `FeatureBehaviour` or inactive `DesignDecision`, replacement or successor | A `GraphAssertion` that still links a retired `FeatureBehaviour` or a superseded or deprecated `DesignDecision`. `GraphChecker` reports it without failing, so an amendment can list the code and tests it affects. |

---

## Enums

Every value is listed. A code enum whose members drift from this list is exactly what the optional
enum lock test catches.

| Name | Values | Description |
|------|--------|-------------|
| `Ownership` | `Kit`, `Adopter` | Who owns a `PlanEntry`'s destination file. `Kit`-owned files (the scripts, the CI workflow) are replaced wholesale by `--force`; `Adopter`-owned files (`OntologyConfig`, `Ontology`, the enum test) survive `--force` and are discarded only by the separate `--reset-content`. Spelled `"kit"` / `"adopter"` in code. |
| `SemanticOutcome` | `reviewed`, `partial`, `unavailable`, `disabled`, `out-of-scope`, `no-eligible`, `too-large` | The outcome of one `SemanticReviewRun` or `GraphNamingRun`, which controls that review's fixed status. `too-large` is non-blocking like `unavailable`, but records that the `RequestBudget` left no room for the ontology projection, so the status and the pull request record name the budget instead of an outage. |
| `SettlementDecision` | `accepted`, `rejected`, `deferred` | The decision a `NamingSettlement` records. `accepted` makes the `GraphNamingResult` a required correction that holds the merge until a revision no longer reports it; `rejected` and `deferred` let the pull request proceed. |
| `AuthMode` | `Oidc`, `Static`, `None` | Which credential a `ModelAuthProvider` resolved: a complete `OidcClientConfig`, the static key variable, or nothing. `Oidc` wins over `Static`; a partial `OidcClientConfig` is an error, not `Static`. |
| `ProjectionMode` | `matched`, `full` | How the `SemanticReviewWorker` builds each `OntologyProjection`. `matched`, the default, sends full rows only for the entries selected for the Markdown in the request; `full` sends every row, as before this mode existed. Set by `semanticReview.projection` in `OntologyConfig`. |
| `BehaviourStatus` | `current`, `retired` | Whether a `FeatureBehaviour` is still declared in its feature's behaviours or has moved to the Retired behaviours section. |
| `DecisionStatus` | `proposed`, `accepted`, `superseded`, `deprecated` | The first word of a `DesignDecision`'s Status line. `superseded` and `deprecated` make links to it a `RetiredDesignLink`; "amended by" leaves it `accepted`. |

---

## Use Cases

| Name | Actor | Description |
|------|-------|-------------|
| `Install` | Adopter | First run of the `Installer` against a `TargetRepository`: writes every `PlanEntry` whose destination does not already exist, and splices `OntologyProtocol` into the `AgentInstructionFile`. |
| `Upgrade` | Adopter | Re-running the `Installer` with `--force`: replaces every `Kit`-owned `PlanEntry` with the shipped version, leaving every `Adopter`-owned one untouched. |
| `ResetContent` | Adopter | Re-running the `Installer` with `--reset-content`: also discards `Adopter`-owned files back to the shipped templates. Destructive by design. |
| `SeedOntology` | Adopter, guided by `OntologySetupSkill` | Reading a `TargetRepository`'s own code and docs and drafting `Ontology`'s real rows from them, in place of the installed example rows. |
| `CheckOntologyTerms` | CI, or Adopter locally | Running the `TermChecker` against a `TargetRepository`'s tracked Markdown (plus any `--also` paths) and reporting every `Violation`. |
| `ReviewOntologyDrift` | CI, when `DriftReviewer` is installed | The optional advisory pass for paraphrase drift the `TermChecker` cannot see. |
| `ReviewSemanticMatch` | CI, for an eligible pull request | The blocking semantic assessment of each changed, eligible Markdown file in full, with an explicitly nonblocking result when review cannot run. |
| `RefreshSourceKnowledgeGraph` | AI agent, before a pull request | Review changed files within declared `GraphCoverage` and update the proposed `SourceKnowledgeGraph` or record that its existing assertions still hold, including the nodes, `kit:implements` links and `GraphEvidence` for implemented components and symbols, and a proposed widening of `GraphCoverage` when new code for a concept lies in unknown scope. |
| `CheckSourceKnowledgeGraph` | CI, on a pull request | Deterministically check the proposed `SourceKnowledgeGraph` and whether changed files in declared `GraphCoverage` were reviewed before merge; leave semantic truth to maintainers. |
| `GroundWithSourceKnowledgeGraph` | AI coding agent | Find relevant `GraphAssertion`s for a repository task, inspect their `GraphEvidence`, distinguish inferences from directly evidenced claims, and identify unknown or stale areas instead of inventing facts. |
| `AuthorGraphEntry` | AI agent, on a developer's request | Add or refine a `GraphNode` or `GraphAssertion` by choosing its label, kind, concept link and `GraphEvidence` by the authoring guidance, keeping identity on refinement, and reporting the choices made. |
| `FindConceptImplementations` | AI agent or developer | Start from an `Ontology` concept and list, through the `GraphReader`, the `GraphNode`s that denote it and the `kit:implements` assertions that link source elements to them, with evidence, basis and staleness. |
| `ReviewGraphNaming` | CI, for an eligible pull request | The opt-in, model-assisted `GraphNamingRun` over a pull request's graph names, reporting `GraphNamingResult`s that hold the merge until settled. |
| `SettleGraphNamingResult` | Reviewer with write access | Accept, reject with a reason, or defer to a new issue one or all unsettled `GraphNamingResult`s on a pull request in a single action, recording a `NamingSettlement`. |
| `RenderSourceKnowledgeGraph` | Maintainer, through a Git workflow | Generate a human-readable Markdown document of the current `SourceKnowledgeGraph`, preserving its recorded claims, evidence access, direct or inferred basis, coverage limits, and references for finding the underlying Turtle. The Turtle remains canonical; rendering does not judge semantic accuracy. |
| `ShowIndexedPassage` | AI coding agent or developer | Retrieve the `PassageExtract` for one `SemanticSearchResult` so that only the cited lines are read, from the indexed commit and within the `IndexSourceScope`, instead of the whole file. |
| `ReportIndexTokenUse` | Developer or repository owner | Summarise the `SearchTokenLog` as command count, total and mean `TokenEstimate`, and largest response, so token cost has a baseline. Reads only the local log. |
| `FindBehaviourLinks` | AI agent or developer | Start from a `BehaviourReference` and list, through the `GraphReader`, the components, symbols and tests linked to its `FeatureBehaviour`, with evidence, basis, status and staleness. |
| `FindCodeDesignLinks` | AI agent or developer | Start from a source symbol, source file or component and list, through the `GraphReader`, the `FeatureBehaviour`s it implements and the `DesignDecision`s it is documented by, directly or through the component that contains it. |

---

## Relationships

| From | Relationship | To | Cardinality |
|------|--------------|----|-------------|
| `Installer` | writes | `Ontology` | 1 → 1 |
| `Installer` | writes | `OntologyConfig` | 1 → 1 |
| `Installer` | splices | `OntologyProtocol` | 1 → 1 |
| `Installer` | computes | `PlanEntry` | 1 → many |
| `OntologyProtocol` | is spliced into | `AgentInstructionFile` | 1 → 1 |
| `OntologyConfig` | has | `AllowlistEntry` | 1 → many |
| `OntologyConfig` | has | `BannedAlias` | 1 → many |
| `OntologyConfig` | describes | `IndexSourceScope` | 1 → 0 or 1 |
| `OntologyConfig` | describes | `EmbeddingProfile` | 1 → 0 or 1 |
| `SemanticRepositoryIndex` | belongs to a checkout of | `TargetRepository` | many → 1 |
| `SemanticRepositoryIndex` | indexes under | `IndexSourceScope` | many → 1 |
| `SemanticRepositoryIndex` | returns | `SemanticSearchResult` | 1 → 0 or many per search |
| `SemanticRepositoryIndex` | records use in | `SearchTokenLog` | 1 → 1 per checkout |
| `SearchTokenLog` | holds | `TokenEstimate` | 1 → 0 or many |
| `PassageExtract` | answers | `SemanticSearchResult` | many → 1 |
| `OntologyConfig` | sets | `ResponseCap` | 1 → 0 or 1 |
| `IndexSnapshot` | packages | `SemanticRepositoryIndex` | many → 1 |
| `TermChecker` | reads | `Ontology` | many → 1 |
| `TermChecker` | reads | `OntologyConfig` | many → 1 |
| `TermChecker` | produces | `Violation` | 1 → many |
| `SemanticReviewRun` | reports | `SemanticFinding` | 1 → many |
| `SemanticFinding` | may have | `FindingDismissal` | 1 → 0 or 1 |
| `SemanticReviewTrigger` | starts | `SemanticReviewWorker` | many → 1 |
| `SemanticReviewWorker` | produces | `SemanticReviewRun` | 1 → many |
| `SemanticReviewWorker` | reads | `OntologyConfig` | many → 1 |
| `SemanticReviewWorker` | reads | `Ontology` | many → 1 |
| `SemanticReviewWorker` | builds | `OntologyProjection` | 1 → many (one per request) |
| `OntologyProjection` | follows | `ProjectionMode` | many → 1 |
| `SemanticStatusPublisher` | publishes | `SemanticReviewRun` | 1 → many |
| `SemanticDismissalHandler` | records | `FindingDismissal` | 1 → many |
| `GraphNamingTrigger` | starts | `GraphNamingWorker` | many → 1 |
| `GraphNamingWorker` | produces | `GraphNamingRun` | 1 → many |
| `GraphNamingWorker` | authenticates through | `ModelAuthProvider` | many → 1 |
| `GraphNamingWorker` | runs within | `RequestBudget` | many → 1 |
| `GraphNamingPublisher` | publishes | `GraphNamingRun` | 1 → many |
| `GraphNamingSettlementHandler` | records | `NamingSettlement` | 1 → many |
| `GraphNamingRun` | reports | `GraphNamingResult` | 1 → many |
| `GraphNamingRun` | reads | `SourceKnowledgeGraph` | many → 1 |
| `GraphNamingResult` | may have | `NamingSettlement` | 1 → 0 or 1 per pull request |
| `SourceKnowledgeGraph` | contains | `GraphAssertion` | 1 → 0 or many |
| `SourceKnowledgeGraph` | contains | `GraphNode` | 1 → 0 or many |
| `SourceKnowledgeGraph` | declares | `GraphCoverage` | 1 → many |
| `SourceKnowledgeGraph` | records | `GraphRefreshRecord` | 1 → 0 or many |
| `SourceKnowledgeGraph` | uses | `GraphVocabulary` | many → 1 |
| `GraphAssertion` | links | `GraphNode` | 1 → 2 |
| `GraphAssertion` | cites | `GraphEvidence` | 1 → 1 or many |
| `GraphReader` | reads | `SourceKnowledgeGraph` | many → 1 |
| `GraphChecker` | validates | `SourceKnowledgeGraph` | many → 1 |
| `GraphCheckWorkflow` | runs | `GraphChecker` | many → 1 |
| `GraphRenderer` | reads | `SourceKnowledgeGraph` | many → 1 |
| `GraphRenderer` | delegates validation to | `GraphChecker` | many → 1 |
| `GraphRenderWorkflow` | runs | `GraphRenderer` | many → 1 |
| `Installer` | splices | `GraphAgentProtocol` | 1 → 0 or 1 |
| `DriftReviewer` | authenticates through | `ModelAuthProvider` | many → 1 |
| `SemanticReviewWorker` | authenticates through | `ModelAuthProvider` | many → 1 |
| `ModelAuthProvider` | reads | `OidcClientConfig` | many → 1 |
| `DriftReviewer` | runs within | `RequestBudget` | many → 1 |
| `SemanticReviewWorker` | runs within | `RequestBudget` | many → 1 |
| `FeatureBehaviour` | replaced by | `FeatureBehaviour` | many → 0 or 1 |
| `DesignDecision` | superseded by | `DesignDecision` | many → 0 or 1 |
| `GraphChecker` | reports | `RetiredDesignLink` | 1 → 0 or many |
| `GraphChecker` | reads documents through | `DesignDocumentReader` | many → 1 |
| `GraphReader` | reads documents through | `DesignDocumentReader` | many → 1 |

---

## Business Rules & Invariants

- **`Installer`** — refuses to run against a `TargetRepository` that is not already a git
  repository; it will not initialise one itself.
- **`Installer`** — refuses to splice `OntologyProtocol` into an `AgentInstructionFile` that already
  has a hand-written "## Ontology protocol" heading with none of its own markers, rather than
  produce two contradictory copies.
- **`PlanEntry`** — a `Kit`-owned entry is replaced wholesale by `--force`; an `Adopter`-owned entry
  is replaced only by the separate, deliberately destructive `--reset-content`. Plain `--force` must
  never touch adopter content — that is what makes it the safe, routine upgrade path.
- **`SemanticFinding`** — is grounded only when its quote is an exact substring of the reviewed file and its
  evidence names a real ontology item; a wrong or singular section prefix is resolved to the unique item
  with that name and the finding carries the canonical key. A reply that cannot be read, or a finding that
  cannot be grounded, leaves the file not reviewed with a fixed reason that never contains model output.
- **`SemanticReviewWorker`** — never reports an ontology that outgrew the `RequestBudget` as a service or
  configuration outage, and never passes it without saying so: a too-large ontology is stated as such in
  the status description and the pull request record.
- **`OntologyProjection`** — always contains the name index of every ontology entry, so a finding may
  cite any entry, including one sent by name only. It never sends one row of an evidence key without
  the other rows that share that key, and the same inputs always give the same projection.
- **`DriftReviewer`** — never fails a job merely because the ontology outgrew the `RequestBudget`;
  it reports a skipped review. A malformed `RequestBudget` setting is a configuration error and
  does fail.
- **`ModelAuthProvider`** — never includes the client secret, a token, or the token endpoint's response
  body in an error or log line; reports the HTTP status only.
- **`OntologyConfig`** — every `AllowlistEntry` must carry a non-empty reason; an entry with no
  reason is rejected rather than silently accepted.
- **`OntologyConfig`** — an unknown top-level key, or an unknown key under `sections`, is a
  validation error, never a silently ignored typo.
- **`Ontology`** — a canonical term is a backticked PascalCase span with at least one lowercase
  letter after the leading capital; an all-caps token (`README`, `API`) is never treated as a
  canonical term or flagged as a violation, trading missed detections for avoiding a wall of false
  positives on an adopting repository's first run.
- **`TermChecker`** — exits `0` clean, `1` on violations, `2` when it cannot run at all (a broken or
  missing `OntologyConfig`), so "the config is broken" is always distinguishable from "the prose is
  wrong."
- **`TermChecker`** — never flags an occurrence inside a fenced code block; a banned-alias match
  immediately touching a quote character is a meta-mention, not drift.
- The scripts and CI workflow every `PlanEntry` marks `Kit`-owned are byte-identical across every
  `TargetRepository` that has run `Install` — no repository-specific value may be baked into them.
  Anything that varies belongs in that repository's own `OntologyConfig`.
- Running `Install` against a `TargetRepository` creates no runtime dependency between it and this
  repository: no shared vocabulary, registry, or package resolved at runtime.
- **`GraphAssertion`** — an inferred relationship is explicitly labeled as an inference and cites
  the source observations behind it; neither the graph nor an agent presents it as directly
  observed merely because its evidence paths exist.
- **`GraphRefreshRecord`** — a changed file in the union of base and proposed covered scopes
  requires a current reviewed blob or deletion record even when its graph assertions remain valid.
- **`GraphRefreshRecord`** — every covered existing file has a record whose blob equals its current blob
  at the checked revision.
- **`OntologyConfig`** — a pull request cannot disable or relocate an enabled source graph check.
- **`GraphEvidence`** — its source path lies in declared covered scope, matches its eligible role,
  and resolves to the cited blob and line range in the graph's effective Git revision.
- **`GraphNamingResult`** — is reported only when it names a `GraphNode` in the proposed graph, quotes that node's current label or `kit:denotes` target exactly, and cites a real `Ontology` item. A label that contains the implemented concept's canonical name as a whole word sequence is never reported as a mismatch for that concept.
- **`GraphNamingResult`** — has no effect on merge or on the `SourceKnowledgeGraph` unless a permitted reviewer accepts it; no settlement is ever written into the graph or its generated Markdown.
- **`NamingSettlement`** — is recorded only for a person with write access to the repository (write, maintain, admin or owner role), on any pull request including their own; an AI agent never records one, under any identity.
- **`GraphChecker`** — makes no model call and needs no secret or network access after checkout; model-assisted naming review runs separately in `ReviewGraphNaming`.
- **`SemanticRepositoryIndex`** — searches only with a compatible `EmbeddingProfile`. A build,
  refresh or import publishes a complete local index or preserves the previous complete index.
- **`IndexSnapshot`** — a published snapshot represents one verified pushed commit in its own
  `TargetRepository`, and its GitHub Release resolves to the same commit. Credentials stay outside
  the snapshot.
- **`SearchTokenLog`** — stores no query text and no source text, and a failure to write it never fails a
  search or passage response.
- **`ResponseCap`** — a response over the cap is returned cut at the cap with a truncation marker; it
  is never refused for size. Only trusted committed configuration sets it.
- **`PassageExtract`** — is read from the indexed Git commit, never the working tree, and only for
  paths inside the effective `IndexSourceScope`.
- **`FeatureBehaviour`** — its `BehaviourReference` is never renumbered or reused; a declaration that
  reuses a retired id, or a node whose cited lines no longer declare its id, fails `GraphChecker`.
- **`RetiredDesignLink`** — is reported, never failed, so a behaviour can be retired before the code
  that links it is changed.
