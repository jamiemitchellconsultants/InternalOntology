# Ontology drift review — setup and operation

The deterministic check in `scripts/check-ontology-terms.mjs` catches exact-name misuse: a
backticked term that is not in `{{ONTOLOGY_PATH}}`. It cannot catch prose that paraphrases a
concept without backticks — "the invoice moves from approved to sent" when the ontology says
"Approved" then "SentToVendor". This advisory reviewer is the second half.

> Note for the implementer: the examples in this runbook are deliberately quoted rather than
> backticked. This file is installed into the target repository and then linted by the very check
> it describes, so a backticked PascalCase example term would fail that repository's build. The
> acceptance test in Task 18 locks this in.

## What it does

For each pull request touching Markdown:

1. Builds a compact projection of `{{ONTOLOGY_PATH}}` — its canonical tables and invariant bullets,
   with orientation prose stripped out.
2. Extracts only the *added* lines from the diff, attributed by file and new-file line number.
3. Batches them under a complete-request character budget, splitting recursively if the endpoint
   rejects a request as too large.
4. Asks the model for paraphrase drift, and posts or updates a single pull request comment.

## What it deliberately does not do

- It never edits files.
- A finding never fails the build. Human review is the gate.
- It never sends the GitHub token to the model endpoint.

Only an infrastructure or configuration failure turns the `semantic-review` job red. That is on
purpose: "the reviewer could not run" must look different from "the reviewer ran and found
nothing."

## Configuration

| Setting | Where | Example |
|---|---|---|
| `ONTOLOGY_LLM_BASE_URL` | repository variable | `https://gateway.tqaentry.com/v1` |
| `ONTOLOGY_MODEL` | repository variable | `ontology-review` |

Any OpenAI-compatible chat-completions endpoint works. The endpoint must be reachable from a
GitHub hosted runner; otherwise run the job on a self-hosted runner.

### Authentication

`scripts/llm-auth.mjs` supplies the bearer for every model request. Set one of two modes.

**OIDC client credentials (preferred; short-lived tokens).**

| Setting | Where | Example |
|---|---|---|
| `ONTOLOGY_OIDC_TOKEN_URL` | repository variable | `https://auth.tqaentry.com/realms/homelab/protocol/openid-connect/token` |
| `ONTOLOGY_OIDC_CLIENT_ID` | repository variable | `litellm-ci` |
| `KEYCLOAK_CLIENT_SECRET` | repository secret | the client's secret |

The workflow maps the `KEYCLOAK_CLIENT_SECRET` secret into the `ONTOLOGY_OIDC_CLIENT_SECRET`
environment variable the script reads, so a repository that already holds that secret sets nothing
new. All three values must be present; a partial set fails with an error naming the missing
variable names (never their values) and does not fall back to a static key. The script requests a
token with the client-credentials grant (the secret goes in an HTTP Basic header), caches it until
about 60 seconds before it expires (gateway tokens last 300 seconds), fetches a new one after that,
and fetches once more and repeats the request if the model endpoint answers 401. The secret, the
token and the token endpoint's response body are never logged or placed in an error.

**Static key (legacy; still works).** Leave the OIDC settings unset and add
`ONTOLOGY_LLM_API_KEY` as a repository secret holding the endpoint's bearer token. If both modes
are configured, OIDC wins.

The workflow's configuration check passes when either mode is complete and fails, naming what is
missing, when neither is.

## Running it locally

```bash
BASE_REF=origin/main DRY_RUN=1 node scripts/review-ontology-drift.mjs docs/spec.md
```

`DRY_RUN` prints the batching plan and the approximate request size without calling the model or
GitHub. Drop it, and supply `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, `PR_NUMBER` and
`ONTOLOGY_LLM_BASE_URL`, plus either `ONTOLOGY_LLM_API_KEY` or the three `ONTOLOGY_OIDC_*` values,
to do a real run.

## Tuning

`MAX_REQUEST_CHARS` in `scripts/review-ontology-drift.mjs` is a planning heuristic, not a hard
limit — an oversized request is handled authoritatively by recursive splitting. Raising it raises
the cost of recovering from a single timeout, so change it with measurements rather than as a side
effect of changing models.

`max_tokens` in `reviewBatch` covers any reasoning tokens as well as the visible answer, so it is
the binding constraint on a reasoning model. Raise it and `modelJson`'s timeout together, or
neither.

The script sends no sampling parameters. Configure temperature and related values where the model
is served; a value sent from CI silently overrides them.
