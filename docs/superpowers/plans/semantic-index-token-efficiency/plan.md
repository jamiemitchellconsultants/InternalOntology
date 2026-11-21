# Semantic index token efficiency — task plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** every index search and passage response states and logs its `TokenEstimate` and respects the owner's `ResponseCap`; agents can read only the cited lines through `show`, get compact JSON search results, start with a shorter protocol that sends them to the graph first, and the pilot harness can measure each outcome. Serves B1–B16 in [feature.md](../../../features/semantic-index-token-efficiency/feature.md).

**Architecture:** two new shipped modules, `templates/scripts/semantic-index-tokens.mjs` (estimator and limiter) and `templates/scripts/semantic-index-token-log.mjs` (counts-only log); a passage reader added to `semantic-index-source.mjs`; `responseCap` validated in `ontology-config.mjs`; `show`, `usage` and `--compact` added to `semantic-index.mjs`; a shorter `templates/protocol/semantic-index-protocol.md`; and pilot functions added to `scripts/measure-semantic-index.mjs`. See [ADR 0037](../../../adr/0037-count-tokens-by-estimate-and-log-counts-locally.md), [ADR 0038](../../../adr/0038-add-a-passage-command-and-compact-output.md), [ADR 0039](../../../adr/0039-cap-responses-by-estimated-tokens.md) and [ADR 0040](../../../adr/0040-shorten-the-protocol-and-consult-the-graph-first.md).

**Tech stack:** Node 20+ built-ins and Git only; `node --test`.

**Spec:** [docs/features/semantic-index-token-efficiency/feature.md](../../../features/semantic-index-token-efficiency/feature.md), its [Architect] section and ADRs 0037–0040.

## Global Constraints

- Installed scripts stay byte-identical in every adopter; no repository-specific value in a script.
- No new dependency, service, workflow or network call. `show` and `usage` make no model request.
- `TokenEstimate` = character count (Unicode code points) of the rendered response, divided by 4, rounded up. Always labelled an estimate.
- Default `ResponseCap` is 4000 estimated tokens. `semanticIndex.responseCap`, when set, is a positive safe integer read only from the trusted committed configuration.
- The token log is `.ontology-index/token-log.jsonl`. When an append would take it past 1 MiB (1,048,576 bytes), it rotates once to `.ontology-index/token-log.1.jsonl`, replacing any older previous file. Each record is exactly `{ time, command, count, tokens, truncated }`, with no query text, source text or path.
- A failure to write the log is reported in the response and never changes the exit code.
- **Output is append-only (owner decision, 2026-11-21).** Every field and line that default search output carries today stays exactly as it is, in the same order. Responses only gain trailing items: `truncated` (only when over the cap), then `tokens: { estimate, estimated: true }`, then `tokenLog` (only when logging failed) in JSON, and the matching trailing lines in text. `status`, `refresh`, `download` and `upload` output stays fully byte-identical.
- The estimate covers the rendered response the caller receives, including any truncation marker, but excludes the `tokens` and `tokenLog` items themselves.
- `--compact` changes how results are presented, never which results are returned.
- Domain terms come from `docs/ontology.md`, which already defines `SearchTokenLog`, `TokenEstimate`, `ResponseCap`, `PassageExtract`, `ShowIndexedPassage` and `ReportIndexTokenUse`. Do not add synonyms.
- Write tests first. Each task ends in its own commit and push. Before each commit, run the task's focused test, `node scripts/check-ontology-terms.mjs` and `npm test`, and check the exit status of `npm test`.
- A shipped script never imports a file that the installer does not copy. Each new module is added to the installer in the same task that creates it.
- Tests are independent of the host's Git defaults (use `tests/helpers/temp-repo.mjs`), pass on Node 20, 22 and 24, and inject time through a `now` option instead of using timers.

## Review Focus

1. **A file with no trailing newline, or with CRLF line endings, passed to `show`.** The line count and the returned text must match the index's own line numbering exactly: the last line has no newline and `\r` is kept. This is pinned in Task 4.
2. **A cap smaller than the fixed fields of a response.** The response still succeeds, returns no results or no lines, and says what was omitted, never an empty response with no explanation. This is pinned in Tasks 5 and 6.
3. **A token log path that is a symbolic link or a directory, or a `.ontology-index` that is missing.** No write follows the link, the command still succeeds, and `tokenLog` says why nothing was recorded. This is pinned in Tasks 3 and 5.
4. **A corrupt or hand-edited token log line, or a log from a newer Kit.** `usage` skips the line, counts it as skipped, and still reports the rest. This is pinned in Task 3.
5. **`show` against a stale index, or with `--commit` naming HEAD after HEAD has moved.** The request is refused with the recovery message or the commit refusal, never served from the working tree or another commit. This is pinned in Task 6.

---

| # | Task | Behaviours |
| --- | --- | --- |
| 1 | Token estimator and limiter module, installer entry | B2, B8, B10 |
| 2 | `semanticIndex.responseCap` in trusted configuration | B9 |
| 3 | Token log module, installer entry | B1, B3 |
| 4 | Passage reader in the source module | B5 |
| 5 | Search: estimate, cap, log, `--compact`, append-only output | B1, B2, B6, B8, B9, B10 |
| 6 | `show` command | B5, B8, B10 |
| 7 | `usage` command and setup documentation | B3 |
| 8 | Shortened protocol with graph-first rule | B13, B15 |
| 9 | Pilot: estimates, compact relevance, cap, protocol, graph-first | B4, B7, B10, B14, B16 |
| 10 | Pilot: discovery cost from session transcripts | B11, B12 |
| 11 | Wrap-up: full suite, build review document, handoff | all |

### Task 1: Token estimator and limiter

**Files:** create `templates/scripts/semantic-index-tokens.mjs`, `tests/semantic-index-tokens.test.mjs`; modify `bin/install-ontology.mjs` (semantic index script list) and `tests/semantic-index-install.test.mjs` (expected script list).

**Interfaces — produces:** `estimateTokens(text: string): number`, and `fitToCap(total: number, render: (n: number) => string, cap: number): number`, which returns the largest `n` in `0..total` with `estimateTokens(render(n)) <= cap`, assuming `render` grows with `n`.

### Task 2: Response cap in trusted configuration

**Files:** modify `templates/scripts/ontology-config.mjs`, `templates/scripts/semantic-index-source.mjs` (`resolveIndexContext` error text), `tests/semantic-index-config.test.mjs` and `tests/semantic-index-cli.test.mjs`.

**Interfaces — produces:** `export const DEFAULT_RESPONSE_CAP = 4000` from `ontology-config.mjs`. An enabled `semanticIndex` policy gains `responseCap: number` (the default applies when it is unset). An invalid cap makes `resolveIndexContext` throw code `config`, with a message that names `semanticIndex.responseCap`.

### Task 3: Token log

**Files:** create `templates/scripts/semantic-index-token-log.mjs`, `tests/semantic-index-token-log.test.mjs`; modify the installer and the install test as in Task 1.

**Interfaces — produces:** `TOKEN_LOG_BYTES = 1_048_576`; `appendTokenRecord(root, record, { maxBytes }?): Promise<{ recorded: true } | { recorded: false, message: string }>`; `readTokenRecords(root): Promise<{ records, skipped }>`; and `summariseTokenUse(records, { since }?): { commands, totalTokens, meanTokens, largest, byCommand, since }`.

### Task 4: Passage reader

**Files:** modify `templates/scripts/semantic-index-source.mjs` and `tests/semantic-index-source.test.mjs`.

**Interfaces — produces:** `readIndexedLines(tree, scope, { path, startLine, endLine }): string[]`, where each element is one line including its newline. It throws an error with code `refused` and a reason.

### Task 5: Search with estimate, cap, log and compact output

**Files:** modify `templates/scripts/semantic-index.mjs` and `tests/semantic-index-cli.test.mjs`.

**Interfaces — consumes:** Tasks 1–3. **Produces:** `runIndexCommand(argv, { cwd, env, fetchImpl, releaseTransport, now })`, where `now` defaults to `() => new Date()`; the exported `formatIndexResponse(value): string`, the existing `format` renamed; the boolean `--compact` on `search`, which needs `--json`; and `truncated: { returned, omitted }` on a capped search.

### Task 6: `show`

**Files:** modify `templates/scripts/semantic-index.mjs` and `tests/semantic-index-cli.test.mjs`.

**Interfaces — consumes:** Tasks 1–5. **Produces:** `show --path <path> --lines <start>-<end> [--commit <sha>] [--json]`. The response adds `commit, path, startLine, endLine, text`, and when capped `truncated: { lastLine: number | null, nextLine: number }`. A refusal is exit 2 with code `refused`.

### Task 7: `usage`

**Files:** modify `templates/scripts/semantic-index.mjs`, `tests/semantic-index-cli.test.mjs` and `templates/docs/semantic-index.md`.

**Interfaces — consumes:** Task 3. **Produces:** `usage [--since <ISO time>] [--json]`, which reads only the local log and needs no semantic index configuration.

### Task 8: Shortened protocol

**Files:** modify `templates/protocol/semantic-index-protocol.md` and `tests/semantic-index-install.test.mjs`; create `tests/semantic-index-protocol.test.mjs`.

**Interfaces — consumes:** the command names from Tasks 5 and 6. **Produces:** the protocol text, which is fixed copy in the detailed plan.

### Task 9: Pilot measures

**Files:** modify `scripts/measure-semantic-index.mjs` and `tests/semantic-index-pilot.test.mjs`.

**Interfaces — consumes:** `estimateTokens` from Task 1. **Produces:** `compareEstimates`, `compactLocations`, `checkCap`, `protocolCost` and `graphFirstSavings`, plus a `--tokens <input.json>` CLI mode.

### Task 10: Pilot discovery cost

**Files:** modify `scripts/measure-semantic-index.mjs` and `tests/semantic-index-pilot.test.mjs`.

**Interfaces — consumes:** Task 9's `--tokens` mode. **Produces:** `discoveryFromTranscript(jsonl: string)` and `compareDiscovery(tasks)`.

### Task 11: Wrap-up

**Files:** create `docs/detailed-implementations/semantic-index-token-efficiency/build-review.md`.

Run the full suite, write the plain-language review of the new `.mjs` files and tests that AGENTS.md requires, tick the build criteria, and post the handoff to the user.

Details, tests and exact copy are in the [detailed plan](../../../detailed-implementations/semantic-index-token-efficiency/plan.md).
