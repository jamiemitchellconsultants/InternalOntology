# Human-readable source knowledge graph — runbook

This runbook serves repository maintainers operating `GraphRenderer` and `GraphRenderWorkflow`. The canonical `SourceKnowledgeGraph` stays in Turtle; the Markdown document is generated. Structural validation does not establish semantic accuracy.

## Deploy

### Environments

The local acceptance build is Kit commit `1342506` (main after build amendment PR #79 and its narrative update), running its shipped commands against disposable Git repositories. The initial real-data trial uses a temporary clone of [JEPA-Speech PR #194](https://github.com/jamiemitchellconsultants/JEPA-Speech/pull/194) pinned to `f27c3e0fffd3ce0821a70f0d2f3d6cdbcf715465`. Its 12 direct assertions are trial data, not installed defaults.

The deployed acceptance target is the existing private disposable [source graph trial repository](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103), upgraded from this Kit revision through a trial pull request. Use separate branches for empty, invalid and changed-input cases. The separately approved private [JEPA readability trial](https://github.com/jamiemitchellconsultants/ontology-readable-jepa-trial-20261104) contains its pinned graph and covered source; Codex acts as the maintainer under the owner's authorization. GitHub Enterprise navigation and retention require an actual adopter host and repository; an example Enterprise URL in a local fixture is not evidence of a deployed Enterprise pass. See [acceptance status](05-acceptance.md) before treating any environment as accepted.

### Install or upgrade

1. From the Kit checkout, inspect the installation plan:

   ```sh
   node bin/install-ontology.mjs --target <adopter-checkout> --with-source-graph --dry-run
   ```

   Install with the same command without `--dry-run`. Add `--force` when replacing existing Kit-owned scripts and workflows. Preserve adopter-owned configuration, ontology, graph data and existing Markdown. Use `--source-graph-root <path>` when the adopter has a custom root. On a Markdown-only ontology, migrate with the installed `node scripts/build-ontology.mjs` and commit its Turtle source before preparing the graph.
2. Enable `sourceGraph` in `ontology.config.json`. Retain the adopter's namespace, graph root and evidence-role selectors. Add `sourceGraph.repositoryUrl`, the repository's HTTPS browser root without credentials, query or fragment. Optionally set `sourceGraph.markdownPath` to a normalized `.md` path strictly inside the excluded graph root. The default is `<graph-root>/README.md`. An authored README needs a different output path. Existing graph-only commands work without the URL; rendering requires it.
3. Review and stage the canonical inputs: configuration, ontology Markdown and Turtle, graph schema, manifest, nodes, all assertion shards and changed covered source. Review the staged file list and cached diff. Run the installed graph and terminology checks, using the merge base with the default branch:

   ```sh
   node scripts/check-source-graph.mjs --staged --base <merge-base>
   node scripts/check-ontology-terms.mjs
   git commit -m "feat: prepare canonical graph inputs"
   ```

   This is source commit S. Refresh covered-file records and evidence before committing when their source changes.
4. Generate and read the view, then stage it and inspect the cached diff:

   ```sh
   node scripts/render-source-graph.mjs
   git add <configured-markdown-path>
   git diff --cached --name-only
   git diff --cached
   node scripts/render-source-graph.mjs --check --staged
   node scripts/check-ontology-terms.mjs
   git commit -m "docs: generate readable source graph"
   ```

   This is document commit D. Include S and D in the same pull request. Do not change canonical inputs between them. The renderer reads committed source and checks the index; unstaged source edits are not rendered.
5. Push the trial PR. Confirm that `source-graph` and `source-graph-markdown` both run on its test-merge revision and default-branch pushes. After the valid installation and initial document are deployed, add both contexts to required checks, preserving every existing required context. Confirm a deliberately stale-view trial is blocked, then restore a valid trial. The Markdown workflow uses full-history checkout, Node.js 20 and `contents: read`; it makes no commits and requires no model or secret.

## Operate

Read the generated Nodes, Current claims and Coverage sections. Follow each claim's evidence and Turtle source links, inspecting the cited lines before judging its meaning. Inferences are tentative; missing claims and unknown or excluded coverage do not establish negative facts. Correct content in canonical Turtle, then repeat the source-commit/document-commit sequence.

Use these health checks from an adopter checkout:

```sh
node scripts/check-source-graph.mjs --rev HEAD
node scripts/render-source-graph.mjs --check
node scripts/render-source-graph.mjs --check --staged
node scripts/render-source-graph.mjs --check --rev <historical-document-commit>
node scripts/render-source-graph.mjs --print-source-rev --rev HEAD
```

Check modes read the selected tree or index and leave working output untouched. The pinned source and candidate must have identical complete rendering-input projections, and the document must equal the exact expected bytes. Repeated generation reuses a still-matching source commit. Unrelated changes introduce no timestamp, run ID or link churn. Exit 0 means generated/current, 1 means missing or stale output or mismatched check inputs, and 2 means invalid input, configuration or mode, or an unavailable source snapshot. Read the diagnostic as well as the exit code.

Inspect the two hosted checks and their logs on each PR. A graph check covers structure and review records; the Markdown check covers the snapshot and exact rendered view. Neither is the maintainer's accuracy judgement. Record hosted link navigation and retention results separately from local Git-object checks.

## Recover

- **Missing or stale document:** correct and commit canonical inputs and review records, regenerate, stage the generated file, inspect the diff, and rerun both checks. A failed check does not refresh an older document.
- **Invalid graph, evidence or configuration:** use the named path/resource and reason to correct canonical input. Commit it before generation. Do not edit the generated document or weaken coverage to hide a failure. A valid empty or partially covered graph is renderable.
- **Missing source after squash/rebase:** inspect bounded provenance with `node scripts/render-source-graph.mjs --print-source-rev --rev HEAD`. Retrieve only the reported full source SHA from the checkout's known repository remote with `git fetch --no-tags origin <full-source-sha>`, then rerun the check. Checkout bootstrap does this preparation; the renderer itself stays offline. A successful local simulation does not establish that a particular host retains the commit.
- **Source permanently unavailable or metadata damaged:** validate and commit the current canonical inputs, run `node scripts/render-source-graph.mjs --source-rev HEAD`, review and stage the replacement, check it, and commit it in the same PR. The explicit source must still match all current inputs. Never replace immutable links with moving branch links.
- **Authored file or unsafe output destination:** preserve the file and configure another path inside the excluded graph root. Remove symlink traversal from the intended destination. Regenerate only after committing the corrected configuration. A failed replacement preserves the last successful output.
- **Rollback:** use a reviewed revert or replacement PR restoring matching canonical inputs and generated output together. Recheck the retained source snapshot and both required checks. If an upgrade is damaged, rerun the Kit installer with `--force`; ordinary upgrade preserves adopter content. Use `--reset-content` only for an intentional adopter-content reset. Do not remove existing protection requirements as an incidental rollback step.
