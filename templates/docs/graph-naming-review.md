# Graph naming review

The graph naming review is an opt-in, model-assisted check of the names in the source knowledge graph. On each pull request it compares the names of graph nodes that were added or changed, and of nodes whose ontology item the pull request renames or removes, with the proposed ontology. A node's label is compared with the ontology item it denotes and with the concept it implements; a concept, component, system or symbol node with no link is checked for synonyms of ontology terms. File, test and document paths are not compared.

Before any model call, the review drops every name that already contains its canonical term as whole words in order, so a symbol named after the concept plus a role, such as SessionRemovalService for SessionRemoval, is never reported. The model sees only the remaining names, as data, with the ontology catalog.

A result takes effect only when a person with write access accepts it. The source-graph check, the Markdown renderer and their workflows are unchanged: they make no model call, need no secret, and a pass still means only that the graph is structurally valid.

## Install

Install with `--with-source-graph --with-graph-naming-review`. The flag needs the source graph and fails before writing anything without it. It installs `scripts/graph-naming-*.mjs` with their tests, `.github/workflows/ontology-graph-naming-request.yml`, `-review.yml` and `-settle.yml`, and this runbook. If the semantic reviewer is not installed, it also installs the shared `scripts/llm-auth.mjs`, `scripts/request-budget.mjs`, `scripts/semantic-review-github.mjs` and `scripts/semantic-review-model.mjs` with their tests. Re-run the installer with `--force` to upgrade kit-owned files.

## Enable it

Add a `namingReview` object inside `sourceGraph` in `ontology.config.json` and merge it to the default branch:

```json
"namingReview": { "enabled": true, "model": "your-model", "baseUrl": "https://model.example/v1" }
```

`ontology.config.json` is an input of the generated source graph Markdown, so this change makes the Markdown stale. Commit the setting first, then run `node scripts/render-source-graph.mjs`, stage the regenerated Markdown, check it with `node scripts/render-source-graph.mjs --check --staged` and commit it in the same pull request. Otherwise the `source-graph-markdown` check fails.

The review reads this setting, the model, the endpoint and the ontology sections only from the default branch, never from the pull request. Without the setting, or with `enabled` false, every pull request gets a successful "disabled" status and nothing else is posted.

The review job runs in the `ontology-semantic-review` environment, which should be restricted to the default branch. It uses the same secrets and variables as the semantic reviewer: either the `ONTOLOGY_SEMANTIC_LLM_API_KEY` secret, or the `KEYCLOAK_CLIENT_SECRET` secret with the `ONTOLOGY_OIDC_TOKEN_URL` and `ONTOLOGY_OIDC_CLIENT_ID` variables, plus the optional `ONTOLOGY_MAX_REQUEST_CHARS` and `ONTOLOGY_MODEL_TIMEOUT_MS` variables. A repository that already runs the semantic review needs no new secret. Otherwise create the environment, restrict its deployment branches to the default branch, and add the secret or the OIDC settings there.

## Require the status

Once the three workflows are on the default branch, add `ontology/graph-naming` as a required status check. Every pull request gets a result: a pull request from a fork gets an out-of-scope success, and one that changes no graph Turtle or ontology file gets a success saying there were no eligible changes.

## Read the summary

The review keeps one summary comment on the pull request and edits it in place. It labels each result R1, R2 and so on, and shows the node, the compared names, the ontology item, the reason, the suggested correction and ready-to-copy settle commands. It also lists the nodes that were not reviewed and why, the commands that were ignored and why, and the number of open deferral issues with a link to them. When a run finds results that were not on the pull request before, the review also posts a short new comment linking to the summary, so subscribers are notified.

The `ontology/graph-naming` status fails while any result is unsettled or accepted but not yet corrected, and its description gives the counts. Labels are never reused on a pull request: R2 means the same result on every revision.

## Settle results

Settle results with a pull request comment whose first line is a command:

- `/graph-naming accept R1` accepts a result. It keeps holding the merge until a later revision no longer reports it, so the correction must be committed.
- `/graph-naming reject R2 <reason>` rejects a result. The reason is required, and a rejection without one is ignored.
- `/graph-naming defer R1,R3 <optional note>` defers results to one new issue.
- `/graph-naming accept all`, `/graph-naming reject all <reason>` and `/graph-naming defer all <optional note>` settle every result that is unsettled when the command is first seen. Results that appear later are not covered.

Commands are case-insensitive and need no copied hash or commit ID. Anyone with the write, maintain or admin role may settle any result, including on their own pull request; commands from others are ignored and listed in the summary. When several commands name the same result, the latest one wins. Editing or deleting a command comment changes the outcome on the next recompute. A settlement belongs to its pull request and survives pushes while the result stays the same; a result whose compared names change is a new result. Agents never settle results, under any identity.

## Deferral issues

Each defer command creates one issue, titled with the pull request number and the deferred labels and labelled `graph-naming-deferred`. The issue records the pull request, the head commit, the reviewer and the note, and for each result its node, compared names, ontology item, reason, suggested correction, and links to the node's Turtle and its evidence at that commit. Processing the command again never creates a second issue. Deferral issues are never deleted; when a later command accepts or rejects a deferred result, the issue gets a comment saying so and stays open for you to close.

## Outcomes

| Outcome | Meaning |
| --- | --- |
| `reviewed` | Every selected name was compared. |
| `partial` | Some names were compared and the rest are listed as not reviewed. |
| `unavailable` | The review could not run, for example because the model, its credential or the pull request input was unavailable. |
| `too-large` | The ontology catalog does not fit the configured request budget; raise `ONTOLOGY_MAX_REQUEST_CHARS`. |
| `disabled` | The repository has not enabled `sourceGraph.namingReview` on the default branch. |
| `out-of-scope` | The pull request comes from a fork or from an author without write access. |
| `no-eligible` | The pull request changes no graph Turtle or ontology file, or no node needed comparing. |

Every outcome permits merge. Only unsettled results and accepted results that have not been corrected hold it.

## What it does not do

It never writes anything into the graph or its generated Markdown; only a correction you commit changes them. It does not check whether evidence supports a claim. Settlements do not carry over to later pull requests, and it does not sweep the whole graph, only what a pull request changes.
