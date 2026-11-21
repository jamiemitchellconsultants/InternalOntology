# Semantic index token efficiency — detailed implementation plan

Run this after the [task plan](../../superpowers/plans/semantic-index-token-efficiency/plan.md) has been merged. First read the [behaviours and architecture](../../features/semantic-index-token-efficiency/feature.md) and ADRs 0037 to 0040. Work on `feature/semantic-index-token-efficiency/build`. Every task is a separate test-first commit and push. Before each commit, run the task's focused test, `node scripts/check-ontology-terms.mjs` and `npm test`, checking the exit status of each. Stage only that task's files, and review `git diff --cached` before committing.

The task plan's Global Constraints apply to every task, in particular the append-only output rule and the estimate definition. The code fragments here are contracts and complete tests, not implementation bodies; keep the test names as written. `docs/ontology.md` already defines every domain term used here, so do not change it unless a definition becomes inaccurate.

Shared test setup: `tests/semantic-index-cli.test.mjs` already has `withSearchRepo`. It indexes `src/` with `src/a.txt` containing `original\n` and `src/b.txt` containing `unchanged\n`, uses a fake embedding endpoint that records its inputs in `requested`, and exposes `run(...args)`, which appends `--json`. Tasks 2 and 5 to 7 add their tests to that file and import what they need at the top:

```js
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { estimateTokens } from "../templates/scripts/semantic-index-tokens.mjs";
import { formatIndexResponse, runIndexCommand } from "../templates/scripts/semantic-index.mjs";
```

Merge these with the file's existing imports rather than duplicating them.

## Task 1 — token estimator and limiter

**Files:** `templates/scripts/semantic-index-tokens.mjs` (new), `tests/semantic-index-tokens.test.mjs` (new), `bin/install-ontology.mjs`, `tests/semantic-index-install.test.mjs`.

**Interface:**

```js
// Characters are Unicode code points; the figure is always an estimate (ADR 0037).
export function estimateTokens(text) {}                // Math.ceil([...text].length / 4)
// Largest n in 0..total with estimateTokens(render(n)) <= cap; render must grow with n. Binary search.
export function fitToCap(total, render, cap) {}
```

The module imports nothing. In `bin/install-ontology.mjs`, add `"semantic-index-tokens"` to the `scripts` array in the `withSemanticIndex` block. In `tests/semantic-index-install.test.mjs`, add `"semantic-index-tokens.mjs"` to the `scripts` list on line 11, so the existing byte-identical copy assertion covers it.

**Test** (`tests/semantic-index-tokens.test.mjs`):

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { estimateTokens, fitToCap } from "../templates/scripts/semantic-index-tokens.mjs";

test("B2 estimates code points divided by four, rounded up", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("abcde"), 2);
  assert.equal(estimateTokens("😀😀😀😀"), 1);
  assert.equal(estimateTokens("x".repeat(16_000)), 4000);
});

test("B2 the same text always gives the same estimate", () => {
  const text = JSON.stringify({ path: "src/a.txt", startLine: 1, endLine: 9 });
  assert.equal(estimateTokens(text), estimateTokens(String(text)));
});

test("B8 fitToCap keeps the largest leading count that fits", () => {
  const render = (n) => "x".repeat(n * 10);
  assert.equal(fitToCap(10, render, 100), 10);
  assert.equal(fitToCap(10, render, 5), 2);
  assert.equal(fitToCap(10, render, 0), 0);
  assert.equal(fitToCap(0, render, 5), 0);
});

test("B10 fitToCap returns zero when the fixed part alone exceeds the cap", () => {
  assert.equal(fitToCap(3, (n) => "y".repeat(40 + n), 5), 0);
});
```

**Commit:** `feat: estimate response tokens and fit responses to a cap (#178)`.

## Task 2 — response cap in trusted configuration

**Files:** `templates/scripts/ontology-config.mjs`, `templates/scripts/semantic-index-source.mjs`, `tests/semantic-index-config.test.mjs`, `tests/semantic-index-cli.test.mjs`.

**Interface:** export `DEFAULT_RESPONSE_CAP = 4000` from `ontology-config.mjs`. In `validateSemanticIndex`, allow the key `responseCap` for an enabled policy only, so `{ enabled: false, responseCap }` is still an unknown-key error. When the key is present and is not a safe integer of at least 1, throw `` `${CONFIG_FILENAME}: semanticIndex.responseCap must be a positive integer of estimated tokens` ``. Add `responseCap: value.responseCap ?? DEFAULT_RESPONSE_CAP` to the returned enabled policy, after `release`.

In `resolveIndexContext`, keep the fixed config message. When the caught error's message starts with `` `${CONFIG_FILENAME}: semanticIndex.responseCap` ``, append `" "` and that message. No other configuration error changes, and no environment variable is read for the cap.

**Tests** (append to `tests/semantic-index-config.test.mjs`, and import `DEFAULT_RESPONSE_CAP`):

```js
test("B9 defaults the response cap to 4000 estimated tokens", () => {
  assert.equal(DEFAULT_RESPONSE_CAP, 4000);
  assert.equal(parse({ ...base, semanticIndex: policy }).responseCap, 4000);
  assert.equal(parse({ ...base, semanticIndex: { ...policy, responseCap: 250 } }).responseCap, 250);
});

test("B9 rejects a cap that is not a positive integer and names the setting", () => {
  for (const responseCap of [0, -1, 1.5, "4000", null, true, 2 ** 53]) {
    assert.throws(() => parse({ ...base, semanticIndex: { ...policy, responseCap } }), /semanticIndex\.responseCap must be a positive integer/);
  }
  assert.throws(() => parse({ ...base, semanticIndex: { enabled: false, responseCap: 10 } }), /unknown key/);
});
```

Append to `tests/semantic-index-cli.test.mjs`:

```js
test("B9 an invalid cap is a configuration error that names the setting and makes no model request", async () => {
  await withSearchRepo(async ({ policy, setPolicy, commit, options, requested, run }) => {
    setPolicy({ ...policy, responseCap: 0 });
    options.env.ONTOLOGY_INDEX_CONFIG_REF = commit();
    const result = await run("search", "--query", "query");
    assert.equal(result.exitCode, 2);
    assert.equal(result.value.code, "config");
    assert.match(result.value.message, /semanticIndex\.responseCap/);
    assert.deepEqual(requested, []);
  });
});
```

**Commit:** `feat: validate the semantic index response cap (#178)`.

## Task 3 — token log

**Files:** `templates/scripts/semantic-index-token-log.mjs` (new), `tests/semantic-index-token-log.test.mjs` (new), `bin/install-ontology.mjs`, `tests/semantic-index-install.test.mjs`.

**Interface:**

```js
export const TOKEN_LOG = "token-log.jsonl";
export const PREVIOUS_TOKEN_LOG = "token-log.1.jsonl";
export const TOKEN_LOG_BYTES = 1_048_576;
export async function appendTokenRecord(root, { time, command, count, tokens, truncated }, { maxBytes = TOKEN_LOG_BYTES } = {}) {}
export async function readTokenRecords(root) {}            // { records, skipped }, previous file first
export function summariseTokenUse(records, { since = null } = {}) {}
```

`appendTokenRecord` never throws. It runs these steps in order:

1. `lstat(join(root, ".ontology-index"))` must be a real directory. Otherwise it returns `{ recorded: false, message: "Token log not recorded: .ontology-index is not a directory." }`.
2. It writes the line as `JSON.stringify({ time, command, count, tokens, truncated }) + "\n"`, in that key order.
3. If the log exists and is not a regular file (a symbolic link or a directory), it returns `{ recorded: false, message: "Token log not recorded: the token log is not a regular file." }`.
4. If the log's size plus the line's byte length would pass `maxBytes`, it renames the log to `PREVIOUS_TOKEN_LOG`, replacing any older previous file.
5. It opens the log with `O_WRONLY | O_APPEND | O_CREAT | (O_NOFOLLOW ?? 0)` and mode `0o600`, writes the line and closes the file.
6. Any thrown error returns `{ recorded: false, message: "Token log not recorded: " + (error.code ?? error.message) + "." }`.

`readTokenRecords` reads `PREVIOUS_TOKEN_LOG`, then `TOKEN_LOG`, and treats a missing file as empty. It ignores empty lines. A line is counted in `skipped` when it is not JSON, when its keys are not exactly the five above, when `time` does not parse with `Date.parse`, when `command` is not `search` or `show`, when `count` or `tokens` is not a safe integer of at least 0, or when `truncated` is not a boolean.

`summariseTokenUse` keeps the records with `Date.parse(time) >= Date.parse(since)` when `since` is given. It returns `{ commands, totalTokens, meanTokens, largest, byCommand, since }`:

- `meanTokens` is the mean rounded to one decimal place, or 0 when there are no records.
- `largest` is `{ time, command, tokens }` for the record with the most tokens (the first one on a tie), or `null`.
- `byCommand` maps each command name, in sorted order, to `{ commands, totalTokens, meanTokens }`.
- `since` is the normalised ISO string, or `null`.

Add `"semantic-index-token-log"` to the installer's `scripts` array and `"semantic-index-token-log.mjs"` to the install test's list.

**Test** (`tests/semantic-index-token-log.test.mjs`):

```js
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { appendTokenRecord, readTokenRecords, summariseTokenUse } from "../templates/scripts/semantic-index-token-log.mjs";

const record = (time, command, tokens, extra = {}) => ({ time, command, count: 2, tokens, truncated: false, ...extra });

async function withStore(body) {
  const root = mkdtempSync(join(tmpdir(), "token-log-"));
  try {
    mkdirSync(join(root, ".ontology-index"));
    await body(root, join(root, ".ontology-index"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("B1 appends one counts-only record per response", async () => {
  await withStore(async (root, store) => {
    assert.deepEqual(await appendTokenRecord(root, record("2026-11-21T10:00:00.000Z", "search", 40)), { recorded: true });
    const text = readFileSync(join(store, "token-log.jsonl"), "utf8");
    assert.equal(text, '{"time":"2026-11-21T10:00:00.000Z","command":"search","count":2,"tokens":40,"truncated":false}\n');
  });
});

test("B1 rotates once at the size limit keeping one previous file", async () => {
  await withStore(async (root, store) => {
    for (const tokens of [1, 2, 3]) await appendTokenRecord(root, record("2026-11-21T10:00:00.000Z", "search", tokens), { maxBytes: 150 });
    assert.equal(readFileSync(join(store, "token-log.1.jsonl"), "utf8").trim().split("\n").length, 1);
    const { records, skipped } = await readTokenRecords(root);
    assert.deepEqual(records.map(({ tokens }) => tokens), [2, 3]);
    assert.equal(skipped, 0);
  });
});

test("B2 never throws and reports why a record was not written", async () => {
  await withStore(async (root, store) => {
    rmSync(store, { recursive: true });
    assert.match((await appendTokenRecord(root, record("2026-11-21T10:00:00.000Z", "show", 1))).message, /^Token log not recorded: \.ontology-index is not a directory/);
    mkdirSync(store);
    writeFileSync(join(root, "target.txt"), "");
    symlinkSync(join(root, "target.txt"), join(store, "token-log.jsonl"));
    const result = await appendTokenRecord(root, record("2026-11-21T10:00:00.000Z", "show", 1));
    assert.equal(result.recorded, false);
    assert.match(result.message, /not a regular file/);
    assert.equal(readFileSync(join(root, "target.txt"), "utf8"), "");
  });
});

test("B3 skips unreadable lines and summarises the rest", async () => {
  await withStore(async (root, store) => {
    writeFileSync(join(store, "token-log.jsonl"), [
      JSON.stringify(record("2026-11-20T09:00:00.000Z", "search", 100)),
      "not json",
      JSON.stringify({ ...record("2026-11-21T09:00:00.000Z", "search", 5), query: "leaked" }),
      JSON.stringify(record("2026-11-21T10:00:00.000Z", "show", 300)),
      JSON.stringify(record("2026-11-21T11:00:00.000Z", "search", 200)),
      "",
    ].join("\n"));
    const { records, skipped } = await readTokenRecords(root);
    assert.equal(skipped, 2);
    assert.deepEqual(summariseTokenUse(records), {
      commands: 3, totalTokens: 600, meanTokens: 200,
      largest: { time: "2026-11-21T10:00:00.000Z", command: "show", tokens: 300 },
      byCommand: { search: { commands: 2, totalTokens: 300, meanTokens: 150 }, show: { commands: 1, totalTokens: 300, meanTokens: 300 } },
      since: null,
    });
    const recent = summariseTokenUse(records, { since: "2026-11-21T10:00:00Z" });
    assert.equal(recent.commands, 2);
    assert.equal(recent.since, "2026-11-21T10:00:00.000Z");
  });
});

test("B3 an absent log is an empty baseline", async () => {
  await withStore(async (root) => {
    const { records, skipped } = await readTokenRecords(root);
    assert.deepEqual([records, skipped], [[], 0]);
    assert.deepEqual(summariseTokenUse(records), { commands: 0, totalTokens: 0, meanTokens: 0, largest: null, byCommand: {}, since: null });
    assert.equal(existsSync(join(root, ".ontology-index/token-log.jsonl")), false);
  });
});
```

**Commit:** `feat: keep a counts-only local token log for the index (#178)`.

## Task 4 — passage reader

**Files:** `templates/scripts/semantic-index-source.mjs`, `tests/semantic-index-source.test.mjs`.

**Interface:** `export function readIndexedLines(tree, scope, { path, startLine, endLine })`. It returns the requested lines, each with its line ending, using the same line regex as `pieces` (`/[^\n]*\n|[^\n]+$/g`), so the numbering matches the index's. It throws `problem("refused", reason)` with these reasons:

- `"The path is outside the approved index scope."` when `isIndexPath` fails, `isInScope` fails, or the path is not a regular blob in `tree`.
- `"The path has no indexed text."` when the blob contains a NUL byte or is not valid UTF-8. It reads with `readBounded(path, MAX_BLOB_BYTES)`.
- `` `Lines ${startLine}-${endLine} are outside ${path}, which has ${count} lines.` `` when `endLine > count`.

The caller (Task 6) validates `1 <= startLine <= endLine`.

**Test** (append to `tests/semantic-index-source.test.mjs`, adding the imports it needs: `withTempRepo`, `treeFromRevision` and `readIndexedLines`):

```js
test("B5 reads only the cited lines from the commit, not the working tree", async () => {
  await withTempRepo(async ({ dir, write, git }) => {
    write("src/a.txt", "one\ntwo\r\nthree");
    write("src/bin.dat", "A\0B");
    write("src/private/x.txt", "secret\n");
    write("other.txt", "outside\n");
    git("add", ".");
    git("commit", "-qm", "passages");
    const tree = treeFromRevision(dir, "HEAD");
    write("src/a.txt", "changed\n");
    const scope = { include: ["src/"], exclude: ["src/private/"] };
    assert.deepEqual(readIndexedLines(tree, scope, { path: "src/a.txt", startLine: 2, endLine: 3 }), ["two\r\n", "three"]);
    const refused = (path, startLine, endLine, pattern) => assert.throws(
      () => readIndexedLines(tree, scope, { path, startLine, endLine }),
      (error) => error.code === "refused" && pattern.test(error.message));
    refused("other.txt", 1, 1, /outside the approved index scope/);
    refused("src/private/x.txt", 1, 1, /outside the approved index scope/);
    refused("src/../other.txt", 1, 1, /outside the approved index scope/);
    refused("src/missing.txt", 1, 1, /outside the approved index scope/);
    refused("src/bin.dat", 1, 1, /no indexed text/);
    refused("src/a.txt", 3, 4, /Lines 3-4 are outside src\/a\.txt, which has 3 lines/);
  });
});
```

**Commit:** `feat: read cited lines from the indexed commit (#178)`.

## Task 5 — search with estimate, cap, log and compact output

**Files:** `templates/scripts/semantic-index.mjs`, `tests/semantic-index-cli.test.mjs`.

**Interface and rules:**

- Rename `format` to `export function formatIndexResponse(value)`, and have the main block use it. Its existing lines are unchanged and in the same order. It appends new lines after them: for a search `value.truncated`, `` `Truncated at the response cap: ${returned} results returned, ${omitted} omitted.` ``; for `value.tokens`, `` `Estimated tokens: ${estimate}` ``; and for `value.tokenLog`, the message itself.
- `runIndexCommand(argv, { cwd, env, fetchImpl, releaseTransport, now = () => new Date() })`.
- `parseCommand` accepts the boolean `--compact` on `search` only, treating it like `--json`. `--compact` without `--json` is the usage error `"--compact needs --json."`.
- After the search results are built and the readiness re-check passes, take `render = options.json ? JSON.stringify : formatIndexResponse` and `cap = context.policy.responseCap`, then work through these steps:
  1. Let `rows` be the results, with each result's `commit` removed when the response is compact. The response's `indexCommit` is the one commit for every row.
  2. Let `build(n) = { ok: true, ...describe(current, latest, commit), results: rows.slice(0, n) }`.
  3. Let `kept = fitToCap(rows.length, (n) => render(build(n)), cap)`.
  4. Take `payload = build(kept)`. When `kept < rows.length`, add `truncated: { returned: kept, omitted: rows.length - kept }` to it.
  5. The response is `{ ...payload, tokens: { estimate: estimateTokens(render(payload)), estimated: true } }`.
  6. Call `appendTokenRecord(context.root, { time: now().toISOString(), command: "search", count: kept, tokens: estimate, truncated: kept < rows.length })`. When it is not recorded, set `response.tokenLog = result.message`.
  7. Return `{ exitCode: 0, value: response }` without re-spreading `ok`, so the key order is exactly the existing keys, then `truncated`, `tokens`, `tokenLog`.
- Factor steps 3 to 6 into one local helper, `measureAndLog({ total, build, mark, render, cap, root, command, now })`, which Task 6 reuses. `mark(kept)` returns the `truncated` value.
- `status`, `refresh`, `download` and `upload` are untouched: no estimate and no log.

**Tests** (append to `tests/semantic-index-cli.test.mjs`):

```js
const DEFAULT_KEYS = ["ok", "state", "configurationCommit", "sourceCommit", "indexCommit", "committedOnly", "dirty", "results"];
const logLines = (dir) => readFileSync(join(dir, ".ontology-index/token-log.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));

test("B1, B2 and B6 append an estimate to search and keep the existing JSON unchanged", async () => {
  await withSearchRepo(async ({ dir, first, options, run }) => {
    options.now = () => new Date("2026-11-21T10:00:00.000Z");
    await run("refresh");
    const { value } = await run("search", "--query", "query");
    const { tokens, ...rest } = value;
    assert.deepEqual(Object.keys(rest), DEFAULT_KEYS);
    assert.equal(Object.keys(value).at(-1), "tokens");
    assert.deepEqual(rest.results.map(({ commit, path }) => [commit, path]), [[first, "src/a.txt"], [first, "src/b.txt"]]);
    assert.deepEqual(tokens, { estimate: estimateTokens(JSON.stringify(rest)), estimated: true });
    assert.deepEqual(logLines(dir), [{ time: "2026-11-21T10:00:00.000Z", command: "search", count: 2, tokens: tokens.estimate, truncated: false }]);
    assert.doesNotMatch(readFileSync(join(dir, ".ontology-index/token-log.jsonl"), "utf8"), /query|original|src\//);
    assert.equal(Object.hasOwn((await run("status")).value, "tokens"), false);
  });
});

test("B2 and B6 text search output gains only a trailing estimate line", async () => {
  await withSearchRepo(async ({ options, run }) => {
    await run("refresh");
    const { value } = await runIndexCommand(["search", "--query", "query"], options);
    const { tokens, ...rest } = value;
    const lines = formatIndexResponse(value).split("\n");
    assert.equal(lines.at(-1), "Estimated tokens: " + tokens.estimate);
    assert.equal(lines.slice(0, -1).join("\n"), formatIndexResponse(rest));
    assert.match(lines[1], /^"src\/a\.txt":1-1 1\.0000$/);
    assert.equal(tokens.estimate, estimateTokens(formatIndexResponse(rest)));
  });
});

test("B6 and B7 compact JSON states the commit once and returns the same results", async () => {
  await withSearchRepo(async ({ first, options, run }) => {
    await run("refresh");
    const full = (await run("search", "--query", "query")).value;
    const compact = (await run("search", "--query", "query", "--compact")).value;
    assert.equal(compact.indexCommit, first);
    assert.deepEqual(compact.results, full.results.map(({ commit, ...location }) => location));
    assert.ok(compact.tokens.estimate < full.tokens.estimate);
    assert.equal((await runIndexCommand(["search", "--query", "query", "--compact"], options)).value.code, "usage");
  });
});

test("B8, B9 and B10 cut search at the trusted cap and say what was omitted", async () => {
  await withSearchRepo(async ({ dir, write, policy, setPolicy, commit, options, run }) => {
    write("src/c.txt", "third\n");
    write("src/d.txt", "fourth\n");
    setPolicy({ ...policy, responseCap: 120 });
    options.env.ONTOLOGY_INDEX_CONFIG_REF = commit();
    options.env.ONTOLOGY_INDEX_RESPONSE_CAP = "100000";
    await run("refresh");
    const { exitCode, value } = await run("search", "--query", "query");
    assert.equal(exitCode, 0);
    const returned = value.results.length;
    assert.ok(returned >= 1 && returned < 4, "fixture should truncate between one and three results");
    assert.deepEqual(value.truncated, { returned, omitted: 4 - returned });
    const { tokens, tokenLog, ...payload } = value;
    assert.equal(tokens.estimate, estimateTokens(JSON.stringify(payload)));
    const { truncated, ...withoutMarker } = payload;
    assert.ok(estimateTokens(JSON.stringify(withoutMarker)) <= 120);
    assert.deepEqual(logLines(dir).at(-1), { ...logLines(dir).at(-1), count: returned, truncated: true });
  });
});

test("B8 a cap below the fixed fields returns no results and still succeeds", async () => {
  await withSearchRepo(async ({ policy, setPolicy, commit, options, run }) => {
    setPolicy({ ...policy, responseCap: 1 });
    options.env.ONTOLOGY_INDEX_CONFIG_REF = commit();
    await run("refresh");
    const { exitCode, value } = await run("search", "--query", "query");
    assert.equal(exitCode, 0);
    assert.deepEqual(value.results, []);
    assert.deepEqual(value.truncated, { returned: 0, omitted: 2 });
    const text = formatIndexResponse((await runIndexCommand(["search", "--query", "query"], options)).value);
    assert.match(text, /Truncated at the response cap: 0 results returned, 2 omitted\./);
  });
});

test("B2 a failed log write is reported without failing the search", async () => {
  await withSearchRepo(async ({ dir, run }) => {
    await run("refresh");
    mkdirSync(join(dir, ".ontology-index/token-log.jsonl"));
    const { exitCode, value } = await run("search", "--query", "query");
    assert.equal(exitCode, 0);
    assert.equal(typeof value.tokens.estimate, "number");
    assert.match(value.tokenLog, /^Token log not recorded: /);
    assert.equal(Object.keys(value).at(-1), "tokenLog");
  });
});
```

The B8 cap test relies on the fixture producing a response of roughly 200 characters before any results, and about 110 characters per result. If a SHA-256 repository makes this fixture fall outside one to three results, adjust only `responseCap` in the test, never the assertions.

**Commit:** `feat: estimate, cap and log index search responses (#178)`.

## Task 6 — `show`

**Files:** `templates/scripts/semantic-index.mjs`, `tests/semantic-index-cli.test.mjs`.

**Interface and rules:**

- `optionsFor.show = ["path", "lines", "commit"]`, and `show` takes `--json` as other commands do.
- Usage errors (code `usage`, exit 2):
  - no `--path`: `"Provide --path for show."`;
  - `--lines` that does not match `/^(\d+)-(\d+)$/` with `1 <= start <= end`: `"--lines must be <start>-<end> with 1 <= start <= end."`;
  - `--commit` that is not 40 or 64 lowercase hex characters: `"--commit must be a full commit ID."`.
- Update the unknown-command message to `"Use status, refresh, search, show, usage, download, or upload."`.
- Add `"refused"` to the argument codes in `runIndexCommand`'s catch, so a refusal exits with 2 and code `refused`.
- Flow:
  1. Inspect the index. If its state is not `current`, throw `problem(state, recovery[state])`.
  2. If `--commit` is given and differs from `reader.header.sourceCommit`, throw `problem("refused", "Show reads only the indexed commit " + reader.header.sourceCommit + ".")`.
  3. Read `lines = readIndexedLines(context.sourceTree, context.policy.scope, { path, startLine, endLine })`.
  4. Let `build(n) = { ok: true, ...describe(context, "current", commit), commit, path, startLine, endLine, text: lines.slice(0, n).join("") }`.
  5. Let `mark(kept) = { lastLine: kept ? startLine + kept - 1 : null, nextLine: startLine + kept }`.
  6. Reuse `measureAndLog` with `command: "show"` and `count: kept`.
- In `formatIndexResponse`, a `show` value prints after the dirty notice. It prints `` `${JSON.stringify(path)}:${startLine}-${endLine} at ${commit}` `` and then `text` with one trailing `\n` removed. A truncated show prints `` `Truncated at the response cap: lines ${startLine}-${lastLine} returned; request again from line ${nextLine}.` ``, or, when `lastLine` is `null`, `` `Truncated at the response cap: no lines returned; request again from line ${nextLine}.` ``.
- A refusal writes no log record and returns no `text`.

**Tests** (append):

```js
test("B5 show returns only the cited lines from the indexed commit", async () => {
  await withSearchRepo(async ({ dir, write, commit, options, run }) => {
    write("src/a.txt", "one\ntwo\nthree\n");
    const indexed = commit();
    options.now = () => new Date("2026-11-21T12:00:00.000Z");
    await run("refresh");
    write("src/a.txt", "working tree edit\n");
    const { exitCode, value } = await run("show", "--path", "src/a.txt", "--lines", "2-3", "--commit", indexed);
    assert.equal(exitCode, 0);
    assert.deepEqual([value.commit, value.path, value.startLine, value.endLine, value.text], [indexed, "src/a.txt", 2, 3, "two\nthree\n"]);
    assert.equal(value.dirty, true);
    const { tokens, ...payload } = value;
    assert.equal(tokens.estimate, estimateTokens(JSON.stringify(payload)));
    assert.deepEqual(logLines(dir).at(-1), { time: "2026-11-21T12:00:00.000Z", command: "show", count: 2, tokens: tokens.estimate, truncated: false });
    const text = formatIndexResponse((await runIndexCommand(["show", "--path", "src/a.txt", "--lines", "2-3"], options)).value);
    assert.match(text, new RegExp(`"src/a.txt":2-3 at ${indexed}\\ntwo\\nthree\\nEstimated tokens: \\d+$`));
  });
});

test("B5 show refuses another commit, an unapproved path and a range outside the file", async () => {
  await withSearchRepo(async ({ dir, write, commit, run }) => {
    write("unapproved.txt", "private\n");
    commit();
    await run("refresh");
    for (const args of [
      ["--path", "src/a.txt", "--lines", "1-1", "--commit", "0".repeat(40)],
      ["--path", "unapproved.txt", "--lines", "1-1"],
      ["--path", "src/a.txt", "--lines", "1-9"],
    ]) {
      const { exitCode, value } = await run("show", ...args);
      assert.equal(exitCode, 2, args.join(" "));
      assert.equal(value.code, "refused");
      assert.equal(Object.hasOwn(value, "text"), false);
    }
    for (const args of [["--lines", "1-1"], ["--path", "src/a.txt", "--lines", "3"], ["--path", "src/a.txt", "--lines", "0-2"],
      ["--path", "src/a.txt", "--lines", "4-2"], ["--path", "src/a.txt", "--lines", "1-1", "--commit", "abc"]]) {
      assert.equal((await run("show", ...args)).value.code, "usage", args.join(" "));
    }
    assert.throws(() => readFileSync(join(dir, ".ontology-index/token-log.jsonl")), /ENOENT/);
  });
});

test("B5 show on a stale index is refused with the recovery message", async () => {
  await withSearchRepo(async ({ write, commit, run }) => {
    await run("refresh");
    write("src/a.txt", "moved on\n");
    commit();
    const { exitCode, value } = await run("show", "--path", "src/a.txt", "--lines", "1-1");
    assert.equal(exitCode, 1);
    assert.equal(value.code, "stale");
  });
});

test("B8 and B10 a capped passage returns whole leading lines and names the next line", async () => {
  await withSearchRepo(async ({ write, policy, setPolicy, commit, options, run }) => {
    write("src/long.txt", Array.from({ length: 40 }, (_, i) => `line ${i + 1} with some text\n`).join(""));
    write("src/wide.txt", "w".repeat(4000) + "\n");
    setPolicy({ ...policy, responseCap: 150 });
    options.env.ONTOLOGY_INDEX_CONFIG_REF = commit();
    await run("refresh");
    const { exitCode, value } = await run("show", "--path", "src/long.txt", "--lines", "1-40");
    assert.equal(exitCode, 0);
    const kept = value.text.split("\n").length - 1;
    assert.ok(kept >= 1 && kept < 40);
    assert.ok(value.text.endsWith("\n"));
    assert.deepEqual(value.truncated, { lastLine: kept, nextLine: kept + 1 });
    const { tokens, truncated, ...withoutMarker } = value;
    assert.ok(estimateTokens(JSON.stringify(withoutMarker)) <= 150);
    const wide = (await run("show", "--path", "src/wide.txt", "--lines", "1-1")).value;
    assert.equal(wide.text, "");
    assert.deepEqual(wide.truncated, { lastLine: null, nextLine: 1 });
  });
});
```

**Commit:** `feat: add show to read one indexed passage (#178)`.

## Task 7 — `usage` and setup documentation

**Files:** `templates/scripts/semantic-index.mjs`, `tests/semantic-index-cli.test.mjs`, `templates/docs/semantic-index.md`.

**Interface and rules:**

- `optionsFor.usage = ["since"]`. A `--since` that `Date.parse` cannot read is the usage error `"--since must be an ISO 8601 time."`.
- `usage` does not call `resolveIndexContext` and makes no model request. It finds the root with `git rev-parse --show-toplevel` from `cwd`, then calls `readTokenRecords` and `summariseTokenUse`.
- The value is `{ ok: true, ...summary, skipped, estimated: true }`. When `commands` is 0, it adds `message: "No token log records yet, so no baseline exists."`.
- `formatIndexResponse` for a usage value prints these lines:
  - `` `Commands: ${commands}` ``
  - `` `Estimated tokens: ${totalTokens} total, ${meanTokens} mean per command` ``
  - when `largest` is set, `` `Largest: ${largest.tokens} (${largest.command} at ${largest.time})` ``
  - one line per command, `` `${name}: ${commands} commands, ${totalTokens} total, ${meanTokens} mean` ``
  - when `skipped` is not 0, `` `Skipped ${skipped} unreadable records.` ``
  - when `commands` is 0, only the message.
- In `templates/docs/semantic-index.md`:
  - add `"responseCap": 4000` to the configuration example, with a sentence saying it is optional, is measured in estimated tokens, and defaults to 4000;
  - under "Build and search", add `search ... --json --compact`, `show --path src/booking.ts --lines 10-30` and `usage --since 2026-11-01T00:00:00Z`;
  - add one paragraph saying that every search and show states an estimate, that `.ontology-index/token-log.jsonl` keeps counts only and rotates at 1 MiB, and that a response over the cap is cut, says what remains and is not an error.

  Keep the existing text unchanged, and write one line per paragraph.

**Tests** (append):

```js
test("B3 usage summarises the local log and reports an empty baseline", async () => {
  await withSearchRepo(async ({ dir, setPolicy, commit, options, requested, run }) => {
    const empty = await run("usage");
    assert.equal(empty.exitCode, 0);
    assert.equal(empty.value.commands, 0);
    assert.match(empty.value.message, /no baseline exists/);
    await run("refresh");
    const times = ["2026-11-20T09:00:00.000Z", "2026-11-21T09:00:00.000Z", "2026-11-21T10:00:00.000Z"];
    options.now = () => new Date(times.shift());
    await run("search", "--query", "query");
    await run("search", "--query", "query", "--compact");
    await run("show", "--path", "src/a.txt", "--lines", "1-1");
    const before = requested.length;
    setPolicy({ enabled: false });
    options.env.ONTOLOGY_INDEX_CONFIG_REF = commit();
    const all = await run("usage");
    assert.equal(all.value.commands, 3);
    assert.deepEqual(Object.keys(all.value.byCommand), ["search", "show"]);
    assert.equal(all.value.estimated, true);
    assert.equal((await run("usage", "--since", "2026-11-21T00:00:00Z")).value.commands, 2);
    assert.equal(requested.length, before);
    assert.match(formatIndexResponse(all.value), /^Commands: 3\nEstimated tokens: \d+ total, [\d.]+ mean per command\n/);
    assert.equal((await run("usage", "--since", "yesterday")).value.code, "usage");
    assert.ok(readFileSync(join(dir, ".ontology-index/token-log.jsonl"), "utf8").length > 0);
  });
});
```

**Commit:** `feat: add usage to report the local token baseline (#178)`.

## Task 8 — shortened protocol with graph-first rule

**Files:** `templates/protocol/semantic-index-protocol.md`, `tests/semantic-index-protocol.test.mjs` (new), `tests/semantic-index-install.test.mjs`.

**Exact copy.** Replace the whole template with this text (2,175 characters, an estimate of 544 tokens against 588 before):

````markdown
## Semantic index protocol

Use this only when `scripts/semantic-index.mjs` exists and `semanticIndex.enabled` is true in `ontology.config.json`. Each command below runs as `node scripts/semantic-index.mjs <command>`.

### When to use it

Use the index to locate code, tests or documentation when you do not know the file, symbol or subsystem; skip it when the task names one. Read the ontology first and use its terms in queries. If `sourceGraph` is enabled and `scripts/query-source-graph.mjs` exists, ask the graph first with `node scripts/query-source-graph.mjs search <term>`, and search the index only when the reader reports the area as unknown, excluded or empty.

### How to use it

1. Run `status --json`. If the state is `missing`, `stale`, `incompatible` or `unreadable`, run `refresh --json` once, unless the task or the user has said not to: refresh sends approved source to the configured embedding endpoint.
2. Run `search --query "<one focused question>" --limit 5 --json --compact` and read the first relevant result before searching again.
3. If refresh or search still fails, report the error and use exact search. Do not retry in a loop, edit `.ontology-index/` by hand, or remove `.ontology-index/writer.lock` without checking its recorded PID and hostname.

### Results are leads, not evidence

Before relying on a result, read its cited lines with `show --path <path> --lines <start>-<end> --json` or `git show <commit>:<path>`. Cite the commit, path and line range, never the score alone. A dirty notice means approved files have uncommitted edits, so read the working tree before changing them. A truncated response says what it left out; request the rest only if you need it. An empty result is not proof that nothing exists: say the index found nothing within its scope and confirm with exact search. When the index conflicts with the ontology, use the ontology term and name the conflict.

### What you must not do

Do not run `upload` or `download` unless the task asks for a release snapshot. Do not add endpoints, tokens or model settings to Git. Do not widen `semanticIndex.scope` to make a query succeed; only a maintainer changes settings.
````

**Tests** (`tests/semantic-index-protocol.test.mjs`):

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { estimateTokens } from "../templates/scripts/semantic-index-tokens.mjs";

const text = readFileSync(new URL("../templates/protocol/semantic-index-protocol.md", import.meta.url), "utf8");
// Estimate of the protocol before feature #178 (2,352 characters).
const PREVIOUS_TOKENS = 588;

const rules = {
  "applies only when installed and enabled": [/`scripts\/semantic-index\.mjs` exists/, /`semanticIndex\.enabled` is true/],
  "when to use and when to skip": [/do not know the file, symbol or subsystem/, /skip it when the task names one/],
  "ontology first": [/Read the ontology first and use its terms/],
  "status and refresh check": [/`status --json`/, /`missing`, `stale`, `incompatible` or `unreadable`/, /`refresh --json` once/, /sends approved source/],
  "one focused query": [/one focused question/, /read the first relevant result before searching again/],
  "failure handling": [/report the error and use exact search/, /Do not retry in a loop/, /writer\.lock/, /PID and hostname/],
  "results are leads": [/leads, not evidence/, /never the score alone/],
  "read cited lines at the cited commit": [/`show --path <path> --lines <start>-<end> --json`/, /`git show <commit>:<path>`/],
  "dirty notice": [/dirty notice/, /read the working tree before changing them/],
  "empty result": [/not proof that nothing exists/, /confirm with exact search/],
  "ontology conflict": [/use the ontology term and name the conflict/],
  "prohibitions": [/`upload` or `download`/, /endpoints, tokens or model settings/, /widen `semanticIndex\.scope`/, /only a maintainer changes settings/],
  "graph first": [/`sourceGraph` is enabled/, /`node scripts\/query-source-graph\.mjs search <term>`/, /unknown, excluded or empty/],
};

test("B13 the shortened protocol keeps every rule an agent needs", () => {
  for (const [rule, patterns] of Object.entries(rules)) {
    for (const pattern of patterns) assert.match(text, pattern, rule);
  }
});

test("B13 and B14 the protocol costs fewer estimated tokens than before", () => {
  assert.ok(estimateTokens(text) < PREVIOUS_TOKENS, `estimate ${estimateTokens(text)} is not below ${PREVIOUS_TOKENS}`);
});

test("B15 the graph-first rule is conditional on the graph being enabled and installed", () => {
  assert.match(text, /If `sourceGraph` is enabled and `scripts\/query-source-graph\.mjs` exists, ask the graph first/);
  assert.match(text, /search the index only when the reader reports/);
});
```

In `tests/semantic-index-install.test.mjs`, extend the test that splices the protocol once and leaves it out without the flag. Assert that the text between the start and end markers in the installed `AGENTS.md`, trimmed, equals the template file's text, trimmed. This proves the installed copy is identical to the template.

**Commit:** `feat: shorten the semantic index protocol and consult the graph first (#178)`.

## Task 9 — pilot measures

**Files:** `scripts/measure-semantic-index.mjs`, `tests/semantic-index-pilot.test.mjs`.

**Interface** (export each function and import `estimateTokens` from `../templates/scripts/semantic-index-tokens.mjs`):

```js
// B4. samples: [{ id, estimate, independent }]; independent is a positive integer. difference = estimate - independent.
export function compareEstimates(samples) {}   // { samples, meanDifference, meanRelativeDifference, largest: { id, difference } }
// B7. Expands a compact search response into rows measurePilot accepts.
export function compactLocations(response) {}  // results.map(r => ({ commit: response.indexCommit, ...r }))
// B10. responses: [{ id, tokens }]
export function checkCap({ cap, notice, responses }) {}  // { cap, notice, largest: { id, tokens }, withinCap: largest.tokens <= cap + notice }
// B14. runs: [{ protocol: "previous" | "current", followed: [ruleId] }]
export function protocolCost({ previousText, currentText, rules, runs }) {}  // { previousTokens, currentTokens, change, dropped }
// B16. questions: [{ id, previous: { searches, tokens }, current: { searches, tokens }, citesEvidence }]
export function graphFirstSavings(questions) {}  // { questions, previous, current, change, uncited }
```

The rules for these functions:

- Each function throws when its input is empty, or when a count is not a safe integer of at least 0. `compareEstimates([])` throws `"Supply at least one estimate sample."`, and a sample whose `independent` is not a positive integer throws `"Sample <id> needs a positive independent count."`.
- `meanDifference` and `meanRelativeDifference` are rounded to four decimal places.
- `largest` is the sample with the largest absolute difference, the first on a tie.
- In `protocolCost`, `dropped` lists, in `rules` order, the rule IDs that some previous run followed and no current run followed. An unknown rule ID throws `"Unknown rule ID <id>."`, and an unknown protocol name throws `"Unknown protocol <name>."`.
- `change` is current minus previous for each figure.
- `uncited` lists the IDs whose `citesEvidence` is not `true`.

In the existing CLI, when every question has a `compact` response, it also reports `compactHits` and `compactRate`. These come from `measurePilot` run with `semantic: compactLocations(question.compact)`.

Add a CLI mode, `node scripts/measure-semantic-index.mjs --tokens <input.json>`. The input may contain any of these sections, and the output JSON carries only the sections the input supplied, under these names:

| Input key | Shape | Output key |
| --- | --- | --- |
| `estimates` | the `compareEstimates` samples | `estimates` |
| `cap` | the `checkCap` argument | `cap` |
| `protocol` | `{ previous: <file>, current: <file>, rules, runs }` | `protocol` |
| `graphQuestions` | the `graphFirstSavings` questions | `graphFirst` |
| `tasks` | as in Task 10 | `discovery` |

Paths are relative to the input file's directory. An input with none of these sections is the error `"Supply at least one of estimates, cap, protocol, graphQuestions or tasks."`.

**Tests** (append):

```js
test("B4 compares estimates with an independent count and names the largest gap", () => {
  assert.deepEqual(compareEstimates([{ id: "a", estimate: 110, independent: 100 }, { id: "b", estimate: 90, independent: 100 }, { id: "c", estimate: 130, independent: 100 }]),
    { samples: 3, meanDifference: 10, meanRelativeDifference: 0.1, largest: { id: "c", difference: 30 } });
  assert.throws(() => compareEstimates([]), /estimate/i);
  assert.throws(() => compareEstimates([{ id: "a", estimate: 1, independent: 0 }]), /independent/);
});

test("B7 compact results give the same hits as default results", () => {
  const commit = "1".repeat(40);
  const hit = { commit, path: "src/rule.txt", startLine: 3, endLine: 4 };
  const locate = () => true;
  const compact = { indexCommit: commit, results: [{ path: hit.path, startLine: 3, endLine: 4, score: 0.9 }] };
  const rows = compactLocations(compact);
  assert.deepEqual(rows, [{ ...hit, score: 0.9 }]);
  const questions = (semantic) => [{ id: "q", expected: [hit], semantic, keyword: [] }];
  assert.equal(measurePilot({ commit, locate, questions: questions(rows) }).semanticRate,
    measurePilot({ commit, locate, questions: questions([{ ...hit, score: 0.9 }]) }).semanticRate);
});

test("B10 checks the largest response against the cap plus the notice", () => {
  assert.deepEqual(checkCap({ cap: 100, notice: 20, responses: [{ id: "a", tokens: 90 }, { id: "b", tokens: 115 }] }),
    { cap: 100, notice: 20, largest: { id: "b", tokens: 115 }, withinCap: true });
  assert.equal(checkCap({ cap: 100, notice: 20, responses: [{ id: "a", tokens: 121 }] }).withinCap, false);
});

test("B14 reports the protocol's token change and any rule no longer followed", () => {
  const report = protocolCost({ previousText: "x".repeat(400), currentText: "x".repeat(300), rules: ["leads", "refresh", "empty"],
    runs: [{ protocol: "previous", followed: ["leads", "refresh"] }, { protocol: "current", followed: ["leads"] }] });
  assert.deepEqual(report, { previousTokens: 100, currentTokens: 75, change: -25, dropped: ["refresh"] });
  assert.throws(() => protocolCost({ previousText: "", currentText: "", rules: ["a"], runs: [{ protocol: "current", followed: ["b"] }] }), /rule/);
});

test("B16 totals graph-first searches and tokens and lists uncited answers", () => {
  assert.deepEqual(graphFirstSavings([
    { id: "a", previous: { searches: 3, tokens: 900 }, current: { searches: 0, tokens: 200 }, citesEvidence: true },
    { id: "b", previous: { searches: 1, tokens: 300 }, current: { searches: 1, tokens: 300 }, citesEvidence: false },
  ]), { questions: 2, previous: { searches: 4, tokens: 1200 }, current: { searches: 1, tokens: 500 }, change: { searches: -3, tokens: -700 }, uncited: ["b"] });
});

test("B4, B10, B14 and B16 the --tokens CLI reports only the supplied sections", async () => {
  await withTempRepo(async ({ dir, write }) => {
    write("previous.md", "x".repeat(40));
    write("current.md", "x".repeat(20));
    write("tokens.json", JSON.stringify({
      cap: { cap: 10, notice: 2, responses: [{ id: "a", tokens: 11 }] },
      protocol: { previous: "previous.md", current: "current.md", rules: ["r"], runs: [{ protocol: "previous", followed: ["r"] }, { protocol: "current", followed: ["r"] }] },
    }));
    const script = fileURLToPath(new URL("../scripts/measure-semantic-index.mjs", import.meta.url));
    const report = JSON.parse(execFileSync(process.execPath, [script, "--tokens", join(dir, "tokens.json")], { encoding: "utf8" }));
    assert.deepEqual(Object.keys(report), ["cap", "protocol"]);
    assert.equal(report.cap.withinCap, true);
    assert.deepEqual(report.protocol, { previousTokens: 10, currentTokens: 5, change: -5, dropped: [] });
    write("none.json", "{}");
    assert.throws(() => execFileSync(process.execPath, [script, "--tokens", join(dir, "none.json")], { stdio: "pipe" }), /Supply at least one/);
  });
});
```

Update the test file's import line to bring in the new functions.

**Commit:** `feat: measure token estimates, cap, protocol and graph-first savings (#178)`.

## Task 10 — pilot discovery cost

**Files:** `scripts/measure-semantic-index.mjs`, `tests/semantic-index-pilot.test.mjs`.

**Interface:**

```js
// B11. Reads a Claude Code session transcript (JSON Lines) up to and including the message that makes the first edit.
export function discoveryFromTranscript(jsonl) {}  // { inputTokens, filesOpened, searchCalls, indexCommands, edited }
// B12. tasks: [{ id, note, baseline, withIndex, withoutIndex }], each a figures object as returned above.
export function compareDiscovery(tasks) {}  // { tasks: [{ id, note, withIndex, vsBaseline, vsWithoutIndex }], totals: { withIndex, vsBaseline, vsWithoutIndex }, incomplete }
```

`discoveryFromTranscript` follows these rules. Session records are the only source of these counts (U8), and other agents' transcripts can be converted to the same figures by hand.

- Parse each non-empty line as JSON. A line that is not JSON throws `"Transcript line <n> is not JSON."`.
- Consider only lines with `type === "assistant"`. Count usage once per `message.id`: `input_tokens + (cache_creation_input_tokens ?? 0) + (cache_read_input_tokens ?? 0)`.
- For each `tool_use` item in `message.content`, by its `name`:
  - `"Edit"`, `"Write"`, `"MultiEdit"` or `"NotebookEdit"` stops the scan after this message, with `edited: true`;
  - `"Read"` adds `input.file_path` to a set of opened files;
  - `"Grep"` or `"Glob"` adds one to `searchCalls`;
  - `"Bash"` adds one to `indexCommands` when `input.command` contains `semantic-index.mjs`, and otherwise adds one to `searchCalls` when the command matches `/^\s*(?:rg|grep|git\s+grep|find)\b/`.
- `filesOpened` is the size of the set of opened files.

`compareDiscovery` computes `vsBaseline` and `vsWithoutIndex` as `withIndex` minus the other figure, for each of the four counts, and sums them into `totals`. It throws `"Task <id> needs a developer note."` when `note` is not a non-empty string. `incomplete` lists the task IDs where any of the three figures has `edited === false`.

In `--tokens` mode, each of a task's `baseline`, `withIndex` and `withoutIndex` is either a transcript path, read and passed to `discoveryFromTranscript`, or a figures object used as it is.

**Tests** (append):

```js
const assistant = (id, content, usage = { input_tokens: 10, cache_read_input_tokens: 90 }) =>
  JSON.stringify({ type: "assistant", message: { id, content, usage } });
const tool = (name, input) => ({ type: "tool_use", name, input });

test("B11 counts discovery up to the first edit from a session transcript", () => {
  const jsonl = [
    JSON.stringify({ type: "user", message: { content: "find the refund rule" } }),
    assistant("m1", [tool("Bash", { command: "node scripts/semantic-index.mjs search --query refund --json --compact" })]),
    assistant("m1", [tool("Read", { file_path: "src/refund.ts" })]),
    assistant("m2", [tool("Grep", { pattern: "refund" }), tool("Bash", { command: "rg refund src" }), tool("Read", { file_path: "src/refund.ts" })]),
    assistant("m3", [tool("Edit", { file_path: "src/refund.ts" })]),
    assistant("m4", [tool("Read", { file_path: "src/after.ts" })]),
  ].join("\n");
  assert.deepEqual(discoveryFromTranscript(jsonl), { inputTokens: 300, filesOpened: 1, searchCalls: 2, indexCommands: 1, edited: true });
  assert.equal(discoveryFromTranscript(assistant("m1", [tool("Read", { file_path: "a" })])).edited, false);
  assert.throws(() => discoveryFromTranscript("{}\nnot json"), /line 2 is not JSON/);
});

test("B12 compares each task with the baseline and with running without the index", () => {
  const figures = (inputTokens, filesOpened, searchCalls, indexCommands, edited = true) => ({ inputTokens, filesOpened, searchCalls, indexCommands, edited });
  const report = compareDiscovery([
    { id: "t1", note: "trusted the first result", baseline: figures(1000, 4, 3, 2), withIndex: figures(600, 2, 1, 2), withoutIndex: figures(1500, 6, 5, 0) },
    { id: "t2", note: "needed one exact search", baseline: figures(500, 2, 1, 1), withIndex: figures(500, 2, 1, 1), withoutIndex: figures(400, 2, 2, 0, false) },
  ]);
  assert.deepEqual(report.tasks[0].vsBaseline, { inputTokens: -400, filesOpened: -2, searchCalls: -2, indexCommands: 0 });
  assert.deepEqual(report.totals.vsWithoutIndex, { inputTokens: -800, filesOpened: -4, searchCalls: -5, indexCommands: 3 });
  assert.deepEqual(report.incomplete, ["t2"]);
  assert.throws(() => compareDiscovery([{ id: "t3", note: "", baseline: figures(1, 1, 1, 1), withIndex: figures(1, 1, 1, 1), withoutIndex: figures(1, 1, 1, 1) }]), /t3 needs a developer note/);
});
```

**Commit:** `feat: measure discovery cost per task from session transcripts (#178)`.

## Task 11 — wrap-up

1. Run `npm test` and confirm it exits with 0. Then run `node scripts/check-ontology-terms.mjs`, and run the shipped test files alone from `templates/scripts/`, as CI does.
2. Check `git log --oneline main..` and confirm there is one commit for each of Tasks 1 to 10, each pushed.
3. Write `docs/detailed-implementations/semantic-index-token-efficiency/build-review.md`, the plain-language review that AGENTS.md requires for `.mjs` files. For each new or changed module, say what it does. For each test file listed in Tasks 1 to 10, give the setup, what each test does, the expected results and the limits of what it verifies. Write one line per paragraph or list item. Commit it as `docs: describe the token efficiency build for review (#178)`.
4. Tick the [Dev] Build criteria on #178 with `node scripts/feature.mjs tick`. Post the developer-to-user handoff, naming the branch and saying that the user persona opens the build pull request from `feature/semantic-index-token-efficiency/build`. Then stop at the checkpoint.
