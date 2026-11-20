# Repository agent instructions

These instructions apply to the entire repository and are the canonical project instructions for
coding agents. Every rule here is binding regardless of which AI tool is reading it.

`CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`, `.cursor/rules/`, `.windsurf/rules/`
and `.clinerules/` are thin pointers back to this file. They restate no rules, deliberately: a
stale copy is worse than no copy, because an agent cannot tell which one is current. **Edit this
file, not those.**

## Project Narrative

This repository uses [Project Narrative](https://github.com/jamiemitchellconsultants/Narrative) to
maintain a deterministic, review-first decision history.

- `Narrative.md` is **generated and never hand-edited**. To change its wording, edit the fragment
  under `narrative/entries/` and run `narrative compile`.
- A decision-bearing pull request needs **both** the `narrative-required` label **and** three body
  headings, spelled exactly as `.github/pull_request_template.md` spells them:
  - `## Narrative Context`
  - `## Narrative Decision`
  - `## Narrative Consequences`
- The maintenance workflow fires on the **merge event only**. A missing label makes it exit
  silently; missing sections with the label present make it fail visibly. **Neither is repairable
  after merge** — labelling a merged pull request does nothing, and a missed entry has to be
  written by hand as a fragment.
- **Supplying a pull-request body replaces the repository template wholesale.** If you pass a body
  to `gh pr create`, carry the three sections in it yourself. This is the single most common way an
  installation decays: the template documents the rule, and the agent never reads it because the
  supplied body replaced it.
- A narrative-only pull request — one that fixes or maintains the narrative itself — carries no
  label, or it would recursively generate an entry about maintaining the narrative.
- An accepted entry is never rewritten to read as though a later, better framing had been there all
  along. A reversal is a new entry of kind `correction` citing the original by slug; otherwise the
  record loses the evidence that the framing ever needed correcting.

Apply the label when a pull request makes a meaningful product, architecture, governance,
operational, correction, or experimental decision. Leave it off for mechanical changes that do not
alter project intent.

## Feature lifecycle

Features in this repository follow the persona workflow: product owner, analyst, architect,
developer (plan, then build), and user. Each role is a phase with its own artefact under
`docs/features/<slug>/`, GitHub sub-issue, and reviewed pull request. Start, check, or resume a
feature with the `feature` skill. Each role has its own `feature-<role>` skill.

- **The order of the phases is enforced.** Each persona skill checks the gate before doing any work,
  and the `feature-gate` check fails a phase pull request whose earlier phases are not done.
- **The only bypass is the `gate-override` label** on the pull request, with the reason given in its
  Narrative sections. An admin override for merging is separate and does not open a gate.
- **Every handoff is a checkpoint.** The skill stops and suggests a break. Do not start the next
  phase in the same session without one.
- **Park side issues** with the `feature-park` skill rather than working on them.
- **Artefacts are generated.** Apply review feedback and pushback by re-running the role's skill,
  never by changing files directly.

## What this repository is

The Ontology Kit installs a domain-vocabulary discipline into any git repository: a canonical
ontology file, an agent protocol, a deterministic CI linter, and optionally an advisory
model-assisted reviewer and enum lock tests. See [README.md](README.md) for how to install it and
`docs/how-it-works.md` for what the mechanism does and does not catch.

Two properties govern most decisions here, and both are worth knowing before changing anything:

- **Installed scripts are byte-identical in every adopting repository.** All per-repository
  variation lives in that repository's `ontology.config.json`. This is what makes a later fix a
  file copy rather than a hand merge — do not bake a repository-specific value into a script.
- **False positives cost more than missed detections.** The installed linter cannot be patched
  locally by an adopter, and a noisy check gets allowlisted into irrelevance. Prefer missing a
  detection over flagging something legitimate.

## Tests

```bash
npm test
```

`node --test` over `tests/` and the shipped reviewer tests in `templates/scripts/`. No
dependencies. The suite must pass before any commit. CI (`.github/workflows/test.yml`) runs it on Node 20, 22 and 24, and also runs
several shipped test files alone from `templates/scripts/`, as an adopting repository does. Keep
tests independent of the host's git defaults and of timers that do not keep the event loop alive.

When asking a maintainer to review or approve a `.mjs` file, create and share a natural-language Markdown version as the review artefact. For executable tests, describe the setup, what each test does, the expected results, and the limits of what it verifies. Keep the Markdown version aligned with the executable and write each paragraph or list item on one source line.

<!-- ontology-protocol:start -->
## Ontology protocol

The application ontology lives in [`docs/ontology.md`](docs/ontology.md). It is the canonical
source for all domain terminology. Code, specs and plan documents must match the ontology — not the
other way around.

### Before writing anything that touches domain concepts

1. Read `docs/ontology.md` in full.
2. Use the exact names defined there. Do not invent synonyms, abbreviations, or alternative
   spellings.
3. If a concept you need is not in the ontology, define it there first, then write the code.

### Before local validation and commit

1. Stage only the files intended for the proposed commit.
2. Review the staged file list and cached diff with `git diff --cached --name-only` and
   `git diff --cached` before validation.
3. Run `node scripts/check-ontology-terms.mjs` after the intended files are staged and reviewed,
   but before creating the commit.
4. Stage newly created Markdown intended for the commit — the checker discovers Git-tracked
   Markdown with `git ls-files "*.md"` and does not see an untracked file.
5. Staging is not committing: files can still be corrected or unstaged before the commit is made.
6. Do not stage unrelated untracked or working files merely to expose them to validation.
7. CI remains the independent validation of the committed state.

### Checking text that is not a tracked file

A drafted pull-request body is Markdown that no tracked file contains, so the checker cannot see
it — and a bare backticked term sitting only in a PR description passes silently. Save the drafted
body to a scratch file and lint it explicitly:

```bash
node scripts/check-ontology-terms.mjs --also /path/to/drafted-body.md
```

### After completing any task that touches domain objects

1. Update `docs/ontology.md` — add, rename, or remove entities, value objects, events, enums,
   relationships, or invariants as needed.
2. Include the ontology change in the same commit as the code change.

### Enforcement

`scripts/check-ontology-terms.mjs` runs on every pull request and every push to the default branch
via `.github/workflows/ontology-lint.yml`. It fails the build if any Markdown file uses a
backticked PascalCase term not defined in the ontology, or — where the ontology names External
Systems — paraphrases one instead of naming it.

If it flags your term, there are exactly three correct responses:

1. Use the canonical name.
2. Add the concept to the ontology first, then use it.
3. Only for a genuinely non-domain term — a framework type, an interface name, a config key — add
   it to `allowlist` in `ontology.config.json` **with a written reason**. An entry without a reason
   is rejected by the checker.

Reaching for option 3 by default is how this control decays. Prefer 1 and 2.
<!-- ontology-protocol:end -->

<!-- semantic-index-protocol:start -->
## Semantic index protocol

Use this only when `scripts/semantic-index.mjs` exists and `semanticIndex.enabled` is true in `ontology.config.json`. This repository ships the commands in `templates/scripts/` but does not install them for itself, so in this checkout search with exact tools unless an installed copy is present.

### When to use it

Use the index to locate code, tests or documentation when you do not yet know the file, symbol or subsystem. Skip it when the task names an exact file or symbol. Read the ontology first and use its terms in queries.

### How to use it

1. Run `node scripts/semantic-index.mjs status --json`. If the state is `missing`, `stale`, `incompatible` or `unreadable`, run `node scripts/semantic-index.mjs refresh --json` once. A refresh sends approved source to the configured embedding endpoint, so do not run it if the task or the user has said not to.
2. Run `node scripts/semantic-index.mjs search --query "<descriptive question>" --limit 5 --json`. Use one focused question per search and read the first relevant result before searching again.
3. If refresh or search still fails, report the error and fall back to exact search. Do not retry in a loop, edit `.ontology-index/` by hand, or remove `.ontology-index/writer.lock` without checking its recorded PID and hostname.

### Treat results as leads, not evidence

A result is a similarity match, not a statement of fact. Open the cited file at the cited commit with `git show <commit>:<path>` and read the cited lines before relying on them. Cite the commit, path and line range, never the score alone. A dirty notice means approved paths have uncommitted edits that the results do not reflect, so read the working tree before changing those files.

An empty result is not proof that nothing exists. It means the index found nothing within its scope, so say so and confirm with exact search. When the index conflicts with the ontology, use the ontology term and name the conflict.

### What you must not do

Do not run `upload` or `download` unless the task asks for a release snapshot. Do not add endpoints, tokens or model settings to Git. Do not widen `semanticIndex.scope` to make a query succeed; only a maintainer changes settings.
<!-- semantic-index-protocol:end -->
