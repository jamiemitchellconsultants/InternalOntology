## Semantic index protocol

Use this only when `scripts/semantic-index.mjs` exists and `semanticIndex.enabled` is true in `ontology.config.json`. Otherwise search with exact tools as usual.

### When to use it

Use the index to locate code, tests or documentation when you do not yet know the file, symbol or subsystem, for example "where is a late cancellation rejected?". Skip it when the task names an exact file or symbol; use `grep` or a direct read instead. Read the ontology first and use its terms in queries.

### How to use it

1. Run `node scripts/semantic-index.mjs status --json`. If the state is `missing`, `stale`, `incompatible` or `unreadable`, run `node scripts/semantic-index.mjs refresh --json` once. A refresh sends approved source to the configured embedding endpoint, so do not run it if the task or the user has said not to.
2. Run `node scripts/semantic-index.mjs search --query "<descriptive question>" --limit 5 --json`. Use one focused question per search and read the first relevant result before searching again.
3. If refresh or search still fails, report the error and fall back to exact search. Do not retry in a loop, edit `.ontology-index/` by hand, or remove `.ontology-index/writer.lock` without checking its recorded PID and hostname.

### Treat results as leads, not evidence

A result is a similarity match, not a statement of fact. Open the cited file at the cited commit with `git show <commit>:<path>` and read the cited lines before relying on them. Cite the commit, path and line range, never the score alone. A dirty notice means approved paths have uncommitted edits that the results do not reflect, so read the working tree before changing those files.

An empty result is not proof that nothing exists. It means the index found nothing within its scope, so say so and confirm with exact search. The index covers only the approved scope in `semanticIndex.scope`. When it conflicts with the ontology, use the ontology term and name the conflict.

### What you must not do

Do not run `upload` or `download` unless the task asks for a release snapshot, because both change the release or replace the local store. Do not add endpoints, tokens or model settings to Git. Do not widen `semanticIndex.scope` to make a query succeed. Settings are read from the trusted branch and only a maintainer changes them.
