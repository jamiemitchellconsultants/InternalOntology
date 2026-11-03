# Source knowledge graph — acceptance

Acceptance covers [B1–B15](02-behaviours.md). A person acting as user follows each numbered
walkthrough in the local build and the deployed repository, marking **each step** pass or fail.
After a behaviour's walkthrough passes, show that person its matching executable test below and
ask for approval before running it. A green test is not a walkthrough pass. Record the date,
walkthrough person, test approver, local commit or deployed PR, Actions run, and observed result
in the results table. If a walkthrough or test fails, raise pushback; do not repair the build in
this phase.

## Environments

- **Local build:** this Kit on `feature/source-knowledge-graph/user`, installed into a disposable
  local Git repository using `node bin/install-ontology.mjs --target <checkout> --with-source-graph`.
  Author a small graph directly from the installed schema, runbook and protocol. Use a separate
  scratch branch for destructive cases. Run the installed reader and checker from that checkout.
- **Deployed environment:** the private disposable
  [`jamiemitchellconsultants/ontology-source-graph-trial-20261103`](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103)
  repository named in the [runbook](05-runbook.md). Its installed Kit and required `source-graph`
  check run on the default branch and each trial PR. The C#, TypeScript and Java companion
  repositories linked in the evidence index use the same installed scripts for B13. Use separate
  trial PRs for cases that need different graph states. PR #1 shows a real failed graph check
  blocking merge and a repaired check passing.
- **Executable tests, after approval:** run the named `node:test` case from the table with
  `node --test --test-name-pattern '<case name>' <test file>`. The B6 test accepts
  `SOURCE_GRAPH_ACCEPTANCE_SCRIPT_ROOT=<trial-checkout>/scripts` to exercise the deployed copy.
  The tests under `templates/scripts/` are installed byte-identically under the adopter's
  `scripts/`; run their mapped cases there after the deployed walkthroughs. The GitHub
  walkthroughs separately verify the hosted workflow and required check.

## Walkthroughs

### B1 — Retrieve recorded relationships

1. Record a concept with implementation, test, dependency and selected-document assertions.
   **Expected:** all four resources and their source evidence exist in the pinned graph.
2. Search the concept and inspect its neighbors. **Expected:** the reader names each recorded
   relationship, assertion, evidence, direct or inferred basis, and graph revision.

### B2 — Keep each step of a path visible

1. Record A → B and B → C without an A → C assertion. **Expected:** the graph diff contains only
   the two named assertions.
2. Query `path A C` and `neighbors A`. **Expected:** the path shows two separately evidenced steps
   and neighbors has no direct A → C edge.

### B3 — Say when context is missing

1. Query a term with no assertion and inspect `coverage` for a relevant path. **Expected:** the
   reader returns no matching assertion and shows covered, unknown or excluded status.
2. Ask the acting agent for an answer. **Expected:** it says the graph lacks an answer and names
   the coverage status; it does not claim the relationship is absent from source.

### B4 — Cite the underlying source

1. Ask the agent to explain a direct and an inferred relationship from the graph. **Expected:**
   both assertions are available with path, lines, blob ID, basis and pinned revision.
2. Check the response against the cited source. **Expected:** it names assertion, basis, source
   path and location, revision, and calls the inference tentative; a graph ID alone is insufficient.

### B5 — Mark older evidence as stale

1. Pin the original graph commit, then change a cited source file on a later commit without
   changing that pinned graph. **Expected:** the source blob differs from the cited blob.
2. Query with `--rev <old> --working-rev <new>` and ask the agent to use the result. **Expected:**
   the reader marks `STALE` and changed evidence; the agent checks current source or says
   unverified if that source is unavailable.

### B6 — Expose conflicting meaning

1. Give a concept node a label that conflicts with the term it denotes in the canonical ontology,
   or select a document with that conflict. **Expected:** the graph and ontology preserve their
   distinct source text.
2. Query the node and ask the agent to describe it. **Expected:** the reader exposes the label and
   canonical ontology link; the agent names the conflict, uses the ontology term and does not
   silently rewrite the evidence.

### B7 — Label and explain inference

1. Publish an inferred relationship supported by a source observation. **Expected:** it has
   `kit:inferred` basis and a named evidence resource pointing to the observation.
2. Query it and ask the agent to present it. **Expected:** the reader marks it tentative; the
   agent explains the observation and does not state the inference as directly observed.

### B8 — Review changed covered files before PR

1. Change a covered source path and stage a matching current review record with
   `kit:no-fact-change` or refreshed assertions and evidence. **Expected:** the graph diff shows
   the review and the record's blob matches the staged source blob.
2. Run staged validation and open the PR. **Expected:** both the local checker and PR check pass;
   the maintainer can inspect the record and source diff.

### B9 — Block an omitted refresh

1. Change an existing covered file, then add a new file in covered scope, without their review
   records. **Expected:** the checker fails and names each changed path.
2. Change an out-of-scope file separately; try narrowing coverage in the same PR as a covered
   source edit. **Expected:** the out-of-scope change has no freshness failure; the narrowed-scope
   PR still requires a valid record for the source change.

### B10 — Reject invalid proposed facts

1. Propose a duplicate or dangling assertion, missing basis or evidence, an empty evidence path,
   line zero, and malformed coverage in separate trials. **Expected:** each trial's checker names
   the affected resource and rule.
2. Remove a covered selector without a reasoned gap; then retain it as unknown or excluded with a
   reason. In a separate changed-file scope reduction, submit a malformed review record.
   **Expected:** unreasoned removal and malformed record fail; reasoned gap with a valid review
   record passes.

### B11 — Keep semantic review human

1. Submit a structurally valid but deliberately questionable assertion. **Expected:** the
   `source-graph` check passes and says truth is for maintainers to review.
2. Inspect the assertion diff, source lines, workflow permissions and required check. **Expected:**
   a maintainer can reject the claim on meaning; the workflow has read-only access and no model,
   secret or post-checkout network request. A failing structural trial blocks merge.

### B12 — Accept partial coverage

1. Keep one area covered, one named area unknown with a reason, and an out-of-scope area excluded
   with a reason. **Expected:** the graph validates without facts for every area or C4 level.
2. Query a covered fact and the gap paths. **Expected:** the fact remains usable and each gap is
   visible with its status and reason.

### B13 — Apply the same behaviour across languages

1. In representative C#, TypeScript, Java and Python repositories, record equivalent graph
   assertions and coverage with each language's own source paths. **Expected:** the same schema
   and installed commands apply without a language extractor.
2. Query and check each repository, including one omitted refresh. **Expected:** assertion shape,
   basis, evidence roles, coverage and failure rule agree after normalizing source paths.

### B14 — Use the selected deployment source

1. In the JointBooking pilot configuration, set deployment evidence to `**/*.tf`, cite Terraform
   for a deployment assertion and run the checker. **Expected:** the assertion passes with a
   tracked Terraform source path and matching blob.
2. Point the same evidence role at another deployment file while leaving the selector unchanged.
   **Expected:** the checker reports `evidence-role-mismatch`; the other file is not accepted as
   deployment evidence for this pilot.

### B15 — Publish facts with their gaps

1. Pin a commit with some assertions and an explicit unknown coverage area. **Expected:** that
   commit contains both the facts and coverage resources.
2. Query the pinned commit as JSON for a downstream view. **Expected:** it returns assertions and
   coverage at that revision; the acting consumer marks an unsupported C4 level incomplete or
   unavailable without inventing elements.

## Executable cases

The existing build tests below already automate these scenarios. B6 adds an installed-reader
acceptance case in this phase. These are tests to show to the acting user for approval after the
matching walkthrough; the baseline `npm test` run before this phase was build verification, not
user approval.

| Behaviour | Test file | Exact case name |
| --- | --- | --- |
| B1 | `templates/scripts/query-source-graph.test.mjs` | `B1: a concept finds its implementation, test, dependency and document with evidence and basis` |
| B2 | `templates/scripts/query-source-graph.test.mjs` | `B2: an indirect relationship is shown as its recorded steps, never as a direct edge` |
| B3 | `templates/scripts/query-source-graph.test.mjs` | `B3: no match reports the absence, applicable coverage and the limit of that answer` |
| B4 | `templates/scripts/query-source-graph.test.mjs` | `B4 and B7: an inferred assertion is labelled tentative and keeps its observations` |
| B5 | `templates/scripts/query-source-graph.test.mjs` | `B5: later source or a different commit marks the result stale and names changed evidence` |
| B6 | `tests/source-graph-feature-acceptance.test.mjs` | `B6: an installed reader exposes a conflicting label alongside the canonical ontology link` |
| B7 | `templates/scripts/query-source-graph.test.mjs` | `B4 and B7: an inferred assertion is labelled tentative and keeps its observations` |
| B8 | `templates/scripts/check-source-graph.test.mjs` | `B8: a refreshed record, even with no fact change, passes` |
| B9 | `templates/scripts/check-source-graph.test.mjs` | `B9: a changed covered file with no graph review names the file` and `B9: a new file inside covered scope needs a record; an out-of-scope change does not` |
| B10 | `templates/scripts/check-source-graph.test.mjs` | `empty evidence path and line zero each produce a finding`; `removed covered selector is visible with no source edit`; `a changed file leaving coverage rejects an invalid review outcome` |
| B11 | `templates/scripts/check-source-graph.test.mjs` | `B11: the scripts never reach for a model, a secret or the network`; `the command exits 0 clean, 1 on findings, 2 when it cannot run` |
| B12 | `templates/scripts/query-source-graph.test.mjs` | `B12: partial coverage is reported with its gaps and still usable` |
| B13 | `tests/source-graph-acceptance.test.mjs` | `B13: checker and reader output is identical across languages once paths are normalised` |
| B14 | `tests/source-graph-acceptance.test.mjs` | `B14: Docker Compose cannot be deployment evidence in the pilot, Terraform can` |
| B15 | `templates/scripts/query-source-graph.test.mjs` | `B15: a consumer reads a pinned commit as JSON with assertions and coverage` |

## Results

Use `pass`, `fail` or `pending` for each step and executable case. Do not tick the local or
deployed criteria while any required cell is pending. Record the exact evidence links and
approver after each run; do not infer a pass from a test with a different scenario.

| Behaviour | Local walkthrough steps | Local test approval/result | Deployed walkthrough steps | Deployed test result | Date and walkthrough person | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | pass, pass | Codex approved; pass | pass, pass | pass | 2026-11-03; Codex | E1 |
| B2 | pass, pass | Codex approved; pass | pass, pass | pass | 2026-11-03; Codex | E1 |
| B3 | pass, pass | Codex approved; pass | pass, pass | pass | 2026-11-03; Codex | E1, E9 |
| B4 | pass, pass | Codex approved; pass | pass, pass | pass | 2026-11-03; Codex | E1, E9 |
| B5 | pass, pass | Codex approved; pass | pass, pass | pass | 2026-11-03; Codex | E3 |
| B6 | pass, pass | Codex approved; pass | pass, pass | pass | 2026-11-03; Codex | E2 |
| B7 | pass, pass | Codex approved; pass | pass, pass | pass | 2026-11-03; Codex | E1, E9 |
| B8 | pass, pass | Codex approved; pass | pass, pass | pass | 2026-11-03; Codex | E4 |
| B9 | pass, pass | Codex approved; pass | pass, pass | pass | 2026-11-03; Codex | E4, E5 |
| B10 | pass, pass | Codex approved; pass | pass, pass | pass | 2026-11-03; Codex | E6 |
| B11 | pass, pass | Codex approved; pass | pass, pass | pass | 2026-11-03; Codex | E2, E4 |
| B12 | pass, pass | Codex approved; pass | pass, pass | pass | 2026-11-03; Codex | E7 |
| B13 | pass, pass | Codex approved; pass | pass, pass | pass | 2026-11-03; Codex | E8 |
| B14 | pass, pass | Codex approved; pass | pass, pass | pass | 2026-11-03; Codex | E10 |
| B15 | pass, pass | Codex approved; pass | pass, pass | pass | 2026-11-03; Codex | E7 |

### Evidence index

- **E1 — source-owned baseline:** [trial commit `937ab32`](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/commit/937ab32786abccaef5342d73a2bf9cc686e3a64e), [default-branch graph check](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/actions/runs/41633789190). The graph was authored from the trial's own Python source, test, design, ontology and Terraform without fixture helpers. The installed checker returned no findings. The reader showed implementation, test, dependency and document assertions with paths, lines, blobs, basis and commit. `path node-implementation node-design` showed two edges and no direct edge. `search payroll` reported no assertion and an undetermined topic; coverage showed covered source, unknown Compose and unmatched README, and excluded graph files.
- **E2 — canonical conflict and human judgement:** [PR #2](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/pull/2) [passed the structural check](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/actions/runs/41634425776) while changing the concept node label to *Bill* beside canonical Invoice. Codex, acting as user, identified the conflict and used Invoice; the graph data was not silently rewritten. The diff is semantically questionable despite its green check, so a maintainer can reject it on meaning.
- **E3 — stale evidence:** [PR #3](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/pull/3) changed cited source after baseline commit `937ab32`. The reader pinned to that commit with the PR head as working revision reported `stale: true` and `changed` evidence. Codex inspected the current source, saw a comment-only edit and did not present the pinned result as automatically current. Its [graph check failed](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/actions/runs/41634449726) because the PR had no review record.
- **E4 — required check and repair:** [PR #1](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/pull/1) initially [failed](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/actions/runs/41633834098) for the changed `src/invoice.py` and new `src/extra.py`; GitHub reported `mergeStateStatus: BLOCKED` after `source-graph` became required on `main`. The author then updated both review records, evidence blobs and shifted line ranges. The staged candidate and [hosted rerun](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/actions/runs/41634077923) passed, and GitHub reported `CLEAN`. The PR diff made the source review visible.
- **E5 — scope-specific freshness:** [PR #4](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/pull/4) changed only out-of-scope README and [passed](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/actions/runs/41634493048). [PR #7](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/pull/7) changed a formerly covered source while excluding that scope and [failed](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/actions/runs/41634523029) with `refresh-stale`.
- **E6 — invalid facts and coverage transitions:** [PR #5](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/pull/5) failed for a removed `src/**` selector; [PR #10](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/pull/10) failed for empty evidence path and line zero. [PR #11](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/pull/11) failed for a duplicate ID, [PR #12](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/pull/12) for a dangling reference, [PR #13](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/pull/13) for missing basis, [PR #14](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/pull/14) for missing evidence, and [PR #15](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/pull/15) for malformed coverage. During scope reduction, [PR #8](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/pull/8) passed with a current, referenced review record while [PR #9](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/pull/9) failed for `refresh-malformed`. Each local staged check named the affected resource and rule, and the hosted checks matched.
- **E7 — partial facts with gaps:** [PR #6](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/pull/6) retained `src/**` as reasoned unknown coverage, removed assertions whose evidence left coverage, and [passed](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/actions/runs/41634512863). Its pinned JSON still returned three distinct assertions plus the unknown source scope and its reason. Codex marked unsupported C4 levels incomplete rather than inventing elements.
- **E8 — cross-language contract:** The installed reader and checker returned the same assertion shape, basis, evidence roles, coverage statuses and `refresh-stale` failure in C#, TypeScript, Java and Python after normalizing file paths. The additional hosted [C# PR #1](https://github.com/jamiemitchellconsultants/ontology-source-graph-csharp-trial-20261103/pull/1), [TypeScript PR #1](https://github.com/jamiemitchellconsultants/ontology-source-graph-typescript-trial-20261103/pull/1), and [Java PR #1](https://github.com/jamiemitchellconsultants/ontology-source-graph-java-trial-20261103/pull/1) each had a passing default-branch graph check ([C#](https://github.com/jamiemitchellconsultants/ontology-source-graph-csharp-trial-20261103/actions/runs/41658076909), [TypeScript](https://github.com/jamiemitchellconsultants/ontology-source-graph-typescript-trial-20261103/actions/runs/41658075286), [Java](https://github.com/jamiemitchellconsultants/ontology-source-graph-java-trial-20261103/actions/runs/41658075951)), a failing unreviewed-source graph check ([C#](https://github.com/jamiemitchellconsultants/ontology-source-graph-csharp-trial-20261103/actions/runs/41658206013), [TypeScript](https://github.com/jamiemitchellconsultants/ontology-source-graph-typescript-trial-20261103/actions/runs/41658209286), [Java](https://github.com/jamiemitchellconsultants/ontology-source-graph-java-trial-20261103/actions/runs/41658206614)), and a passing independent ontology check on the final PR heads. The ontology fixture was seeded and regenerated before those final hosted runs. Python's hosted failure and repair are E4.
- **E9 — grounded agent statements:** From the baseline reader and cited source, Codex described `:assertion-implements` as direct evidence at `src/invoice.py:16–19` in commit `937ab32`. It described `:assertion-communicates` as tentative inference from the observed `ledger.record` call at the same lines. It reported no payroll answer and could not determine topic coverage. Each statement named the assertion, source and revision rather than using only a graph ID.
- **E10 — selected deployment evidence:** [PR #16](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/pull/16) used tracked Terraform as deployment evidence and [passed](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/actions/runs/41634857732). [PR #17](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/pull/17) put a Compose path into covered scope but kept the Terraform-only role selector; it [failed](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/actions/runs/41634870126) specifically with `evidence-role-mismatch`.

Codex performed each local walkthrough and approved its mapped executable case after observing
the expected steps, under the owner's instruction in this chat. The mapped local cases passed.
For the deployed walkthroughs, Codex queried an independent GitHub clone of the trial repository
and inspected the linked PRs and Actions results. The installed-code cases passed 17/17 from that
clone, and the B6 case passed with its installed-script-root override. The three companion hosted
trials produced the same `refresh-stale` failure with passing ontology checks. No cells remain
pending.
