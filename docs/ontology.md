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
| `Installer` | `bin/install-ontology.mjs` | Copies the kit's templates into a `TargetRepository` and splices `OntologyProtocol`, and optionally `GraphAgentProtocol`, into its `AgentInstructionFile`. Mechanical only — it writes no repository-specific domain content. | Reads `templates/`; writes a `PlanEntry` list, `Ontology`, `OntologyConfig`, and optional graph starter files. |
| `TermChecker` | `scripts/check-ontology-terms.mjs`, installed byte-identical into every adopting repository | Derives the canonical vocabulary from `Ontology` and scans tracked Markdown for an unknown backticked term or a paraphrase of a named `External System`. Runs in CI on every pull request. | Reads `Ontology` and `OntologyConfig`; produces `Violation`s. |
| `DriftReviewer` | `scripts/review-ontology-drift.mjs`, installed only with `--with-drift-review` | Advisory, model-assisted second pass that catches unbackticked paraphrase the `TermChecker` cannot see (e.g. "approved" drifting to "sent" in running prose). Never blocks a merge. | Not installed in this repository. |
| `SemanticReviewTrigger` | kit-owned PR workflow, installed with `--with-semantic-review` | Runs without secrets or path filtering so a trusted follow-up review can produce a result for each PR revision. | Its completion triggers `SemanticReviewWorker`; it passes no executable PR artefact. |
| `SemanticReviewWorker` | kit-owned trusted follow-up workflow and script | Assesses the full contents of changed eligible Markdown against the proposed `Ontology`, using maintainer-owned model settings and an environment secret; records incomplete coverage rather than silently dropping files. | Executes from the default branch; treats PR files and model output as data. |
| `SemanticStatusPublisher` | kit-owned status and PR-comment logic | Publishes the latest `SemanticReviewRun` outcome as a fixed commit status and preserves each run's visible PR record. | Reads `SemanticFinding`s and `FindingDismissal`s; writes GitHub statuses and comments. |
| `SemanticDismissalHandler` | kit-owned issue-comment workflow and script | Verifies a maintainer's reasoned dismissal of one current `SemanticFinding` and recomputes the current status. | Reads PR comments and repository permissions; does not invoke the model. |
| `OntologySetupSkill` | `skills/ontology-setup` | The agent skill that installs the mechanism, then supplies the judgement the mechanism cannot: which sections apply, and the real seeded content of an adopting repository's `Ontology`. | Drives `Installer`, then edits `Ontology` and `OntologyConfig` directly. |
| `GraphReader` | kit-owned local reader script | Finds nodes, assertions, bounded paths, evidence, and coverage in a `SourceKnowledgeGraph` at a named Git revision. Reports gaps and stale results without creating new assertions. | Reads adopter-owned graph files and local Git objects; produces grounded query results for an agent or downstream consumer. |
| `GraphChecker` | kit-owned local checker script | Deterministically validates graph structure, evidence locations, declared coverage, and review of covered file changes before a pull request merges. | Reads adopter-owned graph data, `OntologyConfig`, and local base and proposed Git trees; reports failures without judging semantic truth. |
| `GraphCheckWorkflow` | kit-owned pull-request and default-branch workflow | Runs `GraphChecker` with read-only access to the checked-out Git history and publishes a stable check result. | Reads graph data and Git trees after checkout; has no model, secret, or post-checkout network requirement. |

---

## Entities

| Name | Properties | Description |
|------|------------|-------------|
| `TargetRepository` | `path` | The git repository (must already contain `.git`) the `Installer` writes into. Identity persists across repeated installs and upgrades of the same repository. |
| `Ontology` | `ontologyPath`, one Markdown table per section | The canonical vocabulary document a `TargetRepository` maintains (`docs/ontology.md` by default). Identity persists as sections and rows are added, renamed, or removed over the repository's life; this file, in this repository, is one instance of it. |
| `OntologyConfig` | `ontologyPath`, `sections`, `allowlist`, `bannedAliases`, `ignorePaths`, optional `semanticReview`, optional `sourceGraph` | The one per-repository file (`ontology.config.json`) every installed script reads its repository-specific settings through. Identity persists as its fields change; it is what lets the scripts themselves stay identical across repositories. The `semanticReview` settings are read from the trusted default branch, not an unmerged PR. The optional `sourceGraph` settings locate adopter-owned graph data and select eligible evidence roles. |
| `SourceKnowledgeGraph` | source repository, effective Git revision, Turtle resources for assertions, declared coverage, file review records | A reviewable, versioned account of repository facts and clearly marked inferences that extends beyond the canonical vocabulary in `Ontology`. It is stored as Turtle with the source repository; its effective revision is the Git commit containing it, not a hash embedded in its own files. An agent prepares it before a pull request; its assertions ground later agent work and may support downstream views. Missing coverage is explicit. |
| `GraphNode` | stable identity, kind, label, canonical ontology IRI when kind is concept | A repository concept, source element, dependency, or other subject or object named by a `GraphAssertion`. A concept node links to its canonical `Ontology` IRI instead of reusing the ontology class IRI as a graph node. Its identity remains stable when a label or source location changes. |
| `GraphAssertion` | stable identity, subject, relationship, object, basis, evidence | One reviewable claim in a `SourceKnowledgeGraph` about a repository fact or relationship. Its basis distinguishes a directly evidenced claim from an inference supported by source observations. Its identity persists when the same claim is refreshed at a later source revision. |
| `AgentInstructionFile` | one of `AGENTS.md`, `CLAUDE.md` | Whichever file a `TargetRepository` already treats as authoritative for agent instructions (`AGENTS.md` preferred, `CLAUDE.md` otherwise, `AGENTS.md` created if neither exists). Carries the spliced `OntologyProtocol` and optionally `GraphAgentProtocol`. |
| `SemanticReviewRun` | pull request, revision, eligible files, reviewed files, outcome | One attempt to assess changed Markdown against the ontology. Its outcome controls the current semantic check; a later run supersedes it even when that later run cannot review. |

---

## Value Objects

| Name | Properties | Description |
|------|------------|-------------|
| `PlanEntry` | `template`, `dest`, `substitute`, `ownedBy` | One file an install would write, described before anything touches disk — what `--dry-run` prints. Defined entirely by these four values; a new one is computed on every run. |
| `AllowlistEntry` | `term`, `reason` | One term excused from the unknown-term check, with the written reason a reviewer would need to accept it. |
| `BannedAlias` | `phrase`, `nameInstead` | One paraphrase of a named `External System` that prose must not use, and the canonical name(s) to use instead. |
| `OntologyProtocol` | Markdown body between `<!-- ontology-protocol:start -->` / `<!-- ontology-protocol:end -->` | The instructions bound into an `AgentInstructionFile`: read `Ontology` before writing anything domain-touching, use its exact names, add a missing concept there first, update it in the same commit as the code change. Replaced wholesale on every install — re-running is what keeps it current, not an edit history of its own. |
| `GraphAgentProtocol` | marked Markdown body in an `AgentInstructionFile` | Optional instructions to read the graph with its evidence and gaps, review covered source changes before a pull request, and update assertions or record no fact change. Replaced as a Kit-owned block on install or upgrade. |
| `GraphEvidence` | source path, line range, Git blob ID, role, effective Git revision | A source reference supporting one `GraphAssertion`, whether the source is code, a test, a selected design document, the `Ontology`, or an eligible deployment file. For an inferred assertion it identifies the observations behind the inference, not direct proof of the relationship. Its effective revision comes from the containing graph commit. |
| `GraphCoverage` | repository-relative selector, status, priority, reason | The portion of a `TargetRepository` that a `SourceKnowledgeGraph` declares covered, unknown, or excluded. The highest matching priority wins; unmatched paths remain unknown. Missing coverage remains visible rather than being inferred from absent assertions. |
| `GraphVocabulary` | schema version, core kind and relationship IRIs, defined local extensions | The shared meanings allowed for `GraphNode` kinds and `GraphAssertion` relationships. The Kit versions a small core of `kit:` IRIs; an adopter may declare additional IRIs in its own namespace with definitions in its Turtle manifest. |
| `GraphRefreshRecord` | covered path, current Git blob ID or deletion, review outcome | The current review of one covered source path for graph impact, including a decision that no graph fact changed. Replaced when that path changes; it is a snapshot rather than an event log. |
| `Violation` | `file`, `line`, `column`, `message` | One flagged occurrence the `TermChecker` reports: an unknown backticked term, or a banned-alias paraphrase. |
| `SemanticFinding` | revision, file, passage, ontology evidence, suggested correction | A claim made by a `SemanticReviewRun` that changed Markdown conflicts with the ontology. Its identity is stable across reruns of the same revision and is reconsidered on a new revision. |
| `FindingDismissal` | `SemanticFinding`, revision, maintainer, reason | A maintainer's recorded decision to disregard one `SemanticFinding` for one PR revision. It survives reruns of that revision and expires when the PR changes. |

---

## Enums

Every value is listed. A code enum whose members drift from this list is exactly what the optional
enum lock test catches.

| Name | Values | Description |
|------|--------|-------------|
| `Ownership` | `Kit`, `Adopter` | Who owns a `PlanEntry`'s destination file. `Kit`-owned files (the scripts, the CI workflow) are replaced wholesale by `--force`; `Adopter`-owned files (`OntologyConfig`, `Ontology`, the enum test) survive `--force` and are discarded only by the separate `--reset-content`. Spelled `"kit"` / `"adopter"` in code. |

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
| `RefreshSourceKnowledgeGraph` | AI agent, before a pull request | Review changed files within declared `GraphCoverage` and update the proposed `SourceKnowledgeGraph` or record that its existing assertions still hold. |
| `CheckSourceKnowledgeGraph` | CI, on a pull request | Deterministically check the proposed `SourceKnowledgeGraph` and whether changed files in declared `GraphCoverage` were reviewed before merge; leave semantic truth to maintainers. |
| `GroundWithSourceKnowledgeGraph` | AI coding agent | Find relevant `GraphAssertion`s for a repository task, inspect their `GraphEvidence`, distinguish inferences from directly evidenced claims, and identify unknown or stale areas instead of inventing facts. |

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
| `TermChecker` | reads | `Ontology` | many → 1 |
| `TermChecker` | reads | `OntologyConfig` | many → 1 |
| `TermChecker` | produces | `Violation` | 1 → many |
| `SemanticReviewRun` | reports | `SemanticFinding` | 1 → many |
| `SemanticFinding` | may have | `FindingDismissal` | 1 → 0 or 1 |
| `SemanticReviewTrigger` | starts | `SemanticReviewWorker` | many → 1 |
| `SemanticReviewWorker` | produces | `SemanticReviewRun` | 1 → many |
| `SemanticReviewWorker` | reads | `OntologyConfig` | many → 1 |
| `SemanticReviewWorker` | reads | `Ontology` | many → 1 |
| `SemanticStatusPublisher` | publishes | `SemanticReviewRun` | 1 → many |
| `SemanticDismissalHandler` | records | `FindingDismissal` | 1 → many |
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
| `Installer` | splices | `GraphAgentProtocol` | 1 → 0 or 1 |

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
- **`GraphEvidence`** — its source path lies in declared covered scope, matches its eligible role,
  and resolves to the cited blob and line range in the graph's effective Git revision.
