# Semantic index token efficiency — build review

This is the plain-language review of the `.mjs` changes for feature #178, as AGENTS.md requires. It covers the build on `feature/semantic-index-token-efficiency/build` from `ba2ea41` to `43bf280`: ten task commits and one fix commit after the whole-branch review. The [detailed plan](plan.md) is the source of every value named here.

## What changed

### Shipped modules (installed by `--with-semantic-index`)

- `templates/scripts/semantic-index-tokens.mjs` is new. `estimateTokens` counts the characters (Unicode code points) of a text, divides by four and rounds up. `fitToCap` finds the largest number of leading items whose rendering stays within a cap, using a binary search. It imports nothing.
- `templates/scripts/semantic-index-token-log.mjs` is new. It holds the counts-only `SearchTokenLog`:
  - `appendTokenRecord` appends one line of `{ time, command, count, tokens, truncated }` to `.ontology-index/token-log.jsonl`. When the next line would take the log past 1 MiB, the current log is first moved to `token-log.1.jsonl`, replacing any older previous file. It refuses a store or log that is a symbolic link or not a regular file, opens the log with `O_NOFOLLOW`, and never throws. It reports a failure as a message instead.
  - `readTokenRecords` reads both files, previous first. It skips and counts any line that is not exactly a valid record, and any log file that is not a regular file.
  - `summariseTokenUse` totals the records, with an optional "since" time.
- `templates/scripts/ontology-config.mjs` accepts an optional `semanticIndex.responseCap`, which must be a positive safe integer. It exports `DEFAULT_RESPONSE_CAP = 4000`, and an enabled policy always carries the cap.
- `templates/scripts/semantic-index-source.mjs` has two changes:
  - `resolveIndexContext` keeps its fixed configuration message, but adds the validation text when the problem is the response cap.
  - New `readIndexedLines` returns the cited lines of one path from the indexed commit's tree. It uses the index's own line numbering, keeping `\r` and a last line with no newline. It refuses a path outside the approved scope, a missing path, a binary or non-UTF-8 file, and a range past the end of the file.
- `templates/scripts/semantic-index.mjs` has these changes:
  - Search output is append-only. The existing fields and lines are unchanged, followed by `truncated` (only when the cap cut the response), `tokens: { estimate, estimated: true }` and `tokenLog` (only when logging failed). Text output gains matching trailing lines.
  - `--compact` (JSON only) drops the commit from each result, since `indexCommit` already states it.
  - `show --path --lines [--commit]` returns only the cited lines, through the same helper (`measureAndLog`) that estimates, caps and logs search responses.
  - `usage [--since]` summarises the local log without reading the semantic index configuration.
  - `status`, `refresh`, `download` and `upload` output is unchanged.
  - The dirty check runs once per command, not once per step of the cap search.
- `templates/protocol/semantic-index-protocol.md` is shorter: 544 estimated tokens against 588. It keeps every rule, points agents at `search --compact` and `show`, and tells them to ask the graph reader first when `sourceGraph` is enabled and the reader is installed.
- `templates/docs/semantic-index.md` documents `responseCap`, `--compact`, `show`, `usage`, the token log and truncation.
- `bin/install-ontology.mjs` copies the two new modules.

### Repository-only pilot script

- `scripts/measure-semantic-index.mjs` gains these pure functions, used by the pilot runs that measure the outcomes:
  - `compareEstimates` (B4), `compactLocations` (B7), `checkCap` (B10), `protocolCost` (B14) and `graphFirstSavings` (B16);
  - `discoveryFromTranscript` and `compareDiscovery` (B11, B12).
- It also gains a `--tokens <input.json>` mode that reports only the sections it is given.
- `discoveryFromTranscript` reads a Claude Code session transcript up to and including the message that makes the first edit. It counts usage once per message id, distinct files read, search calls and index commands.

## Tests

All tests use temporary directories or `tests/helpers/temp-repo.mjs`, which isolates Git from the host's configuration. Time is injected through a `now` option, so no test uses a timer. `npm test` passed 841 tests at `43bf280` on the local Node; CI covers Node 20, 22 and 24.

### `tests/semantic-index-tokens.test.mjs`

- Setup: none. The tests call the two functions directly.
- What they do: they check exact estimates for empty, four-character, five-character, emoji and 16,000-character texts. They check that the same text always gives the same figure. They check that `fitToCap` keeps 10, 2 and 0 items for caps of 100, 5 and 0, and returns 0 when even the fixed part exceeds the cap.
- Expected: the estimate is the code-point count divided by four, rounded up, and `fitToCap` returns the largest count that fits.
- Limits: they do not compare the estimate with any model tokenizer. The pilot measures that (B4).

### `tests/semantic-index-token-log.test.mjs`

- Setup: a temporary directory with a `.ontology-index` folder.
- What they do:
  - check the exact bytes of one appended record;
  - append three records with a 150-byte limit and check that only the last two survive across the two files;
  - remove the store, and replace the log with a symbolic link, and check that a message is returned without throwing and that the link's target is untouched;
  - read a log with a malformed line and a record carrying an extra `query` field, and check the totals, the mean, the largest record, the per-command split and the since filter;
  - check that an absent log is an empty baseline;
  - check that a symbolic-linked log is not read and is counted as skipped.
- Expected: records hold counts only, rotation keeps one previous file, and failures and corruption are reported rather than raised.
- Limits: the tests do not exercise two processes writing at once, or the full 1 MiB size.

### `tests/semantic-index-config.test.mjs`

- Setup: in-memory configuration objects.
- What they do: check the 4000 default and an explicit 250. Check that 0, −1, 1.5, `"4000"`, `null`, `true` and 2^53 are rejected with a message naming `semanticIndex.responseCap`. Check that the key is still unknown on a disabled policy.
- Expected: only positive safe integers are accepted.
- Limits: validation only; how the cap is applied is covered by the CLI tests.

### `tests/semantic-index-source.test.mjs`

- Setup: a temporary repository with a CRLF file that has no final newline, a binary file, an excluded file and an out-of-scope file. One file is edited in the working tree after the commit.
- What it does: reads lines 2–3 from the commit. It then checks a refusal for the out-of-scope, excluded, traversal, missing, binary and past-the-end requests.
- Expected: the committed text comes back with `\r` kept, and each refusal has code `refused` and the documented reason.
- Limits: it does not test a file larger than the 8 MiB read bound.

### `tests/semantic-index-cli.test.mjs` (new tests)

- Setup: `withSearchRepo` indexes `src/` in a temporary repository through a fake embedding endpoint that records every request.
- Configuration:
  - an invalid cap is a configuration error that names the setting;
  - the error exits with 2 and makes no model request.
- Search:
  - JSON keeps its existing keys in order, with `tokens` last. The estimate equals the estimate of the rendered response. The log holds exactly one counts-only record, with no query or path text. `status` gains no estimate.
  - Text output is the existing output plus one "Estimated tokens" line.
  - `--compact` returns the same results without per-result commits, costs fewer tokens, and is rejected without `--json`.
  - A cap of 120 cuts the results and states how many were returned and omitted. The payload without the marker stays within the cap. An environment variable cannot raise the cap. The log records the truncation.
  - A cap of 1 returns no results, still succeeds, and the text says what was omitted.
  - A log path that is a directory leaves search successful, with `tokenLog` explaining why nothing was recorded.
- Show:
  - It returns only the cited committed lines, even with a working-tree edit, and is marked dirty. It logs a `show` record, and its text form ends with the estimate line.
  - It refuses another commit, an unapproved path and a range past the end of the file, with exit 2, no text and no log record. Malformed `--path`, `--lines` and `--commit` arguments are usage errors.
  - On a stale index it is refused with the recovery state.
  - A cap of 150 returns whole leading lines and names the next line. A single line longer than the cap returns no text, and the notice points to `git show`, with no blank line before it.
  - `--compact` is a usage error.
- Usage:
  - It reports an empty baseline first, then three commands after two searches and a show.
  - It still works when the index is disabled, makes no model request, and filters by `--since`.
  - It rejects `yesterday` and `1`.
- Cost:
  - A capped search and a capped show each run the dirty check once. A `git` shim on PATH counts the `git diff` calls, and PATH is restored afterwards.
- Limits: the embedding endpoint is fake, so ranking quality is not tested here; the pilot measures it (B7). The `git` shim test runs only on Unix-like systems.

### `tests/semantic-index-protocol.test.mjs`

- Setup: reads the template file.
- What it does:
  - checks each of 13 named rules by pattern, and names the rule on failure;
  - checks that the estimate is below the previous 588;
  - checks that the graph-first rule applies only when the graph is enabled and installed.
- Expected: no rule is dropped and the protocol is cheaper.
- Limits: the tests check the text, not agent behaviour. The pilot (B14) checks whether agents still follow each rule.

### `tests/semantic-index-install.test.mjs` (changed)

- What changed: the copy test now also lists the two new modules, so their installed copies must be byte-identical to the templates. The protocol test now checks that the text between the markers in `AGENTS.md` equals the template.
- Limits: as before, the tests use a temporary target repository.

### `tests/semantic-index-pilot.test.mjs` (new tests)

- Setup: in-memory inputs, plus temporary directories for the CLI tests.
- What they do:
  - check the estimate comparison's mean differences and its largest gap;
  - check that compact rows give the same hit rate as default rows;
  - check the largest response against the cap plus the notice;
  - check the protocol token change and a dropped rule;
  - check the graph-first totals and the uncited answers;
  - check the transcript reading: the deduplicated usage of 300, one file, two searches, one index command, a stop at the first edit, and an error on a non-JSON line;
  - check the per-task comparison, its totals, the incomplete tasks and the missing-note error;
  - check the `--tokens` CLI for the supplied sections only, for transcript paths, and for the no-section error.
- Expected: each function reports changes without setting targets.
- Limits: the transcript reader follows the Claude Code format, and other agents' figures are entered by hand. The CLI branch for compact relevance and malformed structural input are not tested; this script is not shipped.

## Known and accepted gaps

- The response can go over the cap by the size of the truncation notice, which B10 allows.
- The pilot script's structural input checks are thin. The ledger defers this because the script is repository-only.
- `--since` accepts calendar-invalid dates that `Date.parse` normalises, such as 2026-02-31.
