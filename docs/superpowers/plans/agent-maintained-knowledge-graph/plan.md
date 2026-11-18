# Agent-Maintained Knowledge Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make agents name code against the `Ontology` and maintain the `SourceKnowledgeGraph` with the code, give the `GraphReader` a concept-first lookup, and add an opt-in, model-assisted `ReviewGraphNaming` whose results a person with write access settles in one comment.

**Architecture:** Two halves that share nothing at runtime. The agent half is text plus one offline command: a stronger `GraphAgentProtocol`, an "Authoring graph entries" section in the installed runbook, and `concept <term>` in `scripts/query-source-graph.mjs`. The review half mirrors `ReviewSemanticMatch`: a secret-free trigger, a trusted `workflow_run` worker that reads the pull request's Turtle and `Ontology` as data, a publisher that keeps one summary comment with a bot-written ledger and the fixed `ontology/graph-naming` status, and an `issue_comment` settlement handler for `/graph-naming` commands. `GraphChecker`, the `GraphRenderer` and their workflows do not change.

**Tech Stack:** Node.js >=18 standard library only, `node:test`, GitHub Actions on the existing Node 20 setup pattern, the kit's own Turtle reader (`source-graph-turtle.mjs`, `source-graph-model.mjs`, `owl-ontology.mjs`), and the semantic reviewer's `llm-auth.mjs`, `request-budget.mjs`, `semantic-review-github.mjs` and `semantic-review-model.mjs`. No npm dependency.

**Spec:** [feature.md](../../../features/agent-maintained-knowledge-graph/feature.md) (vision, behaviours B1–B45, architecture), [ADR 0020](../../../adr/0020-model-graph-naming-results-take-effect-on-human-acceptance.md), [ADR 0021](../../../adr/0021-settle-graph-naming-results-with-short-comment-commands.md), [ADR 0022](../../../adr/0022-one-summary-comment-with-a-bot-ledger-for-graph-naming.md), [ADR 0023](../../../adr/0023-graph-naming-review-as-a-separate-opt-in.md), [ADR 0024](../../../adr/0024-deterministic-selection-and-prefilter-for-graph-naming.md), [ADR 0025](../../../adr/0025-graph-authoring-guidance-in-the-installed-runbook.md). Read the [detailed plan](../../../detailed-implementations/agent-maintained-knowledge-graph/plan.md) alongside this one; it holds the test files, the exact copy and the algorithms.

## Global Constraints

- This is dev-plan for lite feature #122. Write no implementation until this plan pull request has been reviewed and merged. Build on `feature/agent-maintained-knowledge-graph/build`, which the user phase shares.
- Installed scripts are byte-identical in every adopting repository. Every per-repository value (graph root, ontology path, model, endpoint, sections) comes from `OntologyConfig` read from the default branch. Never bake in JEPA-Speech names.
- False positives cost more than missed detections. Where a rule leaves a choice, drop the pair or the result rather than report it.
- `GraphChecker`, `GraphCheckWorkflow`, `GraphRenderer` and `GraphRenderWorkflow` are unchanged (ADR 0020). The reader's `concept` command makes no network call and reads only local Git objects (B24).
- The semantic reviewer's behaviour must not change. Changes to its modules are limited to exporting existing helpers and adding the `rows` map to `catalogOntology`'s return value; its existing tests pass unmodified.
- Model output never reaches a status description, a log line or a not-reviewed reason. Not-reviewed reasons are fixed strings (ADR 0019). Model `reason` and `suggestion` text appears only in the summary comment and deferral issues, truncated to 200 characters.
- Trusted jobs check out the default branch with `persist-credentials: false` and execute no pull request content. Pull request Turtle, `Ontology` text and model replies are data.
- Status context is exactly `ontology/graph-naming`; the deferral label is exactly `graph-naming-deferred`; the command prefix is exactly `/graph-naming`; the bot identity is `github-actions[bot]`; permitted settlers have collaborator `role_name` `write`, `maintain` or `admin`.
- Outcomes are `SemanticOutcome` values. Only unsettled or accepted results hold the merge; every outcome without such results posts `success`.
- Generated Markdown uses one line per paragraph or list item. Do not backtick a PascalCase word in tracked Markdown unless it is an `Ontology` term; example code names stay unformatted in prose or go in code fences.
- Every task is test-first, independently reviewable and ends in its own commit and push. Before each commit, stage only the task's files, review `git diff --cached --name-only` and `git diff --cached`, run `node scripts/check-ontology-terms.mjs` and `npm test`, then commit and `git push -u origin feature/agent-maintained-knowledge-graph/build`. Never hand-edit `Narrative.md`.
- Shipped tests import only shipped modules, never this repository's `tests/` helpers. Keep tests independent of the host's git defaults and of timers that do not keep the event loop alive.
- No new domain term is needed: every component, use case and value named here is already in `docs/ontology.md`. JavaScript shapes such as the compared node, the pair and the ledger are implementation types, not ontology terms.

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `templates/scripts/query-source-graph.mjs`, matching `.test.mjs` | `concept <term>` for `FindConceptImplementations`: term resolution, grouped one-hop lookup, text and JSON output. | 1 |
| `templates/protocol/source-graph-protocol.md`, `tests/source-graph-templates.test.mjs` | The stronger `GraphAgentProtocol` block. | 2 |
| `templates/docs/source-knowledge-graph.md`, `tests/source-graph-templates.test.mjs` | "Authoring graph entries" guidance with canonical Turtle examples. | 3 |
| `templates/scripts/ontology-config.mjs`, `tests/ontology-config.test.mjs` | `sourceGraph.namingReview` validation, sharing the `semanticReview` validator. | 4 |
| `templates/scripts/graph-naming-select.mjs`, matching `.test.mjs`; `templates/scripts/semantic-review-model.mjs` (adds `rows`) | Deterministic selection of compared nodes, pairs and the canonical-name prefilter (ADR 0024). | 5 |
| `templates/scripts/graph-naming-model.mjs`, matching `.test.mjs`; `templates/scripts/semantic-review-model.mjs` (exports) | Bounded model requests, grounding and stable result keys. | 6 |
| `templates/scripts/graph-naming-commands.mjs`, matching `.test.mjs` | `/graph-naming` grammar and the pure settlement fold (ADR 0021). | 7 |
| `templates/scripts/graph-naming-github.mjs`, matching `.test.mjs`; `templates/scripts/semantic-review-github.mjs` (exports `decodeBlob`) | Base and head graph and `Ontology` snapshots through the API; collaborator role lookup. | 8 |
| `templates/scripts/graph-naming-test-helpers.mjs`, `templates/scripts/graph-naming-ledger.mjs`, matching `.test.mjs` | `GraphNamingPublisher`: ledger, labels, summary, notification, deferral issues and status (ADR 0022). | 9 |
| `templates/scripts/graph-naming-worker.mjs`, matching `.test.mjs` | `GraphNamingWorker` and `GraphNamingSettlementHandler` entry points: identify, review, finalize, settle. | 10 |
| `templates/github/workflows/ontology-graph-naming-request.yml`, `-review.yml`, `-settle.yml`, `tests/graph-naming-workflows.test.mjs` | `GraphNamingTrigger`, the worker workflow and the handler workflow. | 11 |
| `bin/install-ontology.mjs`, `tests/install-ontology.test.mjs`, `templates/docs/graph-naming-review.md` | `--with-graph-naming-review` and its runbook. | 12 |
| `tests/graph-naming-integration.test.mjs`, `.github/workflows/test.yml`, `README.md`, `docs/how-it-works.md`, `docs/ai-agent-install.md` | Installed end-to-end run against stand-ins; CI runs the shipped tests alone; adopter docs. | 13 |

Tasks 1–3 are the agent half and touch nothing in the review half. They can be trialled in JEPA-Speech by installing from the build branch before Task 4 starts.

## Interfaces and Planning Decisions

```js
// query-source-graph.mjs (Task 1)
export function resolveTerm(tree, config, input); // -> { iri: ":Name", name: "Name" } | null
export function conceptImplementations(graph, iri); // -> { term: { iri, name }, denotes: NodeView[], implements: AssertionView[] }
// annotate() also marks evidence under result.implements

// graph-naming-select.mjs (Task 5)
export const SKIPPED_KINDS; // ["kit:source-file", "kit:test", "kit:document"]
export const SYNONYM_KINDS; // ["kit:concept", "kit:component", "kit:system", "kit:source-symbol"]
export function memoryTree(files); // Array<{ path, text }> -> { paths(), has(path), text(path) } for loadGraph
export function ontologySnapshot({ markdown, turtle, sections }); // -> { catalog | null, subjects: Set<string>, rows: Map<name, string> }
export function words(text); // -> lower-cased word tokens
export function containsCanonical(label, name); // -> boolean
export function selectComparedNodes({ baseGraph, headGraph, baseOntology, headOntology }); // -> ComparedNode[] by IRI
export function formPairs(nodes, headOntology); // -> { pairs: Pair[], prefiltered: number }
// ComparedNode: { iri, kind, label, denotes: string | null, implements: Array<{ assertion, concept, item: string | null }>, file, evidence: string[] }
// Pair: { node, kind, type: "denotes" | "implements" | "synonym", label, value, name: string | null, file, evidence }

// graph-naming-model.mjs (Task 6)
export const MAX_RESULTS = 20, MAX_TEXT = 200, GRAPH_SYSTEM_PROMPT;
export function resultKey({ node, type, label, value, ontologyKey }); // SHA-256 hex
export function batchPairs(pairs, catalog, maxRequestChars); // -> { batches: Pair[][], unreviewed }
export function groundReply(content, batch, catalog); // -> { results, failed: Array<{ node, reason }> }; throws GroundingError(reason) for the whole batch
export async function reviewPairs({ pairs, catalog, model, baseUrl, auth, fetchImpl, timeoutMs, maxRequestChars }); // -> { reviewed, unreviewed, results }
// GraphNamingResult record: { key, node, type, label, value, ontologyKey, reason, suggestion, file, evidence }

// graph-naming-commands.mjs (Task 7)
export const PERMITTED_ROLES; // ["write", "maintain", "admin"]
export function parseCommand(body); // -> null | { decision, targets: "all" | string[], text } | { invalid: string }
export function applyCommands({ results, labels, commands, records }); // -> { records, settlements: Map<key, NamingSettlement>, ignored, notCurrent }

// graph-naming-github.mjs (Task 8)
export async function collectGraphNamingInput(client, pull, config); // -> { changed, incomplete, base: Snapshot | null, head: Snapshot | null }
export async function readPermission(client, login); // -> role_name | null on 404
// Snapshot: { files: Array<{ path, text }>, markdown: string | null, turtle: string | null }

// graph-naming-ledger.mjs (Task 9)
export const STATUS_CONTEXT, DEFERRED_LABEL, BOT_LOGIN, MARKER_PREFIX;
export function emptyLedger(prNumber);
export function encodeLedger(ledger); // marker line
export function readLedger(comments, prNumber); // -> { ledger, comment | null }
export async function loadLedger(client, pull); // -> { ledger, comment | null }
export function assignLabels(ledger, results); // -> keys labelled for the first time
export function countResults(run, settlements); // -> { unsettled, accepted, rejected, deferred } (arrays of results)
export function statusFor(run, counts); // -> { state, description }
export function renderSummary(view); // -> Markdown without the marker
export function isNewerTrigger(left, right);
export async function publishPending(client, pull);
export async function publishState({ client, pull, run = null, readRole = readPermission }); // -> { published, newKeys }

// graph-naming-worker.mjs (Task 10)
export async function runGraphNamingReview({ client, pull, config, auth, env, modelFetch, deps });
export async function planGraphNamingReviews({ client, pulls, loadTrustedConfig, deps }); // -> { all, review }
export async function finalizeGraphNamingReview({ client, pull, triggerRunId, config, deps });
export async function handleSettlementEvent({ client, event, deps }); // -> { handled, reason }
```

| Topic | Exact decision |
| --- | --- |
| Term forms (B20, B23) | `Name`, `:Name` or `<namespaceUri>Name` resolves to `:Name` only if `:Name` is a subject of the ontology serialisation at the graph revision. Local names match `[A-Za-z_][A-Za-z0-9_-]*`. No case folding, no fuzzy matching. |
| Lookup output (B20–B22) | Text prints `concept :Name`, then `denotes` and its nodes, then `implements` and each assertion in the reader's existing format. An empty group prints a fixed sentence that does not call the concept unimplemented, then the coverage inventory. Unknown term: exit 2 with a hint to use `search`. |
| Selection (B27) | A head node is compared when it is new, its label, kind or `kit:denotes` changed, it is the subject of a `kit:implements` assertion that is new or whose subject, object or relationship changed, or an item it denotes or implements (through the concept node's `kit:denotes`) is a base ontology subject missing from the head or has a changed row. A missing base graph or base `Ontology` makes every head node new. |
| Pairs (B27) | Skipped kinds form none. `kit:denotes` gives a denotes pair; each `kit:implements` whose object has `kit:denotes` gives an implements pair; a node with neither, of a synonym kind, gives one synonym pair. Duplicate pairs collapse. |
| Prefilter (B28) | Tokens are `/[A-Z]+(?![a-z])\|[A-Z]?[a-z]+\|[0-9]+/g` matches, lower-cased. A label contains a name when the name's tokens occur contiguously, in order, in the label's tokens. Denotes and implements pairs drop on their item's local name; a synonym pair drops when the label contains any catalog entry name. Applied before any request, whatever the item's state. |
| Request and grounding (B29) | One request per batch of whole nodes, sized as `REQUEST_OVERHEAD + GRAPH_SYSTEM_PROMPT + catalog.projection + pairs JSON`. The reply must be `{"results":[{"node","quoted","item","reason","suggestion"}]}`, one fence tolerated. Batch-level failures leave every node in the batch not reviewed; node-level failures leave that node not reviewed and drop its results. Reasons are fixed strings listed in the detailed plan. |
| Result identity (B30) | `resultKey` hashes node IRI, pair type, full label, full value and canonical `Section:Name` key with NUL separators. The pair is the node's pair whose label or denotes value equals `quoted`, preferring the one whose item name equals the cited item. |
| Result cap | At most 20 results per run, ordered by node IRI then key. Nodes whose results fall beyond the cap become not reviewed with "result limit reached". Stored `label`, `value`, `reason` and `suggestion` are cut to 200 characters with a trailing ellipsis after the key is computed. The stored run keeps counts, at most 20 not-reviewed entries and the results, so 20 maximal results fit one comment. |
| Commands (B36, B38, B42) | First line, trimmed, must start `/graph-naming` then whitespace or end; case-insensitive verb and targets; targets are `all` alone or R labels separated by commas with optional spaces, normalised to `R<n>`. Text is the rest of the first line plus later lines, trimmed. `reject` without text is invalid. Quoted replies (`> /graph-naming …`) are not commands. |
| Settlement fold (B36, B40–B43) | Commands apply in creation order; the latest valid one per key wins. Each command's targets resolve once, when first seen or when its body hash changes, and the resolution is kept in the ledger, so `all` never grows to later results. Unknown labels are ignored; labels with no current result are reported as no longer current. |
| Ledger (ADR 0022) | One bot comment, the earliest by ID whose last line is `<!-- ontology-graph-naming v1 data=<base64 JSON> -->`. JSON: `{ schema: 1, prNumber, run, labels: { key: "R<n>" }, next, commands: { commentId: record } }`. Only a comment by `github-actions[bot]` for the same pull request number is trusted. |
| Deferral issues (B39, B41) | Created by `publishState` for any deferred command record with keys and no issue; the label is created first if `GET /labels/graph-naming-deferred` returns 404. Title `Deferred graph naming results from #<pr>: R1, R2`. Links use `pull.base.repo.html_url` and the run's head SHA. When a later accept or reject replaces a deferred key, the issue gets one comment per replacing command; it stays open. |
| Status (B33, B35, B37) | `failure` while any current result is unsettled or accepted, with counts; otherwise `success` with the outcome description. Pending at the start of a review. Posted on the head and, when GitHub still reports it, the test-merge commit, only while the run's head is the current head. |
| Notification (B35) | A short new comment linking to the summary whenever a published run assigns at least one new R label. Recomputes without a new run never notify. |
| Trigger plan (B31) | `review` jobs only for pull requests that are same-repository, enabled on the default branch and whose file listing touches a `.ttl` under the graph root or either ontology file (or is incomplete). Every pull request gets a `finalize` job, so the required status always resolves. |
| Settlement events | `created`, `edited` and `deleted` comments on open pull requests, when the new or previous body parses as a command and the author is not the bot. The handler holds no model secret and uses no environment. |
| Installer | `--with-graph-naming-review` requires `--with-source-graph` (or `--source-graph-root`) and fails before writing otherwise. It adds the six graph naming modules and their tests, the test helper, the three workflows, `docs/graph-naming-review.md`, and, once only, `llm-auth`, `request-budget`, `semantic-review-github` and `semantic-review-model` with their tests. |

## Tasks

### Task 1: `concept` command in the `GraphReader` (B20–B24)

- [ ] Add the tests from the detailed plan to `templates/scripts/query-source-graph.test.mjs`; run `node --test templates/scripts/query-source-graph.test.mjs` and see them fail.
- [ ] Implement `resolveTerm`, `conceptImplementations`, the `concept` branch of `main` and the `implements` marking in `annotate`.
- [ ] Run the file, then `npm test`, green. Commit `feat: add concept-first lookup to the source graph reader` and push.

### Task 2: stronger `GraphAgentProtocol` (B1–B12, B18, B26, B37, B45)

- [ ] Add the protocol tests to `tests/source-graph-templates.test.mjs`; see them fail.
- [ ] Replace `templates/protocol/source-graph-protocol.md` with the detailed plan's copy.
- [ ] Green, including the existing installer splice tests. Commit `feat: teach the graph protocol to name, record and widen with the code` and push.

### Task 3: "Authoring graph entries" in the installed runbook (B7, B9, B13–B19, B45)

- [ ] Add the runbook tests to `tests/source-graph-templates.test.mjs`; see them fail.
- [ ] Insert the detailed plan's section into `templates/docs/source-knowledge-graph.md` after "Author and review in one PR".
- [ ] Green. Commit `docs: add graph entry authoring guidance to the source graph runbook` and push.

### Task 4: `sourceGraph.namingReview` in `OntologyConfig` (B34)

- [ ] Add the config tests to `tests/ontology-config.test.mjs` and update the existing deep-equal `sourceGraph` defaults to include `namingReview: { enabled: false, model: "", baseUrl: "" }`; see the new ones fail.
- [ ] Generalise `validateSemanticReview(value)` into `validateModelReview(value, label)` with identical `semanticReview` messages, call it for `sourceGraph.namingReview`, and reject an enabled naming review when `sourceGraph.enabled` is false. Update the typedef.
- [ ] Green. Commit `feat: validate the graph naming review setting` and push.

### Task 5: deterministic selection and prefilter (B27, B28)

- [ ] Create `templates/scripts/graph-naming-select.test.mjs` from the detailed plan, and add the `rows` test to `semantic-review-model.test.mjs`; see them fail.
- [ ] Add `rows: Map<"Section:Name", row text>` to `catalogOntology`'s result; implement `graph-naming-select.mjs`.
- [ ] Green. Commit `feat: select graph names for naming review deterministically` and push.

### Task 6: model requests, grounding and result keys (B29, B30, B32, B33)

- [ ] Create `templates/scripts/graph-naming-model.test.mjs` from the detailed plan; see it fail.
- [ ] Export `stripFence`, `resolveEvidenceKey` and the reply error class from `semantic-review-model.mjs` unchanged; implement `graph-naming-model.mjs`.
- [ ] Green, with the semantic model tests unchanged. Commit `feat: ground graph naming results from bounded model requests` and push.

### Task 7: commands and the settlement fold (B36, B38, B40–B43)

- [ ] Create `templates/scripts/graph-naming-commands.test.mjs` from the detailed plan; see it fail.
- [ ] Implement `graph-naming-commands.mjs`.
- [ ] Green. Commit `feat: parse and fold graph naming settlement commands` and push.

### Task 8: pull request snapshots and roles through the API (B31, B32)

- [ ] Create `templates/scripts/graph-naming-github.test.mjs` from the detailed plan; see it fail.
- [ ] Export `decodeBlob` from `semantic-review-github.mjs` unchanged; implement `graph-naming-github.mjs`.
- [ ] Green. Commit `feat: read graph naming inputs from the pull request as data` and push.

### Task 9: `GraphNamingPublisher` (B33, B35, B37–B41, B43, B44)

- [ ] Create `templates/scripts/graph-naming-test-helpers.mjs` and `templates/scripts/graph-naming-ledger.test.mjs` from the detailed plan; see the tests fail.
- [ ] Implement `graph-naming-ledger.mjs`.
- [ ] Green. Commit `feat: publish graph naming state in one summary comment and status` and push.

### Task 10: worker and settlement handler entry points (B25, B31–B34, B42)

- [ ] Create `templates/scripts/graph-naming-worker.test.mjs` from the detailed plan; see it fail.
- [ ] Implement `graph-naming-worker.mjs` with `identify`, `review`, `finalize` and `settle` modes.
- [ ] Green. Commit `feat: run and settle graph naming reviews from trusted workflows` and push.

### Task 11: workflows (B31, B32)

- [ ] Create `tests/graph-naming-workflows.test.mjs` from the detailed plan; see it fail.
- [ ] Create the three workflow files from the detailed plan.
- [ ] Green. Commit `feat: add graph naming request, review and settle workflows` and push.

### Task 12: installer flag and runbook (B5, B34)

- [ ] Add the installer tests from the detailed plan to `tests/install-ontology.test.mjs`; see them fail.
- [ ] Add `--with-graph-naming-review` to `bin/install-ontology.mjs` and write `templates/docs/graph-naming-review.md` to the detailed plan's outline.
- [ ] Green. Commit `feat: install the graph naming review with --with-graph-naming-review` and push.

### Task 13: installed integration, CI and adopter docs

- [ ] Create `tests/graph-naming-integration.test.mjs` from the detailed plan; see it fail only where the installed files are missing, then pass.
- [ ] Add the six shipped graph naming tests to the "Shipped reviewer tests" step of `.github/workflows/test.yml`; update `README.md`, `docs/how-it-works.md` and `docs/ai-agent-install.md` as the detailed plan lists.
- [ ] Green. Commit `docs: document the agent-maintained graph and graph naming review` and push.

## Review Focus

- An adopter with the source graph installed but no `namingReview` setting must see a `success` status saying the review is disabled on every pull request, not a missing required status; Task 10 tests the disabled and absent cases and Task 11 checks that `finalize` runs for every pull request.
- A reviewer who edits or deletes a command comment after a push must not widen it to results that appeared later; Task 7 tests that `all` keeps its first resolution and that an edit re-resolves.
- Two reviewers settling at the same moment, or a push during settlement, must not post a status for an old head; Task 9 tests that a stale head publishes no status and Task 11 checks the shared concurrency group.
- A large graph change must not produce a summary comment GitHub rejects; Task 9 tests that 20 maximal results fit within 65,536 characters.
- A term the ontology defines as an enum value (an individual) must still be found by `concept`; Task 1 resolves any subject of the serialisation, and its tests include an individual.
