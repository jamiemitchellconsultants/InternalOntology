# Installing the semantic drift reviewer

Optional, and off by default. Install it only when the repository has an OpenAI-compatible model
endpoint it can reach from CI, and someone who will read the comments it posts.

## What it adds over the deterministic check

The deterministic check reads backticked terms. It cannot see "the invoice moves from approved to
sent" when the ontology says `Approved` → `SentToVendor`, because none of that is backticked. The
reviewer reads added prose against a projection of the ontology and flags exactly that class of
drift.

## Install

```bash
node <kit>/bin/install-ontology.mjs --target <repo> --with-drift-review
```

This adds the reviewer, its tests, its workflow and `docs/ontology-drift-review.md`.

## Configure

Three settings on the repository, described in the installed runbook: `ONTOLOGY_LLM_BASE_URL` and
`ONTOLOGY_MODEL` as variables, `ONTOLOGY_LLM_API_KEY` as a secret. The workflow fails visibly if a
variable is unset, rather than running and silently reviewing nothing.

## Two properties worth preserving

- **A finding never fails the build.** If someone asks to make it blocking, push back: a model that
  can be wrong must not hold a merge, and the moment it does, people learn to work around it.
- **The two jobs stay separate.** The preparation job invokes no model and is blocking; the review
  job may be red only for infrastructure reasons. Merging them means an endpoint outage looks like
  a clean review, or a review failure looks like an outage.

## Verify before you call it done

```bash
BASE_REF=origin/main DRY_RUN=1 node scripts/review-ontology-drift.mjs docs/some-changed-file.md
```

That prints the batching plan without calling the model. If the projection throws, the ontology's
sections do not match `sections` in `ontology.config.json` — fix that before wiring CI.
