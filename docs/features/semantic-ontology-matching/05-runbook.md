# Semantic ontology matching — runbook

This runbook is for repository maintainers operating the optional semantic review. The acceptance
deployment is the private disposable repository
[`jamiemitchellconsultants/ontology-semantic-trial-20261030`](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030).
Its [trial PR #1](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/pull/1)
already verifies the workflow and unavailable-model path. Use a separate trial PR for each scenario
that must keep its previous comments or status as evidence.

## Deploy

1. From this kit's checkout, install into the adopting repository with
   `node bin/install-ontology.mjs --target <checkout> --with-semantic-review`. Commit the installed
   files and merge them to the default branch. For a later kit update use `--force` only after
   reviewing the file-copy diff; `ontology.config.json` and `docs/ontology.md` remain adopter-owned.
2. On the adopter's default branch, set `semanticReview` in `ontology.config.json`:

   ```json
   { "enabled": true, "model": "<model-id>", "baseUrl": "https://<maintainer-endpoint>/v1" }
   ```

   The endpoint must serve OpenAI-compatible `POST /chat/completions`. The PR author's proposed
   config cannot select the endpoint or model for its own review. Commit this setting through normal
   review. Keep credentials out of the config and PR discussion.
3. Create a GitHub Actions environment named `ontology-semantic-review`, restricted to the default
   branch. Store `ONTOLOGY_SEMANTIC_LLM_API_KEY` as an **environment secret** there. The trusted
   worker uses `deployment: false`; confirm the repository plan supports the protected environment.
4. Open a trial PR and verify that its secretless request and trusted review workflows complete.
   Then require the exact `ontology/semantic-match` status from GitHub Actions in branch protection
   or a ruleset. Do not path-filter the request workflow: code-only PRs need a no-eligible result.
5. If the older advisory workflow was installed, disable it if duplicate review comments are
   unwanted. The deterministic ontology term check stays enabled and independent.

For a local build, install into a scratch git repository and run
`node --test scripts/semantic-review-*.test.mjs` from that repository. The suite in this kit runs
with `npm test`; the feature acceptance tests are in `tests/semantic-feature-acceptance.test.mjs`.

## Operate

For a PR, use `gh pr checks <number> -R <owner>/<repo>` to see the request workflow and the fixed
status. Inspect its latest *Semantic ontology review* comment for the head SHA, outcome, reviewed
and unreviewed paths, finding IDs, exact passages, ontology evidence and suggestions. The latest
run on the current revision controls the status. The publisher writes both the current head and a
verified test-merge SHA when GitHub supplies one. A failed status means an active finding blocks;
a successful *partial*, *unavailable*, *disabled*, *out of scope* or *no eligible files* status has
the meaning shown in its comment. Never call an incomplete review clean.

The author's agent may commit a correction to the author's branch and wait for the new run. An
agent with another identity posts a proposed correction to the author on the PR. It does not edit
the author's branch. A maintainer with owner, admin or maintain role can dismiss exactly one
current finding by posting a PR comment in this form:

```text
/ontology-dismiss <64-hex-finding-id> <40-hex-head-sha> <reason>
```

Use the ID and SHA in the latest run comment. Give a substantive reason. Other findings still
block. The comment is the visible dismissal record; editing or deleting it recalculates status.
The dismissal survives a rerun on the same SHA and expires when the PR head changes. A write-role
author cannot dismiss. Ordinary comments proposing corrections are not dismissal commands.

To inspect the underlying status and its description, run
`gh api repos/<owner>/<repo>/commits/<head-sha>/status --jq '{state, statuses: [.statuses[] | {context,state,description,target_url}]}'`.
Inspect the test-merge SHA in the PR API before checking its status. The Actions run log should
identify an API or model failure without printing the credential or file contents. For a fork PR,
follow [issue #21](https://github.com/jamiemitchellconsultants/InternalOntology/issues/21):
automatic model review is out of scope and the request workflow may need approval before any
required status appears.

## Recover

- **Model or configuration unavailable:** Read the latest run comment and status description.
  An unavailable run is successful and explicitly says review did not run; an earlier finding
  stays visible but does not control the latest status. Fix the endpoint, model or environment
  secret on the default branch and trigger a new run by updating the PR. Never replace the
  unavailable result with a claimed clean assessment.
- **False finding:** Use the exact dismissal command above, with a reason, or correct the PR and
  let the next revision be assessed. Do not add an allowlist entry merely to quiet the model.
- **Workflow or environment failure leaves the required context pending:** Inspect the request,
  identification, review and finalizer jobs. Restore the default-branch workflow or environment
  first. If the check cannot be restored promptly, a maintainer may temporarily remove the fixed
  status requirement in repository settings, recording why in the change review. Restore it only
  after a trial PR receives the context again.
- **Rollback the pilot:** Set `semanticReview.enabled` to `false` on the default branch. The
  workflow still posts an explicit successful *disabled* status, and the deterministic term check
  continues. Remove the fixed status requirement only if the workflow itself is unavailable.
  Do not delete historical run or dismissal comments; they explain prior merge decisions.
