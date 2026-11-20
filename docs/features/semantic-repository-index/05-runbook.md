# Semantic repository index runbook

## Deploy

The local acceptance environment is two disposable checkouts built from the merged Kit, with a loopback OpenAI-compatible test endpoint and a simulated GitHub CLI. The deployed acceptance environment is an owner-approved GitHub adopting repository, its designated release or draft, and two independent checkouts with access to the approved model endpoints. Record the adopting repository, release, pinned commit, and model revisions in the [acceptance record](05-acceptance.md).

1. Use Git and Node 20 or newer. For release exchange, install `gh`, authenticate to the adopting repository's GitHub host, and confirm the publisher's write access. Use a separate checkout and, where available, a separate download-only account to exercise a developer's access.
2. Install the approved Kit revision using `node bin/install-ontology.mjs --target "$adopter" --with-semantic-index`. Add `--force` for an upgrade. Review the installed scripts, the setup reference, and the `/.ontology-index/` ignore rule. Keep that rule in the repository so future checkouts inherit it.
3. Configure `semanticIndex` in `ontology.config.json` using the [setup reference](../../../templates/docs/semantic-index.md). Commit the approved scope and exclusions, model endpoint, model ID, revision, dimensions, and any document and query prefixes on the trusted branch. Keep the bearer token in `ONTOLOGY_INDEX_EMBEDDING_TOKEN` and GitHub authentication in `gh`. Use HTTPS for a remote model or loopback HTTP for a local model.
4. Enable release exchange by configuring the adopting repository's `release.repository`. Set `release.publishers` on its default branch to allow authorised uploads. For an immutable release, use the corresponding draft before publication. Start with a pushed commit and a release tag or draft target that resolves to that exact commit.
5. Fetch the approved configuration. Set `ONTOLOGY_INDEX_CONFIG_REF` to a trusted full ref or full commit ID if `refs/remotes/origin/HEAD` is unavailable or if the trial requires a specific approved configuration revision. Run status, refresh, and a known query in the adopting checkout. Confirm the configuration commit, index commit, source commit, and cited lines.

```bash
node scripts/semantic-index.mjs status --json
node scripts/semantic-index.mjs refresh --json
node scripts/semantic-index.mjs search --query 'your known pilot question' --limit 5 --json
```

## Operate

Check status before searching or publishing. `current` means the checkout commit, source scope, and embedding space agree with the local index. The status command uses local Git and the local store. `refresh` can contact the model for changed passages, and `search` contacts it to embed the query. Watch `metrics.sourceEmbeddings` and `metrics.elapsedMs` on refresh, and record status and search timings separately.

For a shared index, upload from the exact pushed commit, then use the same release in another checkout of that commit. Use `--json` to capture the asset name, compressed bytes, and commit. A successful exact download leaves the index current and uses zero source embeddings. Confirm that by observing model request counts before download, after download, and after the first search. Repeat with an explicitly chosen ancestor only when the descendant checkout has the required Git history. Run refresh before searching the descendant.

```bash
node scripts/semantic-index.mjs upload --release "$release" --json
node scripts/semantic-index.mjs download --release "$release" --json
node scripts/semantic-index.mjs download --release "$older_release" --allow-ancestor --json
node scripts/semantic-index.mjs refresh --json
```

Advance the configured model revision when model weights or embedding behaviour change behind the same endpoint. Fetch and inspect the updated trusted configuration in each checkout. A scope change requires refresh. An embedding space change requires a compatible snapshot or a rebuild. Keep release assets under the repository's access rules, and record metadata and request counts without recording credentials or request bodies in shared evidence.

## Recover

| Symptom | Recovery |
| --- | --- |
| `missing` | Download an exact compatible snapshot or run `refresh`. |
| `stale` | Check `sourceCommit`, `indexCommit`, and `configurationCommit`. Fetch the approved configuration if needed, then refresh the intended checkout. |
| `incompatible` | Verify the approved model ID, revision, dimensions, and prefixes. Download an asset for that embedding space or run `refresh`. |
| `unreadable` | Download a fresh compatible snapshot or rebuild. If status still fails, inspect directory ownership, the ignore rule, and whether any storage paths are tracked or symlinks. |
| `config`, `disabled`, or `unborn` | Read the approved committed configuration, enable and complete its settings if needed, or make an initial source commit. |
| Model or transfer failure | Check the approved endpoint or the selected release and access. Retry after service recovery. Check status and the recorded revision of the preserved index before use. |
| Writer lock remains after interruption | Inspect the PID and hostname in `.ontology-index/writer.lock`. Wait for any live writer. Remove the lock only after confirming its writer has stopped, then rerun refresh or download. |
| Upload rejected | Verify the authenticated account, live publisher policy, matching pushed commit, and release mutability. If the asset already exists, verify and reuse it. For a published immutable release, choose an eligible draft. |

To roll back a scope or model rollout, revert the configuration on the trusted branch and fetch it in the adopting checkout. Restore search by downloading a compatible snapshot for the intended commit or refreshing from that commit. To pause indexing, disable `semanticIndex` in the trusted configuration. Rollback takes effect as each checkout uses the replacement policy. Previously uploaded assets retain the release's access rules and can remain available to developers using their matching configuration.
