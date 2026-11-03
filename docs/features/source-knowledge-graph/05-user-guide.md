# Source knowledge graph — user guide

The source graph helps an AI coding agent find repository facts with evidence. The repository
maintainer chooses which areas are covered; missing facts remain visible. The graph may support a
downstream C4 view, but no C4 level is required for participation. Use the installed reader for
facts and the canonical ontology for terminology.

## B1 — Find recorded relationships

Search for a concept with `node scripts/query-source-graph.mjs search <term> --json`, then inspect
its neighbors. The result names each assertion, relationship, direct or inferred basis, cited
source path and lines, and the graph revision. Selected design documents can be evidence too.

## B2 — Follow a path without inventing an edge

Run `path <from-node> <to-node> --json`. Each step is a separate recorded assertion with its own
basis and evidence. A two-step path does not become a direct assertion between its endpoints.

## B3 — Report a missing answer

If search or path returns no assertion, use `coverage [path ...] --json`. Report the absent answer
and the coverage status. Unmatched paths are unknown. An empty graph result does not prove that
the relationship is absent from the source repository.

## B4 — Cite source behind a claim

For every relationship you present, give the assertion ID, direct or inferred basis, source path,
line range and graph commit. Open the cited source before relying on it. A graph ID alone is not a
source citation; an inferred claim must be described as tentative.

## B5 — Check older evidence

Use `--rev <graph-commit> --working-rev <current-commit>` when consulting an older graph. If the
reader marks it `STALE`, compare the cited source with the current revision. State that a claim is
unverified when current source cannot be checked.

## B6 — Keep ontology terminology canonical

When a graph label or selected document conflicts with the canonical ontology, name the conflict
and use the ontology's term in your answer. Preserve the conflicting evidence for review.

## B7 — Explain an inference

An inferred assertion has `kit:inferred` basis and cites source observations. Say what was
observed and why the relationship is tentative. Do not publish a guess without reviewable
observations as an assertion.

## B8 — Review covered changes before a PR

For each changed covered file, update affected graph facts or record that review found no fact
change. Update the file's review record to its current blob, stage the graph, and run the staged
checker. The graph diff should make the review visible to the maintainer.

## B9 — Expect an omitted review to fail

The PR check names a changed covered file whose graph review is missing or stale, including a new
file. A file outside declared coverage does not trigger that freshness rule. Narrowing coverage
in the same PR does not erase the review obligation.

## B10 — Correct invalid proposed facts

The checker rejects duplicate or dangling IDs, missing evidence or basis, missing source paths,
invalid line ranges, malformed coverage and similar structural errors. Read its named rule and
resource, correct the graph, and rerun it. An empty evidence path and line zero are invalid.

## B11 — Review meaning as a maintainer

A green `source-graph` check means structure and covered-file review records passed. Inspect the
graph diff and cited source yourself before merging; the checker does not decide whether an
assertion is true. It makes no model request and needs no secret after checkout.

## B12 — Work with partial coverage

Use `coverage` to see covered, unknown and excluded selectors and their reasons. Valid facts in
covered areas remain usable while other areas are unknown or out of scope. A removed covered
selector must remain visible as a reasoned gap if coverage is reduced.

## B13 — Use the same graph contract in each language

C#, TypeScript, Java and Python repositories use the same graph file format, reader and checker.
Evidence points to each repository's own source paths; no language-specific extractor is needed.
Compare the same reader and checker outcomes rather than expecting identical source syntax.

## B14 — Cite the selected deployment source

In the JointBooking pilot, deployment evidence is selected from Terraform paths. Another
deployment file may exist, but it does not support a deployment assertion unless the adopter's
configuration makes that role eligible. The pilot keeps the Terraform-only selector.

## B15 — Publish available facts with gaps

A downstream consumer pins a Git commit and reads its graph assertions and coverage together.
If facts for a C4 level are absent, mark that level unavailable or incomplete. The checker does
not render C4 views or invent missing elements.
