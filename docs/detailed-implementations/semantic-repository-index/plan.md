# Semantic Repository Index — detailed implementation plan

Start the build after the [implementation plan](../../superpowers/plans/semantic-repository-index/plan.md) merges and the `dev-build` gate opens. Work from the merged `main` in the existing dedicated feature worktree. Read the [accepted behaviours](../../features/semantic-repository-index/02-behaviours.md) and the [architecture and ADRs](../../features/semantic-repository-index/03-architecture.md). The seven task orders and interfaces below are the build contract.

**Every task:** Write the stated tests first and run the focused command. Confirm the test fails because the contract is absent. Implement the stated interface and rerun focused tests. Stage the task files, review `git diff --cached --name-only` and `git diff --cached`, run `node scripts/check-ontology-terms.mjs`, then run `npm test`. Both validation commands must exit zero before committing and pushing. Push each task before starting the next. Test excerpts below are complete executable files for their core cases. Add the enumerated regressions in the same files before implementation and keep their assertions as specified.

## T1 — Validate owner settings

**Files:** Modify `templates/scripts/ontology-config.mjs`. Create `tests/semantic-index-config.test.mjs`.

**Produces:** Extend existing `validateConfig(raw, { ontologyExists })`. It returns `semanticIndex: null` when the key is absent and `{ enabled: false }` for a disabled starter. An enabled value has `scope: { include, exclude }`, `embedding: { endpoint, model, revision, dimensions, documentPrefix, queryPrefix }`, and `release: null` or `{ repository, publishers }`. Configuration contains no credentials. Keep validation self-contained in the existing config module so core-only installs can parse the new key.

- [ ] Create `tests/semantic-index-config.test.mjs`.

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { validateConfig } from "../templates/scripts/ontology-config.mjs";

const base = { ontologyPath: "docs/ontology.md", sections: { required: [], optional: [] } };
const policy = {
  enabled: true,
  scope: { include: ["src/", "docs/ontology.md", "src/"], exclude: ["src/private/"] },
  embedding: { endpoint: "http://127.0.0.1:11434/v1/embeddings", model: "pilot", revision: "r1", dimensions: 2 },
};
const parse = (raw) => validateConfig(raw, { ontologyExists: () => true }).semanticIndex;

test("B13 preserves the disabled and absent cases for core-only installs", () => {
  assert.equal(parse(base), null);
  assert.deepEqual(parse({ ...base, semanticIndex: { enabled: false } }), { enabled: false });
  assert.throws(() => parse({ ...base, semanticIndex: { enabled: true } }), /scope/);
});

test("B14 and B15 normalize purpose prefixes and scope independently of the host", () => {
  const result = parse({ ...base, semanticIndex: policy });
  assert.deepEqual(result.scope, { include: ["docs/ontology.md", "src/"], exclude: ["src/private/"] });
  assert.equal(result.embedding.documentPrefix, "");
  assert.equal(result.embedding.queryPrefix, "");
  assert.equal(result.release, null);
});

test("B16 rejects credentials and endpoint overrides in committed JSON", () => {
  for (const endpoint of ["http://example.test/v1/embeddings", "https://key@example.test/v1/embeddings", "https://example.test/v1/embeddings?token=x"]) {
    assert.throws(() => parse({ ...base, semanticIndex: { ...policy, embedding: { ...policy.embedding, endpoint } } }), /endpoint/);
  }
  assert.throws(() => parse({ ...base, semanticIndex: { ...policy, token: "secret" } }), /unknown key/);
  assert.throws(() => parse({ ...base, semanticIndex: { ...policy, scope: { include: ["src/../private"] } } }), /scope/);
});
```

- [ ] Add assertions for unknown keys within scope, embedding and release, disabled settings with only the starter key, invalid dimensions, non-empty model and revision, and malformed release identifiers. Assert that `github.com/Owner/Repo` and `DEV` in a publisher list become `github.com/owner/repo` and `dev`. Preserve filename case in scope selectors.
- [ ] Run `node --test tests/semantic-index-config.test.mjs` and confirm red.
- [ ] Implement the optional validation. Reject empty include arrays and reject empty, absolute, backslash-containing, or dot-component selectors. Sort and deduplicate both selector lists and default `exclude` to `[]`. Full `endpoint` URLs must have a path, omit URL credentials, query and fragment, and use HTTPS or HTTP to a literal loopback address or `localhost`. Dimensions are integers from 1 to 8192. Prefixes default to empty strings and are bounded with request inputs. Release IDs are plain `host/owner/repo`, with unambiguous host, owner and repository components. Normalize GitHub names for comparison. Require at least one publisher if specifying `publishers`, and default that list to `[]` for download-only use. Validate before opening a network client. Reuse existing object, unknown-key and path validation conventions.
- [ ] Rerun the focused test and the common validation. Commit `feat: validate semantic index settings`. Push `feature/semantic-repository-index/dev-build` and set upstream on this task’s first push.

## T2 — Read approved committed source

**Files:** Modify `templates/scripts/source-graph-git.mjs`. Create `templates/scripts/semantic-index-source.mjs` and `tests/semantic-index-source.test.mjs`.

**Consumes:** `treeFromRevision(cwd, rev)` and the extended `validateConfig` from T1. **Produces:** Git tree methods `entryMode(path)` and `readBounded(path, maxBytes)`. Export `resolveIndexContext(cwd, env)` returning `{ root, sourceTree, configurationCommit, policy, scopeDigest, embeddingDigest }`, `listIndexEntries(tree, scope)` returning ordered `{ path, blobId }` records, `readIndexPassages(tree, entry)` returning ordered `{ path, blobId, startLine, endLine, position, text }` records, and `hasIndexEdits(context)` returning whether an approved path differs in the stage or worktree. Export `hashScope(scope)`, `hashEmbedding(embedding)`, and `verifyIndexSource(tree, scope, records)` to validate an async stream of ordered passage references against the reproducible set generated from that tree. Policy disabled uses error code `disabled`, missing or invalid trusted policy uses `config`, and missing `HEAD` uses `unborn`. Each stops before looking up the model.

- [ ] Create `tests/semantic-index-source.test.mjs`.

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { withTempRepo } from "./helpers/temp-repo.mjs";
import { resolveIndexContext, listIndexEntries, readIndexPassages, hasIndexEdits } from
  "../templates/scripts/semantic-index-source.mjs";

const policy = {
  enabled: true,
  scope: { include: ["src/"], exclude: ["src/private/"] },
  embedding: { endpoint: "https://owner.test/v1/embeddings", model: "pilot", revision: "r1", dimensions: 2 },
};

test("B9 and B15 separate owner policy from the source commit and dirty content", async () => {
  await withTempRepo(async (repo) => {
    repo.write("ontology.config.json", JSON.stringify({ ontologyPath: "docs/ontology.md", semanticIndex: policy }));
    repo.write("docs/ontology.md", "# Ontology\n");
    repo.write("src/allowed.txt", "stable\nsecond\n");
    repo.write("src/private/secret.txt", "secret\n");
    repo.write("src/binary.dat", "a\0b");
    repo.git("add", ".");
    const linkBlob = repo.git("hash-object", "-w", "src/private/secret.txt").trim();
    repo.git("update-index", "--add", "--cacheinfo", "120000," + linkBlob + ",src/link");
    repo.git("commit", "-qm", "owner configuration and source");
    const policyCommit = repo.git("rev-parse", "HEAD").trim();
    repo.git("update-ref", "refs/remotes/origin/main", policyCommit);
    repo.git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
    repo.git("switch", "-qc", "topic");
    const branchPolicy = { ...policy, embedding: { ...policy.embedding, endpoint: "https://other.test/v1/embeddings" } };
    repo.write("ontology.config.json", JSON.stringify({ ontologyPath: "docs/ontology.md", semanticIndex: branchPolicy }));
    repo.git("add", "ontology.config.json");
    repo.git("commit", "-qm", "feature branch policy edit");
    repo.write("src/allowed.txt", "dirty\n");
    repo.write("src/untracked.txt", "new file\n");

    const context = resolveIndexContext(repo.dir, {});
    assert.equal(context.configurationCommit, policyCommit);
    assert.equal(context.sourceTree.id, repo.git("rev-parse", "HEAD").trim());
    assert.equal(context.policy.embedding.endpoint, policy.embedding.endpoint);
    const entries = listIndexEntries(context.sourceTree, context.policy.scope);
    assert.deepEqual(entries.map((entry) => entry.path), ["src/allowed.txt", "src/binary.dat"]);
    assert.deepEqual(readIndexPassages(context.sourceTree, entries[1]), []);
    const [passage] = readIndexPassages(context.sourceTree, entries[0]);
    assert.deepEqual([passage.text, passage.startLine, passage.endLine, passage.position], ["stable\nsecond\n", 1, 2, 0]);
    assert.equal(hasIndexEdits(context), true);
  });
});
```

- [ ] Add regressions for a submodule entry, a prefix collision (`src-other/`), invalid UTF-8, a blob above the read limit, a whitespace-only file, a 2,049-byte line with a multibyte character at the split boundary, and an unchanged-source comparison across branch commits. Assert unchanged output for two reads of the same revision. Add a case with the staged file different from `HEAD` and the unstaged file restored to `HEAD`. `hasIndexEdits` still returns true. For `verifyIndexSource`, reject a forged end line, omitted passage, extra excluded path, and duplicated position.
- [ ] Run `node --test tests/semantic-index-source.test.mjs templates/scripts/source-graph-git.test.mjs` and confirm red.
- [ ] Preserve existing Git tree return behaviour and add optional, non-caching reads after checking blob size with `git cat-file -s`. Cap a read at 8 MiB for a candidate regular blob and fail clearly when that limit prevents inspection. Reject mode `120000`, gitlinks, and paths the record format cannot represent. Use the trusted remote symbolic ref by default. Accept `ONTOLOGY_INDEX_CONFIG_REF` as a full ref or full commit ID. Use local Git and the policy tree's `has` callback for config validation. Read source from a captured `HEAD`. Compute SHA-256 digests of canonical JSON tuples `['scope-v1', include, exclude]` and `['openai-embeddings-v1', model, revision, dimensions, documentPrefix, queryPrefix]`, preserving the relative file paths and excluding the endpoint from the embedding digest. Deduplicate and order using a deterministic ordinal comparison. Calculate dirty status from the union of staged relative paths and unstaged relative paths with rename detection disabled. Ignore untracked content.
- [ ] Build the version-one chunker using committed LF line boundaries and a 2,048 UTF-8 byte cap with up to eight preceding complete lines as overlap. Consume new text in every iteration and split overlong lines only at code-point boundaries. Preserve line endings in emitted text, count one-based inclusive lines, and restart zero-based passage position per file. Skip empty and whitespace-only passages. Source entries are metadata-only so refresh can reuse whole unchanged files without reading their blobs. `verifyIndexSource` compares the ordered metadata fields of the exact expected passages in a single streamed pass, without calling a model.
- [ ] Rerun the focused tests and the common validation. Commit `feat: read semantic index source from committed Git trees`. Push.

## T3 — Make embedding requests

**Files:** Create `templates/scripts/semantic-index-embed.mjs` and `tests/semantic-index-embed.test.mjs`.

**Produces:** `createEmbeddingAdapter(profile, { fetchImpl = fetch, token, timeoutMs = 30_000 } = {})` returns `{ embedSource(texts), embedQuery(text) }`. Both operations resolve to finite unit vectors represented as JavaScript Float32Array values that can be stored in little-endian form. `embedSource` returns vectors corresponding to the input array in the same order. `embedQuery` returns a single vector. The caller supplies the optional `ONTOLOGY_INDEX_EMBEDDING_TOKEN` and does not share model-review credentials.

- [ ] Create `tests/semantic-index-embed.test.mjs`.

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { createEmbeddingAdapter } from "../templates/scripts/semantic-index-embed.mjs";

const profile = { endpoint: "https://owner.test/v1/embeddings", model: "pilot", dimensions: 2, documentPrefix: "doc: ", queryPrefix: "query: " };

test("B14 sends only the approved model and purpose, then reorders response indexes", async () => {
  const inputs = [];
  const adapter = createEmbeddingAdapter(profile, { token: "test-token", fetchImpl: async (url, options) => {
    assert.equal(String(url), profile.endpoint);
    assert.equal(options.redirect, "error");
    assert.equal(new Headers(options.headers).get("authorization"), "Bearer test-token");
    const body = JSON.parse(options.body);
    assert.equal(body.model, "pilot");
    inputs.push(body.input);
    const data = body.input.map((_, index) => ({ index, embedding: index === 0 ? [3, 0] : [0, -4] })).reverse();
    return Response.json({ data });
  } });
  assert.deepEqual((await adapter.embedSource(["one", "two"])).map((vector) => [...vector]), [[1, 0], [0, -1]]);
  assert.deepEqual([...await adapter.embedQuery("where?")], [1, 0]);
  assert.deepEqual(inputs, [["doc: one", "doc: two"], ["query: where?"]]);
});

test("B12 and B16 reject duplicate indexes and suppress service response bodies", async () => {
  let count = 0;
  const adapter = createEmbeddingAdapter(profile, { fetchImpl: async () => {
    count += 1;
    if (count === 1) return Response.json({ data: [{ index: 0, embedding: [1, 0] }, { index: 0, embedding: [0, 1] }] });
    return new Response("sensitive source text", { status: 502 });
  } });
  await assert.rejects(adapter.embedSource(["one", "two"]), /invalid embedding response/);
  await assert.rejects(adapter.embedQuery("query"), (error) => /502/.test(error.message) && !error.message.includes("sensitive"));
  assert.equal(count, 2);
});
```

- [ ] Add cases for zero, underflow-to-zero, oversized numeric components, nonnumeric output, missing replies, out-of-range indexes, wrong dimensions, an oversized response, and abort or redirect. Require the same sanitized errors for malformed responses. Assert that a failed later batch returns no partial array, that credentials never enter the body, and that a no-token call has no authorisation header.
- [ ] Run `node --test tests/semantic-index-embed.test.mjs` and confirm red.
- [ ] Use JSON `{ model, input }` and numeric response arrays. Batch at most 16 items and keep the byte length of the encoded JSON request including prefixes at or below 64 KiB. Reject a single oversize input. An empty source list returns without fetching. Check every response in its own batch before making it observable. Cap response reading at 8 MiB by counting streamed bytes. Convert numeric replies to Float32 and check finiteness and nonzero norm in that representation before normalization. Use an abort signal, `redirect: 'error'`, and fixed safe failures containing an HTTP status only where useful. Perform no automatic retries or provider fallback.
- [ ] Rerun the focused test and the common validation. Commit `feat: add OpenAI-compatible embedding adapter`. Push.

## T4 — Write and read portable index

**Files:** Create `templates/scripts/semantic-index-store.mjs` and `tests/semantic-index-store.test.mjs`.

**Consumes:** `hashScope(scope)` from T2. **Produces:** `openIndex(root, options)` resolves the fixed ignored store path and returns `{ header, records(), close() }`. `records()` returns a fresh async iterable over the same pinned file. `withIndexWriter(root, write, options)` runs an async callback under the checkout lock and passes `{ replace({ header, records }), importStream(stream, verify) }`. The optional `options.limits: { recordBytes, expandedBytes }` can tighten the production bounds in tests. `replace` takes typed records. `importStream` takes expanded bytes and an async verifier that receives the opened candidate reader. Each operation promotes only after validation. Any failure before promotion leaves the old file intact.

The UTF-8 file contains exactly one JSON object and LF per line. The header orders `kind` (`header`), `version` (`1`), `repository` (normalized GitHub identifier or `null` for local use), `sourceCommit`, `scope`, `scopeDigest`, `embeddingDigest`, and `dimensions`. Each passage has `kind` (`passage`), `path`, `blobId`, `startLine`, `endLine`, `position`, and `vector` (canonical base64 of four little-endian bytes per dimension). The last line has `kind` (`footer`), `count`, and `sha256`. Hash the exact bytes of all lines through the last passage, including each LF and the header. Require the footer to end in LF and reject trailing records. Full Git IDs use 40 or 64 lowercase hex digits. Digest strings have 64 lowercase hex digits. Paths are slash-delimited repository-relative text with no dot components. Sort by ordinal path, then contiguous position per file. Validate path-local blob identity, positive line numbers, dimensions, and finite nonzero vectors. Validate the version before interpreting records.

- [ ] Create `tests/semantic-index-store.test.mjs`.

```js
import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { withTempRepo } from "./helpers/temp-repo.mjs";
import { hashScope } from "../templates/scripts/semantic-index-source.mjs";
import { openIndex, withIndexWriter } from "../templates/scripts/semantic-index-store.mjs";

const scope = { include: ["src/"], exclude: [] };
const header = (digit) => ({
  kind: "header", version: 1, repository: null, sourceCommit: digit.repeat(40),
  scope, scopeDigest: hashScope(scope), embeddingDigest: "a".repeat(64), dimensions: 2,
});
const record = (digit) => ({
  path: "src/a.txt", blobId: digit.repeat(40), startLine: 1, endLine: 1, position: 0,
  vector: Float32Array.of(1, 0),
});

test("B12 failed write keeps the old index and a reader pins its original revision", async () => {
  await withTempRepo(async ({ dir, write }) => {
    write(".gitignore", "/.ontology-index/\n");
    await withIndexWriter(dir, (writer) => writer.replace({ header: header("1"), records: [record("a")] }));
    const original = await openIndex(dir);
    try {
      async function* interrupted() {
        yield record("b");
        throw new Error("source interrupted");
      }
      await assert.rejects(withIndexWriter(dir, (writer) => writer.replace({ header: header("2"), records: interrupted() })), /source interrupted/);
      const stillActive = await openIndex(dir);
      assert.equal(stillActive.header.sourceCommit, "1".repeat(40));
      await stillActive.close();
      await withIndexWriter(dir, (writer) => writer.replace({ header: header("2"), records: [record("b")] }));
      for await (const row of original.records()) assert.equal(row.blobId, "a".repeat(40));
      const current = await openIndex(dir);
      assert.equal(current.header.sourceCommit, "2".repeat(40));
      await current.close();
    } finally {
      await original.close();
    }
  });
});

test("B2 and B6 reject bytes after the verified footer", async () => {
  await withTempRepo(async ({ dir, write }) => {
    write(".gitignore", "/.ontology-index/\n");
    await withIndexWriter(dir, (writer) => writer.replace({ header: header("1"), records: [record("a")] }));
    appendFileSync(join(dir, ".ontology-index/index-v1.jsonl"), "{}\n");
    await assert.rejects(openIndex(dir), /invalid index/);
  });
});
```

- [ ] Add cases for an empty corpus, wrong magic or version, missing footer, mismatch of count and digest, invalid UTF-8, invalid base64, wrong vector dimensions, reordered paths, duplicated positions, a line or expanded stream exceeding the configured test bounds, and a failed verification callback during import. Assert retained active bytes on every import failure. Hold a lock with a pending Promise while calling `withIndexWriter` again and assert the second callback is never entered. Put a tracked file or symlink at the store path in separate fixtures and assert the writer refuses to use it.
- [ ] Run `node --test tests/semantic-index-store.test.mjs` and confirm red.
- [ ] Use `/.ontology-index/` in the checkout. Before creating any file there, confirm ignore coverage, reject tracked contents and symlinks for the directory and controlled paths, and validate the root. Open the lock exclusively and record process ID and host. If the lock is held, fail clearly with its recovery information. Remove only the lock acquired by the writer, in a `finally` block. Crash recovery is described in the installed setup reference in T7. Stage the file using an exclusive process-unique temporary name on the same filesystem. Stream under 128 KiB for a newline-terminated record and at most 2 GiB expanded in total. Flush and close the validated candidate before atomic rename. Clean up failed temporary candidates without touching the active file. `openIndex` validates the entire file on one open handle and re-iterates by explicit offsets. Close handles in `finally` on every error and completion path.
- [ ] Rerun the focused test and the common validation. Commit `feat: persist semantic indexes atomically`. Push.

## T5 — Search and refresh locally

**Files:** Create `templates/scripts/semantic-index.mjs` and `tests/semantic-index-cli.test.mjs`.

**Consumes:** Context and sources from T2, embedding adapter from T3, store from T4. **Produces:** `runIndexCommand(argv, { cwd = process.cwd(), env = process.env, fetchImpl = fetch } = {})` returns `{ exitCode, value }`. `value` is the JSON output object. The executable entry point prints one JSON object when `--json` is present and concise human-readable output otherwise. Importing the command module never runs the entry point.

Commands are `status [--json]`, `refresh [--json]`, and `search --query <text> [--limit <n>] [--json]`. T6 adds the two release commands. For `search`, `--query=<text>` also permits a query beginning with `-`. Require nonblank input. The result limit defaults to five and accepts an integer from one to 100. Unknown or duplicate options and excess arguments are invalid. For valid policy and source, status returns exit 0 and `state` (`current`, `missing`, `stale`, `incompatible`, `unreadable`), `configurationCommit`, `sourceCommit`, `indexCommit` (or `null`), `committedOnly: true`, `dirty`, and a recovery `message` where relevant. Search succeeds only for `current` and adds `results: [{ commit, path, startLine, endLine, score }]`. Refresh adds `metrics: { sourceEmbeddings, elapsedMs }` and its resulting state. A successful command sets `ok: true`. JSON failures carry `ok: false`, a stable `code`, and a safe `message`. Exit 2 covers invalid arguments, disabled or invalid policy, and an unborn checkout. Exit 1 covers failed search, refresh or exchange. Search uses its readiness state for an unusable index error code.

- [ ] Create `tests/semantic-index-cli.test.mjs`.

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { withTempRepo } from "./helpers/temp-repo.mjs";
import { runIndexCommand } from "../templates/scripts/semantic-index.mjs";

test("B1, B2 and B10 report readiness, cite the commit and reuse unchanged vectors", async () => {
  await withTempRepo(async ({ dir, write, git }) => {
    write(".gitignore", "/.ontology-index/\n");
    write("docs/ontology.md", "# Ontology\n");
    write("src/a.txt", "refund rule\n");
    write("src/b.txt", "shipping rule\n");
    write("ontology.config.json", JSON.stringify({ ontologyPath: "docs/ontology.md", semanticIndex: {
      enabled: true, scope: { include: ["src/"] },
      embedding: { endpoint: "https://owner.test/v1/embeddings", model: "pilot", revision: "r1", dimensions: 2, queryPrefix: "q:" },
    } }));
    git("add", ".");
    git("commit", "-qm", "initial source");
    const first = git("rev-parse", "HEAD").trim();
    const modelInputs = [];
    const options = { cwd: dir, env: { ONTOLOGY_INDEX_CONFIG_REF: first }, fetchImpl: async (_url, init) => {
      const { input } = JSON.parse(init.body);
      modelInputs.push(...input);
      return Response.json({ data: input.map((text, index) => ({ index, embedding: text.includes("refund") ? [1, 0] : [0, 1] })) });
    } };
    const run = (...args) => runIndexCommand([...args, "--json"], options);
    assert.equal((await run("status")).value.state, "missing");
    assert.equal((await run("search", "--query", "refund")).exitCode, 1);
    assert.deepEqual(modelInputs, []);
    assert.equal((await run("refresh")).value.metrics.sourceEmbeddings, 2);
    const search = await run("search", "--query", "refund", "--limit", "1");
    assert.equal(search.exitCode, 0);
    assert.deepEqual(search.value.results, [{ commit: first, path: "src/a.txt", startLine: 1, endLine: 1, score: 1 }]);
    git("rm", "src/b.txt");
    git("commit", "-qm", "remove shipping rule");
    assert.equal((await run("status")).value.state, "stale");
    assert.equal((await run("refresh")).value.metrics.sourceEmbeddings, 0);
    assert.deepEqual(modelInputs, ["refund rule\n", "shipping rule\n", "q:refund"]);
  });
});
```

- [ ] Add committed edit, addition, rename and deletion fixtures. After refresh, assert new paths and citations and the exact number of newly embedded passages, including zero for the repeat. Exercise a scope update that removes a file and enables another. Change model revision without changing dimensions and assert `incompatible` before a query call and a full refresh when requested. Move `HEAD` inside the injected query request and expect a stale error and zero results. In a separate refresh test, move `HEAD` during the source request and expect a complete index at the captured commit with stale status. Simulate provider errors and partial writes and compare the old active bytes. Test equal-score tie order, an empty corpus, disabled or invalid config with zero network calls, and a corrupt footer with zero query calls. Assert that a staged edit retains committed citations and sets `dirty`.
- [ ] Add the B15 outbound-data fixture with an approved source file, test, and `Ontology` document alongside an unapproved tracked file, an excluded regular file, an ignored untracked file, a symlink and a binary. Assert the recorded embedding inputs and stored passages contain only the three approved eligible texts and locations. Invoke the CLI without a graph, then with independent graph files excluded by scope, and assert equivalent retrieval.
- [ ] Run `node --test tests/semantic-index-cli.test.mjs` and confirm red.
- [ ] Dispatch local commands only after parsing and configuration checks. For readiness, verify the file and identity first, compare the embedding digest and dimensions, then compare source commit, repository identity and scope. Missing file is `missing`, invalid file or format is `unreadable`, embedding mismatch is `incompatible`, and other currentness mismatches are `stale`. Derive context from T2 for both the starting and finished operation. For refresh, use the checkout lock and merge the path-ordered prior records with the currently eligible entries. Reuse compatible whole-file records for the same path and blob. Reuse approved unchanged files across a scope change when their profile and recipe still match. Embed inputs in bounded batches and omit deleted or newly excluded records. Repeat refresh with the same current input is a no-op. For search, keep only the best `n` from the streamed cosine scan. Rank by decreasing score, then ascending ordinal path, start, end and passage position. Recheck `HEAD` and effective settings before returning hits. Include the committed-content notice when appropriate and close all readers.
- [ ] Rerun the focused test and the common validation. Commit `feat: search and refresh semantic indexes locally`. Push.

## T6 — Exchange release snapshots

**Files:** Create `templates/scripts/semantic-index-release.mjs` and `tests/semantic-index-release.test.mjs`. Modify `templates/scripts/semantic-index.mjs`.

**Consumes:** `runIndexCommand` and readiness rules from T5, the pinned store reader and writer from T4, and `hashScope`, `hashEmbedding` and `verifyIndexSource` from T2. **Produces:** `createReleaseTransport({ spawnGh } = {})`, `downloadIndex({ context, tag, allowAncestor, transport })`, and `uploadIndex({ context, tag, transport })`. The CLI accepts `download --release <tag> [--allow-ancestor] [--json]` and `upload --release <tag> [--json]`, with an optional injected `releaseTransport` in its options for tests. Resolve policy in T2 before invoking the transport. Successful exchange returns `{ repository, release, asset, indexCommit, bytes }` plus the normal readiness information. `download` distinguishes a stale imported ancestor from a current exact import. Transfer failure uses exit 1 and code `release` with a safe cause and recovery message.

The transport exposes `getRepository(repository)` returning `{ defaultBranch, canWrite }`, `getActor(repository)` returning login, `getRelease(repository, tag)` returning `{ id, tag, draft, immutable, target, assets }`, `getPolicy(repository, defaultBranch)` returning committed `OntologyConfig` JSON, `resolveReleaseCommit(repository, release)` returning the full verified pushed commit, `readAsset(repository, asset)` returning a readable stream, and `uploadAsset(repository, release, path)` returning asset metadata. Assets have `{ id, name, bytes, sha256, state }`. An omitted host digest is `null`. `spawnGh(argv, options)` for transport tests replaces the shell-free subprocess runner and returns a child process exposing streams, `error` and `close`. Test fixtures control stdout, stderr and exit status and can record the reply chunk boundaries. Exchange operations use no model adapter.

- [ ] Create `tests/semantic-index-release.test.mjs`.

```js
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { test } from "node:test";
import { withTempRepo } from "./helpers/temp-repo.mjs";
import { runIndexCommand } from "../templates/scripts/semantic-index.mjs";

test("B4, B7 and B8 exchange an exact snapshot and preserve a published asset on collision", async () => {
  await withTempRepo(async (builder) => withTempRepo(async (reader) => {
    const policy = { ontologyPath: "docs/ontology.md", semanticIndex: {
      enabled: true, scope: { include: ["src/"] },
      embedding: { endpoint: "https://owner.test/v1/embeddings", model: "fixture", revision: "r1", dimensions: 2, queryPrefix: "q:" },
      release: { repository: "github.com/example/fixture", publishers: ["dev"] },
    } };
    builder.write(".gitignore", "/.ontology-index/\n");
    builder.write("ontology.config.json", JSON.stringify(policy));
    builder.write("docs/ontology.md", "# Ontology\n");
    builder.write("src/rule.txt", "refund rule\n");
    builder.git("add", ".");
    builder.git("commit", "-qm", "source");
    const commit = builder.git("rev-parse", "HEAD").trim();
    reader.git("fetch", "-q", builder.dir, commit);
    reader.git("switch", "-q", "--detach", "FETCH_HEAD");

    const assets = [];
    let snapshotBytes;
    let uploadCalls = 0;
    const releaseTransport = {
      getRepository: async () => ({ defaultBranch: "main", canWrite: true }),
      getActor: async () => "dev",
      getRelease: async () => ({ id: 12, tag: "v1", draft: false, immutable: false, target: commit, assets: [...assets] }),
      getPolicy: async () => policy,
      resolveReleaseCommit: async () => commit,
      readAsset: async () => Readable.from([snapshotBytes]),
      uploadAsset: async (_repo, _release, path) => {
        uploadCalls += 1;
        snapshotBytes = readFileSync(path);
        const asset = { id: 21, name: basename(path), bytes: snapshotBytes.length, sha256: createHash("sha256").update(snapshotBytes).digest("hex"), state: "uploaded" };
        assets.push(asset);
        return asset;
      },
    };
    const requests = [];
    const fetchImpl = async (_url, init) => {
      const { input } = JSON.parse(init.body);
      requests.push(...input);
      return Response.json({ data: input.map((_, index) => ({ index, embedding: [1, 0] })) });
    };
    const run = (repo, ...args) => runIndexCommand([...args, "--json"], { cwd: repo.dir, env: { ONTOLOGY_INDEX_CONFIG_REF: commit }, fetchImpl, releaseTransport });
    assert.equal((await run(builder, "refresh")).exitCode, 0);
    assert.equal((await run(builder, "upload", "--release", "v1")).exitCode, 0);
    assert.equal((await run(builder, "upload", "--release", "v1")).exitCode, 1);
    assert.equal(uploadCalls, 1);
    assert.equal((await run(reader, "download", "--release", "v1")).exitCode, 0);
    assert.deepEqual(requests, ["refund rule\n"]);
    const search = await run(reader, "search", "--query", "refund");
    assert.equal(search.value.results[0].commit, commit);
    assert.deepEqual(requests, ["refund rule\n", "q:refund"]);
  }));
});
```

- [ ] Add cases for a compatible ancestor, a divergent commit, and an ancestor whose objects are unavailable. Assert explicit consent for an ancestor, stale status before refresh, and reuse of unchanged vectors after it. Test bad compressed bytes, mismatched host digest, forged blob or line metadata with a recomputed internal digest, wrong repo or model, truncated transfer, duplicate asset match, and stream budget overflow. Compare active index bytes after rejection. For upload, cover missing owner approval despite write access, publisher without write access, unpushed or mismatched target, moved release tag, immutable release, over-limit asset, and broken upload. Assert `uploadAsset` is never called for rejected preconditions and previously published assets remain after failure. Test the subprocess adapter with authenticated private-release replies and inspect its exact repo, tag and no-clobber arguments. Neither direction invokes the embedding model.
- [ ] Run `node --test tests/semantic-index-release.test.mjs tests/semantic-index-cli.test.mjs` and confirm red.
- [ ] Use a versioned asset name `ontology-index-v1-<commit>-<scopeDigest>-<embeddingDigest>.jsonl.gz`. Pass the configured host and repo explicitly to `gh` for release, actor, permissions, ref and contents queries. Use argument arrays without a shell. Parse bounded metadata replies and use fixed diagnostics with no child process credential or response dump. Resolve annotated tags to commits. For a draft without a tag, resolve its target branch or commit and prove reachability from a current pushed branch or tag in the adopting repo. Existence of a commit object alone is insufficient. Use the authenticated binary asset read by asset ID and stream under the compressed size bound. Compare its SHA-256 with the host digest when supplied. Gunzip into the store’s bounded import path, check the version, repository, scope, embedding and release commit, and regenerate the exact expected source references. Require the current commit or an explicitly selected local ancestor that Git can prove.
- [ ] Upload pins and validates the current reader and requires scope and embedding fingerprint equality with the live default-branch policy. Check the actual authenticated login and repository write permission, confirm the requested release is mutable and matches a verified pushed commit, compress its valid payload into the ignored directory, and hash it while measuring exact compressed bytes. Reject limits at 2 GiB, collisions, and moved release metadata before transfer. Use `gh release upload` for the selected release, with no clobber flag, and check the release ID, resolved commit, resulting asset state, size, and available digest after transfer before reporting success. Clean only local temporary output on errors. Preserve all assets present before upload.
- [ ] Rerun the focused tests and the common validation. Commit `feat: exchange semantic indexes through GitHub releases`. Push.

## T7 — Install and measure the workflow

**Files:** Modify `bin/install-ontology.mjs` and `README.md`. Create `templates/docs/semantic-index.md`, `scripts/measure-semantic-index.mjs`, `tests/semantic-index-install.test.mjs`, and `tests/semantic-index-pilot.test.mjs`.

**Consumes:** The five optional `semantic-index*.mjs` scripts, existing `source-graph-git.mjs`, and extended `ontology-config.mjs`. **Produces:** `--with-semantic-index` for CLI and `install({ target, withSemanticIndex: true })`, plus `measurePilot({ commit, questions, locate })` from `scripts/measure-semantic-index.mjs`. `questions` is an array of `{ id, expected, semantic, keyword }`. Each result location has `{ commit, path, startLine, endLine }`. The caller passes `locate(commit, path, startLine, endLine)` returning whether the exact source range resolves. The report returns `{ questions, semanticHits, keywordHits, semanticRate, keywordRate }` and rejects invalid semantic citations. Use recorded `refresh` metrics and a timed exact transfer for the other pilot evidence. The acceptance phase owns live credentials, reviewed pilot inputs and final results.

- [ ] Create `tests/semantic-index-install.test.mjs`.

```js
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { buildPlan, install } from "../bin/install-ontology.mjs";
import { withTempRepo } from "./helpers/temp-repo.mjs";

test("B13 opt-in installs byte-identical scripts and an ignored checkout store", async () => {
  const scripts = ["semantic-index.mjs", "semantic-index-source.mjs", "semantic-index-embed.mjs", "semantic-index-store.mjs", "semantic-index-release.mjs", "source-graph-git.mjs"];
  const combined = buildPlan({ withSemanticIndex: true, withSourceGraph: true });
  assert.equal(combined.filter(({ dest }) => dest === "scripts/source-graph-git.mjs").length, 1);
  assert.equal(buildPlan({}).some(({ dest }) => dest === "scripts/semantic-index.mjs"), false);
  await withTempRepo(async ({ dir, write, git }) => {
    write(".gitignore", "*.local\n");
    install({ target: dir, withSemanticIndex: true });
    for (const name of scripts) {
      assert.deepEqual(readFileSync(join(dir, "scripts", name)), readFileSync(new URL("../templates/scripts/" + name, import.meta.url)));
    }
    assert.equal(git("check-ignore", ".ontology-index/index-v1.jsonl").trim(), ".ontology-index/index-v1.jsonl");
    assert.match(readFileSync(join(dir, ".gitignore"), "utf8"), /^\*\.local/m);
    git("add", ".");
    git("commit", "-qm", "install");
    const revision = git("rev-parse", "HEAD").trim();
    assert.throws(() => execFileSync(process.execPath, ["scripts/semantic-index.mjs", "status", "--json"], {
      cwd: dir, env: { ...process.env, ONTOLOGY_INDEX_CONFIG_REF: revision }, stdio: ["ignore", "pipe", "pipe"],
    }), (error) => error.status === 2 && JSON.parse(error.stdout).code === "disabled");
  });
});
```

- [ ] Create `tests/semantic-index-pilot.test.mjs`.

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { measurePilot } from "../scripts/measure-semantic-index.mjs";

test("B3 counts hits within five locations and validates every semantic citation", () => {
  const commit = "1".repeat(40);
  const hit = { commit, path: "src/rule.txt", startLine: 3, endLine: 4 };
  const miss = { ...hit, startLine: 1, endLine: 2 };
  const expected = [hit];
  const locate = (rev, path, start, end) => rev === commit && path === hit.path && start >= 1 && end <= 10;
  const report = measurePilot({ commit, locate, questions: [
    { id: "refund", expected, semantic: [hit], keyword: [miss] },
    { id: "cancellation", expected, semantic: [miss, miss, miss, miss, miss, hit], keyword: [hit] },
  ] });
  assert.deepEqual(report, { questions: 2, semanticHits: 1, keywordHits: 1, semanticRate: 0.5, keywordRate: 0.5 });
  assert.throws(() => measurePilot({ commit, locate, questions: [{ id: "bad", expected, semantic: [{ ...hit, endLine: 11 }], keyword: [] }] }), /citation/);
});
```

- [ ] Add upgrade and dry-run coverage. Assert that core-only installation adds no feature files or ignore line, opt-in preserves existing adopter config and ignore rules, repeated opt-in does not duplicate the rule, tracked or symlink-conflicted storage is rejected before install writes, and the combined graph-and-index flags place the shared helper once. Test the installed CLI using the same file bytes in a second adopter and a committed enabled policy. Exercise local and remote endpoint identities with injected responses and no live secrets. Use the installed output in a pinned fixture checkout to verify search and refresh metrics.
- [ ] Run `node --test tests/semantic-index-install.test.mjs tests/semantic-index-pilot.test.mjs tests/install-ontology.test.mjs` and confirm red.
- [ ] Add the installer flag to the plan, parser, help, dry-run and actual opt-in path. Keep scripts and setup reference Kit-owned and byte-identical. Preserve `OntologyConfig` on upgrade. Print the example configuration and setup destination for an existing adopter. Add `/.ontology-index/` to the checkout’s ignore rules only for opt-in, retaining existing bytes and avoiding duplicate effective rules. Reject conflicts before writes. Include the settings in README and the installed reference, including fixed storage location, trusted ref override, endpoint requirements, model revision changes, explicit release commands, recovery for stale state and abandoned locks, and limits. Keep user-guide and live acceptance evidence in the later user phase.
- [ ] Implement `measurePilot` as a deterministic evaluator. Compare full commit, path and inclusive line overlap against each question’s reviewed expected locations. Validate all semantic locations with `locate`, even rows after the first five, and reject an empty question set or mismatching commit. Expose a simple JSON input command that verifies the named Git commit, checks file line ranges locally, and emits the report. Collect the keyword baseline at the same pinned commit by ranking approved lines by the count of matching distinct case-insensitive query words, then path and line. Record that baseline recipe with the result. The end-to-end trial pairs two checkouts, records the compressed asset size and time from download to the first valid search, and records the source embedding count and duration for the initial, changed, and repeated refresh. Run the synthetic offline trial during build. The live trial uses an authorised release and owner-supplied local Ollama and remote-compatible endpoints in the user phase.
- [ ] Rerun the focused tests and the common validation. Commit `feat: install and measure the optional semantic index`. Push.

## Verification map

| Behaviour | Evidence in build or pilot |
| --- | --- |
| B1 | T5 exact rank, commit, path and range. |
| B2 | T4 invalid data and T5 distinct readiness states before model calls. |
| B3 | T7 top-five baseline and source citation verification. |
| B4 | T6 paired checkouts and zero source calls on import, with size and timing in T7. |
| B5 | T6 compatible ancestor import and T5 incremental refresh. |
| B6 | T2 exact source references, T4 atomic validation and T6 invalid assets. |
| B7 | T6 pushed revision, live owner policy and release checks. T7 measures paired reuse. |
| B8 | T6 immutable, collision, size, permission and upload failure cases. |
| B9 | T2 captured commit and separate staged and unstaged checks. T5 returns committed citations. |
| B10 | T5 edit, rename, deletion and no-op counts. T7 reports time and count. |
| B11 | T5 currentness and scope refresh, with T7 Git-ignored storage verification. |
| B12 | T3 invalid vectors, T4 interrupted writer, T5 endpoint and concurrent revision change cases. |
| B13 | T1 optional validated settings, T2 trusted policy, T5 and T6 no network on disabled policy, T7 installed adopter. |
| B14 | T3 purpose-specific requests, T5 same-dimension model change, T7 local and remote-compatible trials. |
| B15 | T2 eligibility checks, T5 outbound request assertions and T7 adopter workflow. |
| B16 | T1 credential-free config, T3 safe diagnostics, T4 bounded data format, T6 verified data-only transfer. |

Confirm the seven task commits are pushed, the full suite is green, and the remaining live evidence is listed in the build handoff. Open the build PR using the repository’s phase workflow.
