# Semantic repository index acceptance

Run each numbered walkthrough first. Record the operator, date, pinned source and configuration commits, and the result of each step in the [evidence table](#evidence). Review the paired executable checks, then record their run and results. Run destructive cases only in disposable checkouts or with designated fixture assets. Keep the original index bytes or checksum and a record of the selected release's assets for preservation checks.

Use the [runbook](05-runbook.md) to set up two checkouts. In the local build use the test fixture's loopback endpoint and simulated GitHub CLI. In the deployed run use the private synthetic acceptance adopter, its designated release, and the tested model details in the evidence. Shell examples run from the adopting checkout unless they name a Kit path. Use `--json` for machine-readable evidence. Measure elapsed times with a monotonic timer and count source versus query inputs at the endpoint.

## B1 · Locate committed source

1. Refresh the pinned checkout and run `node scripts/semantic-index.mjs search --query "$question" --limit 5 --json`. Expect a successful ranked response with at most five results and each result's full commit, repository-relative path, line interval, and score.
2. For each result run `git show "$commit:$path" | nl -ba` and inspect its reported interval. Expect every interval to exist at the named commit even when graph support is absent. On a second disposable commit or policy with no eligible passages, refresh and search. Expect success with `results: []`.

## B2 · Distinguish index states

1. In the second checkout before importing, run status and search. Expect `missing`, a recovery message, zero query requests, and no locations.
2. In a disposable checkout step through a changed commit or scope, a different model revision with the same dimensions, and a damaged active file. In each state run status and search before recovery. Expect `stale`, `incompatible`, and `unreadable` respectively, each with its own recovery and zero query requests. Rebuild or restore from a compatible download after the check.

## B3 · Measure retrieval

1. At a full pinned commit, review each question and its expected source locations before running queries. Run each at `--limit 5 --json`. Expect every returned location to resolve against that same commit.
2. Write a trial input with `commit`, the approved `scope` containing `include` and `exclude`, and `questions` containing `id`, `text`, `expected` locations, and `semantic` results. A location has `commit`, `path`, `startLine`, and `endLine`. Run `node scripts/measure-semantic-index.mjs "$trial_input" "$adopter"` from the Kit checkout. Expect counts and top-five rates for both semantic and keyword search. Enter an invalid line in a scratch copy and rerun. Expect a citation error. Record rates and question count without imposing a target.

## B4 · Download and search the exact snapshot

1. Complete the publisher steps in B7. In the second checkout of the exact release commit, confirm status is `missing`; record endpoint counts, then run `download --release <tag>` using the CLI. Expect `current`, the selected asset and byte count, and zero source and query requests during download.
2. Run the first query and record elapsed time since starting the download and the ending request counts. Expect one query embedding and zero source embeddings. Inspect the cited lines at the release commit.

## B5 · Refresh an explicitly chosen ancestor

1. Advance the second checkout with an unpushed commit adding an eligible file. Try the ancestor release with default download flags and expect a commit mismatch. Retry with `--allow-ancestor`. Expect success with `stale` and distinct source and index commits. Search should request refresh and send no query.
2. Refresh, then search. Expect the descendant commit, reused vectors for unchanged files, and embeddings for newly eligible passages. If the selected release has no suitable asset, expect a diagnostic that permits a local refresh.

## B6 · Reject a bad import and preserve the store

1. Record the checksum of the complete store in the reader. Attempt imports with an incompatible or unrelated commit, then simulate a damaged or interrupted asset transfer. Expect the operation to fail and the active checksum to remain identical.
2. Use disposable copies to exercise an unknown format, wrong repository, invalid citations, and wrong model or scope. Expect rejection before local promotion. Use the executable fixture for resealed invalid metadata and truncated transfer so valid shared assets remain intact.

## B7 · Publish a pushed commit

1. In the publisher checkout, verify the live default-branch policy and matching push and release tag or draft target. Refresh and run `node scripts/semantic-index.mjs upload --release "$release" --json`. Expect success naming the exact commit, versioned asset name, and bytes.
2. List the designated release assets through `gh` and verify the asset is uploaded. In the reader checkout follow B4. Expect the same repository, release, asset metadata, and commit.

## B8 · Preserve assets on failed upload

1. Record the release asset ID, name, byte count, and digest after B7. Repeat the upload and expect an asset collision. Advance locally, refresh, and try uploading the unpushed or mismatched commit. Expect a rejection and the same asset metadata after both attempts.
2. On the disposable release fixture, exercise absent publisher approval, absent write permission, an immutable published release, excessive asset size, and a failed upload. Expect explicit failure and no change to existing assets. Verify an eligible draft can accept the asset for its pushed commit.

## B9 · Use local commits and disclose pending edits

1. In the reader, commit an approved change without pushing. Further stage or edit approved text. Refresh and search. Expect the local commit in the response and a dirty notice for staged and unstaged changes. Inspect request evidence for the committed text and the absence of the pending edit. Check that status shows both revisions.
2. In a disposable unborn checkout with an available trusted configuration ref, run refresh and expect a clear request for a source commit.

## B10 · Update only changed passages

1. Record the initial refresh's elapsed time and source embeddings. Commit an edit, an addition, a rename, and a deletion together. Refresh using unchanged policy and record elapsed time and embeddings. Expect reuse for unchanged paths, current locations for edited and added content, and no results for the deleted and old renamed paths.
2. Refresh again with the same inputs. Expect zero source embeddings. Confirm the new commit and line ranges by searching and opening the results.

## B11 · Apply approved coverage changes

1. Commit and select a trusted policy that approves an additional path and excludes a previously indexed path. Expect `stale` before refresh even when the source commit is unchanged.
2. Refresh and search. Expect the added path to appear and the excluded path to disappear. `git check-ignore .ontology-index/index-v1.jsonl` should confirm the store stays ignored.

## B12 · Recover after an incomplete write

1. Save the active index checksum, advance the source commit, then interrupt refresh or make the approved endpoint reject the request. Expect failure, the previous checksum and index commit, and `stale` status. Repeat with an empty fixture store and expect `missing` afterward. Restore the endpoint and refresh normally.
2. Advance `HEAD` during a controlled refresh. Expect the resulting complete index to cite the commit initially captured and report `stale` against the now-current checkout.

## B13 · Require approved configuration

1. Run status, refresh, search, download, and upload under a disabled policy and under an incomplete enabled policy. Expect a configuration or disabled diagnostic before any model or release request.
2. Configure a second adopter with a different approved model or scope. Confirm the installed CLI files are byte-identical and each adopter uses its own policy.

## B14 · Use the chosen model for source and queries

1. With the approved loopback model, run a refresh and query and inspect endpoint evidence. Expect source and query requests to use the selected model and their respective configured prefixes. Repeat with the approved remote model endpoint.
2. Change the revision with dimensions held constant and try search or import. Expect an incompatible index or asset, and search should send no query. Cause an approved model failure and verify there is no request to a fallback.

## B15 · Send only eligible source

1. Prepare eligible source, an eligible test, and an eligible `Ontology` document next to an unapproved file, explicit exclusion, ignored untracked file, symlink, and binary. Refresh and then search.
2. Compare the model's source-request evidence and indexed paths with the approved files at the source commit. Expect the approved eligible files only, and a separate approved query request.

## B16 · Keep credentials separate

1. Supply test credentials out of Git. Refresh, search, upload, and download. Decompress the synthetic test asset and inspect the index and command output for those credential values or the endpoint URL. Expect credentials and endpoint outside the data. Induce a model error and verify diagnostic output omits the provider response body.
2. Attempt to import a payload that claims a different destination, repository, or scope. Expect rejection and no change to the approved policy or active index. Verify the release subprocess does not receive the embedding token.

## Executable checks

Use the [plain-language acceptance test review](05-acceptance-test-review.md) to review the new executable suite before running it. It gives the setup and pass criteria for each test in execution order.

Run the acceptance suite alongside the build's approved semantic-index checks. The acceptance suite uses installed commands in separate Git checkouts and crosses the HTTP and GitHub CLI process boundaries with fixtures in the local build. The deployed pilot runs the installed commands with the actual GitHub CLI and the approved model using the same observable checks.

```bash
node --test tests/semantic-index-*.test.mjs
```

| Behaviour | Paired checks |
| --- | --- |
| B1, B2 | Installed-command acceptance and `semantic-index-cli.test.mjs` |
| B3 | Installed-command acceptance and `semantic-index-pilot.test.mjs` |
| B4, B5, B6, B7, B8 | Installed-command acceptance and `semantic-index-release.test.mjs` |
| B9, B10, B11 | Installed-command acceptance and `semantic-index-cli.test.mjs`, `semantic-index-source.test.mjs` |
| B12 | Installed-command acceptance and `semantic-index-cli.test.mjs`, `semantic-index-store.test.mjs`, `semantic-index-embed.test.mjs` |
| B13, B14, B15, B16 | Installed-command acceptance and `semantic-index-install.test.mjs`, `semantic-index-config.test.mjs`, `semantic-index-source.test.mjs`, `semantic-index-embed.test.mjs` |

## Evidence

### 20 November 2026 · Codex

The local walkthrough used the Kit from `f4cc34982768d10681b5127059d6f2af8fc64eb5`, disposable Git checkouts, a loopback fixture model, and a simulated release. The deployed walkthrough used the same Kit, a private synthetic adopter on GitHub, draft tag `v0.0.1-index-pilot`, source and configuration commit `785d205e3ad8462b87fec83561c730fd35150856`, and Ollama 0.40.16 serving `nomic-embed-text:v1.5`, model ID `0a109f422b47`. GitHub authenticated the same account for both clones. The deployed walkthrough used a local model and live GitHub Releases.

| Behaviour | Local walkthrough evidence | Deployed walkthrough evidence |
| --- | --- | --- |
| B1 | The installed CLI searched a downloaded index and returned the pinned commit. | Every citation in eight queries resolved in the pinned commit. An index with no eligible passages returned a successful empty result. |
| B2 | Missing search stopped before the model was contacted. | Missing, stale, incompatible, and unreadable search stopped before sending a query. |
| B3 | The build suite exercises the keyword baseline and invalid citations. | Eight prewritten synthetic questions yielded 8/8 semantic and 5/8 keyword top-five hits. The JEPA-Speech results are recorded below. |
| B4 | Exact download made zero model requests. First search sent one query. The fixture asset was 659 bytes. | Exact download made zero model requests. First search sent one query. The compressed asset was 44,261 bytes and download to first search took 5,072 ms. |
| B5 | The build suite exercises exact rejection and explicit ancestor import. | Explicit ancestor import stayed stale until refresh, then reused unchanged vectors. |
| B6 | The build suite exercises corrupt and malformed assets and connection loss. | A wrong-commit import was rejected and the previous active bytes were preserved. Deliberately invalid asset variants remain fixture checks. |
| B7 | The simulated release accepted the asset and the second checkout installed it. | GitHub confirmed one uploaded asset for the pushed commit. The reader's installed bytes matched the publisher's active file. |
| B8 | Duplicate upload failed against the simulated release. | Duplicate and unpushed-commit uploads failed. The original draft still contained exactly one uploaded asset of 44,261 bytes. Publisher denial, immutable releases, oversize, and upload failure remain fixture checks. |
| B9 | The build suite exercises committed input and dirty local source. | An unpushed commit was searchable, and staged and unstaged edits produced the committed-content notice. |
| B10 | Cold refresh embedded six fixture passages. | Cold refresh embedded 14 passages in 1,646 ms and warm refresh embedded zero in 210 ms. An edit, addition, rename and deletion required three embeddings in 439 ms. The repeat required zero in 237 ms. The previous rename path and deleted path were absent. |
| B11 | The build suite exercises scope changes and ignored storage. | On a fixed source commit, changed coverage reported stale and refresh added only the newly approved content. |
| B12 | The build suite exercises previous-byte preservation and a moving `HEAD`. | A controlled model error preserved the previous bytes and left the old index stale until recovery. |
| B13 | Disabled refresh exited before model or GitHub operations. | All five commands rejected disabled or incomplete trusted policy at validation. The request monitor recorded zero model calls during the checks. |
| B14 | The fixture recorded the approved source and query modes. | Ollama received the approved source and query modes. Changing the model revision with unchanged dimensions stopped queries before calling the model. A remote provider trial is pending. |
| B15 | The build suite exercises approved paths, exclusions, symlinks, binary and dirty inputs. | The model received precisely 14 source passages from the 13 approved files. The excluded, unapproved, ignored, linked, and binary paths were absent from the index and the request trace. |
| B16 | The build suite exercises bounded model errors and credential-free committed config. | The active store from the asset contained no token, endpoint URL or source text. A provider error omitted its response body. |

### Local executable results · 20 November 2026

The maintainer approved the [plain-language test review](05-acceptance-test-review.md). Codex ran the installed-command suite in the local build. All five scenarios passed, and the runner reported six passing tests including the enclosing test. The 31 merged semantic-index build tests also passed on rerun.

| Scenario | Behaviour | Result |
| --- | --- | --- |
| Committed policy and source selection | B1, B2, B13–B15 | Pass. Disabled and missing cases stopped before the model was called. The first build embedded exactly six approved passages. |
| Exact release exchange and preservation | B1, B4, B6–B8, B16 | Pass. The reader reused the same asset with zero model requests during download and sent one query for the first search. A collision preserved the asset, and a damaged download preserved the local index. |
| Retrieval comparison and citations | B3 | Pass. The fixture yielded two semantic and one keyword top-five hit across two queries. The measurement rejected an invalid citation. |
| Ancestor reuse and local commits | B5, B8–B10 | Pass. Explicit ancestor import required refresh. An unpushed commit required three source embeddings on refresh and zero on repeat. Search reported uncommitted edits and cited the committed source. |
| Model, scope, store, and configuration recovery | B1, B2, B11–B14, B16 | Pass. Failed refresh preserved the previous index. Scope changes applied after refresh, invalid states stopped queries, and an empty eligible scope returned an empty result. |

### JEPA-Speech retrieval trial · 20 November 2026 · Codex

The representative adopter was JEPA-Speech at source commit `3021446c9cb0987139dff4f6466712bc21c617ac`. A disposable clone used the installed Kit commands and a separate trusted policy commit, `3b8208b389846059f7296c1d3c4c27749e17e0ba`. The trial covered study app source, tests, the ontology, and study documentation. Codex chose 12 questions and checked their expected locations at the pinned commit before running either retrieval method. Ollama 0.40.16 served `nomic-embed-text:v1.5`, model ID `0a109f422b47`, with 768 dimensions on localhost. The source and queries stayed on the machine.

| Measurement | Result |
| --- | --- |
| Indexed scope | 138 files, 485 passages |
| Semantic top-five hits | 8/12 (66.7%) |
| Built-in keyword top-five hits | 1/12 (8.3%) |
| Citations | All 60 semantic results resolved at the pinned source commit |
| Initial refresh | 485 source embeddings in 12.62 s |
| Repeat refresh | Zero source embeddings in 0.24 s |
| Search time | 421 ms median across the 12 CLI searches |
| Size | 2,073,242 bytes locally and 1,504,614 bytes after local gzip compression |

These figures describe the selected study-app slice and question set. The live release exchange above used the private synthetic adopter. JEPA-Speech's default branch needs committed semantic index publishing policy before the upload command can approve an asset there.

### Remaining deployed evidence

InternalOntology documents the existing `ontology-review` alias for chat completions. An unauthenticated request to its gateway's model catalogue returned HTTP 401. The maintainer supplied a LAN embeddings endpoint. Two synthetic inputs sent directly to it returned indexed, finite, nonzero 4,096-dimensional vectors from `qwen3-embedding-8b` with HTTP 200. A separate probe on the supplied port did not establish HTTPS.

The installed Kit requires HTTPS off localhost and permits HTTP for loopback addresses. Its configuration validator rejected the supplied LAN HTTP URL before any model call. The LAN probe used only synthetic text. An installed-command trial needs a transport supported by the Kit, and the live release exchange still needs a distinct reader account.
