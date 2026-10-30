# Semantic ontology matching — vision

## Problem

A trusted collaborator can change a Markdown file using plausible names or descriptions that
conflict with the repository's ontology, while the deterministic term check passes. The kit ships
an optional semantic reviewer, but its findings are advisory and cover only added lines. A PR
author and maintainer need a dependable way to find and resolve those mismatches before merge.

## Users

- Trusted collaborators who author PRs and the agents working under their identity.
- Maintainers who review PRs, configure the model used by this repository, and decide whether a
  finding is a false positive.
- Agents working without the PR author's identity, which can propose corrections for the author.

## Outcomes and measures

1. **Semantic drift is visible before merge.** A finding identifies the affected file
   and passage and blocks the PR. A trial PR with a known mismatch demonstrates this outcome.
2. **The author can resolve a finding.** The PR author's agent monitors the check and can commit a
   correction under the author's identity; an agent using another identity proposes one for the
   author. A subsequent review shows whether the finding remains.
3. **A mistaken finding has an accountable exit.** A maintainer can dismiss that specific finding
   with a recorded reason. A new PR revision is reviewed again.
4. **Model failure is visible without stopping unrelated work.** If the model or its configuration
   is unavailable, the PR reports that it was not semantically reviewed and may proceed.
5. **The pilot is judged by maintainers.** There is no numerical value target yet. Maintainers
   assess whether the findings are subjectively useful in real PRs and disable semantic matching
   if they see no value.

## Scope

- Run semantic review for trusted collaborators' same-repository PRs. The repository's maintainers
  own the model and endpoint configuration and the credential used by CI; a PR author does not
  supply them.
- Inspect the full contents of each changed, tracked Markdown file within the deterministic
  checker's configured file scope. Do not inspect unchanged files. Honor the repository's ignored
  paths.
- Look for noncanonical names, paraphrases, or descriptions that contradict the ontology, with
  the ontology as the canonical reference.
- Block merge on a semantic finding. Allow merge when review cannot run, while clearly reporting
  that the PR was not reviewed.
- Keep findings, author corrections, and maintainer dismissals visible on the PR.
- Run this as a reversible experiment that maintainers can disable.

## Out of scope

- Model-assisted review of fork PRs. [Side issue #21](https://github.com/jamiemitchellconsultants/InternalOntology/issues/21)
  investigates their separate manual path.
- Scanning source code or Markdown files untouched by the PR.
- Letting a PR author choose CI model settings or supply a model credential through the PR.
- Letting an agent without the author's identity commit directly to the author's branch.
- A numerical value target before the pilot has produced experience.

## Research

- [How the ontology discipline works](../../how-it-works.md) explains the deterministic check's
  limits and the current deliberate advisory policy. This proposal reverses that policy for
  semantic findings, so the decision and its false-positive escape path need explicit review.
- [The deterministic workflow](../../../.github/workflows/ontology-lint.yml) runs on PRs, and the
  [term checker](../../../scripts/check-ontology-terms.mjs) scans tracked Markdown except paths
  excluded by `ontology.config.json`. The [optional semantic workflow](../../../templates/github/workflows/ontology-drift-review.yml)
  currently reviews only added lines and only same-repository PRs.
- The optional workflow currently checks out PR code and runs its reviewer with a model credential.
  [GitHub's workflow security guidance](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target)
  warns against executing untrusted PR code with secrets. The design must keep the reviewer code
  trusted while treating the changed Markdown as input data.
- [GitHub's secrets guidance](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
  distinguishes repository variables from secrets and documents that ordinary Actions secrets are
  not passed to workflows triggered from forks.
