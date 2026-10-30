# Semantic Ontology Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install an optional semantic check that reviews all changed eligible Markdown in a trusted workflow, blocks on active findings, and reports unavailable review without blocking.

**Architecture:** A secretless PR workflow triggers a default-branch `workflow_run` worker. The worker reads trusted `OntologyConfig`, fetches PR files as data, assesses bounded full-file chunks, and publishes a required commit status plus durable PR comments. A separate trusted comment handler processes maintainer dismissals. Existing advisory review remains separate.

**Tech Stack:** Node.js >=18, built-in `fetch` and `node:test`, GitHub Actions and REST API, OpenAI-compatible chat completions; no npm dependencies.

**Spec:** [Vision](../../../features/semantic-ontology-matching/01-vision.md), [behaviours](../../../features/semantic-ontology-matching/02-behaviours.md), [architecture](../../../features/semantic-ontology-matching/03-architecture.md), and [ADRs 0001–0004](../../../adr/0001-trusted-semantic-review-workflow.md).

## Global Constraints

- Kit-owned scripts and workflows install byte-identically; all repository-specific settings live in `ontology.config.json`, with the model credential in a default-branch-only Actions environment secret named `ONTOLOGY_SEMANTIC_LLM_API_KEY`.
- The trusted worker executes default-branch code only. PR files, PR metadata, comments, and model output are untrusted data; no PR code or artifact is executed with credentials.
- Select changed, tracked Markdown in the deterministic checker's configured scope, excluding `ignorePaths`; assess every selected current file in full. Deleted files have no current content; renamed files use the destination path.
- A current active finding yields status `failure`; clean, empty-scope, disabled, unavailable, incomplete-without-findings, and out-of-scope outcomes yield `success` with explicit descriptions. An earlier finding remains visible after a later unavailable run.
- A dismissal applies to one stable finding ID and one head SHA, is authored by an owner/admin/maintainer with a non-empty reason, and expires on a new SHA.
- The fixed required commit-status context is `ontology/semantic-match`. Publish against the current head and a verified test-merge SHA where GitHub evaluates it; never overwrite current status with a stale run.
- False positives cost more than missed detections. Invalid model output or missing coverage must never be reported as clean. No numerical pilot metric is introduced.
- Before every commit: stage only intended files, review `git diff --cached --name-only` and `git diff --cached`, run `node scripts/check-ontology-terms.mjs` and `npm test`, then commit and push that task. Never hand-edit generated `Narrative.md`.

## File map

| File or group | Responsibility |
| --- | --- |
| `templates/scripts/ontology-config.mjs`, `templates/ontology.config.json` | Strict optional `semanticReview` settings and disabled default. |
| `templates/scripts/semantic-review-github.mjs` | GitHub REST calls, PR association and eligibility, paginated changed-file collection, blob reads, trusted config and proposed ontology. |
| `templates/scripts/semantic-review-model.mjs` | Ontology evidence catalog, complete file chunking, bounded model calls, grounded response validation, stable finding IDs, partial coverage. |
| `templates/scripts/semantic-review-ledger.mjs` | Bot-authored run comments, valid dismissal lookup, latest-run selection, fixed commit status on verified SHAs. |
| `templates/scripts/semantic-review-worker.mjs` | Trusted worker orchestration and run outcomes. |
| `templates/scripts/semantic-review-dismissal.mjs` | `issue_comment` command and maintainer authorization; status recomputation without a model call. |
| `templates/github/workflows/ontology-semantic-request.yml`, `ontology-semantic-review.yml`, `ontology-semantic-dismiss.yml` | Secretless trigger, protected worker, and trusted dismissal event. |
| `bin/install-ontology.mjs`, `templates/docs/ontology-semantic-review.md`, README and install docs | Opt-in installation, setup, migration, and operational guidance. |
| `tests/semantic-*.test.mjs`, `tests/install-ontology.test.mjs`, `tests/ontology-config.test.mjs`, `tests/acceptance.test.mjs`, `tests/templates.test.mjs` | Behavior and install verification. Shipped module tests under `templates/scripts/` exercise installed copies. |

## Review Focus

- A PR filename containing spaces or shell metacharacters must be passed as API data, never interpolated into shell; Task 2 tests it.
- GitHub pagination limits, malformed blob encoding, or a changed-file count mismatch must mark coverage incomplete; Task 2 tests them.
- A file with one line larger than the model budget or a model 413 response must not silently lose text; Tasks 3–4 test them.
- A run that becomes stale after a push must not overwrite the latest head or test-merge status; Task 5 tests it.
- A forged bot marker or edited/deleted dismissal comment must not unblock a current finding; Tasks 5–6 test them.

---

### Task 1: Strict semantic configuration

**Files:** Modify `templates/scripts/ontology-config.mjs`, `templates/ontology.config.json`, `tests/ontology-config.test.mjs`.

**Interfaces:** `validateConfig(raw, deps)` returns `semanticReview: { enabled: boolean, model: string, baseUrl: string }`; absent config defaults to disabled. When enabled, non-empty model and valid HTTP(S) URL are required; unknown nested keys and malformed values fail validation. Preserve existing config behavior.

- [ ] **Step 1: Write failing tests** for disabled default, enabled valid config, missing model or endpoint, invalid URL, unknown nested key, and present `null`.
- [ ] **Step 2: Run** `node --test tests/ontology-config.test.mjs`; expect the new tests to fail.
- [ ] **Step 3: Implement** the optional nested validator and disabled template value.
- [ ] **Step 4: Run** `node --test tests/ontology-config.test.mjs`; expect all tests to pass.
- [ ] **Step 5: Stage, inspect, run global checks, commit** `feat: validate semantic review settings`, and push.

### Task 2: PR data and eligibility adapter

**Files:** Create `templates/scripts/semantic-review-github.mjs`, `templates/scripts/semantic-review-github.test.mjs`; add `tests/semantic-github-integration.test.mjs` only if a cross-module case needs it.

**Interfaces:** Export `createGitHubClient({ token, repository, fetchImpl })`, `resolvePulls(client, workflowRun)`, `isEligiblePull(client, pull)`, and `collectReviewInput(client, pull, config)`. The collector returns `{ headSha, mergeSha, files: [{ path, text }], unreviewed: [{ path, reason }], ontologyText }`; GitHub API data never becomes a shell command.

- [ ] **Step 1: Write failing fixture tests** for same-repo write/maintain/admin eligibility, fork or read-only rejection, current SHA resolution, pagination, rename/deletion, ignored/unchanged files, proposed ontology, and the first two Review Focus cases.
- [ ] **Step 2: Run** `node --test templates/scripts/semantic-review-github.test.mjs`; expect failure.
- [ ] **Step 3: Implement** REST pagination, blob decoding, and selection from the current PR API state; treat missing pages or unreadable blobs as unreviewed.
- [ ] **Step 4: Run** the focused test; expect pass.
- [ ] **Step 5: Stage, inspect, run global checks, commit** `feat: collect semantic review PR data`, and push.

### Task 3: Complete file batching and evidence catalog

**Files:** Create `templates/scripts/semantic-review-model.mjs`, `templates/scripts/semantic-review-model.test.mjs`.

**Interfaces:** Export `catalogOntology(markdown, sections)` and `chunkFiles(files, catalog, maxRequestChars)`; chunks retain path and exact source offsets, and the union of chunks covers every selected file byte. A too-large ontology projection is a named unavailable condition.

- [ ] **Step 1: Write failing tests** for required/optional ontology sections, every-byte coverage, paragraph boundaries, one oversize line, empty file, and per-request budget including prompt plus ontology.
- [ ] **Step 2: Run** `node --test templates/scripts/semantic-review-model.test.mjs`; expect failure.
- [ ] **Step 3: Implement** the catalog and lossless chunker without reading diff hunks.
- [ ] **Step 4: Run** the focused test; expect pass.
- [ ] **Step 5: Stage, inspect, run global checks, commit** `feat: prepare full-file semantic review`, and push.

### Task 4: Grounded model assessment and partial results

**Files:** Extend `templates/scripts/semantic-review-model.mjs` and its test.

**Interfaces:** Export `reviewFiles({ files, ontologyText, sections, model, baseUrl, apiKey, headSha, fetchImpl }) -> { reviewed, unreviewed, findings }`. Each finding has `{ id, path, quote, evidenceKey, reason, suggestion }`; `id` hashes head SHA, path, exact quote, and evidence key. The model token is never sent to GitHub, and the GitHub token is never sent to the model.

- [ ] **Step 1: Write failing tests** for grounded finding, no finding, duplicate finding, empty/malformed response, wrong quote or evidence, timeout, 413 split or final incomplete, and partial files with and without findings.
- [ ] **Step 2: Run** the focused model test; expect failure.
- [ ] **Step 3: Implement** bounded chat-completion calls, strict structured-response validation, retry/split rules, and coverage aggregation.
- [ ] **Step 4: Run** the focused test; expect pass.
- [ ] **Step 5: Stage, inspect, run global checks, commit** `feat: assess semantic matching with grounded findings`, and push.

### Task 5: Run ledger and commit-status publication

**Files:** Create `templates/scripts/semantic-review-ledger.mjs`, `templates/scripts/semantic-review-ledger.test.mjs`.

**Interfaces:** Export `publishPending(client, pull, run)`, `publishRun(client, pull, run, dismissals)`, `readLatestRun(client, pull)`, and `reconcileStatus(client, pull, run, dismissals)`. A `SemanticReviewRun` record includes schema version, PR number, SHA, trigger run ID, outcome, file coverage, and findings. Task 6 supplies validated dismissals. Use context `ontology/semantic-match`.

- [ ] **Step 1: Write failing tests** for pending/failure/success mappings, no-files/disabled/unavailable descriptions, earlier finding history, current head plus verified merge SHA, stale run rejection, bot-marker spoof rejection, comment pagination, and the fourth Review Focus case.
- [ ] **Step 2: Run** `node --test templates/scripts/semantic-review-ledger.test.mjs`; expect failure.
- [ ] **Step 3: Implement** immutable run comments, same-SHA status updates, freshness checks, and status reconciliation given validated dismissals.
- [ ] **Step 4: Run** the focused test; expect pass.
- [ ] **Step 5: Stage, inspect, run global checks, commit** `feat: publish semantic review outcomes`, and push.

### Task 6: Maintainer dismissal path

**Files:** Create `templates/scripts/semantic-review-dismissal.mjs`, `templates/scripts/semantic-review-dismissal.test.mjs`.

**Interfaces:** Export `parseDismissal(text)`, `readDismissals(client, pull, run)`, and `handleDismissal({ client, event })`; a valid command names one current finding ID and non-empty reason. It checks the current role through the collaborator-permissions API and invokes Task 5's reconciliation without the model.

- [ ] **Step 1: Write failing tests** for maintain/admin acceptance, write/read denial, one-finding dismissal, remaining active finding, same-SHA persistence, new-SHA expiry, changed/deleted command, ordinary proposal comment, and the fifth Review Focus case.
- [ ] **Step 2: Run** the focused dismissal test; expect failure.
- [ ] **Step 3: Implement** command parsing, author verification, current-comment reloading, and status recomputation.
- [ ] **Step 4: Run** the focused test; expect pass.
- [ ] **Step 5: Stage, inspect, run global checks, commit** `feat: process semantic finding dismissals`, and push.

### Task 7: Trusted worker and three workflows

**Files:** Create `templates/scripts/semantic-review-worker.mjs`, `templates/scripts/semantic-review-worker.test.mjs`, `templates/github/workflows/ontology-semantic-request.yml`, `ontology-semantic-review.yml`, `ontology-semantic-dismiss.yml`; extend `tests/templates.test.mjs`.

**Interfaces:** Export `runSemanticReview({ client, pull, config, modelFetch, secret })`; the CLI entry point reads only trusted checkout code and environment, resolves current PRs before config validation, calls Tasks 2–6, and records a current outcome it can publish. A secretless identification job resolves PR numbers for a per-PR worker matrix and posts `pending` before model work; review and dismissal jobs share the per-PR concurrency group. The model job references the default-branch-only environment with no deployment. A secretless finalizer reports an unavailable model job only if that run has no published result, so a partial run's finding is not cleared by an infrastructure fallback.

- [ ] **Step 1: Write failing orchestration and template tests** for B1–B14 outcome mapping, no PR code execution, no path filter or artifact, protected secret only in worker, same PR concurrency, and no model call for ineligible/disabled PRs.
- [ ] **Step 2: Run** the focused worker and template tests; expect failure.
- [ ] **Step 3: Implement** the CLI and workflows; keep PR metadata in environment or API data, never interpolated into shell source.
- [ ] **Step 4: Run** the focused tests; expect pass.
- [ ] **Step 5: Stage, inspect, run global checks, commit** `feat: run trusted semantic review workflows`, and push.

### Task 8: Opt-in installation, runbook, and end-to-end acceptance

**Files:** Modify `bin/install-ontology.mjs`, `README.md`, `docs/ai-agent-install.md`, `tests/install-ontology.test.mjs`, `tests/acceptance.test.mjs`, `tests/templates.test.mjs`, and `docs/ontology.md`; create `templates/docs/ontology-semantic-review.md`.

**Interfaces:** `buildPlan({ withSemanticReview: true })` installs all kit-owned semantic files and the runbook. `--with-drift-review` retains its advisory behavior. The runbook specifies environment branch restriction, secret, status context, migration, disabled mode, author and non-author correction, dismissal command, and fork approval path.

- [ ] **Step 1: Write failing installer and scratch-repository tests** for the opt-in flag, byte-identical copies, default disabled config, existing advisory install, disabled status, and a fixture finding that blocks after activation.
- [ ] **Step 2: Run** focused installer/acceptance tests; expect failure.
- [ ] **Step 3: Implement** installer flag, template plan, runbook, and documentation; update the repository ontology with any final terms.
- [ ] **Step 4: Run** focused tests and `npm test`; expect pass. In a disposable GitHub repository, verify that the fixed context appears on the evaluated PR commit and that a later unavailable run supersedes a failure; record the trial evidence in the PR. If GitHub access is unavailable, report the unverified branch-protection integration explicitly for user acceptance rather than claiming it passed.
- [ ] **Step 5: Stage, inspect, run global checks, commit** `feat: install semantic matching pilot`, and push.

## Behaviour coverage

| Behaviours | Proof tasks |
| --- | --- |
| B1–B3 | 2–4, 7–8 |
| B4–B5 | 4–5, 7–8 |
| B6–B7 | 5, 7–8; agent action is documented, not impersonated |
| B8–B9 | 5–6 |
| B10–B12 | 4–5, 7–8 |
| B13 | 1–2, 7–8 |
| B14 | 1, 5, 7–8 |

## Execution

Each task is a separate commit and push on `feature/semantic-ontology-matching/dev-build` after its focused tests, the ontology term check, and `npm test` pass. Follow the [detailed implementation plan](../../../detailed-implementations/semantic-ontology-matching/plan.md) for exact fixtures and interfaces. Do not start the build until this plan PR is reviewed and merged.
