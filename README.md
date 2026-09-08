# Ontology Kit

Installs a self-contained domain-ontology discipline into any git repository: a canonical
vocabulary file, an agent protocol, and a deterministic CI check that fails the build when prose
drifts from it. Optionally, an advisory model-assisted reviewer and enum lock tests.

See [docs/how-it-works.md](docs/how-it-works.md) for what the mechanism is and what it does and
does not catch.

## Install into a repository

```bash
node bin/install-ontology.mjs --target /path/to/repo --dry-run
node bin/install-ontology.mjs --target /path/to/repo
```

| Option | Effect |
|---|---|
| `--target <repo>` | **Required.** The repository to install into. Must already be a git repository. |
| `--project-name <name>` | Name used in the ontology's title. Defaults to the target directory's name. |
| `--ontology-path <path>` | Where the ontology file goes. Defaults to `docs/ontology.md`. Must be repository-relative, with no `..` segment. |
| `--default-branch <name>` | Branch the lint workflow's `push` trigger fires on. Defaults to the target's current branch (detected via `git`), falling back to `main` if that can't be detected. |
| `--with-drift-review` | Also install the advisory semantic reviewer, its tests, workflow and runbook. |
| `--with-enum-tests <lang>` | Also install a worked-example enum lock test: `csharp`, `typescript`, or `python`. Installed with a `.example` suffix — see [Then seed it](#then-seed-it). |
| `--dry-run` | Print the file plan and exit without writing. |
| `--force` | Overwrite existing **kit-owned** files — the scripts and CI workflows. Never touches adopter-owned files (`ontology.config.json`, the ontology document, the enum test); this is the correct way to upgrade an installed repository. |
| `--reset-content` | Also overwrite adopter-owned files, discarding their content back to the shipped templates. Destructive — only for someone who genuinely wants to start over. |
| `--help` | Print usage and exit 0. |

A core install writes:

```
scripts/ontology-config.mjs
scripts/check-ontology-terms.mjs
ontology.config.json
docs/ontology.md
.github/workflows/ontology-lint.yml
```

and splices an "Ontology protocol" section into the repository's `AGENTS.md` (or `CLAUDE.md`, or a
new `AGENTS.md`) between HTML comment markers. Re-running updates that section in place, so an
upgrade is one command. If the agent file already has a hand-written "## Ontology protocol"
section with no markers, the installer refuses rather than adding a second, contradictory copy —
remove or mark the existing section first.

## Then seed it

The installer writes the mechanism, not the content. Filling in the ontology means reading the
repository and cataloguing what it already calls things. The `ontology-setup` skill in
[skills/ontology-setup](skills/ontology-setup/SKILL.md) does that, and triages the first check run.

Without the skill, the manual path is: edit `docs/ontology.md`, delete the sections and example
rows that do not apply, update `sections` in `ontology.config.json` to match, then run
`node scripts/check-ontology-terms.mjs` and work through what it reports.

## Upgrading an installed repository

Re-run the installer with `--force`. The scripts and CI workflows are identical in every
repository, so `--force` replaces them wholesale — a script fix becomes a one-command upgrade.
`--force` never touches `ontology.config.json`, `docs/ontology.md` (or wherever `--ontology-path`
points), or the enum test: those are yours, and an upgrade must not silently revert your seeded
ontology or your reasoned allowlist.

If you genuinely want the adopter-owned templates back — starting over, say — pass
`--reset-content` as well. It is destructive: it discards your ontology content and your allowlist
back to the blank shipped templates, so use it deliberately, not as a matter of routine.

## Independence

Installing copies files and creates no dependency on this repository. There is no shared
vocabulary, registry, server, or runtime link. Two repositories that install this have no
relationship to each other.

## Developing the kit

```bash
npm test
```

`node --test` over `tests/` and the shipped reviewer tests in `templates/scripts/`. No
dependencies.
