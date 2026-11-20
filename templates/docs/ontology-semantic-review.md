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
   Restrict its deployment branches to the repository's default branch. Add the model credential as an
   environment secret, in one of two modes. OIDC (preferred): the environment secret
   `KEYCLOAK_CLIENT_SECRET` (the workflow maps it to `ONTOLOGY_OIDC_CLIENT_SECRET`), plus repository
   variables `ONTOLOGY_OIDC_TOKEN_URL` (for example
   `https://auth.tqaentry.com/realms/homelab/protocol/openid-connect/token`) and
   `ONTOLOGY_OIDC_CLIENT_ID` (for example `litellm-ci`). The script fetches a short-lived token with
   the client-credentials grant, refreshes it shortly before expiry, and retries once after a 401;
   a partial OIDC set is reported as a misconfigured credential. Static key (legacy): the
   environment secret `ONTOLOGY_SEMANTIC_LLM_API_KEY`. OIDC wins when both are present. The trusted review job names this environment with
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

   For a gateway that exposes the alias `ontology-review`, use `"model": "ontology-review"` and
   `"baseUrl": "https://gateway.tqaentry.com/v1"`. The endpoint must provide OpenAI-compatible `POST /chat/completions`. Keep credentials out of
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

## Request budget

Each model request holds the instructions, the ontology projection and a piece of the changed file.
Requests are planned against a character budget: **200,000 characters by default**, a default sized for
a model with a large context window and not a statement about any particular model. Two optional
repository variables change it without editing a script; the drift reviewer reads the same ones.

Set `ONTOLOGY_MAX_REQUEST_CHARS` from the context window of whatever model your alias currently points
at. Text is about 3 to 4 characters per token, so a request of N characters is roughly N/4 to N/3
tokens; keep it well inside the window and leave headroom for the answer, since a model that spends
tokens thinking before it answers needs room for those tokens too. Set `ONTOLOGY_MODEL_TIMEOUT_MS` from
how quickly that model answers a prompt of that size, and revisit both when the alias is repointed.

| Setting | Where | Default | Meaning |
|---|---|---|---|
| `ONTOLOGY_MAX_REQUEST_CHARS` | repository variable | 200000 | complete-request character budget |
| `ONTOLOGY_MODEL_TIMEOUT_MS` | repository variable | 300000 | how long one model request may take |

Both must be positive integers (digits only). An unset or empty variable uses the default. Anything
else makes the review job fail with an error naming the variable and the value, and the pull request
gets a successful *not reviewed* record that says the configuration is invalid and why; fix the
variable and push again.

If the ontology projection leaves no room for any Markdown at the configured budget, no model call is
made and the result is **too large**. The status reads
"Semantic match not reviewed: ontology too large for the configured budget (raise ONTOLOGY_MAX_REQUEST_CHARS)",
the pull request comment lists
each file with its reason, and the result permits merge, like every other case in which review did not
run. It does not fail the status: raise `ONTOLOGY_MAX_REQUEST_CHARS` to a size your model accepts. If
the model keeps rejecting even the smallest request as too long, the same result is reported. A model
that rejects a larger request as too long still makes the reviewer split the file and retry.

Larger prompts take longer to answer. The request timeout default is now 300,000 ms (it was 30,000 ms);
that figure has not been measured with prompts near the budget against any gateway, so raise
`ONTOLOGY_MODEL_TIMEOUT_MS` if requests time out. A hung model call can hold a request for that long, and
chunks are reviewed one after another. The semantic request sets no output cap of its own.

## Ontology projection

Each request carries an `OntologyProjection` for the piece of the file the model reviews. Set its `ProjectionMode` with `semanticReview.projection` in the default branch's `ontology.config.json`.

| Value | What each request carries |
|---|---|
| `"matched"` (the default) | the full rows of the ontology entries selected by that piece of the file, their relationships, and the name index grouped by section |
| `"full"` | the whole ontology projection, exactly as before this setting existed |

To send the whole ontology again, set the projection to `"full"`.

```json
"semanticReview": { "enabled": true, "model": "...", "baseUrl": "...", "projection": "full" }
```

Any other value, including `null`, makes the review job fail with an error naming `semanticReview.projection` and the value.

### Which ontology is read

The semantic reviewer reads `ontology.ttl` at the pull request's revision and renders it exactly as `node scripts/build-ontology.mjs` writes `ontology.md`. It falls back to `ontology.md` when `ontology.ttl` is absent at that revision. A read or parse error on an existing source makes the run unavailable. The drift reviewer and graph naming still read `ontology.md`.

### How entries are matched

Matching is deterministic. The same Markdown and ontology select the same entries. The Markdown selects an entry when it contains any of the following.

- The entry's exact name as a whole word with the same case.
- A banned-alias phrase whose suggested name is the entry, as whole words in any case.
- One of the entry's name words, alone or with "s" or "es" added. Name words come from splitting the name at case changes and keeping words of four letters or more. PascalCase words in the Markdown are split the same way, so "RemovalStatus" contains "removal".
- For an enum, one of the words of its values.

The fixed stop list filters these words out of name and enum value matching. It contains data, info, item, kind, list, name, type, value, values, state, status, record, result, config, event, events.

The reviewer adds every relationship whose From or To is a selected entry, including every Relationships row that shares that From. An entry at the other end needs its own match to be selected. Names in an entry's description add nothing to the selection.

### Name index

In `"matched"` mode, the name index groups every entry by section in ontology order.

```text
## Evidence keys

Each key is a section name, a colon, and one name listed under it, for example Entities:AuditEvent.

Entities: AuditEvent, StudySession, SessionRemoval
Enums: RemovalReason, SessionRemovalState
```

The reviewer checks cited keys against the whole ontology in either mode. In `"full"` mode the index lists one key per line.

### Planning by paragraph

In `"matched"` mode, the reviewer packs paragraphs into a request while the combined text and the projection it selects still fit the budget. It divides a paragraph that is too large for a request into lines and cuts a line that is too long into pieces. A file whose paragraphs each fit is reviewed however much of the ontology the whole file mentions. In `"full"` mode the reviewer divides files as before.

### What the record shows

The pull request comment gains one line per reviewed file, after the "Eligible" line:

```text
- Ontology projection for `docs/a.md`: matched, 12 of 130 entries with full rows; largest 8410 characters (full projection 31977).
```

It names the mode, how many entries were sent with full rows across the file's requests, the total number of entries, the largest projection sent for that file, and the size of the whole projection. Status descriptions do not change.

### Limits

Matched mode reports two too-large reasons. Both name ONTOLOGY_MAX_REQUEST_CHARS and use the existing status descriptions.

- "ontology name index too large for the configured budget (name index N characters, budget M; raise ONTOLOGY_MAX_REQUEST_CHARS)" means the name index leaves no room for file text and every file is too-large.
- "line at offset O selects too much of the ontology for the configured budget (projection N characters, budget M; raise ONTOLOGY_MAX_REQUEST_CHARS)" means the projection for that line leaves no room for its text.

A matched review can miss a paraphrase that shares no name word with its entry, including one it previously caught because a neighbouring entry's rows were sent. Set `"full"` if catching such paraphrases matters more than request size.

The median matched request was 42% of the full projection for JEPA-Speech and 60% for InternalOntology when this mode was amended. The grouped name index costs about 17 to 20 characters per entry and fills the default budget at about 10,000 to 11,000 entries.

Older reviewer scripts reject `projection` as an unknown key, so update the kit first, then set `"full"`.

## Reading "not reviewed" reasons

When a file could not be assessed, the pull request comment lists it as "Not reviewed" with a fixed
reason. The reasons never contain model output. Besides the budget reasons above:

| Reason | Meaning |
|---|---|
| model reply was empty | the model returned nothing usable |
| model reply was not valid JSON | the reply was not JSON, even after removing one surrounding code fence |
| model reply had no findings list | valid JSON without a `findings` array |
| model finding was incomplete | a finding lacked a quote, key, reason or suggestion |
| finding quote not found in the file | the quoted passage is not an exact substring of the file |
| finding cites an unknown evidence key | the item name is not in the ontology evidence |
| finding cites an ambiguous evidence key | the name exists in several sections and the prefix does not pick one |
| model timed out, model returned HTTP n | transport problems; see the timeout setting above |
| model credential could not be obtained | the OIDC or static credential failed |

The model's reply may be wrapped in one markdown code fence. An evidence key is accepted when it names a real
ontology item: a wrong or singular section prefix is resolved to the unique matching item, and the
finding is shown with the real key. The prompt lists every valid key.

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
