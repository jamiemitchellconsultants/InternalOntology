# Source Knowledge Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install an opt-in, source-owned graph of repository facts: an agent protocol, a local reader and a deterministic checker that blocks unreviewed changes to covered files, and a read-only PR workflow. Nothing calls a model, needs a secret, or touches the network after checkout.

**Architecture:** Git-tracked canonical Turtle (manifest, nodes, assertion shards) is read from Git objects at a revision, never from the working tree. One dependency-free parser and model feed two commands: `check-source-graph.mjs` (structure, evidence, coverage, refresh records, base-versus-proposed freshness) and `query-source-graph.mjs` (search, neighbours, bounded paths, coverage, staleness). The installer adds both behind `--with-source-graph`; adopter config holds all repository variation.

**Tech Stack:** Node.js >=18, `node:test`, `node:child_process` calling `git` with argument arrays (never a shell), GitHub Actions; no npm dependencies.

**Spec:** [Vision](../../../features/source-knowledge-graph/01-vision.md), [behaviours](../../../features/source-knowledge-graph/02-behaviours.md), [architecture](../../../features/source-knowledge-graph/03-architecture.md), and [ADRs 0005–0008](../../../adr/0005-source-graph-git-data.md).

## Global Constraints

- Installed scripts are byte-identical in every adopting repository. No repository-specific value (root path, evidence selectors, namespace, Terraform) appears in a script; it comes from `ontology.config.json` read **from the tree being checked**, never from the working directory.
- The checker and reader read Git objects only (`ls-tree`, `cat-file`, `write-tree`). They never read the working tree, execute source files, call a model, use a secret, or open a network connection. A test asserts the scripts import no `node:http`, `node:https`, `node:net`, `node:dns` and never call `fetch`.
- False positives cost more than missed detections. Every failure names the file or resource and a specific reason; where a check cannot be certain it does not fail (a record for a path that left coverage is ignored; an unreferenced node or evidence resource is not an error).
- Accepted input is the canonical Turtle subset in the architecture and nothing else. Anything outside it fails with the line number and the rule it broke; the checker never guesses.
- A passing result states "structurally valid; semantic truth is for maintainers". No message, doc or protocol text claims a pass proves a claim true.
- The enabled graph check requires a committed canonical ontology Turtle source; otherwise the commands exit 2 with the `build-ontology.mjs` hint. Exit codes everywhere: 0 clean, 1 findings, 2 cannot run.
- Installed Markdown (protocol, runbook) is linted by the adopter's term checker, so it uses no backticked PascalCase term the adopter's ontology lacks. A test installs with the flag, commits, and runs the term checker.
- Before every commit: stage only intended files, review `git diff --cached --name-only` and `git diff --cached`, run `node scripts/check-ontology-terms.mjs` and `npm test`, then commit and push that task. Never hand-edit generated `Narrative.md`. The repository's own `scripts/` copies are not touched.

## Decisions made while planning

The architecture fixes behaviour; these fill the gaps it deliberately left to the developer. None changes a behaviour or an ADR.

| Topic | Decision |
| --- | --- |
| Config shape | `sourceGraph: { enabled, root, evidence }`. `root` defaults to `docs/source-knowledge-graph`. `evidence` maps `implementation`, `test`, `selected-document`, `ontology`, `deployment` to arrays of path selectors. A role with no entry accepts no evidence, so Terraform-only deployment (B14) is simply `deployment: ["**/*.tf"]`. |
| Role and outcome IRIs | Roles are `kit:role-implementation`, `-test`, `-selected-document`, `-ontology`, `-deployment`, so a role never shares an IRI with the node kind `kit:test`. Basis: `kit:direct`, `kit:inferred`. Status: `kit:covered`, `kit:unknown`, `kit:excluded`. Outcome: `kit:graph-updated`, `kit:no-fact-change`. |
| Resource naming | Local names are `node-…`, `assertion-…`, `evidence-…`, `coverage-…`, and `refresh-<first 12 hex of sha1(path)>`. Concept IRIs in the ontology never contain a hyphen, so the two cannot collide. All use the config `namespaceUri` as the default prefix. |
| Deleted file | A refresh record for a deleted path carries `kit:deleted 1` and no `kit:blobId`. |
| Currency rule | Every existing covered file has a record whose blob equals its current blob. This is the single-revision check; PR mode adds the base-union rule so a PR cannot narrow coverage past its own changes. |
| Bypass guard | In PR mode a head config that disables the graph check, or moves its root, while the base config enabled it is a failure. |
| Revision modes | `--rev <rev>` (default `HEAD`), `--base <rev> --head <rev>` for CI, and `--staged [--base <rev>]` for the author; staged mode checks the tree from `git write-tree` and prints its ID. |

## File map

| File or group | Responsibility |
| --- | --- |
| `templates/scripts/ontology-config.mjs`, `templates/ontology.config.json` | Strict optional `sourceGraph` settings. |
| `templates/scripts/source-graph-turtle.mjs` | Parse, canonical-check and format the Turtle subset. |
| `templates/scripts/source-graph-git.mjs` | Tree sources from a revision or the index, blob reads, changed paths. |
| `templates/scripts/source-graph-model.mjs` | Core vocabulary, selector matching, resource indexing, coverage resolution. |
| `templates/source-graph/graph-schema.ttl`, `manifest.ttl`, `nodes.ttl` | Kit-owned schema; adopter-owned starter graph. |
| `templates/scripts/check-source-graph.mjs` | Structural validation, evidence, coverage, refresh records, freshness, CLI. |
| `templates/scripts/query-source-graph.mjs` | Reader: search, neighbours, paths, coverage, staleness, text and JSON output. |
| `templates/protocol/source-graph-protocol.md`, `templates/docs/source-knowledge-graph.md` | Agent protocol block and runbook. |
| `templates/github/workflows/source-graph-check.yml` | Read-only PR and default-branch workflow. |
| `bin/install-ontology.mjs`, README, `docs/ai-agent-install.md`, `docs/ontology.md` | `--with-source-graph`, config injection, docs. |
| `templates/scripts/source-graph-*.test.mjs`, `check-source-graph.test.mjs`, `query-source-graph.test.mjs`, `templates/scripts/source-graph-test-helpers.mjs`, `tests/source-graph-*.test.mjs` | Behaviour and install verification. The shipped tests and their helper run inside adopting repositories, so they import nothing from `tests/`. |

## Review Focus

- Narrowing coverage in a PR must not erase that PR's review obligation (ADR 0006); Task 6 tests it, including a deletion.
- A cited blob or line range that no longer matches must fail; moving a cited file must not silently pass; Tasks 5–6 test them.
- An inference must stay labelled in reader output and a path must never become a direct edge; Task 7 tests both.
- A PR that edits `ontology.config.json` to disable or relocate the check must fail; Task 6 tests it.
- Empty results must report coverage and say topic coverage cannot be determined, never "no relationship exists"; Task 7 tests it.
- File names with spaces, quotes or newlines must reach `git` as arguments only; Task 3 tests it.

---

### Task 1: Strict source graph configuration

**Files:** Modify `templates/scripts/ontology-config.mjs`, `templates/ontology.config.json` (unchanged default: absent), `tests/ontology-config.test.mjs`.

**Interfaces:** `validateConfig(raw, deps)` returns `sourceGraph: { enabled, root, evidence }`; absent means `{enabled:false, root:"docs/source-knowledge-graph", evidence:{}}`. Enabled requires a repository-relative `root` (reuse `normaliseRepoRelativePath`), known role keys only, selector arrays of non-empty repository-relative strings, and an `ontologyPath` ending `.md`. Present `null` and unknown keys fail. Existing fields and the `semanticReview` default are untouched.

- [ ] **Step 1: Write failing tests** for disabled default, enabled valid config, unknown nested or role key, `null`, absolute or `..` root, non-array selector, empty selector string, and non-`.md` ontology path when enabled.
- [ ] **Step 2: Run** `node --test tests/ontology-config.test.mjs`; expect the new tests to fail.
- [ ] **Step 3: Implement** the nested validator and add `sourceGraph` to the known keys.
- [ ] **Step 4: Run** the focused test; expect pass.
- [ ] **Step 5: Stage, inspect, run global checks, commit** `feat: validate source graph settings`, and push.

### Task 2: Canonical Turtle subset

**Files:** Create `templates/scripts/source-graph-turtle.mjs`, `templates/scripts/source-graph-turtle.test.mjs`.

**Interfaces:** `parseGraphTurtle(text, file) -> { namespace, blocks: [{ subject, line, type, pairs: [{ predicate, object, objectType, line }] }] }`; `formatGraphTurtle({ namespace, blocks }) -> string`; `canonicalProblems(text) -> { line, rule }[]`. Throws `GraphTurtleError` with file, line and rule. Accepts only fixed prefixes, one named subject block at a time, one pair per line, sorted subjects and predicates, IRIs as prefixed names, escaped strings, decimal integers. Rejects blank nodes, RDF-star, collections, multiline literals, compacted multi-object syntax, `@base`, and unknown prefixes.

- [ ] **Step 1: Write failing tests** for a round trip, each rejected construct with its line number, unsorted subject, unsorted predicate, trailing or missing blank line, CRLF input, escaped quote and newline in a string, and an integer.
- [ ] **Step 2: Run** the focused test; expect failure.
- [ ] **Step 3: Implement** the line-oriented parser and formatter; `canonicalProblems` re-formats and reports the first differing line.
- [ ] **Step 4: Run** the focused test; expect pass.
- [ ] **Step 5: Stage, inspect, run global checks, commit** `feat: parse the canonical graph turtle subset`, and push.

### Task 3: Git tree sources and path selectors

**Files:** Create `templates/scripts/source-graph-git.mjs`, `templates/scripts/source-graph-git.test.mjs`, `templates/scripts/source-graph-test-helpers.mjs` (scratch repository part).

**Interfaces:** `treeFromRevision(cwd, rev) -> Tree`, `treeFromIndex(cwd) -> Tree`, where a `Tree` is `{ id, revision, paths(): string[], blobId(path), has(path), read(path): Buffer }`; `changedPaths(baseTree, headTree) -> { path, change: "added"|"modified"|"deleted" }[]` (no rename detection). Every call uses `execFileSync("git", [...])` with an argument array and `-z`. Submodule entries are skipped. A missing revision or an index with unmerged entries throws `GitSourceError` (exit 2).

- [ ] **Step 1: Write failing tests** in a scratch repository: revision tree matches committed content not a dirty working file; index tree includes a staged file and reports a tree ID; unmerged index error; unknown revision error; file name with spaces, a quote and a newline; submodule skipped; added, modified, deleted and rename-as-delete-plus-add.
- [ ] **Step 2: Run** the focused test; expect failure.
- [ ] **Step 3: Implement** the two tree sources and `changedPaths`.
- [ ] **Step 4: Run** the focused test; expect pass.
- [ ] **Step 5: Stage, inspect, run global checks, commit** `feat: read graph input from git trees`, and push.

### Task 4: Graph model, vocabulary and coverage resolution

**Files:** Create `templates/scripts/source-graph-model.mjs`, `templates/scripts/source-graph-model.test.mjs`, `templates/source-graph/graph-schema.ttl`, `tests/source-graph-templates.test.mjs` (kit-only checks of template files, extended in Task 8).

**Interfaces:** `CORE` (schema version `1`, node kinds, relationships, roles, bases, statuses, outcomes); `matchSelector(selector, path)` (`*` within a segment, `**` across segments, `?` one character, everything else literal); `loadGraph(tree, config) -> Graph` reading every tracked `.ttl` under the root except `graph-schema.ttl`, returning typed resources indexed by IRI plus `problems[]` from the parser; `resolveCoverage(graph, path) -> { status, coverage, reason } | { status:"unknown", coverage:null }` (highest priority wins, equal-priority differing status is a conflict, unmatched is unknown); `renderSchema()` generates the Kit-owned schema text from `CORE`. A test proves `templates/source-graph/graph-schema.ttl` equals `renderSchema()`, so the file and the constants cannot drift.

- [ ] **Step 1: Write failing tests** for selector cases (`**` zero segments, dotfiles, literal metacharacters, anchoring), shard loading including a nested shard and a skipped schema, duplicate-IRI reporting, coverage priority, equal-priority conflict, unmatched path, and schema/constants agreement.
- [ ] **Step 2: Run** the focused test; expect failure.
- [ ] **Step 3: Implement** the model, selector and schema file.
- [ ] **Step 4: Run** the focused test; expect pass.
- [ ] **Step 5: Stage, inspect, run global checks, commit** `feat: model the source graph and its coverage`, and push.

### Task 5: Structural and evidence checks

**Files:** Create `templates/scripts/check-source-graph.mjs` (library part), `templates/scripts/check-source-graph.test.mjs`; extend `templates/scripts/source-graph-test-helpers.mjs` with the widgets fixture.

**Interfaces:** `checkTree({ tree, config }) -> Finding[]` where `Finding = { file, subject, rule, message }`. It reports: noncanonical or unparseable shard; missing, duplicate or multiple graph resources; wrong schema version; duplicate IRIs; a missing required predicate or a predicate of the wrong kind per the architecture's table; dangling subject, object, evidence, coverage or refresh references; undeclared or colliding node kind or relationship; a local kind or relationship with no definition; an assertion with no basis or no evidence; evidence whose path is missing, is outside covered scope, does not match its role's selector, whose blob differs from the current blob, or whose line range is not within the file; a concept node whose `kit:denotes` is absent from the ontology Turtle at this tree; malformed coverage (selector, priority, status, missing reason for a gap), an equal-priority conflict, and a graph root that does not resolve as excluded. Failure order is deterministic.

- [ ] **Step 1: Write failing tests** with one fixture mutation per rule above, B10's five named cases first, the B14 pilot (docker-compose cited as deployment fails, Terraform passes), and a passing partial-coverage graph (B12).
- [ ] **Step 2: Run** `node --test templates/scripts/check-source-graph.test.mjs`; expect failure.
- [ ] **Step 3: Implement** `checkTree` as small independent rule functions over the model.
- [ ] **Step 4: Run** the focused test; expect pass.
- [ ] **Step 5: Stage, inspect, run global checks, commit** `feat: check graph structure and evidence`, and push.

### Task 6: Freshness, refresh records and the checker command

**Files:** Extend `templates/scripts/check-source-graph.mjs` and its test.

**Interfaces:** `checkPullRequest({ baseTree, headTree }) -> Finding[]` adds the refresh-record rules and the base-union rule; `checkRevision(tree)` adds the currency rule only; the CLI parses `--rev`, `--base` with `--head`, `--staged`, `--base` with `--staged`, `--json`, prints the checked revision or candidate tree ID, and exits 0, 1 or 2. Rules: a covered existing file needs a record whose `kit:blobId` equals its blob; a covered deleted file needs a `kit:deleted 1` record; a path covered in the base or the head scope that changed needs a record that differs from the base's; a path newly covered needs a record; a record must have exactly one of `kit:blobId` or `kit:deleted`, a valid outcome, and the `refresh-<hash>` name for its path; a record for a vanished path must be a deletion; changed paths under the graph root and outside the union scope are ignored. A head config that disables or relocates a graph the base enabled fails. Each failure names the path and prints the expected current blob ID.

- [ ] **Step 1: Write failing tests** for B8–B9 (changed file with no record fails naming the file; new in-scope file included; out-of-scope change passes; a refreshed record with `no-fact-change` passes), the three Review Focus cases (coverage narrowed in the same PR; deletion; disabled config), stale blob in a record, both-or-neither blob and deleted, newly covered file, staged mode with a tree ID, unknown revision exit 2, missing ontology Turtle exit 2, and the no-network/no-model static check.
- [ ] **Step 2: Run** the focused test; expect failure.
- [ ] **Step 3: Implement** the freshness rules and the CLI.
- [ ] **Step 4: Run** the focused test; expect pass.
- [ ] **Step 5: Stage, inspect, run global checks, commit** `feat: block unreviewed covered changes`, and push.

### Task 7: Graph reader

**Files:** Create `templates/scripts/query-source-graph.mjs`, `templates/scripts/query-source-graph.test.mjs`.

**Interfaces:** `search(graph, terms)`, `neighbors(graph, id)`, `findPaths(graph, from, to, { maxDepth })`, `coverageReport(graph, paths)`, `annotateStaleness(result, { graphTree, workingTree })`; CLI `search|node|neighbors|path|coverage` with `--rev`, `--working-rev`, `--max-depth` (default 4, ceiling 6) and `--json`. Output always carries the graph revision, the working revision, a `stale` flag, and per assertion its IRI, basis, relationship, endpoints and each evidence path, lines, role, blob and `current|changed|missing` status against the working revision. Paths list every edge separately and never add a synthetic edge. An empty result prints the applicable file coverage and, when none can be associated, the whole inventory with "topic coverage cannot be determined".

- [ ] **Step 1: Write failing tests** for B1 (concept to code, test and dependency with evidence and basis), B2 (A→B→C without A→C), B3 (absence plus coverage), B4 inferred labelled tentative, B5 revision and blob staleness, B12 partial coverage, B15 JSON consumption of a pinned commit, direction, depth ceiling and a cycle.
- [ ] **Step 2: Run** the focused test; expect failure.
- [ ] **Step 3: Implement** the reader and CLI over the shared model.
- [ ] **Step 4: Run** the focused test; expect pass.
- [ ] **Step 5: Stage, inspect, run global checks, commit** `feat: read the source graph with evidence and gaps`, and push.

### Task 8: Agent protocol, starter graph and runbook

**Files:** Create `templates/protocol/source-graph-protocol.md`, `templates/source-graph/manifest.ttl`, `templates/source-graph/nodes.ttl`, `templates/docs/source-knowledge-graph.md`; extend `tests/templates.test.mjs`.

**Interfaces:** The protocol is a marked block (`<!-- source-graph-protocol:start -->` … `end`) with `{{GRAPH_ROOT}}`. It tells the agent to consult the ontology and reader before a task and cite assertion, basis, source path, lines and revision; call an inference tentative; report absence with coverage; verify current source when stale; name an ontology conflict and use the ontology term; refresh affected assertions or record no fact change before a PR; write refresh records using `git rev-parse :<path>` blob IDs; never publish a guess without observations; run `--staged --base <merge base>` before commit. It is language-neutral and names no extractor. The starter manifest declares only the root-excluded coverage and passes the checker. Starter and runbook add `{{GRAPH_ROOT}}` to the known placeholders.

- [ ] **Step 1: Write failing tests** that the templates exist and are non-empty, use only known placeholders, that the starter graph passes the checker in a scratch repository, that the protocol names each required instruction, and that no installed Markdown contains a backticked PascalCase term.
- [ ] **Step 2: Run** the focused tests; expect failure.
- [ ] **Step 3: Write** the protocol, starter files and runbook (install, enable, evidence selectors, Terraform-only example, required check name, partial coverage, authoring loop, what a pass does not prove, upgrade).
- [ ] **Step 4: Run** the focused tests; expect pass.
- [ ] **Step 5: Stage, inspect, run global checks, commit** `feat: add the graph agent protocol and runbook`, and push.

### Task 9: Workflow and opt-in installation

**Files:** Create `templates/github/workflows/source-graph-check.yml`; modify `bin/install-ontology.mjs`, `tests/install-ontology.test.mjs`, `tests/templates.test.mjs`.

**Interfaces:** `buildPlan({ withSourceGraph: true, sourceGraphRoot })` adds the kit-owned scripts, their tests, the workflow, the schema and the runbook (kit-owned) and the starter manifest and nodes (adopter-owned, under the root). `--source-graph-root <path>` is validated like `--ontology-path`. A fresh `ontology.config.json` gains a `sourceGraph` section with defaults from the ontology path; an existing config is never edited, and the result carries a `configNotice` with the exact snippet. The protocol block is spliced by a generalised splice that leaves the ontology block and its existing tests untouched. The workflow has `contents: read`, no `secrets`, `fetch-depth: 0`, passes the base SHA through `env`, and runs the PR and push commands.

- [ ] **Step 1: Write failing tests** for the plan with and without the flag, byte-identical installed scripts, the workflow shape, idempotent second protocol splice, `--force` keeping the graph files, `--reset-content` restoring them, root validation, fresh and existing config behaviour, and an install without the flag adding nothing.
- [ ] **Step 2: Run** the focused tests; expect failure.
- [ ] **Step 3: Implement** the flag, plan entries, config injection, second splice and workflow.
- [ ] **Step 4: Run** the focused tests and `npm test`; expect pass.
- [ ] **Step 5: Stage, inspect, run global checks, commit** `feat: install the source graph opt-in`, and push.

### Task 10: Cross-language acceptance, documentation and ontology

**Files:** Create `tests/source-graph-acceptance.test.mjs`; modify `templates/scripts/source-graph-test-helpers.mjs`, `README.md`, `docs/ai-agent-install.md`, `docs/ontology.md`.

**Interfaces:** the widgets fixture from Task 5 is built for `csharp`, `typescript`, `java` and `python` (equivalent source, test and dependency files, ontology Turtle, graph files, records computed with `git hash-object`); a pilot variant adds Terraform and Docker Compose. The acceptance test asserts that normalised checker and reader output is identical across the four languages (B13), runs B1–B15 end to end against an installed repository (clean install, covered change blocked, refreshed change passes, reader sees the pinned commit), proves the installed commands work from a pure-Git checkout with the working tree removed, and proves the graph files install with `--force` intact.

- [ ] **Step 1: Write failing acceptance tests** for the four-language equivalence, the pilot (B14), the full installed loop, and the term checker over the installed repository.
- [ ] **Step 2: Run** `node --test tests/source-graph-acceptance.test.mjs`; expect failure.
- [ ] **Step 3: Implement** the fixture builders and update README (option table, install and migration), the install guide, and the repository ontology for any term the build introduced, in the same commit.
- [ ] **Step 4: Run** focused tests and `npm test`; expect pass. In a disposable GitHub repository, confirm the workflow runs on a PR and its check name can be required; if GitHub access is unavailable, state the branch-protection integration as unverified for the user's acceptance rather than claiming it passed.
- [ ] **Step 5: Stage, inspect, run global checks, commit** `feat: accept the source graph across languages`, and push.

## Behaviour coverage

| Behaviours | Proof tasks |
| --- | --- |
| B1–B3 | 7, 10 |
| B4–B5 | 7, 8, 10 |
| B6 | 7 (the reader shows each concept node's `kit:denotes` target so a conflict is visible), 8 (protocol instruction); the agent action is documented, not impersonated |
| B7 | 5 (inference needs evidence and basis), 7, 8 |
| B8–B9 | 6, 10 |
| B10 | 2–5 |
| B11 | 6 (static no-model/no-network test), 8, 9 |
| B12 | 4–5, 7, 10 |
| B13 | 1–2, 10 |
| B14 | 1, 5, 10 |
| B15 | 7, 10 |

## Execution

Each task is a separate commit and push on `feature/source-knowledge-graph/dev-build` after its focused tests, the ontology term check and `npm test` pass. Follow the [detailed implementation plan](../../../detailed-implementations/source-knowledge-graph/plan.md) for exact fixtures and interfaces. Do not start the build until this plan PR is reviewed and merged.
