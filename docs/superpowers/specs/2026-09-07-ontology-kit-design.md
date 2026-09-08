# Ontology Kit — design

**Date:** 2026-09-07
**Status:** Approved for planning

## Problem

`the integration repository` maintains an internal application ontology — a canonical domain vocabulary in
`docs/ontology.md`, a protocol binding AI agents to read it before and update it after every
domain-touching task, and CI enforcement of that vocabulary across the repo's Markdown. The
feature was later carried into `the application repository` by hand, with AI assistance. That port took
substantial effort that was not the interesting part of the work: rewriting an ~80-entry
allowlist inside the script's source, changing section names, adapting the protocol prose, and
dropping the half of the tooling that depended on personal infrastructure.

This repository generalises the mechanism so a third repository can adopt it without repeating
that work.

## Goals

- One command installs the mechanism into any git repository.
- The judgement-heavy part — writing that repository's actual ontology — is captured as a skill
  rather than left as tribal knowledge.
- A later fix to the mechanism reaches an adopting repository as a file copy, not a hand merge.
- Every adopting repository is completely self-contained.

## Non-goals

- **No cross-repository coupling of any kind.** No shared vocabulary, no registry, no server, no
  package resolved at runtime, no content flowing between repositories. Installation is a one-time
  transfer of files. Two repositories that both installed the kit have no relationship to each
  other, and neither has any relationship to this one.
- No CI provider other than GitHub Actions.
- This repository does not run the ontology check on itself; it has no application domain.

## What the mechanism is

Extracted from `the integration repository` (full form) and `the application repository` (reduced port):

1. **`docs/ontology.md`** — the canonical vocabulary, as Markdown tables under named `##` sections.
   Every domain concept appears there as a backticked PascalCase term. `the integration repository` uses nine
   sections (External Systems, Subsystems, Aggregate Roots, Entities, Value Objects, Domain Events,
   Enums, Relationships, Business Rules & Invariants); `the application repository` uses six, including one
   (Use Cases) the other lacks. The section set is therefore per-repository, not universal.

2. **A protocol section** in the repository's authoritative agent-instruction file
   (`CLAUDE.md` §2 in one repo, `AGENTS.md` in the other): read the ontology in full before
   writing anything that touches domain concepts; use its exact names; add missing concepts there
   first; update it in the same commit as the code change.

3. **A deterministic linter** (`scripts/check-ontology-terms.ts` today). It derives the canonical
   term set from backticked PascalCase terms in the ontology file, then scans every git-tracked
   `.md` file for two violations: a backticked PascalCase term that is neither canonical nor
   allowlisted, and — where the repository names External Systems — a prose paraphrase of one of
   them. Quoted occurrences are treated as meta-mentions and permitted. Zero dependencies.

4. **A CI workflow** running that linter on pull requests and pushes to the default branch. This
   is the blocking half of the defence.

5. **An advisory semantic reviewer** (`the integration repository` only). It projects the ontology down to its
   canonical catalogues, extracts added Markdown lines from the pull request's diff, batches them
   under a character budget with recursive splitting on a 413, asks a model to report paraphrase
   drift the deterministic pass cannot see, and upserts a single pull request comment. Findings
   never fail CI; only infrastructure failure turns the job red, which is deliberately visually
   distinct from "reviewed, found nothing". A separate unguarded job tests the deterministic
   preparation logic and is itself blocking.

6. **Enum lock tests** (`the application repository` only). Unit tests asserting the code's enum members exactly
   match the ontology's declared member lists. This catches drift in code, which the Markdown
   linter cannot see at all.

## Design

### Repository layout

```
bin/install-ontology.mjs                    mechanical installer
templates/
  scripts/check-ontology-terms.mjs          identical in every adopting repo
  scripts/review-ontology-drift.mjs         optional
  scripts/review-ontology-drift.test.mjs    optional
  ontology.config.json                      the only per-repo file
  docs/ontology.md                          annotated template, all sections
  docs/ontology-drift-review.md             optional runbook
  github/workflows/ontology-lint.yml
  github/workflows/ontology-drift-review.yml
  protocol/ontology-protocol.md             spliced into the agent-instruction file
  enum-tests/csharp-xunit.cs
  enum-tests/typescript-vitest.ts
  enum-tests/python-pytest.py
skills/ontology-setup/SKILL.md
skills/ontology-setup/references/
docs/how-it-works.md                        the extracted explanation
tests/                                      node --test
```

### Script language

Installed scripts are plain `.mjs` JavaScript. The two existing repositories run TypeScript
directly under Node, but at different versions and with different flags — `the integration repository` needs
Node 24 to run `.ts` bare, `the application repository` passes `--experimental-strip-types` on Node 22. Since
the script is now byte-identical across repositories, its portability across Node versions matters
more than its authoring ergonomics. Types are expressed in JSDoc where useful.

### Configuration

All per-repository variation moves out of the script and into `ontology.config.json`, sitting in
the adopting repository and describing only that repository:

```json
{
  "ontologyPath": "docs/ontology.md",
  "sections": {
    "required": ["Entities", "Enums", "Relationships", "Business Rules & Invariants"],
    "optional": ["External Systems", "Subsystems", "Aggregate Roots",
                 "Value Objects", "Domain Events", "Use Cases"]
  },
  "allowlist":     [{ "term": "IClock", "reason": "architecture interface, not a domain concept" }],
  "bannedAliases": [{ "phrase": "the billing platform", "nameInstead": ["VendorPortal"] }],
  "ignorePaths":   ["CHANGELOG.md"]
}
```

`reason` is required on every allowlist entry. Today the justification is a comment convention
that nothing enforces; making it a schema field turns an unexplained entry into a config error.

`sections` is consumed by the semantic reviewer's projection, replacing that script's hard-coded
nine-section list while preserving its behaviour of failing when a `required` section is missing,
duplicated, or empty. `optional` sections are projected when present and ignored when absent. The
linter itself does not check section structure — it reads backticked terms from the whole ontology
file regardless of which section they sit under, exactly as the existing script does.

`ignorePaths` entries are matched as glob patterns against repository-relative paths.

The linter exits non-zero with a clear message if the config is absent, malformed, or names an
ontology file that does not exist.

### Linter behaviour

Identical to the `the integration repository` script's two checks, with the repository-specific values read
from config and one addition: an `--also <path>...` argument that lints files outside the git
index. `the application repository`'s `AGENTS.md` documents a four-step `git add -N` workaround for checking a
drafted pull request body, needed because the script only reads `git ls-files "*.md"`. The
argument removes the workaround.

Banned-alias checking is not a separate installable option: the code always ships, and is inert
when `bannedAliases` is empty, which is the case for a repository with no External Systems.

### Installer

```
node bin/install-ontology.mjs --target <repo>
       [--dry-run] [--force]
       [--with-drift-review]
       [--with-enum-tests csharp|typescript|python]
```

Behaviour:

- Refuses a target that is not a git repository.
- `--dry-run` prints the file plan and exits without writing.
- Never overwrites an existing file without `--force`.
- Copies the scripts, workflow, config and ontology template.
- Detects the authoritative agent-instruction file — `AGENTS.md`, else `CLAUDE.md`, else creates
  `AGENTS.md` — and splices the protocol section between
  `<!-- ontology-protocol:start -->` and `<!-- ontology-protocol:end -->` markers. Re-running
  replaces the content between the markers in place rather than appending a second copy.
- Substitutes placeholders: project name, ontology path, script paths.
- Prints the remaining manual steps.

Idempotence is what makes a later upgrade one command rather than a merge.

### Skill

`ontology-setup` performs the part the installer cannot:

1. Survey the target repository's docs, specs and code. Propose which ontology sections apply;
   prune the template to those; record the kept set in `sections`.
2. Draft the repository's actual `docs/ontology.md` from what exists — entities, enums,
   relationships, invariants already implied by its specs and code. Present it for review and
   iterate. For a greenfield repository, fall back to the annotated template.
3. Run the linter and triage the violations into two groups: prose that genuinely uses a wrong
   name, which is fixed; and non-domain terms, for which allowlist entries with written
   justifications are **proposed for approval, never auto-applied**.
4. Install the optional pieces if asked, and adapt the enum-lock-test template to the repository's
   actual enums and test framework.
5. Commit.

Reference files hold the deeper material: seeding an ontology, allowlist discipline, the drift
reviewer's setup, and the enum-lock-test patterns per language.

### Semantic drift reviewer, generalised

The reviewer is carried over with its structure intact — ontology projection, added-line
extraction, character-budgeted batching, recursive splitting on a token-limit 413, single upserted
pull request comment, advisory-only semantics, and the separate blocking job that tests the
preparation logic without invoking a model.

Personal infrastructure is removed. There is no Tailscale step, no gateway health-check against a
named host, and no retired-model-alias guard. The script talks to any OpenAI-compatible endpoint
configured entirely through environment variables — `ONTOLOGY_LLM_BASE_URL`, `ONTOLOGY_MODEL`,
`ONTOLOGY_LLM_API_KEY` — and the workflow template carries a commented placeholder where a
repository that needs private network access can add its own step. The separation the original
enforces between the model-authenticated path and the GitHub-authenticated path is preserved: the
GitHub token is never sent to the model endpoint.

### Testing

`node --test` in this repository covers:

- The linter, against fixture ontologies and Markdown files, asserting exact violations for the
  unknown-term check, the banned-alias check, quoted meta-mentions, the allowlist, `ignorePaths`,
  and `--also` paths.
- Config validation: missing file, malformed JSON, allowlist entry without a `reason`, ontology
  path that does not exist.
- The reviewer's pure functions — projection (including the missing, duplicated and empty section
  failures), added-line extraction, and batch construction.
- The installer, against a temporary git repository: correct files written, refusal without
  `--force`, `--dry-run` writing nothing, protocol splicing into each of the three
  agent-instruction cases, and an idempotent second run.

### Documentation

`docs/how-it-works.md` explains the mechanism itself: what the ontology is for, why the defence has
a deterministic and a semantic half, what each half catches, and what neither catches. `README.md`
covers installation and the options.

## Risks

- **The linter's term set is only as good as the ontology file.** A repository that seeds a thin
  ontology gets a linter that flags heavily and pushes people toward the allowlist. The skill's
  triage step exists to resist that, but it cannot fully prevent it.
- **The allowlist is the pressure valve.** Requiring a `reason` raises the cost of a lazy entry
  but does not make one impossible.
- **The semantic reviewer needs a model endpoint** that the adopting repository must supply. It is
  off by default for exactly that reason.
