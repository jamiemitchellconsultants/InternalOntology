# Semantic ontology review pilot

The blocking semantic reviewer is a separate opt-in from the deterministic term check and the
older advisory drift reviewer. It reviews the **entire current contents** of each changed,
eligible Markdown file against the proposed ontology on a same-repository PR whose author has
current write access. It does not execute PR code or apply corrections.

## Install and activate

1. Install from the kit with `--with-semantic-review`, commit the copied files, and merge them to
   the default branch. Use `--force --with-semantic-review` to upgrade the kit-owned files later;
   `ontology.config.json` and the ontology remain adopter-owned.
2. In repository settings, create an Actions environment named `ontology-semantic-review`.
   Restrict its deployment branches to the repository's default branch. Add an environment secret
   named `ONTOLOGY_SEMANTIC_LLM_API_KEY`. The trusted review job names this environment with
   `deployment: false`; the request, identification, finalizer, and dismissal jobs have no model
   secret. Check that your GitHub plan supports protected environment secrets before activating.
3. On the **default branch**, set `semanticReview` in `ontology.config.json` to:

   ```json
   {
     "enabled": true,
     "model": "your-model-id",
     "baseUrl": "https://your-maintainer-controlled-endpoint/v1"
   }
   ```

   The endpoint must provide OpenAI-compatible `POST /chat/completions`. Keep credentials out of
   this file. A PR's proposed config never controls the model, endpoint, or secret used to review
   that PR.
4. Require the commit status context `ontology/semantic-match` in branch protection or a
   repository ruleset after the workflows have reached the default branch. Inspect a trial PR
   first; the context is posted on its current head and, when verified, its test-merge commit.
   The request workflow has no path filter, so code-only PRs receive a *no eligible files* result.

To disable the pilot, set `semanticReview.enabled` to `false` on the default branch. The workflow
still posts a successful *disabled; not reviewed* result. Invalid settings, a missing credential,
or an unavailable model post a successful *not reviewed* result with the reason. An active finding
blocks merge even if another file could not be assessed. A later unavailable run on the same
revision supersedes an earlier failure; the earlier comment remains visible as history.

## Respond to a finding

The PR comment names the file, exact passage, ontology evidence, suggested correction, finding
ID, and head SHA. An agent acting under the PR author's identity may commit a correction to the
author's branch; the next revision receives a new run. An agent with another identity should post
a proposed correction to the author on the PR without modifying the branch.

For a false positive, a maintainer with owner, admin, or maintain role posts a comment consisting
of exactly:

```text
/ontology-dismiss <64-hex-finding-id> <40-hex-head-sha> <reason>
```

Use the ID and SHA from the current run comment, and give a substantive reason. One command
dismisses one finding for that revision; other findings still block. The reason and author stay
visible in the comment. Editing or deleting the command recomputes the status. The dismissal
survives a rerun on the same SHA and expires when a new revision is pushed. A write-role author
cannot dismiss a finding unless they also hold a maintainer role.

## Fork PRs and migration

Fork PRs are outside this pilot and receive an *out of scope; not reviewed* result if their
request workflow runs. GitHub may require a maintainer to approve that workflow before it runs;
the required context can stay pending until approval. Follow the manual investigation path in
[issue #21](https://github.com/jamiemitchellconsultants/InternalOntology/issues/21). Do not
grant the model secret to a fork workflow to clear a pending check.

If `--with-drift-review` was previously installed, it stays advisory and separate. Disable its
old workflow when moving to this pilot if duplicate review comments are unwanted. The semantic
reviewer has its own workflows and status context; it does not replace the deterministic linter.
