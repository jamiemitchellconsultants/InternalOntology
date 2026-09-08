## Ontology protocol

The application ontology lives in [`{{ONTOLOGY_PATH}}`]({{ONTOLOGY_PATH}}). It is the canonical
source for all domain terminology. Code, specs and plan documents must match the ontology — not the
other way around.

### Before writing anything that touches domain concepts

1. Read `{{ONTOLOGY_PATH}}` in full.
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

1. Update `{{ONTOLOGY_PATH}}` — add, rename, or remove entities, value objects, events, enums,
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
