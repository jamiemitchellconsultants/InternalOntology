## Source graph protocol

Before a task, read the ontology, then run `node scripts/query-source-graph.mjs search <term>`;
use `neighbors` and `path` as needed. The graph lives under `{{GRAPH_ROOT}}`.

When citing a relationship, name its assertion, direct or inferred basis, source path, lines and
revision from the reader. A graph-only citation is not grounded. Call an inferred relationship
tentative and say it is an inference. When the reader finds nothing, report the coverage it prints;
never say the relationship does not exist. When it prints `STALE`, check current source before
presenting the relationship as current, or say it is unverified.

When a graph assertion or selected document conflicts with the ontology, name the conflict and use
the ontology term; do not rewrite the evidence.

Before a pull request, review each changed file in declared coverage. Update affected assertions
and evidence or record that review found no fact change, then replace its refresh record. Use
`git rev-parse :<path>` for the staged blob ID. Update evidence blob IDs and line ranges for changed
files. New covered files and deletions need records too. Never publish a relationship without
supporting source observations.

After staging and before committing, run `node scripts/check-source-graph.mjs --staged --base <merge-base>`
with the merge base with the default branch. A pass means the graph is structurally valid and
covered changes have review records; it does not mean the claims are true. Do not edit
`{{GRAPH_ROOT}}/graph-schema.ttl` or generate the graph in CI.
