## Semantic index protocol

Use this only when `scripts/semantic-index.mjs` exists and `semanticIndex.enabled` is true in `ontology.config.json`. Each command below runs as `node scripts/semantic-index.mjs <command>`.

### When to use it

Use the index to locate code, tests or documentation when you do not know the file, symbol or subsystem; skip it when the task names one. Read the ontology first and use its terms in queries. If `sourceGraph` is enabled and `scripts/query-source-graph.mjs` exists, ask the graph first with `node scripts/query-source-graph.mjs search <term>`, and search the index only when the reader reports the area as unknown, excluded or empty.

### How to use it

1. Run `status --json`. If the state is `missing`, `stale`, `incompatible` or `unreadable`, run `refresh --json` once, unless the task or the user has said not to: refresh sends approved source to the configured embedding endpoint.
2. Run `search --query "<one focused question>" --limit 5 --json --compact` and read the first relevant result before searching again.
3. If refresh or search still fails, report the error and use exact search. Do not retry in a loop, edit `.ontology-index/` by hand, or remove `.ontology-index/writer.lock` without checking its recorded PID and hostname.

### Results are leads, not evidence

Before relying on a result, read its cited lines with `show --path <path> --lines <start>-<end> --json` or `git show <commit>:<path>`. Cite the commit, path and line range, never the score alone. A dirty notice means approved files have uncommitted edits, so read the working tree before changing them. A truncated response says what it left out; request the rest only if you need it. An empty result is not proof that nothing exists: say the index found nothing within its scope and confirm with exact search. When the index conflicts with the ontology, use the ontology term and name the conflict.

### What you must not do

Do not run `upload` or `download` unless the task asks for a release snapshot. Do not add endpoints, tokens or model settings to Git. Do not widen `semanticIndex.scope` to make a query succeed; only a maintainer changes settings.
