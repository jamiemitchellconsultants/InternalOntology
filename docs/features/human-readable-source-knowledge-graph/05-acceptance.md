# Human-readable source knowledge graph — acceptance

This record covers [B1–B14](02-behaviours.md). Status is **stopped: hosted B4 failed; pushback to dev-build**. The merged build's passing tests are baseline verification, not approval of this phase's executable acceptance cases. No local or deployed exit criterion is met while a required step, test approval or result is pending.

For each environment, the person acting as user follows every numbered walkthrough step and records pass or fail. After a behaviour's walkthrough passes, show that person the mapped executable case and obtain approval before running it as acceptance. Record the date, walkthrough person, approver, exact revision, command and result. A test run does not replace reading the document or judging its usability. If a walkthrough or approved test fails its expected result, raise pushback to the owning earlier phase and stop; do not repair the build here.

## Environments and execution

- **Local build:** Kit `ac4547f` on `feature/human-readable-source-knowledge-graph/user`, installed in disposable local Git repositories using the [runbook](05-runbook.md). Use independent branches/repositories for destructive scenarios. The shipped fixtures supply direct/inferred claims, shared labels, isolated nodes, multiple evidence links, separate assertion shards, empty input and custom settings. Author an additional overlapping unknown catch-all selector at lower priority than covered/excluded rules when following B8.
- **Real-data local preview:** JEPA-Speech PR #194 pinned to `f27c3e0fffd3ce0821a70f0d2f3d6cdbcf715465`. A temporary clone adds only its renderer-required browser URL in local source commit `2a9e5df1116423efb7266770498b8da730980c86`. The Kit's current shipped commands run against that clone; its older installed commands predate the URL setting. This local commit has not been published, so preview URLs are not a hosted-navigation result. Its canonical assertions, nodes, evidence, coverage and source files are unchanged.
- **Deployed:** upgrade the existing private [source graph trial](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103) through a PR, then run the walkthroughs against its deployed installed scripts and GitHub-rendered documents. Record trial PRs, source/document commits, both Actions checks and required-check configuration. Repeat hosted retention after actual squash and rebase merges and source-branch deletion on disposable trial branches. Preserve unrelated required contexts. The separate JEPA-Speech maintainer trial records readability and an accuracy judgement for every pilot claim. A GitHub Enterprise trial needs a named real host/repository before it can pass.
- **Approved executable cases:** existing build cases are reused below. Run individual cases with `node --test --test-name-pattern '<exact-case-name>' <test-file>` from the Kit checkout. For deployed copies of shipped cases, run the same case from `<trial-checkout>/scripts/<file>` after its deployed walkthrough and approval. Kit installation/transport cases remain local mechanism checks; repeat their actual hosted actions separately. A local transport fixture or an example Enterprise URL is never a deployed-host result.

## Walkthroughs

### B1 — Present the whole current graph faithfully

1. Generate a valid graph whose assertions occupy two shards. Read every claim and compare subject, relationship, object and direction with the canonical assertions. **Expected:** each assertion appears exactly once and no shortcut or invented relationship appears.
2. Repeat with the pinned JEPA-Speech pilot and enumerate its assertions. **Expected:** all 12 claims match their recorded direction and names. Record the maintainer's readability judgement separately from mechanical fidelity.

### B2 — Preserve readable names and meanings

1. Render labels with Markdown/HTML punctuation and a declared local relationship. **Expected:** recorded text stays readable as content and the local meaning is accessible without a guessed paraphrase.
2. Read two nodes sharing a label and follow their claim references. **Expected:** their distinct claims remain identifiable; full IRIs are not the reading entry point. In the deployed environment inspect the actual browser rendering.

### B3 — Describe unconnected and empty graphs honestly

1. Render a valid graph with an isolated node. **Expected:** its recorded name remains in Nodes with no recorded assertions, without inventing a relationship.
2. Render a valid graph with no assertions. **Expected:** the document still shows coverage and states that missing graph knowledge does not prove absence.

### B4 — Make all evidence usable

1. Read a claim with multiple evidence references and inspect each file/line range at the recorded source commit. **Expected:** every reference and its role are available beside the correct claim, without hashes dominating the prose.
2. Inspect all 12 pilot claims' evidence; on the host, follow every link in the rendered document. **Expected:** each destination opens the named source and recorded line range at the same pinned snapshot. Local Git inspection does not pass the browser portion.

### B5 — Keep inference tentative

1. Read both direct and inferred claims in the supplementary graph. **Expected:** each basis is explicit and the inferred relationship says “Inferred (tentative).”
2. Inspect the inferred observation and the document's review notice. **Expected:** the reader can distinguish supporting observation from proof; the notice leaves accuracy judgement to a human. Do not substitute the all-direct pilot for this case.

### B6 — Identify and retain the snapshot

1. Record the full source commit shown in provenance and compare every evidence/Turtle destination. Advance the viewing branch with a later source change after opening the older document. **Expected:** all old destinations still identify the original bytes; the document claims no fresh semantic review.
2. In the deployed trial, squash and rebase separate valid source/document PRs, delete only their disposable source branches, and use fresh default-branch clones. Run SHA inspection, fixed-remote retrieval and the real check; reopen the old hosted permalinks. **Expected:** the source remains retrievable and links remain available. Record each hosting environment separately; missing retention is a failed acceptance trial, not a moving-link fallback.

### B7 — Find the exact canonical assertion

1. Begin at each readable pilot claim, follow its Turtle source reference and compare its resource identity. **Expected:** all 12 routes reach the exact matching assertion block.
2. Repeat with shared-label nodes and claims split across shards. **Expected:** references distinguish the claims and remain pinned when the branch advances. In deployment use actual browser navigation.

### B8 — Explain declared scope and priority

1. Read covered, unknown and excluded selectors, priorities and reasons, including an overlapping lower-priority catch-all. **Expected:** every declaration is visible and the higher-priority matching rule wins.
2. Inspect a path unmatched by any selector and the coverage notice. **Expected:** it remains unknown; covered files may still have unrecorded relationships.

### B9 — Preserve gaps alongside useful claims

1. Read a valid claim while unrelated repository areas are unknown or excluded. **Expected:** the claim remains readable and each gap's reason remains visible.
2. Ask whether an unrecorded relationship exists. **Expected:** the reader reports missing graph knowledge and relevant scope, without turning it into a negative source fact.

### B10 — Generate and check an ordinary document

1. Follow the runbook's source S then document D sequence. Compare canonical inputs before and after generation, stage the view and check it. **Expected:** ordinary Markdown identifies itself as generated, directs content fixes to Turtle, leaves canonical inputs unchanged and passes the staged freshness check.
2. Commit D and check it. In deployment inspect the PR/default-branch checks and workflow permissions. **Expected:** `source-graph` and `source-graph-markdown` run; CI has read-only access and does not commit generated output. Both contexts are required while existing requirements remain present. A stale-view trial blocks merge.

### B11 — Repeat without churn

1. Generate twice from unchanged input; compare document bytes and the recorded source commit. **Expected:** both remain identical, with stable ordering and no timestamps or run IDs.
2. Commit an unrelated change and regenerate. **Expected:** the existing source snapshot is reused and the tracked view stays unchanged.

### B12 — Replace only with current state

1. On a disposable branch, remove or revise a claim and its relevant evidence/coverage, validate and commit canonical input, then check the old view. **Expected:** stale output fails the check; forcing a nonmatching old source cannot bypass validation.
2. Generate and read the replacement. **Expected:** it shows only the new input's current claims, evidence and scope, without a change report, history or diagram.

### B13 — Fail without a partial replacement

1. Preserve a successful document; separately try stale evidence, malformed input, uncommitted staged relevant input and an unavailable source snapshot. **Expected:** each attempt fails with the affected input and reason, and the last successful file is unchanged rather than presented as refreshed.
2. Try an authored output file and a symlinked destination on disposable branches. **Expected:** authored content and outside files remain intact. A valid empty or partially covered graph still succeeds. Distinguish expected negative-case failures from a failure to meet these expectations.

### B14 — Respect independent adopter settings

1. Install the same Kit in default and alternate-root/namespace repositories, with different browser URLs and an alternate Markdown path. Generate and check each view. **Expected:** each describes only its own configured graph and uses its own source URLs; the installed renderer files are byte-identical.
2. Upgrade the alternate adopter with `--force`, then check its view and terminology. **Expected:** configuration, canonical graph data, generated output and any authored README survive. An example Enterprise browser base checks URL construction only; actual hosted navigation and retention require a real host trial.

## Executable cases for approval

Every behaviour maps to existing executable scenarios; no duplicate implementation tests are introduced in this phase. Read the complete named cases before approving them. Files under `templates/scripts/` also install under the adopter's `scripts/` directory.

| Key | File | Exact case name |
| --- | --- | --- |
| M1 | [source-graph-markdown.test.mjs](../../../templates/scripts/source-graph-markdown.test.mjs) | B1–B9: all shards, claims, evidence, basis, shared/isolated nodes and scope stay readable |
| M2 | [source-graph-markdown.test.mjs](../../../templates/scripts/source-graph-markdown.test.mjs) | B2: supplied markup is text and used local relationship meaning remains accessible |
| M3 | [source-graph-markdown.test.mjs](../../../templates/scripts/source-graph-markdown.test.mjs) | B3: an empty valid graph produces a document with limits, not fabricated relationships |
| M4 | [source-graph-markdown.test.mjs](../../../templates/scripts/source-graph-markdown.test.mjs) | B4/B6/B7: source destinations remain immutable after branch advancement and encode paths |
| P1 | [source-graph-model.test.mjs](../../../templates/scripts/source-graph-model.test.mjs) | the highest priority wins, equal priority with different status conflicts, unmatched is unknown |
| C1 | [render-source-graph.test.mjs](../../../templates/scripts/render-source-graph.test.mjs) | B10/B11: source then document commits, staged check, source reuse and historical checks |
| C2 | [render-source-graph.test.mjs](../../../templates/scripts/render-source-graph.test.mjs) | B12: a changed valid graph replaces current state and an old-source check fails stale |
| C3 | [render-source-graph.test.mjs](../../../templates/scripts/render-source-graph.test.mjs) | B13: invalid input and concurrent staging preserve the previous document |
| C4 | [render-source-graph.test.mjs](../../../templates/scripts/render-source-graph.test.mjs) | B13: authored files, symlinks and replacement failures are preserved |
| I1 | [source-graph-render-install.test.mjs](../../../tests/source-graph-render-install.test.mjs) | installed alternate-root/namespace/Enterprise configuration generates, checks and survives upgrade |
| W1 | [source-graph-render-workflow.test.mjs](../../../tests/source-graph-render-workflow.test.mjs) | squashed fresh clone retrieves retained source and passes the real check |
| W2 | [source-graph-render-workflow.test.mjs](../../../tests/source-graph-render-workflow.test.mjs) | unavailable source fails bootstrap and preserves the tracked document |
| W3 | [source-graph-render-workflow.test.mjs](../../../tests/source-graph-render-workflow.test.mjs) | workflow is read-only, unfiltered, full-history and uses bounded SHA inspection |

| Behaviour | Cases | Additional walkthrough evidence required |
| --- | --- | --- |
| B1 | M1 | Pilot's 12 claims and maintainer readability judgement |
| B2 | M1, M2 | Actual browser rendering and local vocabulary meaning |
| B3 | M1, M3 | Isolated and empty graph reading |
| B4 | M1, M4 | Every pilot evidence link, including actual hosted navigation |
| B5 | M1 | Reader's inference and accuracy distinction |
| B6 | M4, W1, W2 | Real squash/rebase/deletion retrieval and permalink retention per host |
| B7 | M1, M4 | Exact Turtle navigation for every pilot assertion |
| B8 | M1, P1 | Rendered priorities/reasons paired with overlapping selector precedence and unmatched paths |
| B9 | M1, M3 | Reader's response to missing knowledge |
| B10 | C1, W3 | Live workflows and both required checks |
| B11 | M1, C1 | Byte comparison after repeated generation and unrelated commit |
| B12 | C2 | Current claims/evidence/coverage after replacement |
| B13 | C3, C4, W2 | Named failure diagnostics and preserved files |
| B14 | I1 | Real adopter configurations; actual Enterprise trial if that host is claimed |

## Results as of 2026-11-04

Codex followed the local command/source-inspection portions of the walkthroughs below. Pending cells are intentional, not inferred passes. These observations do not complete browser rendering, maintainer acceptance, approved executable runs or deployed navigation. A step's hosted-only actions remain in the deployed column.

| Behaviour | Local walkthrough steps | Local approval / executable result | Deployed walkthrough steps | Deployed approval / executable result | Walkthrough person and date |
| --- | --- | --- | --- | --- | --- |
| B1 | 1 pass; 2 fidelity pass, maintainer judgement pending | Codex approved / pass (E11) | pending / pending | pending / pending | Codex, 2026-11-04; E3, E4 |
| B2 | escaped text/local meaning pass; shared source references pass; browser rendering pending | Codex approved / pass (E11) | pending / pending | pending / pending | Codex, 2026-11-04; E4 |
| B3 | pass / pass | Codex approved / pass (E11) | pending / pending | pending / pending | Codex, 2026-11-04; E4 |
| B4 | pass / local source inspection pass | Codex approved / pass (E11) | 1 inspected; 2 FAIL: Markdown evidence range has no target | not run after failure | Codex, 2026-11-04; E3, E4, E12 |
| B5 | pass / pass | Codex approved / pass (E11) | pending / pending | pending / pending | Codex, 2026-11-04; E4, E10 |
| B6 | 1 local historical inspection pass; 2 hosted-only actions pending in deployed column | Codex approved / pass (E11) | pending / pending | pending / pending | Codex, 2026-11-04; E6 |
| B7 | pass / local source lookup pass | Codex approved / pass (E11) | pending / pending | pending / pending | Codex, 2026-11-04; E3, E4 |
| B8 | pass / pass | Codex approved / pass (E11) | pending / pending | pending / pending | Codex, 2026-11-04; E4 |
| B9 | pass / pass | Codex approved / pass (E11) | pending / pending | pending / pending | Codex, 2026-11-04; E4 |
| B10 | pass / local committed check pass; hosted-only actions pending in deployed column | Codex approved / pass (E11) | pending / pending | pending / pending | Codex, 2026-11-04; E5 |
| B11 | pass / pass | Codex approved / pass (E11) | pending / pending | pending / pending | Codex, 2026-11-04; E5 |
| B12 | pass / pass | Codex approved / pass (E11) | pending / pending | pending / pending | Codex, 2026-11-04; E7 |
| B13 | pass / pass | Codex approved / pass (E11) | pending / pending | pending / pending | Codex, 2026-11-04; E8 |
| B14 | pass / pass (local URL construction; no Enterprise host result) | Codex approved / pass (E11) | pending / pending | pending / pending | Codex, 2026-11-04; E9 |

### Preliminary evidence

- **E1 — merged baseline:** PR #77 merged as `bb1f7c45b4f004175cb17b4d739857549fff554e`; main including the generated narrative is `ac4547f`. On 2026-11-04, Codex ran `npm test` there: 456 tests passed, zero failed, zero skipped. This preceded acceptance approval and is build verification only.
- **E2 — local pilot preparation:** the temporary clone at `/private/tmp/human-readable-source-graph-jepa-20261104` contains the pinned pilot plus one local browser-URL config commit, `2a9e5df1116423efb7266770498b8da730980c86`. The current Kit's staged graph check, term check (271 files, 157 terms) and ontology freshness check passed before that commit. The older pilot-installed config loader rejects the new URL setting; the deployed trial must upgrade the Kit together rather than mix old and new installed modules. No adopter remote was changed.
- **E3 — local pilot reading:** Codex generated and read `docs/source-knowledge-graph/README.md`, compared all 12 claim sentences with the canonical assertions, and inspected all 12 evidence ranges and all 12 Turtle resource start lines in the pinned local source. All matched their recorded locations and direction. The view retained all eight coverage declarations, their priorities/reasons and the unknown/excluded limitations. The preview's local-only source SHA has not been published; live URL availability, browser rendering, maintainer readability/accuracy judgements and host retention remain pending.
- **E4 — supplementary local reading:** scratch repositories under `/private/tmp/readable-graph-local-20261104` use the actually installed scripts. The rich graph's source is `cdd26d83b5032a471fa34fa75ec185fdb069b7b8`: six claims across two shards, two distinct nodes sharing a label, one isolated node and two evidence references on one claim. Codex read each sentence and every evidence/Turtle target at the source commit. The markup graph at `89793d181b0ab854390c759000ce836a2272885d` retained escaped punctuation and the declared local relationship definition. The empty graph at `709622094b586c8f5e7de8298f7588872c129f62` retained scope and the missing-knowledge notice. In the rich graph, the priority-0 unknown catch-all remained visible beneath priority-10 covered scopes and priority-1000 excluded graph scope; the reader confirmed covered source, excluded graph and unknown README. The empty graph's unmatched `untracked.txt` remained unknown. A payroll search had no matches; Codex interpreted that as no recorded answer, with no negative fact about the repository. The generic fixture's inferred observation is placeholder source; E10 supplies the meaningful separate inference trial.
- **E5 — local generation and repetition:** rich document commit `f8dc2e372fecbf3368658ee6386cc3992bdcd481` passed staged and committed checks. Only the generated view changed after source S; the term check passed. Repeated generation and a later unrelated README commit reused S. All three observed document SHA-256 values were `e17357143e04e8d5e7f3eeaff9d9bd8945561b6dfefeaf1e6debe305d7bb968f`. The working tree stayed clean after regeneration.
- **E6 — local historical destinations:** a separate `history` clone advanced a cited source file at `3aa0e1aa449fcc7790135135fee3384602ac799c`. Reading the original pinned source returned the original six lines while HEAD returned the changed bytes. `--check --rev f8dc2e372fecbf3368658ee6386cc3992bdcd481` passed without changing the clean working tree. This verifies local immutable reading, not hosted retention or browser navigation.
- **E7 — local current-state replacement:** source `a436e50cc9e4c8ef7a161cb1dcd6a0646aae73c6` removed one assertion, moved an inferred claim's evidence range and changed an unknown-scope reason. Its staged graph and term checks passed. Checking the old document exited 1 with a stale diagnostic; forcing the old source exited 2 with a projection mismatch. Regeneration succeeded. Codex read the five remaining claims, the updated evidence line and current scope reason, with no change-report sections.
- **E8 — expected local failure preservation:** separate stale-evidence, malformed-manifest, uncommitted valid-input and unavailable-source attempts exited 2 with the affected input and reason. The generated file retained SHA-256 `bb2e37f28a002f3a4b6fa0ee27ce9073b0cc81c6721cde43e59585861a6d4bde` throughout. An authored destination remained intact after an explicit refusal. A symlinked graph-directory destination was rejected, leaving the outside sentinel unchanged. These were expected negative cases, not failures of their walkthrough expectations.
- **E9 — local alternate adopter:** source `328390bdeba4c8b9cc7ace14e89ac5bb624d8217` uses a custom namespace, `knowledge` root, `knowledge/current.md` and an example Enterprise browser URL. Generation, staged/committed checks and terminology validation passed; document commit is `89f1ca73ebba8e2bc37c668bd1c1d0c1b37ed397`. Ordinary `--force` upgrade preserved configuration, canonical graph files, generated output and an authored README. The three installed renderer modules compared byte-identical to the Kit templates. The post-upgrade check passed. No request was made to the example host.
- **E10 — meaningful local inference:** the supplementary `inference` repository's source `77451bacf9460f38fcb9a1ce1ec7db6d3a276e09` contains an actual `ledger.Record(invoice)` call at `src/Invoice.cs:3`. Its one recorded component-communication claim is inferred and cites that line. Codex read the generated tentative label, the exact source observation, the Turtle resource and the human-review notice. The method call supports an inference about communication; it is not direct proof of the complete component relationship or runtime topology. The separate sample supplies observed source content without changing the all-direct JEPA-Speech pilot.

Before completing this phase, replace pending cells with observed results and link durable deployed evidence. For each pilot assertion record the maintainer's accuracy judgement and rationale. For each hosted retention trial record the host, merge method, source SHA, document SHA, deleted trial branch, fresh-clone fetch/check result and reopened permalinks. Obtain a real Enterprise environment or explicitly record its acceptance limitation; do not mark an example URL as a deployed pass. Do not tick the local/deployed criteria or close issue #68 while required acceptance is pending.

## Authorized acceptance execution and failure

On 2026-11-04 the owner explicitly authorized Codex to act as user, approve each mapped test after its walkthrough passes, and run local and disposable hosted acceptance. Codex approved the mapped executable scenarios following the recorded local inspections; the selected five test files passed all 23 cases, including every case in the approval map. Command: `node --test templates/scripts/source-graph-markdown.test.mjs templates/scripts/source-graph-model.test.mjs templates/scripts/render-source-graph.test.mjs tests/source-graph-render-install.test.mjs tests/source-graph-render-workflow.test.mjs`. **E11:** local log `/private/tmp/readable-local-acceptance.log`. This result does not pass the remaining browser, hosted or maintainer walkthrough portions.

**E12 — hosted B4 failure:** [disposable trial PR #18](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/pull/18) installed the merged tooling as source `92e110992ff9c7335394a1f803daca4649758abe`, followed by generated document `cd27c5ac068b901dcd45d08c4a51c0520a031543`. Its [graph check](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/actions/runs/41774834266), [Markdown check](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/actions/runs/41774834464) and [term check](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/actions/runs/41774834270) all passed. The disposable PR was squash-merged as `fb54210671597809fbd3e37d93a948d1ad6d7ebe` and its trial branch was deleted as authorized for retention testing. Browser navigation then exposed the failure below; no further acceptance or retention trial was run after it.

1. Open the [generated document at its document commit](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/blob/cd27c5ac068b901dcd45d08c4a51c0520a031543/docs/source-knowledge-graph/README.md). The five recorded claims, direct/inferred basis and scope are readable in GitHub's rendered view.
2. Follow its [Markdown evidence link, docs/design.md lines 3–4](https://github.com/jamiemitchellconsultants/ontology-source-graph-trial-20261103/blob/92e110992ff9c7335394a1f803daca4649758abe/docs/design.md#L3-L4). **Expected:** the named source and line range open at the pinned revision. **Observed: fail.** GitHub selects Preview; the page has no line-3 element and no target for the range fragment. The file content is available, but the cited lines are not selected or exposed as a source range. The browser DOM reports Preview pressed and no `L3` target. Code/test/Turtle destinations opened their source files; those successes do not repair the Markdown case.
3. Stop and raise pushback to dev-build. Both required-check configuration, fresh-clone retrieval, rebase retention, the full deployed behaviour set and the JEPA-Speech hosted trial remain unfinished. No Enterprise environment was supplied or claimed as accepted. Do not close the phase issue or mark the feature accepted.

![Markdown evidence opens Preview without the cited source-line target](evidence/markdown-evidence-preview.png)
