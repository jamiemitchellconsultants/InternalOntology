# Semantic ontology matching — user guide

This optional check helps trusted collaborators and maintainers spot clear conflicts between a
changed Markdown file and the repository ontology before merge. It reads changed eligible files
as a whole. The check is separate from the deterministic ontology term check and the older
advisory reviewer. A repository maintainer chooses whether to enable it.

## B1 — Which files are selected

On a same-repository PR by a collaborator with write access, the reviewer selects tracked changed
`.md` files except paths in the repository's `ignorePaths`. It skips unchanged files, source code,
and deleted files with no current content. Fork PRs are outside this pilot; ask a maintainer about
the manual path in [issue #21](https://github.com/jamiemitchellconsultants/InternalOntology/issues/21).

## B2 — The selected file is read in full

The review covers the current content of each selected file, including lines outside the diff.
If GitHub cannot supply a selected file, the PR comment lists it as not reviewed.

## B3 — The PR's proposed ontology is the reference

If the PR changes `docs/ontology.md`, semantic matching uses that proposed ontology when judging
the PR's changed Markdown. The ontology change still needs ordinary human review.

## B4 — A finding blocks merge

The fixed `ontology/semantic-match` status fails when the latest run has an active finding. Its PR
comment names the file, exact passage, ontology evidence, reason, finding ID and suggested
correction. Read the passage and ontology row before changing anything; model findings can be
mistaken.

## B5 — A complete review with no finding passes

A passing reviewed result says how many selected files were assessed. If none qualified, the
passing result says *no eligible changed Markdown files*. Neither result is a guarantee that the
whole PR is correct; continue normal review and the deterministic check.

## B6 — The author's agent corrects the PR

An agent acting under the PR author's identity may commit a correction to that PR branch. The
new head SHA receives a new review, and its latest status controls merge. Watch for the new run
before treating the old finding as resolved.

## B7 — An agent with another identity proposes a correction

An agent that is not operating under the author's identity posts a suggested edit in a PR
comment, referencing the finding and exact passage. The author decides whether to apply it. The
kit does not impersonate the author or modify the branch for that agent.

## B8 — A maintainer dismisses one mistaken finding

An owner, admin or maintainer may post exactly
`/ontology-dismiss <64-hex-finding-id> <40-hex-head-sha> <reason>` as a PR comment. Copy the ID
and SHA from the latest run and give a real reason. That comment is the durable record. It clears
only that finding; other active findings still block. A collaborator with only write permission
cannot dismiss.

## B9 — A dismissal belongs to one revision

The dismissal remains effective across reruns of the same head SHA for the same finding ID. A new
commit changes the SHA and requires fresh assessment; old dismissals do not carry forward.
Editing away or deleting a dismissal comment recalculates the status.

## B10 — An unavailable later run permits merge

If the model or trusted configuration is unavailable, the latest status succeeds and explicitly
says semantic matching did not run. This later outcome supersedes an earlier block on the same
revision, while the earlier finding comment remains visible. A maintainer should still decide
whether the PR needs manual investigation.

## B11 — A partial run keeps its findings

If one changed file yields a grounded finding and another cannot be assessed, the active finding
still blocks. The PR comment identifies both the finding and the unreviewed file.

## B12 — A partial run without findings permits merge

If the reviewer assessed some files and could not assess others but found no drift in what it
covered, the status succeeds and lists unreviewed paths. It reports *partial review*, not a clean
semantic assessment of the whole PR.

## B13 — Maintainers control model settings

Only the default branch's `ontology.config.json` and protected Actions environment control the
model, endpoint and credential. Text or files in a PR cannot change those settings for that PR's
review. Invalid settings or a missing credential give an explicit nonblocking unavailable result.

## B14 — Maintainers can disable the pilot

Set `semanticReview.enabled` to `false` on the default branch to stop model review. The workflow
then posts a passing *disabled; not reviewed* result. The deterministic `TermChecker` remains
independent. Maintainers decide whether real findings are useful enough to keep the pilot on;
there is no numerical value threshold yet.
