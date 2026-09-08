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
dependencies. The suite must pass before any commit.

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
