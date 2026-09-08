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
| `Installer` | `bin/install-ontology.mjs` | Copies the kit's templates into a `TargetRepository` and splices `OntologyProtocol` into its `AgentInstructionFile`. Mechanical only — it writes no domain content. | Reads `templates/`; writes a `PlanEntry` list, `Ontology`, `OntologyConfig`. |
| `TermChecker` | `scripts/check-ontology-terms.mjs`, installed byte-identical into every adopting repository | Derives the canonical vocabulary from `Ontology` and scans tracked Markdown for an unknown backticked term or a paraphrase of a named `External System`. Runs in CI on every pull request. | Reads `Ontology` and `OntologyConfig`; produces `Violation`s. |
| `DriftReviewer` | `scripts/review-ontology-drift.mjs`, installed only with `--with-drift-review` | Advisory, model-assisted second pass that catches unbackticked paraphrase the `TermChecker` cannot see (e.g. "approved" drifting to "sent" in running prose). Never blocks a merge. | Not installed in this repository. |
| `OntologySetupSkill` | `skills/ontology-setup` | The agent skill that installs the mechanism, then supplies the judgement the mechanism cannot: which sections apply, and the real seeded content of an adopting repository's `Ontology`. | Drives `Installer`, then edits `Ontology` and `OntologyConfig` directly. |

---

## Entities

| Name | Properties | Description |
|------|------------|-------------|
| `TargetRepository` | `path` | The git repository (must already contain `.git`) the `Installer` writes into. Identity persists across repeated installs and upgrades of the same repository. |
| `Ontology` | `ontologyPath`, one Markdown table per section | The canonical vocabulary document a `TargetRepository` maintains (`docs/ontology.md` by default). Identity persists as sections and rows are added, renamed, or removed over the repository's life; this file, in this repository, is one instance of it. |
| `OntologyConfig` | `ontologyPath`, `sections`, `allowlist`, `bannedAliases`, `ignorePaths` | The one per-repository file (`ontology.config.json`) every installed script reads its repository-specific values through. Identity persists as its fields change; it is what lets the scripts themselves stay identical across repositories. |
| `AgentInstructionFile` | one of `AGENTS.md`, `CLAUDE.md` | Whichever file a `TargetRepository` already treats as authoritative for agent instructions (`AGENTS.md` preferred, `CLAUDE.md` otherwise, `AGENTS.md` created if neither exists). Carries the spliced `OntologyProtocol`. |

---

## Value Objects

| Name | Properties | Description |
|------|------------|-------------|
| `PlanEntry` | `template`, `dest`, `substitute`, `ownedBy` | One file an install would write, described before anything touches disk — what `--dry-run` prints. Defined entirely by these four values; a new one is computed on every run. |
| `AllowlistEntry` | `term`, `reason` | One term excused from the unknown-term check, with the written reason a reviewer would need to accept it. |
| `BannedAlias` | `phrase`, `nameInstead` | One paraphrase of a named `External System` that prose must not use, and the canonical name(s) to use instead. |
| `OntologyProtocol` | Markdown body between `<!-- ontology-protocol:start -->` / `<!-- ontology-protocol:end -->` | The instructions bound into an `AgentInstructionFile`: read `Ontology` before writing anything domain-touching, use its exact names, add a missing concept there first, update it in the same commit as the code change. Replaced wholesale on every install — re-running is what keeps it current, not an edit history of its own. |
| `Violation` | `file`, `line`, `column`, `message` | One flagged occurrence the `TermChecker` reports: an unknown backticked term, or a banned-alias paraphrase. |

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
