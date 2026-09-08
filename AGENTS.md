# Repository agent instructions

These instructions apply to the entire repository and are the canonical project instructions for
coding agents. Agent-specific control files must point here rather than duplicating these rules —
a stale copy is worse than no copy, because an agent cannot tell which one is current.

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
