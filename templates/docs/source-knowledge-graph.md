# Source knowledge graph

Install explicitly with `--with-source-graph`; use `--source-graph-root <path>` to choose the graph
root. On an older Markdown-only ontology, first run `node scripts/build-ontology.mjs` and commit the
resulting Turtle source. Use `--force` to upgrade kit-owned scripts and the schema; adopter-owned
graph data and configuration remain in place.

Enable the `sourceGraph` section in `ontology.config.json` and set evidence selectors for each
role. For a Terraform-only deployment, use `"deployment": ["**/*.tf"]`. Paths without an eligible
role selector cannot serve as evidence for that role. For an existing config, apply the installer's
printed config notice yourself.

Coverage can be partial: declare selectors, priorities and covered, unknown or excluded status,
with reasons for gaps. Unmatched paths are unknown. The graph root is excluded. Graph files use the
canonical Turtle subset: fixed prefixes, named subjects, one predicate and object per line, sorted
subjects and predicates, escaped strings and decimal integers. Blank nodes, collections, RDF-star,
multiline literals and compact multi-object syntax are not accepted.

For each task, query the reader and inspect the cited source. After editing covered files, update
the relevant assertions and evidence or record that no fact changed. Update refresh records with
staged blob IDs, then run `node scripts/check-source-graph.mjs --staged --base <merge-base>` before
committing. New covered files and deletions also need records.

The workflow publishes the `source-graph` check on pull requests and default-branch pushes. Configure
branch protection to require that check when adopting the graph. A pass means the graph is
structurally valid and covered changes have review records; it does not prove claims are true.
Maintainers must review assertions and their evidence.
