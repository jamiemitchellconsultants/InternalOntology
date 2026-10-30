# Semantic ontology matching — behaviours

These behaviours describe the proposed `ReviewSemanticMatch` use case. A `SemanticReviewRun` is the
current run for a PR; its outcome supersedes earlier runs, including when it cannot review.

## Behaviours

### Outcome 1: Semantic drift is visible before merge

**B1 — Select changed eligible Markdown.** Given a same-repository PR from a trusted collaborator,
when semantic review starts, then it selects each tracked Markdown file changed by the PR that is
not excluded by the repository's `ignorePaths`, and does not select unchanged or excluded files.

**B2 — Read each selected file in full.** Given B1 has selected a file, when the file is reviewed,
then all of its current contents are assessed, including lines unchanged within that file. A
deleted file has no current contents to assess.

**B3 — Use the proposed ontology.** Given a PR also changes the `Ontology`, when a selected file
is assessed, then the PR's proposed `Ontology` is the canonical reference for that assessment.

**B4 — Block on an active finding.** Given a `SemanticReviewRun` reports a `SemanticFinding` that
has not been dismissed for the current revision, when the semantic check completes, then the check
blocks merge and shows the affected file and passage, relevant ontology evidence, and a suggested
correction on the PR.

**B5 — Pass when review finds no drift.** Given every selected file was assessed and no active
`SemanticFinding` remains, when the run completes, then the semantic check passes and reports that
the selected files were reviewed. If no files qualify under B1, it passes and reports that there
were no eligible changed files.

### Outcome 2: The author can resolve a finding

**B6 — Author agent corrects a PR.** Given B4 has blocked a PR and an agent is operating under the
PR author's identity, when that agent commits a correction to the PR branch, then the new revision
receives a new `SemanticReviewRun` and the current check reflects that run's outcome.

**B7 — Other agent proposes a correction.** Given B4 has blocked a PR and an agent is not operating
under the PR author's identity, when that agent acts on the finding, then it presents a proposed
correction to the author on the PR without changing the PR branch under the author's identity.

### Outcome 3: A mistaken finding has an accountable exit

**B8 — Dismiss one finding with a reason.** Given B4 has blocked a PR, when a maintainer records a
reason for dismissing one `SemanticFinding`, then a `FindingDismissal` is visible on the PR and
that finding no longer blocks the current revision. Other active findings still block.

**B9 — Scope dismissal to the revision.** Given a `FindingDismissal` exists, when the same PR
revision is reviewed again, then that dismissal still applies to the same finding. When a new
revision is pushed, the dismissal no longer applies and findings are reconsidered.

### Outcome 4: Model failure is visible without stopping unrelated work

**B10 — Unavailable review unblocks a PR.** Given a later `SemanticReviewRun` cannot assess the PR
because the model or its configuration is unavailable, when that run completes, then the semantic
check permits merge and explicitly reports that semantic matching did not run. This applies even
when an earlier run had an unresolved `SemanticFinding`; that earlier finding remains visible as
history but does not control the latest check.

**B11 — Keep findings from a partial run.** Given a run reports a `SemanticFinding` from one file
and then cannot assess another selected file, when the run completes, then the reported finding
still blocks merge and the PR also identifies the files it could not review.

**B12 — Report incomplete review without findings.** Given a run assesses some selected files,
reports no `SemanticFinding`, and cannot assess the remainder, when the run completes, then the
check permits merge and reports which files were not reviewed. It does not describe the PR as
semantically clean.

**B13 — Keep repository settings under maintainer control.** Given a PR author supplies text or
files that name a model, endpoint, or credential, when semantic review runs, then it uses only the
repository-maintainer-owned settings and credential. An unavailable or invalid configuration
produces the visible nonblocking outcome in B10.

### Outcome 5: The pilot is judged by maintainers

**B14 — Disable the experiment visibly.** Given maintainers have disabled semantic matching, when
an otherwise eligible PR is checked, then no model review runs and the PR can proceed with an
explicit disabled status. The deterministic `TermChecker` remains independent.

## Uncertainties

| ID | Question | Decision or deferral |
| --- | --- | --- |
| U1 | Does an earlier unresolved finding survive a later unavailable run? | [Issue #24](https://github.com/jamiemitchellconsultants/InternalOntology/issues/24): no. The latest unavailable run permits merge and says semantic matching did not run; the earlier finding stays visible as history. |
| U2 | Which ontology applies when the PR changes it? | Use the PR's proposed `Ontology`, as accepted for B3. The ontology change itself remains subject to normal PR review. |
| U3 | How long does a finding dismissal last? | It applies to the same finding and revision across reruns and expires on a new PR revision, as accepted for B9. |
| U4 | What if only some files are reviewed? | A finding returned during the current run blocks; without a returned finding, incomplete review permits merge but reports missing coverage, as accepted for B11–B12. |
| U5 | How does agent identity affect correction? | The author's agent may commit under the author's identity; an agent with another identity proposes a correction on the PR. B4 and B7 define what the author must see; the presentation details are deferred to architecture. |
| U6 | Which PRs receive model review? | Trusted collaborators' same-repository PRs only. Fork PRs are outside this feature and tracked for manual investigation in [issue #21](https://github.com/jamiemitchellconsultants/InternalOntology/issues/21). |
| U7 | What if the model returns no usable assessment? | Treat it as not reviewed and permit merge with an explicit reason, consistent with B10. |

## Terms

- `SemanticReviewRun`: one attempt to assess eligible changed Markdown for a PR revision; the
  latest run controls the semantic check's current result.
- `SemanticFinding`: a reported conflict between a file passage and the proposed `Ontology`, with
  evidence and a suggested correction.
- `FindingDismissal`: a maintainer's reasoned dismissal of one `SemanticFinding` for one revision.
- `ReviewSemanticMatch`: the proposed use case represented by these behaviours.
