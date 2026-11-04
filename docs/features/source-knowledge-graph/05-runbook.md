# Source knowledge graph — runbook

This runbook is for maintainers of a repository that opts into the source graph. The acceptance
deployment is the private disposable
[`jamiemitchellconsultants/ontology-source-graph-trial-20261103`](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103)
repository. Its C#, TypeScript and Java companion repositories are linked in
[acceptance](05-acceptance.md). They use the same installed files and commands as an adopter. The
graph is source-owned data. The Kit's checker validates its structure and review records;
maintainers judge the truth of its claims.

## Deploy

1. In an existing Git repository, install from a Kit checkout:

   ```sh
   node bin/install-ontology.mjs --target <adopter-checkout> --with-source-graph
   ```

   Use `--source-graph-root <path>` to choose a different root. Review the dry-run plan first with
   `--dry-run` when upgrading an existing repository. The installed workflow, scripts and schema
   are Kit-owned. `ontology.config.json`, the ontology and graph data are adopter-owned.
2. If the adopter already has `ontology.config.json`, apply the installer's printed `sourceGraph`
   config notice to that file and retain its existing `namespaceUri`. Otherwise edit the installed
   config. Set `sourceGraph.enabled` to `true`, its graph root, and the selectors for each eligible
   evidence role. A role without selectors accepts no evidence. For a Terraform-only pilot use
   `"deployment": ["**/*.tf"]`; do not add other deployment paths. Commit the canonical
   `docs/ontology.ttl` source, generating it with `node scripts/build-ontology.mjs` if necessary.
3. Author `manifest.ttl`, `nodes.ttl` and assertion shards under the configured graph root. Use
   the installed `docs/source-knowledge-graph.md` and agent protocol as the file format guide.
   Declare covered, unknown and excluded selectors explicitly; give unknown and excluded scopes
   a reason and exclude the graph root. Add a current review record for every existing covered
   file. A starter graph with only the graph root excluded is valid while the adopter adds facts.
4. Stage only the intended files. Inspect `git diff --cached --name-only` and
   `git diff --cached`. Run the staged checker against the merge base with the default branch:

   ```sh
   node scripts/check-source-graph.mjs --staged --base <merge-base>
   node scripts/check-ontology-terms.mjs
   ```

   Commit and push the graph with the source it describes. The local checker prints a candidate
   tree ID before commit; the containing commit becomes the graph's effective revision.
5. Merge the installation and valid starter graph to the default branch. Open a trial PR and
   verify that the read-only `source-graph` job runs on the PR and reports a check for its proposed
   revision. Require the exact `source-graph` check in branch protection or a ruleset only after
   it appears in GitHub's check list. The workflow uses full-history checkout, Node.js 20 and
   `contents: read`; it needs no secret or model.

For a local acceptance build, install into a scratch Git repository and run the installed
`scripts/check-source-graph.mjs` and `scripts/query-source-graph.mjs` there. The executable cases
and their commands are listed in [acceptance](05-acceptance.md).

## Operate

- Before a task, read the canonical ontology and run
  `node scripts/query-source-graph.mjs search <term> --json`. Use `neighbors <node-id>`,
  `path <from-id> <to-id>` and `coverage [path ...]` to inspect the recorded relationships and
  gaps. Pin a graph revision with `--rev <commit>` and compare it with the working revision using
  `--working-rev <commit>`. Inspect the cited source lines and blob IDs. A `STALE` result needs a
  current-source check before a claim is presented as current. Inferences remain tentative.
- Before each PR, review changed files covered in either the base or proposed graph. Refresh
  affected assertions and evidence or record `no-fact-change`. Replace each changed file's review
  record with its staged blob ID (`git rev-parse :<path>`); deletions use a deletion record. A
  removed or narrowed covered selector remains as an unknown or excluded selector with a reason.
  A changed path leaving coverage still needs a valid review record on that PR. Run the staged
  checker, then inspect the graph diff and cited source as a maintainer.
- On GitHub, run `gh pr checks <number> -R <owner>/<repo>` and inspect the `source-graph` job log
  and graph diff. The checker names a path or assertion and a specific rule when it fails.
  Structural success does not approve the semantic meaning of an assertion. The workflow also
  checks default-branch pushes.

## Recover

- **A PR fails:** Read the named rule and path. Correct the proposed graph or its review record,
  restage, and rerun the staged checker. For `evidence-path-missing` or `evidence-range`, inspect
  the actual source path and line bounds. For `refresh-missing`, `refresh-stale` or
  `refresh-malformed`, inspect the current blob and the record. For `coverage-transition`, retain
  the old selector as covered or a reasoned unknown/excluded scope. Do not suppress a finding by
  silently narrowing coverage.
- **The reader reports stale or missing source:** Pin the graph commit, inspect current source,
  and refresh the graph in a new PR. If the current source is unavailable, report the claim as
  unverified. If a graph claim conflicts with the canonical ontology, name the conflict in the
  review and use the ontology's term; preserve the original evidence for review.
- **An upgrade needs repair:** Re-run the installer with `--force` to replace Kit-owned files;
  review the diff and preserve adopter-owned config and graph data. If the existing config has a
  custom namespace, starter graph files created by the upgrade use that namespace. Use
  `--reset-content` only when deliberately replacing adopter content, and review its full diff
  before committing.
- **A workflow or check is unavailable:** Inspect the Actions run, checkout history and Node
  setup. Restore the installed workflow or scripts from the Kit and rerun the trial PR. Keep the
  required check configured only when GitHub can publish it reliably. Roll back an unsafe graph
  change with a new reviewed commit or revert PR; retain the previous pinned commit for readers.
