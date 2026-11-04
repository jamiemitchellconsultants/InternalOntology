# Source knowledge graph

Install explicitly with `--with-source-graph`; use `--source-graph-root <path>` to choose the graph root. On an older Markdown-only ontology, first run `node scripts/build-ontology.mjs` and commit the resulting Turtle source. Use `--force` to upgrade Kit-owned scripts, workflows and the schema; adopter-owned graph data, configuration and existing Markdown views remain in place.

Enable the `sourceGraph` section in `ontology.config.json` and set evidence selectors for each role. For a Terraform-only deployment, use `"deployment": ["**/*.tf"]`. Paths without an eligible role selector cannot serve as evidence for that role. For an existing config, apply the installer's printed config notice yourself.

## Read the current state

The generated view defaults to `<graph-root>/README.md`. Read its claims, their direct or inferred basis, coverage and declared gaps, then follow the evidence links to assess accuracy. Inferred claims are tentative. Missing knowledge does not establish that a relationship is absent. A structural pass does not establish that claims are true. The view describes the whole current graph, including isolated nodes; it does not report added, changed or removed claims.

Turtle files remain the canonical graph source. Each claim has a Turtle source link for detailed inspection; exact graph identifiers and snapshot information appear in secondary lookup details. This operating guide is separate from the generated view.

Set these rendering options inside `sourceGraph` in `ontology.config.json` before committing the source:

- `repositoryUrl`: this repository's HTTPS browser URL, such as `https://github.com/owner/repository` or `https://git.example.com/team/repository`. Use the owner/repository root without credentials, query or fragment. The renderer requires this setting; existing graph-only commands still work without it.
- `markdownPath`: optional output path, default `<graph-root>/README.md`. It must be a normalized `.md` path strictly inside the graph root, distinct from the ontology files. Choose another path if the default README contains authored content.

Evidence and Turtle links use the full source commit ID and line anchors. Links explicitly select the host's source view (`?plain=1`), so Markdown evidence opens with source lines rather than a rendered preview. After upgrading the renderer, regenerate and commit the view if the freshness check reports changed output. They continue to identify the same bytes when the branch advances, provided the Git host retains that source commit. Repeated generation reuses the existing source commit when its inputs still match, keeping the document byte-identical.

## Author and review in one PR

Coverage can be partial: declare selectors, priorities and covered, unknown or excluded status, with reasons for gaps. Unmatched paths are unknown. The graph root is excluded. Graph files use the canonical Turtle subset: fixed prefixes, named subjects, one predicate and object per line, sorted subjects and predicates, escaped strings and decimal integers. Blank nodes, collections, RDF-star, multiline literals and compact multi-object syntax are not accepted.

For each task, query the reader and inspect the cited source. After editing covered files, update the relevant assertions and evidence or record that no fact changed. Update refresh records with staged blob IDs. New covered files and deletions also need records.

1. Stage and review all canonical inputs: configuration, ontology Markdown and Turtle, graph files including the schema, and covered source. Run `node scripts/check-source-graph.mjs --staged --base <merge-base>` and `node scripts/check-ontology-terms.mjs`, then commit those inputs as the source commit.
2. Run `node scripts/render-source-graph.mjs`. It reads committed source, validates the complete graph and evidence, and checks that staged inputs match. Unstaged working-file edits are not rendered. It publishes atomically and preserves the previous output on validation or replacement failure. It refuses authored files and symlinked output paths.
3. Read the generated current state and assess claims against their evidence. Correct the canonical inputs and repeat the source commit and generation if needed. Never edit the generated Markdown manually.
4. Stage and review the generated document. Run `node scripts/render-source-graph.mjs --check --staged` and `node scripts/check-ontology-terms.mjs` before committing it. Include both source and generated-document commits in the same PR.

The source commit and document commit are separate because the document embeds the full source commit ID. Canonical inputs must not change between them. `--check` checks committed HEAD, `--check --rev <revision>` checks a historical commit, and `--check --staged` checks the candidate index tree. Checks are read-only and compare exact rendered bytes as well as the current and recorded source inputs. Exit 0 means current, 1 means missing or stale output, and 2 means invalid input, configuration, mode or an unavailable source snapshot.

## Recover a source snapshot

The renderer is offline. After squash or rebase, a fresh checkout may lack the recorded source commit even though the Git host retains it. The workflow reads only the bounded, validated SHA from `node scripts/render-source-graph.mjs --print-source-rev --rev HEAD`, then fetches a missing commit from fixed remote `origin` before the real check. Metadata is data and cannot supply Git options, a remote or executable commands.

For a local missing snapshot, use that inspection command and retrieve its full source SHA with `git fetch --no-tags origin <full-source-sha>`, then rerun the check. An unavailable snapshot is an explicit failure. If the host no longer retains it, or the generated metadata is damaged, commit the valid current canonical inputs and run `node scripts/render-source-graph.mjs --source-rev HEAD` to regenerate against the current commit. Review, stage, check and commit the replacement in the same PR. The explicit source must match all current rendering inputs; it cannot bypass validation. An unmarked authored file is preserved even in recovery mode, so configure another output path.

## Require the checks

The workflows publish `source-graph` and `source-graph-markdown` on pull requests and default-branch pushes. Configure branch protection to require both when adopting this workflow. The existing graph check validates structure and review records for covered changes. The Markdown check additionally validates the pinned source and exact current rendering. CI has read-only repository permission and never commits or publishes a generated document. Maintainers remain responsible for judging claims and evidence.
