# Semantic ontology matching — acceptance

Acceptance covers behaviours [B1–B14](02-behaviours.md). The person acting as user follows each
numbered walkthrough first and records pass or fail for **every step**. After a walkthrough passes,
show that person the matching `B<n>` case in
`tests/semantic-feature-acceptance.test.mjs` and ask them to approve it before running it. Run the
same executable suite against the local kit and the installed scripts in the deployed environment.
Do not infer a walkthrough pass from a green automated test.

## Environments and evidence

- **Local build:** this repository on `feature/semantic-ontology-matching/user`, with a scratch
  installation from `node bin/install-ontology.mjs --target <scratch-repo> --with-semantic-review`.
  Use the local fixture data and public APIs in the matching `B<n>` test as the scenario setup;
  inspect the produced run record, PR comment text and status before running that test.
- **Deployed environment:** the private disposable
  [`jamiemitchellconsultants/ontology-semantic-trial-20261030`](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030)
  repository named in [the runbook](05-runbook.md), with the kit installed on `main`, the protected
  `ontology-semantic-review` environment, and a required `ontology/semantic-match` status. Open
  separate disposable PRs where a scenario requires different text or history. Use a configured
  pilot model and its environment secret for finding and clean-review scenarios; never put the key
  in a PR or this document. The existing
  [trial PR #1](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/pull/1)
  demonstrates the unavailable path only.
- **Executable local command, after approval:**
  `node --test tests/semantic-feature-acceptance.test.mjs`.
- **Executable installed-code command, after approval:**
  `ONTOLOGY_ACCEPTANCE_SCRIPT_ROOT=<trial-checkout>/scripts node --test tests/semantic-feature-acceptance.test.mjs`
  from this kit checkout. This runs the same acceptance cases against the deployed repository's
  installed scripts. The GitHub walkthroughs separately verify the hosted workflow and branch
  protection.

For each case below, repeat the steps locally with its fixture and in the deployed repository
with an equivalent PR. Record the observed comment, status or file selection as evidence. A
finding is useful only if the maintainer judges it to be a real, actionable conflict.

## B1 — Select changed eligible Markdown

1. Prepare a trusted same-repository PR with one changed `docs/spec.md`, one changed ignored
   Markdown file, one changed source file, one deleted Markdown file and one unchanged Markdown
   file. **Expected:** the PR and its changed-file list show those distinct cases.
2. Trigger semantic review and inspect its file coverage. **Expected:** only `docs/spec.md` is
   selected; unchanged, ignored, source and deleted files are absent from reviewed coverage.

## B2 — Read each selected file in full

1. Change one line of a Markdown file that also contains an unchanged, deliberately conflicting
   passage. **Expected:** the diff shows only the edited line while the current file contains both.
2. Review the model request in the local fixture and the finding in the deployed PR. **Expected:**
   the unchanged passage is within the assessed content and can be cited as an exact finding.

## B3 — Use the proposed ontology

1. In one PR, change an ontology row and a Markdown passage whose meaning depends on that row.
   **Expected:** both changes are visible on the PR head.
2. Run review and inspect the referenced ontology evidence. **Expected:** the proposed row, not
   the default branch's previous row, is used to assess the passage.

## B4 — Block on an active finding

1. Submit a changed Markdown passage that clearly conflicts with a canonical ontology row.
   **Expected:** the deterministic check can pass while semantic review still finds the conflict.
2. Inspect the latest PR comment and `ontology/semantic-match` status. **Expected:** the comment
   shows file, exact passage, ontology evidence, finding ID and correction; the status fails. In
   the deployed repository, branch protection also blocks merge.

## B5 — Pass on clean or no-eligible review

1. Submit a changed Markdown file that matches the ontology. **Expected:** review reports the
   assessed file count, no active finding and a successful status.
2. Submit a code-only PR. **Expected:** the fixed status succeeds with *no eligible changed
   Markdown files*, rather than staying pending.

## B6 — Author agent corrects the PR

1. Start with the blocking PR from B4 and have an agent using the author's identity commit the
   suggested correction. **Expected:** the author branch receives a new head SHA.
2. Wait for the new review. **Expected:** its result controls the fixed status, and the old finding
   remains only in the previous run's comment.

## B7 — Other agent proposes a correction

1. Start with a blocking finding and use an agent without the author's identity to post a PR
   comment referencing the exact passage and a proposed edit. **Expected:** the author can see the
   proposal, while the PR head SHA is unchanged.
2. Inspect dismissal and status activity. **Expected:** an ordinary proposal is not treated as a
   dismissal and the active finding still blocks.

## B8 — Dismiss one finding with a reason

1. Use a PR with two active findings. Have a maintainer post
   `/ontology-dismiss <finding-id> <head-sha> <reason>` for only one of them. **Expected:** the
   reason and maintainer identity remain visible, and the other finding still blocks.
2. Dismiss the second finding with a reason. **Expected:** no active finding remains and the fixed
   status succeeds. A non-maintainer workflow bot's attempted command must not clear a finding.

## B9 — Scope dismissal to the revision

1. Rerun review on the same SHA after a valid dismissal. **Expected:** that finding remains
   dismissed. Edit away or delete the command. **Expected:** the status is recalculated.
2. Push a new commit. **Expected:** the previous SHA's dismissal no longer applies; the new run
   considers any finding afresh.

## B10 — Unavailable later run unblocks

1. Begin with a finding that blocks the current SHA, then make the trusted model or its
   configuration unavailable and rerun on that same SHA. **Expected:** the later run explicitly
   says semantic matching did not run.
2. Inspect status and comments. **Expected:** the latest fixed status succeeds and permits merge;
   the older finding comment remains visible as history.

## B11 — Keep findings from a partial run

1. Have one changed file produce a grounded finding while another selected file cannot be read or
   assessed. **Expected:** the latest comment names the finding and the unreviewed path.
2. Inspect the fixed status. **Expected:** it fails because the finding is still active.

## B12 — Report incomplete review without findings

1. Have one selected file assessed without findings while another cannot be assessed. **Expected:**
   the latest comment names the unreviewed path and describes partial coverage.
2. Inspect the fixed status. **Expected:** it succeeds but does not claim the PR is semantically
   clean in full.

## B13 — Keep settings under maintainer control

1. Put a different model ID, endpoint and credential-looking string in a PR's proposed config or
   Markdown. **Expected:** those values are visible as PR data only.
2. Trigger review and inspect the trusted job's selected model and endpoint without exposing its
   credential. **Expected:** they come from the default branch and protected environment. Invalid
   trusted settings yield an explicit successful *not reviewed* result.

## B14 — Disable the experiment visibly

1. Set `semanticReview.enabled` to `false` on the default branch and trigger an eligible PR.
   **Expected:** no model request occurs and the fixed status succeeds with *disabled; not
   reviewed*.
2. Run the deterministic term check on a noncanonical backticked term. **Expected:** it still
   flags the term independently of the disabled semantic pilot.

## Results

Use `pass`, `fail` or `pending` for each step and executable case. Add the date, the person who
performed the walkthrough, the exact trial PR and Actions run, and the observed result. Do not
tick the issue's local or deployed criteria while any required cell is pending. The executable
case for a behaviour runs only after that behaviour's walkthrough has passed and the person has
approved the test.

| Behaviour | Local walkthrough (steps 1, 2) | Local test approval/result | Deployed walkthrough (steps 1, 2) | Deployed installed-code test | Date and walkthrough person | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | pass, pass | Codex approved / pass | pass, pass | pass | 2026-11-01, Codex (local and deployed) | [PR #3](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/pull/3), [run 41317651953](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/actions/runs/41317651953): one eligible Markdown file reviewed; ignored, source, deleted and unchanged files excluded |
| B2 | pass, pass | Codex approved / pass | pass, pass | pass | 2026-11-01, Codex (local and deployed) | [PR #3](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/pull/3), [run 41317651953](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/actions/runs/41317651953): only footer changed, but finding quotes the unchanged first line |
| B3 | pass, pass | Codex approved / pass | pass, pass | pass | 2026-11-01, Codex (local and deployed) | [PR #5](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/pull/5), [run 41317814195](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/actions/runs/41317814195): proposed status enum ends in Archived; passage saying Closed was flagged against that proposed row |
| B4 | pass, pass | Codex approved / pass | pass, pass | pass | 2026-11-01, Codex (local and deployed) | [PR #3](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/pull/3), [run 41317651953](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/actions/runs/41317651953): finding showed path, quote, `Entities:ExampleEntity`, reason, correction and ID; fixed status failed and branch protection blocked merge |
| B5 | pass, pass | Codex approved / pass | pass, pass | pass | 2026-11-01, Codex (local and deployed) | Clean [PR #6](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/pull/6), [run 41317542634](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/actions/runs/41317542634) reviewed one file and passed; code-only [PR #1](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/pull/1), [run 41319975220](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/actions/runs/41319975220) reported no eligible Markdown and passed |
| B6 | pass, pass | Codex approved / pass | pass, pass | pass | 2026-11-01, Codex (local and deployed) | [PR #3](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/pull/3): [run 41319544054](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/actions/runs/41319544054) blocked old SHA; author commit `0528df5` applied the suggestion; [run 41319695227](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/actions/runs/41319695227) reviewed the new SHA cleanly |
| B7 | pass, pass | Codex approved / pass | pass, pass | pass | 2026-11-01, Codex (local and deployed) | On [PR #3](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/pull/3), [bot run 41317763165](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/actions/runs/41317763165) proposed the exact correction; head stayed `d46ef9a` and the active finding still failed |
| B8 | pass, pass | Codex approved / pass | pass, pass | pass | 2026-11-01, Codex (local and deployed) | [PR #9](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/pull/9), [run 41317944652](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/actions/runs/41317944652): two findings; [first dismissal run](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/actions/runs/41318075296) left failure, [second dismissal run](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/actions/runs/41318108118) passed; [bot command](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/pull/9#issuecomment-6559624920) was ignored on [rerun 41318861150](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/actions/runs/41318861150) |
| B9 | pass, pass | Codex approved / pass | pass, pass | pass | 2026-11-01, Codex (local and deployed) | [PR #9](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/pull/9): [same-SHA rerun 41318164606](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/actions/runs/41318164606) retained dismissals; [edit run 41318256038](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/actions/runs/41318256038) restored failure; [new-SHA run 41318354740](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/actions/runs/41318354740) found both conflicts anew |
| B10 | pass, pass | Codex approved / pass | pass, pass | pass | 2026-11-01, Codex (local and deployed) | [PR #3](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/pull/3): [finding run 41317651953](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/actions/runs/41317651953) failed; after trusted endpoint became unavailable, [run 41319230272](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/actions/runs/41319230272) on the same SHA said not reviewed and succeeded while old finding stayed visible |
| B11 | pass, pass | Codex approved / pass | pass, pass | pass | 2026-11-01, Codex (local and deployed) | [PR #8](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/pull/8), [run 41318475667](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/actions/runs/41318475667): one grounded finding plus unreadable `docs/binary.md`; status failed |
| B12 | pass, pass | Codex approved / pass | pass, pass | pass | 2026-11-01, Codex (local and deployed) | [PR #8](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/pull/8), [run 41318601878](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/actions/runs/41318601878): corrected readable file had no finding; unreadable `docs/binary.md` remained listed; partial status succeeded |
| B13 | pass, pass | Codex approved / pass | pass, pass | pass | 2026-11-01, Codex (local and deployed) | [PR #7](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/pull/7) proposed another endpoint, model and fake key; [run 41318974255](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/actions/runs/41318974255) reviewed via trusted Meta config; [run 41319328710](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/actions/runs/41319328710) reported not reviewed when the trusted endpoint was unavailable |
| B14 | pass, pass | Codex approved / pass | pass, pass | pass | 2026-11-01, Codex (local and deployed) | [PR #4](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/pull/4) disabled the pilot; [PR #3](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/pull/3) showed disabled success; [deterministic run 41287351006](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/actions/runs/41287351006) independently failed on a noncanonical backticked term |

Codex acted as the user tester under the owner's 2026-11-01 authorization. It followed the local
fixture walkthrough before approving and running each matching test. The local suite passed 14/14
against both kit templates and the scratch installation at
`/tmp/ontology-user-acceptance.fBLGBl/scripts`.

Codex followed every deployed walkthrough, approved its matching executable case under the same
authorization, then ran that case against the trial repository's installed scripts. The complete
installed-code suite passed 14/14 on 2026-11-01. For B8, the owner approved using
`github-actions[bot]` as the non-maintainer identity in place of a write-role collaborator. The
bot's repository role was `none`; the next trusted rerun read its dismissal command and kept both
findings active. The trial-only endpoint change was restored in
[PR #14](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/pull/14).

The build-phase disposable trial already demonstrated a no-eligible status, a missing-credential
unavailable status, and required-status behaviour using a manually simulated failure. Those are
preparation evidence, not passes for the user walkthroughs or a hosted model finding.
