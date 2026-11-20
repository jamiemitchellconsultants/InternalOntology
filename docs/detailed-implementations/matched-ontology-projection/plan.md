# Matched ontology projection — detailed implementation plan

Execute after the [task plan](../../superpowers/plans/matched-ontology-projection/plan.md) has merged. Before starting, read:
- the [behaviours and architecture](../../features/matched-ontology-projection/feature.md);
- ADRs [0026](../../adr/0026-matched-projection-as-an-injected-projector.md), [0027](../../adr/0027-deterministic-matching-rule-and-fixed-stop-list.md) and [0028](../../adr/0028-projection-setting-and-run-record-summary.md);
- the amendment's ADRs [0029](../../adr/0029-semantic-review-reads-the-ontology-source.md), [0030](../../adr/0030-matched-planning-by-paragraph-in-the-projector.md) and [0031](../../adr/0031-relationships-only-and-grouped-name-index.md).

**Resume at Part 3, Tasks 18–21.** This build-review amendment follows PR #160 and ADRs [0034](../../adr/0034-semantic-review-reads-raw-ontology-contents.md) and [0035](../../adr/0035-matched-planner-budgets-whole-code-points.md).

- **Part 1, the acceptance amendment.** Tasks 10–16 are pushed through `148d96f` on the build branch. The build review stopped during Task 17. Task 21 takes over its verification and handoff.
- **Part 2, the first pass.** Tasks 1–9 shipped in PR #141.
- **Part 3, the build-review amendment.** Tasks 18–21 are the only tasks for this build pass.

Resume the existing `feature/matched-ontology-projection/build` after the Part 3 plan has merged and the build gate opens. Each task is a separate test-first commit and push. Before each commit:
1. Run the task's focused test.
2. Stage only that task's files and review `git diff --cached`.
3. Run `node scripts/check-ontology-terms.mjs`.
4. Run `npm test` and **check the exit status**.

Every test in Part 1 was run against a prototype of this plan before the plan was written:
- the tests pass against the prototype, and `npm test` passed 744 of 744;
- the shipped tests pass alone from `templates/scripts` on Node 20, 22 and 24;
- each new test fails against `main` where it should, except the non-`.md` path test and the B25 equivalence test. The former pins today's Markdown read, and the latter also passes with current generated Markdown;
- the existing assertions that this plan updates are the only existing failures;
- with Task 15 left out, every acceptance and reviewer test still passes, so the order below keeps the suite green.

Keep the test names. Code fragments are contracts. Where a fragment gives a whole function, use it as written: the tests pin its behaviour, but not every detail of it.

# Part 1 — the acceptance amendment (Tasks 10–16 pushed)

## Task 10 — `ttlPathFor` moves into `owl-ontology.mjs`

**Files:** `templates/scripts/owl-ontology.mjs`, `templates/scripts/build-ontology.mjs`, and a new `tests/semantic-ontology-source.test.mjs`.

**Produces:** `ttlPathFor(ontologyPath)` exported from `owl-ontology.mjs`. `build-ontology.mjs` imports it and re-exports the same function, so `tests/build-ontology.test.mjs` keeps working unchanged. ADR 0029 moves it so that the reviewer imports no module with a command-line entry point.

- [ ] **Step 1: Write the failing test.** Create `tests/semantic-ontology-source.test.mjs` with this content. Task 12 adds to it.

```js
// Feature #135, B25 and ADR 0029: the semantic reviewer reads ontology.ttl and renders it exactly as
// build-ontology.mjs writes ontology.md, so evidence keys, rows and the full projection are unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";

import { ttlPathFor } from "../templates/scripts/owl-ontology.mjs";
import { ttlPathFor as reexported } from "../templates/scripts/build-ontology.mjs";

test("ttlPathFor lives in owl-ontology.mjs, and build-ontology.mjs re-exports the same function", () => {
  assert.equal(reexported, ttlPathFor);
  assert.equal(ttlPathFor("docs/ontology.md"), "docs/ontology.ttl");
  assert.equal(ttlPathFor("docs/ontology.markdown"), "docs/ontology.markdown");
});
```

- [ ] **Step 2: Run the test.** Run `node --test tests/semantic-ontology-source.test.mjs`. It fails because `owl-ontology.mjs` has no export named `ttlPathFor`.
- [ ] **Step 3: Implement.**
  - In `owl-ontology.mjs`, above `KIT_NS`, add:

```js
/**
 * The ontology source beside a Markdown ontology path. A path not ending in .md maps to itself.
 * @param {string} ontologyPath
 */
export function ttlPathFor(ontologyPath) {
  return ontologyPath.replace(/\.md$/, ".ttl");
}
```

  - In `build-ontology.mjs`, delete its own `ttlPathFor`, add `ttlPathFor` to the import list from `./owl-ontology.mjs`, and add `export { ttlPathFor };` below the imports.
- [ ] **Step 4: Run the tests.** Run the focused test, `node --test tests/build-ontology.test.mjs`, then `npm test`. All pass.
- [ ] **Step 5: Commit.** `refactor: ttlPathFor moves into owl-ontology.mjs (#135)`.

## Task 11 — `catalogOntology` lists relationships

**Files:** `templates/scripts/semantic-review-model.mjs`, `templates/scripts/semantic-review-model.test.mjs`.

**Produces:** `catalogOntology(markdown, sections)` returns its existing fields plus `relationships`.
- It is an array with one item per Relationships row, in ontology order: `{ evidenceKey, from, to }`.
- `evidenceKey` is `Relationships:<From>`, `from` is the row's name, and `to` is the row's third cell, trimmed and without backticks.
- It is empty when the Relationships section is not configured.
- No other field changes. Under ADR 0029 both names are rendered from `rdfs:domain` and `rdfs:range`.

- [ ] **Step 1: Add the failing test** to the end of `semantic-review-model.test.mjs`:

```js
test("B7 the catalog lists every relationship row with its key, From and To, in ontology order", () => {
  const source = "## Entities\n\n| Name | Description |\n| --- | --- |\n| `Analysis` | a pass |\n| `Speaker` | a person |\n\n" +
    "## Relationships\n\n| From | Relationship | To | Cardinality |\n| --- | --- | --- | --- |\n" +
    "| `Analysis` | scores | `Speaker` | 1 → 1 |\n| `Speaker` | reads | `Analysis` | 1 → many |\n| `Analysis` | writes | `Speaker` | 1 → many |\n";
  const catalog = catalogOntology(source, { required: ["Entities", "Relationships"], optional: [] });
  assert.deepEqual(catalog.relationships, [
    { evidenceKey: "Relationships:Analysis", from: "Analysis", to: "Speaker" },
    { evidenceKey: "Relationships:Speaker", from: "Speaker", to: "Analysis" },
    { evidenceKey: "Relationships:Analysis", from: "Analysis", to: "Speaker" },
  ]);
  assert.deepEqual(catalogOntology(source, { required: ["Entities"], optional: [] }).relationships, []);
  assert.equal(catalogOntology(source, { required: ["Entities", "Relationships"], optional: [] }).projection,
    catalogOntology(source, { required: ["Entities", "Relationships"], optional: [] }).projection);
});
```

- [ ] **Step 2: Run the test.** Run `node --test templates/scripts/semantic-review-model.test.mjs`. It fails because `relationships` is undefined.
- [ ] **Step 3: Implement.**
  - Declare `const relationships = [];` beside `groups`.
  - In the table-row branch, directly after `groupFor(current, name).rows.push(line);`, add:

```js
if (current === "Relationships") {
  relationships.push({ evidenceKey: `${current}:${name}`, from: name, to: line.split("|")[3]?.trim().replace(/^`|`$/g, "") ?? "" });
}
```

  - Return `relationships` beside `groups`.
- [ ] **Step 4: Run the tests.** Run the focused test, then `npm test`. Both pass.
- [ ] **Step 5: Commit.** `feat: catalog lists each relationship with its From and To (#135)`.

## Task 12 — `collectReviewInput` reads `ontology.ttl`, falling back to `ontology.md`

**Files:**
- `templates/scripts/semantic-review-github.mjs` and `templates/scripts/semantic-review-github.test.mjs`;
- `tests/semantic-ontology-source.test.mjs`;
- `tests/semantic-feature-acceptance.test.mjs`.

**Consumes:** `ttlPathFor` (Task 10) and `catalog.relationships` (Task 11, in the tests only).

**Produces:** `collectReviewInput` returns `ontologyText` like this (ADR 0029, B25):
1. When `ttlPathFor(config.ontologyPath)` differs from `config.ontologyPath`, it reads that path through the contents API at `pull.head.sha`.
2. If the read succeeds, it returns `renderOntologyMarkdown(triplesToModel(parseTurtle(decodeBlob(source))))`, exactly as `build-ontology.mjs` writes `ontology.md`, and does not read `ontology.md`.
3. If the read fails with a 404 (the error message matches `/returned 404/`, as `isEligiblePull` already tests), it reads `config.ontologyPath` as today.
4. Any other read error, a decoding error or a parse error propagates. The worker already maps it to the unavailable reason "PR files or proposed ontology could not be read". It never falls back.
5. When the two paths are the same, it reads `config.ontologyPath` once, as Markdown.

Everything after the ontology read is unchanged.

- [ ] **Step 1: Update the existing collector tests.** They give no answer for `docs/ontology.ttl`. Add this helper below `blob` in `semantic-review-github.test.mjs`:

```js
const absent = (path) => { throw new Error(`GitHub API GET returned 404 for ${path}`); };
```

  Then make each existing collector mock return `absent(path)` for that file:
  - In "collector reads complete changed Markdown blobs, including renamed destinations", add `if (path.includes("/contents/docs/ontology.ttl")) return absent(path);` after the `ontology.md` line.
  - In "unreadable blobs and truncated file listings are incomplete, never silently clean", use `get: async (path) => path.includes("/contents/docs/ontology.ttl") ? absent(path) : path.includes("/contents/") ? blob("# ontology") : { encoding: "base64", content: "%%%" },`.
  - In "failed file pagination is reported as incomplete coverage", use `get: async (path) => path.includes("/contents/docs/ontology.ttl") ? absent(path) : blob("# ontology"),`.

- [ ] **Step 2: Add the failing collector tests.** Add these imports to `semantic-review-github.test.mjs`:

```js
import { modelToTriples, serializeTurtle } from "./owl-ontology.mjs";
import { catalogOntology } from "./semantic-review-model.mjs";
```

  Then add to the end of the file:

```js
// B25: the reviewer reads the ontology source, rendered as build-ontology.mjs renders it (ADR 0029).
const SOURCE_MODEL = { projectName: "Widgets", invariants: [{ concept: "Analysis", text: "scores only stored sessions." }], sections: {
  Entities: [{ name: "Analysis", cells: { Properties: "`analysisId`", Description: "One scoring pass." } },
    { name: "Speaker", cells: { Properties: "`speakerCode`", Description: "A person." } }],
  Enums: [{ name: "SessionRemovalState", cells: { Values: "`Requested`, `Removed`", Description: "Where a removal stands." } }],
  Relationships: [{ name: "Analysis", cells: { Relationship: "credits", To: "`Speaker`", Cardinality: "many → many" } }],
} };
const SOURCE_TTL = serializeTurtle(modelToTriples(SOURCE_MODEL), { namespaceUri: "https://ontology.example/widgets#" });

function sourceClient(contents) {
  const calls = [];
  return { calls, getAll: async () => [],
    get: async (path) => {
      calls.push(path.split("?")[0]);
      const [file, value] = Object.entries(contents).find(([name]) => path.startsWith(`/contents/${name}?`)) ?? [];
      if (!file) return absent(path);
      if (value instanceof Error) throw value;
      return blob(value);
    } };
}
const listed = { ...pull, changed_files: 0 };

test("B25 the collector renders ontology.ttl as build-ontology.mjs does and does not read ontology.md", async () => {
  const client = sourceClient({ "docs/ontology.ttl": SOURCE_TTL, "docs/ontology.md": "# stale Markdown" });
  const result = await collectReviewInput(client, listed, { ontologyPath: "docs/ontology.md", ignorePaths: [] });
  assert.deepEqual(client.calls, ["/contents/docs/ontology.ttl"]);
  assert.match(result.ontologyText, /^# Widgets — Application Ontology\n/);
  const catalog = catalogOntology(result.ontologyText, { required: ["Entities", "Enums", "Relationships", "Business Rules & Invariants"], optional: [] });
  assert.deepEqual([...catalog.evidenceKeys], ["Entities:Analysis", "Entities:Speaker", "Enums:SessionRemovalState",
    "Relationships:Analysis", "Business Rules & Invariants:Analysis"]);
  assert.deepEqual(catalog.groups.get("Relationships:Analysis").rows, ["| `Analysis` | credits | `Speaker` | many → many |"]);
  assert.deepEqual(catalog.relationships, [{ evidenceKey: "Relationships:Analysis", from: "Analysis", to: "Speaker" }]);
});

test("B25 the collector reads ontology.md when ontology.ttl is absent at the revision", async () => {
  const client = sourceClient({ "docs/ontology.md": "# proposed ontology" });
  const result = await collectReviewInput(client, listed, { ontologyPath: "docs/ontology.md", ignorePaths: [] });
  assert.equal(result.ontologyText, "# proposed ontology");
  assert.deepEqual(client.calls, ["/contents/docs/ontology.ttl", "/contents/docs/ontology.md"]);
});

test("B25 an unreadable or unparseable ontology source fails the read instead of falling back", async () => {
  const config = { ontologyPath: "docs/ontology.md", ignorePaths: [] };
  await assert.rejects(collectReviewInput(sourceClient({ "docs/ontology.ttl": new Error("GitHub API GET returned 500 for /contents"),
    "docs/ontology.md": "# ontology" }), listed, config), /returned 500/);
  await assert.rejects(collectReviewInput(sourceClient({ "docs/ontology.ttl": "this is not turtle", "docs/ontology.md": "# ontology" }),
    listed, config));
});

test("B25 an ontology path without .md is read as Markdown only", async () => {
  const client = sourceClient({ "docs/ontology.markdown": "# proposed ontology" });
  const result = await collectReviewInput(client, listed, { ontologyPath: "docs/ontology.markdown", ignorePaths: [] });
  assert.equal(result.ontologyText, "# proposed ontology");
  assert.deepEqual(client.calls, ["/contents/docs/ontology.markdown"]);
});
```

- [ ] **Step 3: Add the B25 equality test.** It runs `build-ontology.mjs` on a fixture with relationships, enums and invariants, then checks that the collector returns the committed `ontology.md` with the same catalog. It is not shipped, so it lives in `tests/`. Replace `tests/semantic-ontology-source.test.mjs` with:

```js
// Feature #135, B25 and ADR 0029: the semantic reviewer reads ontology.ttl and renders it exactly as
// build-ontology.mjs writes ontology.md, so evidence keys, rows and the full projection are unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { run } from "../templates/scripts/build-ontology.mjs";
import { ttlPathFor } from "../templates/scripts/owl-ontology.mjs";
import { ttlPathFor as reexported } from "../templates/scripts/build-ontology.mjs";
import { collectReviewInput } from "../templates/scripts/semantic-review-github.mjs";
import { catalogOntology } from "../templates/scripts/semantic-review-model.mjs";
import { withTempRepo } from "./helpers/temp-repo.mjs";

const SECTIONS = { required: ["Entities", "Enums", "Relationships", "Business Rules & Invariants"], optional: [] };
const HAND_WRITTEN = `# Widgets — Application Ontology

## Entities

| Name | Properties | Description |
| --- | --- | --- |
| \`Analysis\` | \`analysisId\` | One scoring pass over a \`Speaker\`. |
| \`Speaker\` | \`speakerCode\` | A person. |

---

## Enums

| Name | Values | Description |
| --- | --- | --- |
| \`SessionRemovalState\` | \`Requested\`, \`Removed\` | Where a removal stands. |

---

## Relationships

| From | Relationship | To | Cardinality |
| --- | --- | --- | --- |
| \`Analysis\` | credits | \`Speaker\` | many → many |
| \`Analysis\` | scores | \`Speaker\` | 1 → 1 |

---

## Business Rules & Invariants

- **\`Analysis\`** — scores only stored sessions.
- **\`Analysis\`** — is never deleted.
`;

const diskClient = (dir) => ({
  getAll: async () => [],
  get: async (path) => {
    const file = decodeURIComponent(path.slice("/contents/".length, path.indexOf("?")));
    let text;
    try { text = readFileSync(join(dir, file), "utf8"); } catch { throw new Error(`GitHub API GET returned 404 for ${path}`); }
    return { encoding: "base64", content: Buffer.from(text).toString("base64") };
  },
});

test("ttlPathFor lives in owl-ontology.mjs, and build-ontology.mjs re-exports the same function", () => {
  assert.equal(reexported, ttlPathFor);
  assert.equal(ttlPathFor("docs/ontology.md"), "docs/ontology.ttl");
  assert.equal(ttlPathFor("docs/ontology.markdown"), "docs/ontology.markdown");
});

test("B25 when build-ontology --check passes, the reviewer's ontology is the committed ontology.md, with the same catalog", async () => {
  await withTempRepo(async (repo) => {
    repo.write("ontology.config.json", JSON.stringify({ ontologyPath: "docs/ontology.md", namespaceUri: "https://ontology.example/w#" }));
    repo.write("docs/ontology.md", HAND_WRITTEN);
    run({ cwd: repo.dir });
    assert.equal(run({ cwd: repo.dir, check: true }).changed, false);
    const committed = readFileSync(join(repo.dir, "docs/ontology.md"), "utf8");
    const input = await collectReviewInput(diskClient(repo.dir), { number: 7, head: { sha: "a".repeat(40) }, changed_files: 0 },
      { ontologyPath: "docs/ontology.md", ignorePaths: [] });
    assert.equal(input.ontologyText, committed);
    const fromSource = catalogOntology(input.ontologyText, SECTIONS);
    const fromHand = catalogOntology(HAND_WRITTEN, SECTIONS);
    assert.equal(fromSource.projection, fromHand.projection);
    assert.deepEqual([...fromSource.evidenceKeys], [...fromHand.evidenceKeys]);
    assert.deepEqual(fromSource.groups, fromHand.groups);
    assert.deepEqual(fromSource.relationships, [
      { evidenceKey: "Relationships:Analysis", from: "Analysis", to: "Speaker" },
      { evidenceKey: "Relationships:Analysis", from: "Analysis", to: "Speaker" },
    ]);
  });
});
```

- [ ] **Step 4: Update the semantic feature acceptance mock.** In `tests/semantic-feature-acceptance.test.mjs`, directly after the line that returns `blob(sourceOntology)` for `/contents/docs/ontology.md?ref=`, add:

```js
if (path.startsWith("/contents/docs/ontology.ttl?ref=")) throw new Error(`GitHub API GET returned 404 for ${path}`);
```

- [ ] **Step 5: Run the tests.** Run `node --test templates/scripts/semantic-review-github.test.mjs tests/semantic-ontology-source.test.mjs tests/semantic-feature-acceptance.test.mjs`. Exactly three new collector tests fail. "B25 an ontology path without .md is read as Markdown only" and "B25 when build-ontology --check passes, the reviewer's ontology is the committed ontology.md, with the same catalog" both pass. The old collector already reads the current generated Markdown in the equivalence fixture. The stale-Markdown fixture proves the source switch.
- [ ] **Step 6: Implement.** In `semantic-review-github.mjs`:
  - Import `parseTurtle`, `renderOntologyMarkdown`, `triplesToModel` and `ttlPathFor` from `./owl-ontology.mjs`.
  - Add this function above `collectReviewInput`:

```js
// ADR 0029: render the ontology source exactly as build-ontology.mjs does; read ontology.md only when
// the source is absent at this revision.
async function readOntologyText(client, ontologyPath, headSha) {
  const contents = (path) => client.get(`/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(headSha)}`);
  const sourcePath = ttlPathFor(ontologyPath);
  if (sourcePath !== ontologyPath) {
    let source;
    try {
      source = await contents(sourcePath);
    } catch (error) {
      if (!/returned 404/.test(String(error))) throw error;
    }
    if (source) return renderOntologyMarkdown(triplesToModel(parseTurtle(decodeBlob(source))));
  }
  return decodeBlob(await contents(ontologyPath));
}
```

  - In `collectReviewInput`, replace the two lines that read and decode the ontology with `const ontologyText = await readOntologyText(client, config.ontologyPath, headSha);`, and drop the now-unused `ontologyPath` local.
- [ ] **Step 7: Run the tests.** Run the focused tests, the shipped test alone from inside `templates/scripts`, then `npm test`. All pass.
- [ ] **Step 8: Commit.** `feat: semantic review reads the ontology source, falling back to ontology.md (#135)`.

## Task 13 — `reviewFiles` uses the projector's `plan` when it has one

**Files:** `templates/scripts/semantic-review-model.mjs`, `templates/scripts/semantic-review-model.test.mjs`.

**Consumes:** the `plan` contract in the task plan's interfaces. The model module and its test still must **not** import `ontology-projection.mjs`; the test uses a stub.

**Produces:** in `reviewFiles`, planning becomes:
- When `typeof project.plan === "function"`, `prepared = await project.plan(catalog, files, maxRequestChars)`. The whole file is not projected.
- Otherwise, today's code runs unchanged: project each file, collect the lengths, and call `chunkFiles(files, catalog, maxRequestChars, projectionChars)`. The built-in full projector and `"full"` mode therefore plan and send exactly as today (B21).

Everything after `prepared` is unchanged. Each chunk is still projected once by `assess`, the pre-send guard still halves any chunk whose own projection outgrows the budget, and `projections` is computed as before.

- [ ] **Step 1: Add the failing test** to the end of `semantic-review-model.test.mjs`. It reuses the file's `options`, `completion` and `clean`:

```js
test("B17 a projector with a plan replaces chunkFiles, and only planned chunks are projected", async () => {
  const seen = [];
  const plan = async (_catalog, files, budget) => ({
    chunks: [{ path: "docs/a.md", offset: 0, text: "one\n\n" }, { path: "docs/a.md", offset: 5, text: "two\n" }],
    unreviewed: [{ path: "docs/b.md", code: "too-large", reason: `planned reason ${budget}` }] });
  const project = Object.assign(async (_catalog, text) => { seen.push(text); return { text: "p", keys: [] }; }, { mode: "matched", plan });
  let requests = 0;
  const result = await reviewFiles({ ...options([{ path: "docs/a.md", text: "one\n\ntwo\n" }, { path: "docs/b.md", text: "big" }],
    async () => { requests++; return completion(clean); }), project, maxRequestChars: 5_000 });
  assert.deepEqual(seen, ["one\n\n", "two\n"]);
  assert.equal(requests, 2);
  assert.deepEqual(result.reviewed, ["docs/a.md"]);
  assert.deepEqual(result.unreviewed, [{ path: "docs/b.md", code: "too-large", reason: "planned reason 5000" }]);
});
```

- [ ] **Step 2: Run the test.** Run `node --test templates/scripts/semantic-review-model.test.mjs`. It fails, because `chunkFiles` plans the whole file and the stub's plan is ignored.
- [ ] **Step 3: Implement** as described above.
- [ ] **Step 4: Run the tests.** Run the focused test and `npm test`. The graph-naming and #111 budget tests pass unchanged.
- [ ] **Step 5: Commit.** `feat: reviewFiles plans with the projector's plan when it has one (#135)`.

## Task 14 — per-catalog index, relationships only, grouped name index

**Files:** `templates/scripts/ontology-projection.mjs`, `templates/scripts/ontology-projection.test.mjs`, `tests/matched-projection-acceptance.test.mjs`.

**Consumes:** `catalog.groups` and `catalog.relationships` (Task 11).

**Produces:** in `"matched"` mode:
- **B7.** The selection is the base match of ADR 0027 (B2 to B6, unchanged), plus, for each base entry, every relationship whose `from` or `to` is that entry's name. Each relationship adds its evidence key, and with it every row of that key (B8). Nothing else is added: the entries at the other end are not, and backticked names in rows select nothing.
- **B24.** The projection text is the selected rows, as before, followed by the grouped name index:

```text


## Evidence keys

Each key is a section name, a colon, and one name listed under it, for example <first evidence key>.

<Section>: <Name>, <Name>, ...
```

  There is one line per section in ontology order, with that section's names in ontology order. The example key is the catalog's first evidence key.
- **The index.** The projector builds it once per catalog object and caches it in a JavaScript WeakMap inside the projector, keyed by the catalog. `project` uses only the index.

`"full"` mode, `STOP_WORDS`, `nameWords`, `markdownWords` and the projector's call shape and `mode` do not change.

- [ ] **Step 1: Update the shipped test's fixture.** In `ontology-projection.test.mjs`, change the Microphone row to:

```js
  "| `Microphone` | `model` | Unrelated to removal or audit; used by a `Speaker`. |",
```

  This gives the description a backticked entry name, which B7 now says selects nothing.

- [ ] **Step 2: Replace the B7, B8 and B1 B13 tests.** Delete the tests "B7 one hop adds backticked names and relationship ends, and stops there", "B8 every row of a selected key travels together" and "B1 B13 the text is selected rows by section in ontology order, then the whole name index". In their place, before "B9 the same inputs give the same projection", add:

```js
test("B7 a matched entry adds the relationships whose domain or range it is, not the entries at their other ends", () => {
  assert.deepEqual(keys("An AuditEvent was written."),
    ["Entities:AuditEvent", "Relationships:Analysis", "Business Rules & Invariants:AuditEvent"]);
  assert.deepEqual(keys("the speakers"), ["Entities:Speaker", "Relationships:Analysis"]);
  assert.deepEqual(keys("An analysis."), ["Entities:Analysis", "Relationships:Analysis"]);
});

test("B7 a name in an entry's description selects nothing", () => {
  assert.deepEqual(keys("A microphone."), ["Entities:Microphone"]);
});

test("B8 every row of a selected relationship key travels together, without the far-end entry", () => {
  const { text } = matched(catalog, "the speakers");
  for (const verb of ["scores", "credits", "writes"]) assert.ok(text.includes(`| \`Analysis\` | ${verb} |`), verb);
  assert.ok(!text.includes("| `Analysis` | `analysisId` |"));
  assert.ok(!text.includes("| `SessionRemoval` | removes |"));
});

const INDEX = "\n\n## Evidence keys\n\n" +
  "Each key is a section name, a colon, and one name listed under it, for example Entities:AuditEvent.\n\n" +
  "Entities: AuditEvent, StudySession, SessionRemoval, Analysis, Speaker, DataType, Microphone\n" +
  "Enums: RemovalReason, SessionRemovalState\n" +
  "Relationships: Analysis, SessionRemoval\n" +
  "Business Rules & Invariants: SessionRemoval, AuditEvent";

test("B24 the matched name index lists each section's names on one line, after one explanatory sentence", () => {
  assert.equal(matched(catalog, "nothing at all").text, `# Canonical ontology evidence${INDEX}`);
  assert.ok(catalog.projection.endsWith("\n- Business Rules & Invariants:AuditEvent"));
});

test("B1 B13 the text is selected rows by section in ontology order, then the grouped name index", () => {
  assert.deepEqual(matched(catalog, "nothing at all").keys, []);
  assert.equal(matched(catalog, "A microphone.").text,
    `# Canonical ontology evidence\n\n## Entities\n| \`Microphone\` | \`model\` | Unrelated to removal or audit; used by a \`Speaker\`. |${INDEX}`);
  const invariant = matched(catalog, "a SessionRemoval").text;
  assert.ok(invariant.includes("- **`SessionRemoval`** — only forward transitions are allowed;\n  the purge job resumes interrupted removals.\n- **`SessionRemoval`** — the short note"));
});
```

- [ ] **Step 3: Update the #135 acceptance test.** In `tests/matched-projection-acceptance.test.mjs`, in "B1 B10 B15 B20 an unchanged config sends a matched projection and records it", replace `assert.match(prompt, /- Entities:Microphone/);` with:

```js
      assert.match(prompt, /\nEntities: AuditEvent, SessionRemoval, StudySession, Microphone\n/);
```

- [ ] **Step 4: Run the tests.** Run `node --test templates/scripts/ontology-projection.test.mjs tests/matched-projection-acceptance.test.mjs`. The new B7, B8, B24 and B1 B13 tests and the acceptance test fail.
- [ ] **Step 5: Implement.** Keep `PROJECTION_MODES`, `STOP_WORDS`, `HEADER`, `splitWords`, `markdownWords`, `nameWords`, `escape`, `cells` and `wordsOf`. Delete `unticked`, `hasWord`, `keysNamed`, `selectEntries`, `nameIndex` and `renderProjection`. Change `wholeWord` to return the expression instead of testing it, so it can be compiled once:

```js
function wholeWord(phrase, flags) {
  const pattern = phrase.trim().split(/\s+/u).map(escape).join("\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, `u${flags}`);
}
```

  Add the grouped name index:

```js
// The grouped name index (B24, ADR 0031): one line per section, names in ontology order.
function groupedNameIndex(catalog) {
  const lines = [];
  let section = null;
  for (const group of catalog.groups.values()) {
    if (group.section === section) lines[lines.length - 1] += `, ${group.name}`;
    else lines.push(`${(section = group.section)}: ${group.name}`);
  }
  const example = catalog.groups.keys().next().value;
  return ["", "", "## Evidence keys", "",
    `Each key is a section name, a colon, and one name listed under it, for example ${example}.`, "", ...lines].join("\n");
}
```

  Add the index. `groupChars` and `emptyChars` are used by Task 15. Names with whitespace and banned aliases are phrases, because they can match across a line break; every other name is matched within a unit:

```js
// Built once per catalog and projector (ADR 0030). Every selection and size comes from here.
function buildIndex(catalog, bannedAliases) {
  const order = new Map([...catalog.groups.keys()].map((key, position) => [key, position]));
  const byWord = new Map();
  const byName = new Map();
  for (const [key, group] of catalog.groups) {
    for (const word of wordsOf(group)) {
      if (!byWord.has(word)) byWord.set(word, []);
      byWord.get(word).push(key);
    }
    if (!byName.has(group.name)) byName.set(group.name, []);
    byName.get(group.name).push(key);
  }
  // Names without whitespace cannot match across a line break, so a unit's matches are the chunk's.
  const names = [];
  const phrases = [];
  for (const [name, keys] of byName) {
    const matcher = { probe: name.trim().split(/\s+/u)[0], pattern: wholeWord(name, ""), keys };
    (/\s/u.test(name.trim()) ? phrases : names).push(matcher);
  }
  for (const alias of bannedAliases) {
    phrases.push({ probe: "", pattern: wholeWord(alias.phrase, "i"), keys: alias.nameInstead.flatMap((name) => byName.get(name) ?? []) });
  }
  const relationshipsOf = new Map();
  for (const relationship of catalog.relationships ?? []) {
    for (const end of [relationship.from, relationship.to]) {
      if (!relationshipsOf.has(end)) relationshipsOf.set(end, new Set());
      relationshipsOf.get(end).add(relationship.evidenceKey);
    }
  }
  const groupChars = new Map();
  for (const [key, group] of catalog.groups) groupChars.set(key, group.rows.reduce((sum, row) => sum + row.length + 1, 0));
  const indexText = groupedNameIndex(catalog);
  return { catalog, order, byWord, names, phrases, relationshipsOf, groupChars, indexText,
    emptyChars: HEADER.length + indexText.length };
}
```

  Add the selection and rendering:

```js
const addAll = (target, keys) => { for (const key of keys) target.add(key); return target; };

// Matches that never span a line break: name words, enum value words and names without whitespace.
function unitMatches(index, text) {
  const found = new Set();
  for (const word of markdownWords(text)) {
    for (const candidate of [word, word.endsWith("s") && word.slice(0, -1), word.endsWith("es") && word.slice(0, -2)]) {
      if (candidate) addAll(found, index.byWord.get(candidate) ?? []);
    }
  }
  for (const name of index.names) if (text.includes(name.probe) && name.pattern.test(text)) addAll(found, name.keys);
  return found;
}

// Matches that can span a break: banned-alias phrases and names with whitespace (B6).
function phraseMatches(index, text, found) {
  for (const phrase of index.phrases) if ((!phrase.probe || text.includes(phrase.probe)) && phrase.pattern.test(text)) addAll(found, phrase.keys);
  return found;
}

// B7: each base entry adds the relationships whose domain or range it is, and nothing else.
function withRelationships(index, base) {
  const selected = new Set(base);
  for (const key of base) addAll(selected, index.relationshipsOf.get(index.catalog.groups.get(key).name) ?? []);
  return selected;
}

function select(index, text) {
  return withRelationships(index, phraseMatches(index, text, unitMatches(index, text)));
}

const ordered = (index, selected) => [...selected].sort((a, b) => index.order.get(a) - index.order.get(b));

function render(index, selected) {
  const output = [HEADER];
  let section = null;
  for (const key of ordered(index, selected)) {
    const group = index.catalog.groups.get(key);
    if (group.section !== section) output.push("", `## ${(section = group.section)}`);
    output.push(...group.rows);
  }
  return output.join("\n") + index.indexText;
}
```

  `unitMatches` takes each Markdown word `m` and looks up `m`, `m` without a final "s", and `m` without a final "es" in `byWord`. That is the same rule as ADR 0027's "a name word `w` with `w`, `w + "s"` or `w + "es"` among the Markdown words". The `includes` probe is only a fast pre-check before the regular expression.

  Then rewrite `createProjector`:

```js
export function createProjector({ mode = "matched", bannedAliases = [] } = {}) {
  if (!PROJECTION_MODES.includes(mode)) throw new Error(`unknown projection mode: ${JSON.stringify(mode)}`);
  if (mode === "full") return Object.assign((catalog) => ({ text: catalog.projection, keys: [...catalog.evidenceKeys] }), { mode });
  const indexes = new WeakMap();
  const indexFor = (catalog) => {
    if (!indexes.has(catalog)) indexes.set(catalog, buildIndex(catalog, bannedAliases));
    return indexes.get(catalog);
  };
  const project = (catalog, text) => {
    const index = indexFor(catalog);
    const selected = select(index, text);
    return { text: render(index, selected), keys: ordered(index, selected) };
  };
  return Object.assign(project, { mode });
}
```

  Update the module's header comment to cite ADRs 0026, 0027, 0030 and 0031.
- [ ] **Step 6: Run the tests.** Run the shipped test, then the shipped test alone from inside `templates/scripts`, then `npm test`. All pass. The B11 tests pass unchanged, because each recorded finding is matched directly.
- [ ] **Step 7: Commit.** `feat: matched projection adds relationships only and groups the name index (#135)`.

## Task 15 — `plan`: paragraphs, then lines, then pieces

**Files:** `templates/scripts/ontology-projection.mjs`, `templates/scripts/ontology-projection.test.mjs`.

**Consumes:** the index from Task 14, `REQUEST_OVERHEAD`, and `reviewFiles`' use of `plan` from Task 13.

**Produces:** the matched projector gains `plan(catalog, files, maxRequestChars) → { chunks, unreviewed }`. The full projector has none. For each file, in order:
1. **The name index (B18).** If `REQUEST_OVERHEAD + path.length + emptyChars >= maxRequestChars`, the file is unreviewed, with `{ path, code: "too-large", reason }`. The reason is `ontology name index too large for the configured budget (name index <emptyChars> characters, budget <maxRequestChars>; raise ONTOLOGY_MAX_REQUEST_CHARS)`. Here `emptyChars` is the length of an empty selection's projection: the header and the grouped name index.
2. **An empty file (B13)** is one chunk: `{ path, offset: 0, text: "", keys: [], chars: emptyChars }`.
3. **Paragraphs (B17).** The room for a chunk is `maxRequestChars - REQUEST_OVERHEAD - path.length`. A chunk fits while `chars + text.length <= room`.
   - A paragraph is a run of lines up to and including the blank lines after it. A blank line is empty or whitespace only. The units keep their line endings, so concatenating them gives back the file.
   - Paragraphs are added to the current chunk while it fits.
   - A chunk's selection is the union of its units' within-unit matches, plus the phrase matches of the chunk's joined text, plus their relationships. Its `chars` is computed from the selection without rendering.
4. **Lines.** A paragraph that does not fit even in an empty chunk is divided into its lines, and they are packed the same way.
5. **Pieces.** A line that does not fit even in an empty chunk is cut into pieces of at most `room - chars(line)` characters. Each piece is its own chunk, with its own selection.
   - A piece ends after the last whitespace character before the limit, if there is one past the piece's start.
   - Otherwise it ends at the limit, moved back one place if that would split a surrogate pair. If that would leave the piece empty, the pair stays whole.
   - A piece cut inside a word may select more than its line. Its `keys` and `chars` are still its own, and `reviewFiles`' pre-send guard halves it if it no longer fits.
6. **A line that selects too much (B18).** If `room - chars(line) < 1`, the file is unreviewed with `{ path, code: "too-large", reason }`, and none of its chunks are kept. The reason is `line at offset <offset> selects too much of the ontology for the configured budget (projection <chars> characters, budget <maxRequestChars>; raise ONTOLOGY_MAX_REQUEST_CHARS)`, where `offset` is the line's offset in the file.

Every chunk is `{ path, offset, text, keys, chars }`. `keys` and `chars` always equal `project(catalog, text).keys` and `.text.length`. The tests assert this for every chunk they plan.

- [ ] **Step 1: Add the imports** to the shipped test. Replace `import { catalogOntology } from "./semantic-review-model.mjs";` with:

```js
import { createModelAuth } from "./llm-auth.mjs";
import { catalogOntology, REQUEST_OVERHEAD, reviewFiles } from "./semantic-review-model.mjs";
```

- [ ] **Step 2: Add the failing tests** to the end of `ontology-projection.test.mjs`:

```js
// B17 B18: planning. Every test checks each planned chunk against project of its own text.
const PATH = "docs/a.md";
const EMPTY = matched(catalog, "").text.length;
const fixed = REQUEST_OVERHEAD + PATH.length;
const cost = (text) => matched(catalog, text).text.length + text.length;

function assertPlanned(file, planned, budget) {
  const chunks = planned.chunks.filter((chunk) => chunk.path === file.path);
  assert.equal(chunks.map((chunk) => chunk.text).join(""), file.text);
  for (const chunk of chunks) {
    assert.equal(file.text.slice(chunk.offset, chunk.offset + chunk.text.length), chunk.text);
    const own = matched(catalog, chunk.text);
    assert.deepEqual(chunk.keys, own.keys, JSON.stringify(chunk.text));
    assert.equal(chunk.chars, own.text.length, JSON.stringify(chunk.text));
    if (budget !== undefined) assert.ok(fixed + chunk.chars + chunk.text.length <= budget, JSON.stringify(chunk.text));
  }
  return chunks;
}

test("B17 paragraphs are packed into a chunk while its own projection and text still fit", () => {
  const text = "An AuditEvent was written.\n\nA microphone.\n\nThe speakers.\n\nAn analysis.\n";
  const budget = fixed + cost("An AuditEvent was written.\n\nA microphone.\n\n");
  assert.ok(fixed + cost(text) > budget);
  const planned = matched.plan(catalog, [{ path: PATH, text }], budget);
  assert.deepEqual(planned.unreviewed, []);
  const chunks = assertPlanned({ path: PATH, text }, planned, budget);
  assert.equal(chunks[0].text, "An AuditEvent was written.\n\nA microphone.\n\n");
  assert.ok(chunks.length > 1);
});

test("B17 a file whose paragraphs each fit is reviewed, however much the whole file selects", () => {
  const paragraphs = ["AuditEvent rows.\n\n", "RemovalReason rows.\n\n", "Microphone rows.\n\n", "Speaker rows.\n"];
  const text = paragraphs.join("");
  const budget = fixed + Math.max(...paragraphs.map(cost));
  assert.ok(fixed + matched(catalog, text).text.length > budget);
  const planned = matched.plan(catalog, [{ path: PATH, text }], budget);
  assert.deepEqual(planned.unreviewed, []);
  assertPlanned({ path: PATH, text }, planned, budget);
});

test("B17 a paragraph that cannot fit on its own is divided into its lines", () => {
  const lines = ["An AuditEvent was written.\n", "A microphone.\n", "The speakers.\n"];
  const text = lines.join("");
  const budget = fixed + Math.max(...lines.map(cost));
  assert.ok(fixed + cost(text) > budget);
  const planned = matched.plan(catalog, [{ path: PATH, text }], budget);
  assert.deepEqual(planned.unreviewed, []);
  const chunks = assertPlanned({ path: PATH, text }, planned, budget);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) assert.ok(chunk.text.endsWith("\n"));
});

test("B17 a line too long for its room is cut at whitespace, else between characters, never inside a surrogate pair", () => {
  const words = "plain words ".repeat(20).trimEnd();
  const budget = fixed + EMPTY + 40;
  const spaced = assertPlanned({ path: PATH, text: words }, matched.plan(catalog, [{ path: PATH, text: words }], budget), budget);
  assert.ok(spaced.length > 1);
  for (const chunk of spaced.slice(0, -1)) assert.ok(chunk.text.endsWith(" "), JSON.stringify(chunk.text));
  const solid = "x".repeat(25);
  const cut = assertPlanned({ path: PATH, text: solid }, matched.plan(catalog, [{ path: PATH, text: solid }], fixed + EMPTY + 10), fixed + EMPTY + 10);
  assert.deepEqual(cut.map((chunk) => chunk.text.length), [10, 10, 5]);
  const faces = "\u{1F600}".repeat(6);
  const pairs = assertPlanned({ path: PATH, text: faces }, matched.plan(catalog, [{ path: PATH, text: faces }], fixed + EMPTY + 5));
  for (const chunk of pairs) assert.doesNotMatch(chunk.text, /^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u);
});

test("B18 when the name index leaves no room, every file is too-large with a reason naming the index", () => {
  const budget = fixed + EMPTY;
  const planned = matched.plan(catalog, [{ path: PATH, text: "x" }], budget);
  assert.deepEqual(planned.chunks, []);
  assert.deepEqual(planned.unreviewed, [{ path: PATH, code: "too-large",
    reason: `ontology name index too large for the configured budget (name index ${EMPTY} characters, budget ${budget}; raise ONTOLOGY_MAX_REQUEST_CHARS)` }]);
  assertPlanned({ path: PATH, text: "x" }, matched.plan(catalog, [{ path: PATH, text: "x" }], budget + 1), budget + 1);
});

test("B18 a line whose own projection leaves no room makes its file too-large, naming the line's offset", () => {
  const text = "A microphone.\nAn AuditEvent was written.\n";
  const line = "An AuditEvent was written.\n";
  const budget = fixed + matched(catalog, line).text.length;
  const planned = matched.plan(catalog, [{ path: PATH, text }, { path: "docs/b.md", text: "A microphone.\n" }], budget);
  assert.deepEqual(planned.unreviewed, [{ path: PATH, code: "too-large",
    reason: `line at offset 14 selects too much of the ontology for the configured budget (projection ${matched(catalog, line).text.length} characters, budget ${budget}; raise ONTOLOGY_MAX_REQUEST_CHARS)` }]);
  assert.deepEqual(planned.chunks.map((chunk) => chunk.path), ["docs/b.md"]);
  assertPlanned({ path: "docs/b.md", text: "A microphone.\n" }, planned, budget);
});

test("B6 B17 a banned alias that spans a paragraph break selects for the chunk that holds both parts", () => {
  const text = "A deletion\n\nrequest was filed.\n";
  assert.ok(!keys("A deletion\n\n").includes("Entities:SessionRemoval"));
  assert.ok(!keys("request was filed.\n").includes("Entities:SessionRemoval"));
  const [chunk] = assertPlanned({ path: PATH, text }, matched.plan(catalog, [{ path: PATH, text }], 200_000), 200_000);
  assert.ok(chunk.keys.includes("Entities:SessionRemoval"));
});

test("B9 B13 planning is deterministic, and an empty file is one chunk with the name index only", () => {
  const files = [{ path: PATH, text: "An AuditEvent was written.\n\nA microphone.\n" }, { path: "docs/empty.md", text: "" }];
  const budget = fixed + cost("An AuditEvent was written.\n\n");
  const planned = matched.plan(catalog, files, budget);
  assert.deepEqual(matched.plan(catalogOntology(ONTOLOGY, SECTIONS), files, budget), planned);
  assertPlanned(files[0], planned, budget);
  assert.deepEqual(planned.chunks.at(-1), { path: "docs/empty.md", offset: 0, text: "", keys: [], chars: EMPTY });
});

test("B21 a full projector has no plan", () => {
  assert.equal(createProjector({ mode: "full" }).plan, undefined);
  assert.equal(typeof matched.plan, "function");
});

test("each request is projected once: a file that fits one chunk is not projected again", async () => {
  const calls = [];
  const counted = Object.assign((value, text) => { calls.push(text); return matched(value, text); }, { mode: matched.mode, plan: matched.plan });
  let requests = 0;
  const one = "A microphone.\n\nPlain words.\n";
  const many = "An AuditEvent was written.\n\nThe speakers.\n\nAn analysis.\n";
  const files = [{ path: PATH, text: one }, { path: "docs/b.md", text: many }];
  const budget = fixed + cost("An AuditEvent was written.\n\n") + 4;
  const result = await reviewFiles({ files, ontologyText: ONTOLOGY,
    sections: SECTIONS, model: "m", baseUrl: "https://model.example/v1", headSha: "a".repeat(40), project: counted,
    auth: createModelAuth({ env: { K: "k" }, staticKeyVar: "K" }), maxRequestChars: budget,
    fetchImpl: async () => { requests++; return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ findings: [] }) } }] }) }; } });
  assert.equal(calls.filter((text) => text === one).length, 1);
  assert.deepEqual(result.reviewed, [PATH, "docs/b.md"]);
  assert.equal(calls.length, requests);
  assert.ok(requests > 2);
  const planned = matched.plan(catalog, files, budget);
  assert.equal(assertPlanned(files[0], planned, budget).length, 1);
  assertPlanned(files[1], planned);
});
```

- [ ] **Step 3: Run the tests.** Run `node --test templates/scripts/ontology-projection.test.mjs`. The new tests fail because `plan` is undefined. The last test, which reaches `plan` only after its counts, fails with 2 projections against 1, as it does on `main`. That is the known minor this task removes.
- [ ] **Step 4: Implement.** Add `import { REQUEST_OVERHEAD } from "./semantic-review-model.mjs";` at the top of `ontology-projection.mjs`. The model module still imports nothing from this one. Add:

```js
// The rendered length of a selection's projection, without rendering it.
function charsOf(index, selected) {
  let chars = index.emptyChars;
  const sections = new Set();
  for (const key of selected) {
    chars += index.groupChars.get(key);
    sections.add(index.catalog.groups.get(key).section);
  }
  for (const section of sections) chars += section.length + 5;
  return chars;
}

// Units keep their line endings, so a file's units concatenate back to its text.
function splitLines(text, offset) {
  const units = [];
  for (const match of text.matchAll(/[^\n]*(?:\n|$)/g)) {
    if (match[0] === "") continue;
    units.push({ offset: offset + match.index, text: match[0] });
  }
  return units;
}

function splitParagraphs(text) {
  const units = [];
  for (const line of splitLines(text, 0)) {
    const blank = !line.text.trim();
    const last = units.at(-1);
    if (last && (blank || !last.closed)) {
      last.text += line.text;
      if (blank) last.closed = true;
    } else {
      units.push({ offset: line.offset, text: line.text, closed: blank });
    }
  }
  return units;
}

function cutLine(unit, size) {
  const pieces = [];
  const text = unit.text;
  for (let start = 0; start < text.length;) {
    let end = Math.min(text.length, start + size);
    if (end < text.length) {
      let space = end - 1;
      while (space > start && !/\s/u.test(text[space])) space--;
      if (space > start) end = space + 1;
      else if (/[\uD800-\uDBFF]/.test(text[end - 1]) && /[\uDC00-\uDFFF]/.test(text[end])) end = end - 1 > start ? end - 1 : end + 1;
    }
    pieces.push({ offset: unit.offset + start, text: text.slice(start, end) });
    start = end;
  }
  return pieces;
}

const nameIndexReason = (chars, budget) =>
  `ontology name index too large for the configured budget (name index ${chars} characters, budget ${budget}; raise ONTOLOGY_MAX_REQUEST_CHARS)`;
const lineReason = (offset, chars, budget) =>
  `line at offset ${offset} selects too much of the ontology for the configured budget (projection ${chars} characters, budget ${budget}; raise ONTOLOGY_MAX_REQUEST_CHARS)`;

class LineTooLarge extends Error {}

function planFile(index, file, maxRequestChars) {
  const room = maxRequestChars - REQUEST_OVERHEAD - file.path.length;
  const chunks = [];
  let current = null;
  const finish = (chunk, selected) => {
    chunks.push({ path: file.path, offset: chunk.offset, text: chunk.text, keys: ordered(index, selected), chars: charsOf(index, selected) });
  };
  const flush = () => {
    if (current) finish(current, current.selected);
    current = null;
  };
  const tryAdd = (unit) => {
    const text = current ? current.text + unit.text : unit.text;
    const found = current ? addAll(new Set(current.found), unit.found) : new Set(unit.found);
    const selected = withRelationships(index, phraseMatches(index, text, new Set(found)));
    if (charsOf(index, selected) + text.length > room) return false;
    current = { offset: current ? current.offset : unit.offset, text, found, selected };
    return true;
  };
  const place = (unit, isLine) => {
    unit.found = unitMatches(index, unit.text);
    if (tryAdd(unit)) return;
    flush();
    if (tryAdd(unit)) return;
    if (!isLine) {
      for (const line of splitLines(unit.text, unit.offset)) place(line, true);
      return;
    }
    const chars = charsOf(index, select(index, unit.text));
    if (room - chars < 1) throw new LineTooLarge(lineReason(unit.offset, chars, maxRequestChars));
    for (const piece of cutLine(unit, room - chars)) finish(piece, select(index, piece.text));
  };
  for (const paragraph of splitParagraphs(file.text)) place(paragraph, false);
  flush();
  return chunks;
}
```

  `charsOf` follows from `render`. The header, then for each selected section `"\n\n## " + section` (its length plus 5), then `"\n" + row` for each selected row, then the index text. The test's `chunk.chars === project(...).text.length` pins it.

  Then, in `createProjector`, add `plan` beside `project` and return `Object.assign(project, { mode, plan })`:

```js
export function createProjector({ mode = "matched", bannedAliases = [] } = {}) {
  if (!PROJECTION_MODES.includes(mode)) throw new Error(`unknown projection mode: ${JSON.stringify(mode)}`);
  if (mode === "full") return Object.assign((catalog) => ({ text: catalog.projection, keys: [...catalog.evidenceKeys] }), { mode });
  const indexes = new WeakMap();
  const indexFor = (catalog) => {
    if (!indexes.has(catalog)) indexes.set(catalog, buildIndex(catalog, bannedAliases));
    return indexes.get(catalog);
  };
  const project = (catalog, text) => {
    const index = indexFor(catalog);
    const selected = select(index, text);
    return { text: render(index, selected), keys: ordered(index, selected) };
  };
  const plan = (catalog, files, maxRequestChars) => {
    const index = indexFor(catalog);
    const chunks = [];
    const unreviewed = [];
    for (const file of files) {
      if (REQUEST_OVERHEAD + file.path.length + index.emptyChars >= maxRequestChars) {
        unreviewed.push({ path: file.path, code: "too-large", reason: nameIndexReason(index.emptyChars, maxRequestChars) });
        continue;
      }
      if (file.text.length === 0) {
        chunks.push({ path: file.path, offset: 0, text: "", keys: [], chars: index.emptyChars });
        continue;
      }
      try {
        chunks.push(...planFile(index, file, maxRequestChars));
      } catch (error) {
        if (!(error instanceof LineTooLarge)) throw error;
        unreviewed.push({ path: file.path, code: "too-large", reason: error.message });
      }
    }
    return { chunks, unreviewed };
  };
  return Object.assign(project, { mode, plan });
}
```

- [ ] **Step 5: Run the tests.** Run the shipped test, the shipped test alone from inside `templates/scripts`, then `npm test`. All pass.
- [ ] **Step 6: Commit.** `feat: matched projector plans chunks by paragraph, line and piece (#135)`.

## Task 16 — runbook and README

**Files:** `templates/docs/ontology-semantic-review.md`, `README.md`, `tests/matched-projection-acceptance.test.mjs`.

- [ ] **Step 1: Extend the B23 acceptance test.** In `tests/matched-projection-acceptance.test.mjs`, in "B23 the installed runbook describes the modes, the record line and the caveats", add these to the `expected` list:

```js
      "ontology.ttl", "ontology.md", "other end", "Each key is a section name", "paragraph",
      "ontology name index too large for the configured budget", "selects too much of the ontology for the configured budget",
```

  Run `node --test tests/matched-projection-acceptance.test.mjs`. It fails on "ontology.ttl".
- [ ] **Step 2: Rewrite the runbook's "Ontology projection" section.** Keep its place after "Request budget", its setting example, the invalid-value sentence and the record line. Write one line per paragraph or list item. It covers:
  - **The modes table.** The `"matched"` row says each request carries the full rows of the entries that piece of the file selects, the relationships of those entries, and the name index grouped by section. The `"full"` row is unchanged.
  - **Which ontology is read** (B25, ADR 0029). The reviewer reads `ontology.ttl` at the pull request's revision and renders it exactly as `node scripts/build-ontology.mjs` writes `ontology.md`. It reads `ontology.md` only when `ontology.ttl` does not exist at that revision. A source that exists but cannot be read or parsed makes the run unavailable. The drift reviewer and graph naming still read `ontology.md`.
  - **How entries are matched.** The existing rules and the stop list, written exactly as `data, info, item, kind, list, name, type, value, values, state, status, record, result, config, event, events`. Replace the one-hop paragraph with relationships only (B7):
    - every relationship whose From or To is a selected entry is added, with every Relationships row that shares its From;
    - the entry at the other end is not added;
    - a name mentioned in an entry's description adds nothing.
  - **The name index** (B24). Show the format in a `text` block, using the ADR 0031 example: the `## Evidence keys` heading, the sentence "Each key is a section name, a colon, and one name listed under it, for example Entities:AuditEvent.", then `Entities: AuditEvent, StudySession, SessionRemoval` and `Enums: RemovalReason, SessionRemovalState`. A key the model forms from it is checked against the whole ontology, as before. `"full"` keeps one key per line.
  - **Planning by paragraph** (B17). In matched mode, a file is divided into paragraphs, and paragraphs are packed into a request while it still fits, each request with the projection its own text selects. A paragraph too large for a request is divided into lines, and a line too long is cut into pieces. A file whose paragraphs each fit is reviewed however much of the ontology the whole file mentions. In `"full"` mode, files are divided as before.
  - **The record line**, unchanged.
  - **Limits.**
    - The two too-large reasons, quoted with placeholders, and what each means: the name index alone does not fit, so every file is too-large; or one line selects too much. Both name ONTOLOGY_MAX_REQUEST_CHARS, and status descriptions do not change.
    - The paraphrase caveat. A matched review can miss a paraphrase that shares no name word with its entry, including one caught before only because a neighbouring entry's rows were sent. Set `"full"` if that matters more than request size.
    - The measured sizes. The median matched request was 42% of the full projection for JEPA-Speech and 60% for InternalOntology when this mode was amended. The name index costs about 17 to 20 characters per entry, so it alone fills the default budget at about 10,000 to 11,000 entries.
    - The update order. Update the kit first, then set `"full"`, because older scripts reject the unknown key. Keep the words "update the kit first".

  Use backticks only for key names, values, file names and ontology terms (`OntologyProjection`, `ProjectionMode`).
- [ ] **Step 3: Update README.md.** Rewrite the matched-projection sentence in the semantic pilot paragraph: each request carries the matched `OntologyProjection` by default, which is the ontology entries that piece of the file selects, their relationships, and a name index grouped by section, read from `ontology.ttl`. `semanticReview.projection: "full"` restores the whole ontology; see the runbook.
- [ ] **Step 4: Check and commit.** Run the acceptance test, `node scripts/check-ontology-terms.mjs` and `npm test`, then commit: `docs: runbook covers the ontology source, relationships only and planning by paragraph (#135)`.

## Task 17 — wrap-up, re-measurement and handoff

Task 21 replaces this checkpoint. Keep the measurement script below for its use.

- [ ] **Step 1: Check the ontology.** Confirm that `docs/ontology.md` still matches the code: the `OntologyProjection` row (relationships only, the grouped name index), `ProjectionMode`, and the `OntologyConfig` and `SemanticReviewRun` rows. The amendment adds no domain term.
- [ ] **Step 2: Run the full suite.** Run `npm test` and check its exit status.
- [ ] **Step 3: Run the shipped tests on every Node version.** From `templates/scripts`, run `ontology-projection.test.mjs`, `semantic-review-model.test.mjs`, `semantic-review-github.test.mjs` and `semantic-review-worker.test.mjs` alone on Node 20, 22 and 24 in Docker, as `.github/workflows/test.yml` does.
- [ ] **Step 4: Re-measure with the built module.** Run this from the repository root with `JEPA` set to a JEPA-Speech checkout. Compare against the task plan's Measurements, and report the figures in the build handoff.

```js
// node measure.mjs (scratch; do not commit)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { catalogOntology, REQUEST_OVERHEAD } from "./templates/scripts/semantic-review-model.mjs";
import { createProjector } from "./templates/scripts/ontology-projection.mjs";
import { parseTurtle, renderOntologyMarkdown, triplesToModel } from "./templates/scripts/owl-ontology.mjs";

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const matched = createProjector({});
for (const [label, repo] of [["JEPA-Speech", process.env.JEPA], ["InternalOntology", "."]]) {
  const config = JSON.parse(readFileSync(`${repo}/ontology.config.json`, "utf8"));
  let text;
  try { text = renderOntologyMarkdown(triplesToModel(parseTurtle(readFileSync(`${repo}/docs/ontology.ttl`, "utf8")))); }
  catch { text = readFileSync(`${repo}/docs/ontology.md`, "utf8"); }
  const catalog = catalogOntology(text, config.sections);
  const flat = ["", "", "## Evidence keys", "", ...[...catalog.evidenceKeys].map((key) => `- ${key}`)].join("\n").length;
  const grouped = matched(catalog, "").text.length - "# Canonical ontology evidence".length;
  const shares = [];
  for (const path of execFileSync("git", ["-C", repo, "ls-files", "*.md"], { encoding: "utf8" }).trim().split("\n")) {
    const planned = matched.plan(catalog, [{ path, text: readFileSync(`${repo}/${path}`, "utf8") }], 200_000);
    if (planned.chunks.length) shares.push(Math.max(...planned.chunks.map((chunk) => chunk.chars)) / catalog.projection.length);
  }
  console.log(`${label}: ${catalog.evidenceKeys.size} entries; index ${flat} -> ${grouped} (${(100 * (flat - grouped) / flat).toFixed(1)}% smaller); ` +
    `ceiling about ${Math.floor((200_000 - REQUEST_OVERHEAD - 29) / (grouped / catalog.evidenceKeys.size))} entries; ` +
    `median matched request ${(100 * median(shares)).toFixed(1)}% over ${shares.length} files`);
}
```

  Also replay the ten recorded findings. For each finding in the hidden run records on JEPA-Speech pull requests #210 and #217, plan its file at its recorded revision against that revision's `ontology.ttl`. Check that the chunk holding the quote has the cited key in `keys`.
- [ ] **Step 5: Hand off to the user.** In lite mode, the user phase opens the build PR, so post the handoff instead of opening one. The handoff includes:
  - links to ADRs 0029 to 0031;
  - the measured figures from Step 4;
  - the per-consumer follow-up: re-run the installer with `--force --with-semantic-review`. A consumer whose `ontology.ttl` is missing keeps reading `ontology.md`;
  - for the user phase:
    - regenerate the acceptance tests, the walkthrough driver and the large-ontology helper, committed locally as b1a2a41 on `feature/matched-ontology-projection/user`, against the amended B2–B8, B17, B18, B24 and B25;
    - the scaling test should now show the broad file reviewed in several requests;
    - a live model run in JEPA-Speech is required, because only a real model can show that findings cite `Section:Name` keys correctly from the grouped name index (ADR 0031). Ask the maintainer before committing or pushing in JEPA-Speech;
  - what was not verified: the live model run.

# Part 2 — the first pass (executed in PR #141)

These tasks were executed and merged in PR #141. They are kept as the record that Part 1 builds on. Do not execute them again. Where Part 1 replaces part of a task, the task says so.

## Task 1 — grouped rows in `catalogOntology`

**Files:** `templates/scripts/semantic-review-model.mjs`, `templates/scripts/semantic-review-model.test.mjs`.

**Produces:** `catalogOntology(markdown, sections)` returns its existing fields plus `groups`:
`Map<evidenceKey, { section, name, rows: string[] }>`.
- Keys are in order of first appearance.
- `rows` holds, in source order, every table line keyed to that evidence key, and every invariant bullet keyed to it.
- An invariant bullet's row is the bullet line plus its continuation lines, joined with `"\n"`, as `rows` builds it today.
- `projection`, `entries`, `evidenceKeys` and `rows` are unchanged. `rows` still keeps the last row per key.

- [x] **Step 1: Add the failing tests** to the end of `semantic-review-model.test.mjs`:

```js
const GROUPED = "## Entities\n\n| Name | Description |\n| --- | --- |\n| `Analysis` | a pass |\n| `Speaker` | a person |\n\n" +
  "## Relationships\n\n| From | Relationship | To | Cardinality |\n| --- | --- | --- | --- |\n" +
  "| `Analysis` | scores | `Speaker` | 1 → 1 |\n| `Analysis` | writes | `Speaker` | 1 → many |\n\n" +
  "## Business Rules & Invariants\n\n- **`Analysis`** — first\n  continued.\n- **`Analysis`** — second.\n";
const GROUPED_SECTIONS = { required: ["Entities", "Relationships", "Business Rules & Invariants"], optional: [] };

test("B8 groups hold every row of an evidence key, in ontology order", () => {
  const catalog = catalogOntology(GROUPED, GROUPED_SECTIONS);
  assert.deepEqual([...catalog.groups.keys()], ["Entities:Analysis", "Entities:Speaker", "Relationships:Analysis",
    "Business Rules & Invariants:Analysis"]);
  assert.deepEqual(catalog.groups.get("Relationships:Analysis"), { section: "Relationships", name: "Analysis",
    rows: ["| `Analysis` | scores | `Speaker` | 1 → 1 |", "| `Analysis` | writes | `Speaker` | 1 → many |"] });
  assert.deepEqual(catalog.groups.get("Business Rules & Invariants:Analysis").rows,
    ["- **`Analysis`** — first\n  continued.", "- **`Analysis`** — second."]);
  assert.equal(catalog.rows.get("Relationships:Analysis"), "| `Analysis` | writes | `Speaker` | 1 → many |");
});

test("B21 the projection text is unchanged by grouping", () => {
  assert.equal(catalogOntology(GROUPED, GROUPED_SECTIONS).projection,
    "# Canonical ontology evidence\n\n## Entities\n| Name | Description |\n| --- | --- |\n| `Analysis` | a pass |\n" +
    "| `Speaker` | a person |\n\n## Relationships\n| From | Relationship | To | Cardinality |\n| --- | --- | --- | --- |\n" +
    "| `Analysis` | scores | `Speaker` | 1 → 1 |\n| `Analysis` | writes | `Speaker` | 1 → many |\n\n" +
    "## Business Rules & Invariants\n- **`Analysis`** — first\n  continued.\n- **`Analysis`** — second.\n\n" +
    "## Evidence keys\n\n- Entities:Analysis\n- Entities:Speaker\n- Relationships:Analysis\n- Business Rules & Invariants:Analysis");
});
```

- [x] **Step 2: Run the tests.** Run `node --test templates/scripts/semantic-review-model.test.mjs`. The first test fails because `groups` is undefined. The second passes, which proves today's projection text before the change.
- [x] **Step 3: Implement.** Use a local `groupFor(section, name)` that creates groups on demand.
  - Push each keyed table line.
  - Push each named invariant bullet, and remember its group and its index in `rows`.
  - Append each continuation line to that remembered row while the invariant is open, under the same condition that already appends to `rows`.
  - Return `groups` beside the existing fields.
- [x] **Step 4: Run the tests.** Run the focused test, then `npm test`. Both pass.
- [x] **Step 5: Commit.** `feat: catalog groups every ontology row by evidence key (#135)`.

## Task 2 — the projection module, its shipped test, the installer and CI

> Replaced in part by Task 14: the one hop in Step 4 and the one-key-per-line name index in Step 5 no longer apply in matched mode. The tests "B7 one hop…", "B8 every row of a selected key travels together" and "B1 B13 … the whole name index" below were replaced there.

**Files:**
- Create `templates/scripts/ontology-projection.mjs` and `templates/scripts/ontology-projection.test.mjs`.
- Modify `bin/install-ontology.mjs`, `tests/install-ontology.test.mjs` and `.github/workflows/test.yml`.

**Consumes:** `catalog.groups` (Task 1), `catalog.projection` and `catalog.evidenceKeys`.

**Produces:** these exports.
- `PROJECTION_MODES = ["matched", "full"]`.
- `STOP_WORDS`: a JavaScript Set of exactly `data info item kind list name type value values state status record result config event events`.
- `nameWords(name) → string[]` and `markdownWords(text) → Set<string>`.
- `createProjector({ mode = "matched", bannedAliases = [] } = {}) → project`.
  - The projector has `project.mode`.
  - `project(catalog, text) → { text, keys }`.
  - Any other mode throws `unknown projection mode: ${JSON.stringify(mode)}`.

The module has no I/O and no imports. A projector may return a plain object; `reviewFiles` awaits it
anyway, so a later asynchronous selector fits (ADR 0026).

- [x] **Step 1: Write the shipped test**, `templates/scripts/ontology-projection.test.mjs`, in full. It imports only `./semantic-review-model.mjs` and `./ontology-projection.mjs`, so it runs alone in an adopting repository:

```js
// Shipped with the semantic reviewer. Runs standalone in an adopting repository: the fixtures are
// inline and synthetic, modelled on the ten findings JEPA-Speech recorded (feature #135, B11).
import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogOntology } from "./semantic-review-model.mjs";
import { createProjector, markdownWords, nameWords, STOP_WORDS } from "./ontology-projection.mjs";

const ONTOLOGY = [
  "# Ontology", "",
  "## Entities", "",
  "| Name | Fields | Description |", "| --- | --- | --- |",
  "| `AuditEvent` | `eventId`, `occurredAt` | One metadata record sent through the `AuditHook`. |",
  "| `StudySession` | `sessionId` | One stored recording session. |",
  "| `SessionRemoval` | `removalId`, `state` | Removes a `StudySession`; moves through `SessionRemovalState`. |",
  "| `Analysis` | `analysisId` | One scoring pass. |",
  "| `Speaker` | `speakerCode` | A person who records. |",
  "| `DataType` | `code` | A name whose words are all stopped. |",
  "| `Microphone` | `model` | Unrelated to removal or audit. |",
  "",
  "## Enums", "",
  "| Name | Values | Description |", "| --- | --- | --- |",
  "| `RemovalReason` | `TesterWithdrew`, `TestRecording`, `BadRecording`, `Other` | Why a session was removed. |",
  "| `SessionRemovalState` | `Requested`, `Removing`, `Removed`, `Failed` | Where a `SessionRemoval` stands. |",
  "",
  "## Relationships", "",
  "| From | Relationship | To | Cardinality |", "| --- | --- | --- | --- |",
  "| `Analysis` | scores | `StudySession` | many → 1 |",
  "| `SessionRemoval` | removes | `StudySession` | 1 → 1 |",
  "| `Analysis` | credits | `Speaker` | many → many |",
  "| `Analysis` | writes | `AuditEvent` | 1 → many |",
  "",
  "## Business Rules & Invariants", "",
  "- **`SessionRemoval`** — only forward transitions are allowed;",
  "  the purge job resumes interrupted removals.",
  "- **`AuditEvent`** — never carries audio.",
  "- **`SessionRemoval`** — the short note is never sent to the audit system.",
  "",
].join("\n");
const SECTIONS = { required: ["Entities", "Enums", "Relationships", "Business Rules & Invariants"], optional: [] };
const catalog = catalogOntology(ONTOLOGY, SECTIONS);
const matched = createProjector({ mode: "matched", bannedAliases: [{ phrase: "deletion request", nameInstead: ["SessionRemoval"] }] });
const keys = (text) => matched(catalog, text).keys;

test("name words split at case changes and drop short and stop-listed words", () => {
  assert.deepEqual(nameWords("SessionRemovalState"), ["session", "removal"]);
  assert.deepEqual(nameWords("DataType"), []);
  assert.deepEqual(nameWords("UsbPort"), ["port"]);
  assert.ok(STOP_WORDS.has("status") && STOP_WORDS.has("event") && STOP_WORDS.size === 16);
  assert.deepEqual([...markdownWords("The RemovalStatus, audits!")], ["the", "removal", "status", "audits"]);
});

// B11: each recorded JEPA-Speech finding, by its quoted passage alone, selects the cited entry.
for (const [quote, cited] of [
  ["RemovalStatus", "Enums:SessionRemovalState"],
  ["- AuditRecord (concept) — [View claims](#node-3cfce651e985363113811847e08b3b98)", "Entities:AuditEvent"],
  ["**AuditRecord** is documented by **docs/ontology.md**. **Direct**.", "Entities:AuditEvent"],
  ["**src/JepaSpeech.Console.Domain/AuditEvents.cs** implements **AuditRecord**. **Direct**.", "Entities:AuditEvent"],
  ["- RemovalStatus (concept)", "Enums:SessionRemovalState"],
  ["**src/JepaSpeech.Console.Domain/SessionRemoval.cs** implements **RemovalStatus**. **Direct**.", "Enums:SessionRemovalState"],
  ["the removal moves through the states pending, running, done and failed", "Enums:SessionRemovalState"],
  ["the removal moves through the states requested, removing, removed and failed", "Enums:SessionRemovalState"],
  ["the deletion moves through the states pending, running, done and failed", "Enums:SessionRemovalState"],
  ["the reason for it is one of: tester left, test run, bad take or miscellaneous", "Enums:RemovalReason"],
]) {
  test(`B11 ${JSON.stringify(quote)} selects ${cited}`, () => assert.ok(keys(quote).includes(cited)));
}

test("B2 an exact name selects its entry only as a case-sensitive whole word", () => {
  assert.deepEqual(keys("A DataType row."), ["Entities:DataType"]);
  assert.deepEqual(keys("A datatype row, a data type, DataTypes."), []);
});

test("B3 a name word selects alone or with s or es", () => {
  assert.ok(keys("two microphones").includes("Entities:Microphone"));
  assert.ok(keys("the speakers").includes("Entities:Speaker"));
  assert.deepEqual(keys("microphonery"), []);
});

test("B4 enum value words select the enum", () => {
  assert.ok(keys("the states requested, removing, removed and failed").includes("Enums:SessionRemovalState"));
  assert.ok(keys("it withdrew").includes("Enums:RemovalReason"));
});

test("B5 a stop-listed or short word selects nothing", () => {
  assert.deepEqual(keys("the data type, its status and state, one event"), []);
});

test("B6 a banned alias phrase selects its nameInstead entries, as whole words in any case", () => {
  assert.ok(keys("A Deletion\n  Request was filed.").includes("Entities:SessionRemoval"));
  assert.ok(!keys("a deletion requester").includes("Entities:SessionRemoval"));
});

test("B7 one hop adds backticked names and relationship ends, and stops there", () => {
  assert.deepEqual(keys("An AuditEvent was written."), [
    "Entities:AuditEvent", "Entities:Analysis", "Relationships:Analysis", "Business Rules & Invariants:AuditEvent",
  ]);
  assert.deepEqual(keys("A microphone."), ["Entities:Microphone"]);
});

test("B8 every row of a selected key travels together", () => {
  const { text } = matched(catalog, "An AuditEvent was written.");
  for (const verb of ["scores", "credits", "writes"]) assert.ok(text.includes(`| \`Analysis\` | ${verb} |`), verb);
  assert.ok(!text.includes("| `SessionRemoval` | removes |"));
});

test("B1 B13 the text is selected rows by section in ontology order, then the whole name index", () => {
  const index = catalog.projection.slice(catalog.projection.indexOf("\n\n## Evidence keys"));
  assert.equal(matched(catalog, "nothing at all").text, `# Canonical ontology evidence${index}`);
  assert.deepEqual(matched(catalog, "nothing at all").keys, []);
  assert.equal(matched(catalog, "A microphone.").text,
    `# Canonical ontology evidence\n\n## Entities\n| \`Microphone\` | \`model\` | Unrelated to removal or audit. |${index}`);
  const invariant = matched(catalog, "a SessionRemoval").text;
  assert.ok(invariant.includes("- **`SessionRemoval`** — only forward transitions are allowed;\n  the purge job resumes interrupted removals.\n- **`SessionRemoval`** — the short note"));
});

test("B9 the same inputs give the same projection", () => {
  const text = "the removal moves through the states pending, running, done and failed";
  assert.deepEqual(matched(catalog, text), matched(catalogOntology(ONTOLOGY, SECTIONS), text));
});

test("B21 full mode returns today's projection and every key", () => {
  const full = createProjector({ mode: "full" });
  assert.equal(full.mode, "full");
  assert.equal(matched.mode, "matched");
  assert.equal(full(catalog, "anything").text, catalog.projection);
  assert.deepEqual(full(catalog, "anything").keys, [...catalog.evidenceKeys]);
});

test("an unknown mode is rejected", () => {
  assert.throws(() => createProjector({ mode: "embedding" }), /unknown projection mode: "embedding"/);
});

test("names with regex characters match literally, and an alias naming no entry selects nothing", () => {
  const odd = catalogOntology("## Entities\n\n| Name | Description |\n| --- | --- |\n| `Data.Item` | a row |\n| `C++Type` | a kind |\n",
    { required: ["Entities"], optional: [] });
  const project = createProjector({ bannedAliases: [{ phrase: "ghost (term)", nameInstead: ["Nowhere"] }] });
  assert.deepEqual(project(odd, "uses C++Type and Data.Item").keys, ["Entities:Data.Item", "Entities:C++Type"]);
  assert.deepEqual(project(odd, "uses DataXItem and C+Type").keys, []);
  assert.deepEqual(project(odd, "a ghost (term) appears").keys, []);
});
```

- [x] **Step 2: Run the test.** Run `node --test templates/scripts/ontology-projection.test.mjs`. It fails because the module is not found.
- [x] **Step 3: Implement the word splitting.** The tests do not fully pin these expressions, so use them exactly:

```js
function splitWords(text) {
  return text
    .replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, "$1 $2")      // "RemovalStatus" -> "Removal Status"
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, "$1 $2")      // "HTTPServer" -> "HTTP Server"
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}
// markdownWords(text) = new Set(splitWords(text))
// nameWords(name) = unique splitWords(name) with length >= 4 and not in STOP_WORDS
```

  Whole-word matching, used for both exact names and banned-alias phrases:
  - Escape the phrase for a regex, and turn each whitespace run into `\s+`.
  - Surround it with `(?<![\p{L}\p{N}])` and `(?![\p{L}\p{N}])`.
  - Use the flags `u` for exact names (case-sensitive) and `ui` for banned-alias phrases.

- [x] **Step 4: Implement the selection.** It follows ADR 0027 over `catalog.groups`:
  1. **Base keys:**
     - every group whose `name` matches as a whole word, case-sensitive;
     - every group with a word `w` among its words where the Markdown words include `w`, `w + "s"` or `w + "es"`. A group's words are `nameWords(group.name)`, plus, for the Enums section, `nameWords(cells[1])` of each of its rows, where `cells = row.split("|").slice(1, -1).map(trim)`;
     - for each banned alias whose `phrase` matches as whole words in any case, every group whose `name` is in its `nameInstead`. A name with no group selects nothing.
  2. **One hop, read from base groups only:**
     - every group whose `name` equals the content of a backtick span in one of the base group's rows;
     - every Relationships group with a row whose From (the group name) or To (`cells[2]` without backticks) is a base name. Select that group, plus every group named by that row's From or To.
     - Entries added in this step add nothing further.
- [x] **Step 5: Implement the rendering.**
  - **Matched mode:**
    1. Start with `# Canonical ontology evidence`.
    2. Walk `catalog.groups` in order. Before the first selected group of each section, emit `""` and `## <section>`. Emit every row of each selected group.
    3. End with the name index: `["", "", "## Evidence keys", "", ...evidenceKeys.map((key) => "- " + key)].join("\n")`, appended directly.
    4. `keys` are the selected keys in `groups` order.
  - **Full mode:** `{ text: catalog.projection, keys: [...catalog.evidenceKeys] }`.
- [x] **Step 6: Add the installer entries.** In `bin/install-ontology.mjs`, inside `if (options.withSemanticReview)`, after the `semantic-review-*` loop, add `scripts/ontology-projection.mjs` and `scripts/ontology-projection.test.mjs`, each with `substitute: false, ownedBy: "kit"`. Do not add them to the graph-naming block.
- [x] **Step 7: Add the CI line.** In `.github/workflows/test.yml`, add `node --test ontology-projection.test.mjs` to the step that runs shipped test files from `templates/scripts`.
- [x] **Step 8: Extend the installer test.** In `tests/install-ontology.test.mjs`:

```js
test("the projection module is planned with the semantic reviewer only", () => {
  for (const dest of ["scripts/ontology-projection.mjs", "scripts/ontology-projection.test.mjs"]) {
    const hits = buildPlan({ withSemanticReview: true }).filter((entry) => entry.dest === dest);
    assert.equal(hits.length, 1, dest);
    assert.equal(hits[0].ownedBy, "kit");
  }
  for (const options of [{}, { withDriftReview: true }, { withSourceGraph: true, withGraphNamingReview: true }]) {
    assert.equal(buildPlan(options).some((entry) => entry.dest.includes("ontology-projection")), false, JSON.stringify(options));
  }
});
```

- [x] **Step 9: Run the tests.** Run the shipped test, then the shipped test alone from inside `templates/scripts`, then `npm test`. All pass.
- [x] **Step 10: Commit.** `feat: deterministic ontology projector for the semantic reviewer (#135)`.

## Task 3 — `reviewFiles` projects per file and per request

> Replaced in part by Task 13: a projector with `plan` is planned by `plan`, not against its file's projection. The planning step below still applies to a projector without `plan`.

**Files:** `templates/scripts/semantic-review-model.mjs`, `templates/scripts/semantic-review-model.test.mjs`.

**Consumes:** the projector contract from Task 2. This file and its test must **not** import `ontology-projection.mjs`. The tests use stub projectors.

**Produces:**
- `chunkFiles(files, catalog, maxRequestChars = MAX_REQUEST_CHARS, projectionChars = new Map())`. The capacity for a file uses `projectionChars.get(path) ?? catalog.projection.length`, and so does its too-large reason, which stays word for word: `ontology too large for the configured budget (projection N characters, budget M)`.
- `reviewFiles({ ..., project = fullProjector })`. `fullProjector` is a module-private function with `mode: "full"` that returns `{ text: catalog.projection, keys: [...catalog.evidenceKeys] }`. The function returns `{ reviewed, unreviewed, findings, projections }`.

The behaviour:
1. **Planning (B17).** Before chunking, `await project(catalog, file.text)` for each file, in order. Record the text length per path and pass the Map to `chunkFiles`.
2. **Sending (B1, B19).** `assess(chunk)` first awaits `project(catalog, chunk.text)`. The system message becomes `${SYSTEM_PROMPT}\n\n${projection.text}`.
3. **Guard (review focus 1).**
   - When `REQUEST_OVERHEAD + projection.text.length + chunk.path.length + chunk.text.length > maxRequestChars`, the chunk is not sent. Split it exactly as on a 413.
   - A chunk that cannot be split returns `{ complete: false, code: "too-large", reason: <the chunkFiles too-large reason with this projection's length> }`.
   - Factor the existing 413 split into one helper, `halves(chunk, reason)`, used by both paths. The persistent-413 reason stays `ontology too large: the model rejected the smallest request`.
4. **Summary (B10).** For each request actually sent, keep per path the union of `projection.keys` and the largest `projection.text.length`. Each `projections` item, one per reviewed path in `files` order, is `{ path, mode: project.mode, entriesSent: <union size>, entriesTotal: catalog.evidenceKeys.size, largestChars, fullChars: catalog.projection.length }`.
5. **Unchanged.** Finding validation, `resolveEvidenceKey` and the identity hash stay as they are.

- [x] **Step 1: Update the existing test** "clean response reviews a file and duplicate findings collapse". It deep-compares the whole result, so add the `projections` it now returns: one entry with mode `"full"`, `entriesSent: 1`, `entriesTotal: 1`, and `largestChars` and `fullChars` both equal to `catalogOntology(ontology, sections).projection.length`.
- [x] **Step 2: Add the failing tests.** Add `catalogOntology` to the file's import list if it is missing. Add these helpers below the existing `options` and `completion`, then the tests:

```js
const projector = (sizeFor, keysFor = () => []) =>
  Object.assign(async (_catalog, text) => ({ text: "p".repeat(sizeFor(text)), keys: keysFor(text) }), { mode: "matched" });
const clean = JSON.stringify({ findings: [] });

test("B17 chunks are planned against the file's projection and sent with their own", async () => {
  const text = "alpha line\n".repeat(12);
  const calls = [];
  const sizes = [];
  const project = Object.assign(async (catalog, value) => { calls.push(value); return { text: value === text ? "p".repeat(40) : "p".repeat(10), keys: [] }; }, { mode: "matched" });
  const budget = REQUEST_OVERHEAD + 40 + "docs/a.md".length + 60;
  const result = await reviewFiles({ ...options([{ path: "docs/a.md", text }], async (_url, request) => {
    sizes.push(JSON.parse(request.body).messages[0].content.length); return completion(clean); }), project, maxRequestChars: budget });
  assert.equal(calls[0], text);
  assert.ok(calls.length > 2);
  assert.deepEqual(result.reviewed, ["docs/a.md"]);
  assert.ok(sizes.every((size) => size === sizes[0]));
});

test("B17 a chunk whose own projection outgrows its file's is split before it is sent", async () => {
  const text = "alpha line\n".repeat(12);
  const sent = [];
  const budget = REQUEST_OVERHEAD + 10 + "docs/a.md".length + 50;
  const project = projector((value) => (value === text ? 10 : 30));
  const result = await reviewFiles({ ...options([{ path: "docs/a.md", text }], async (_url, request) => {
    sent.push(JSON.parse(request.body).messages[1].content); return completion(clean); }), project, maxRequestChars: budget });
  assert.deepEqual(result.reviewed, ["docs/a.md"]);
  assert.ok(sent.length > 3);
  for (const body of sent) {
    const chunk = body.slice(body.indexOf("Text:\n") + 6);
    assert.ok(REQUEST_OVERHEAD + 30 + "docs/a.md".length + chunk.length <= budget);
  }
});

test("B18 a chunk that cannot fit even at one character is too-large and never sent", async () => {
  const text = "alpha line\n".repeat(12);
  let called = false;
  const budget = REQUEST_OVERHEAD + 10 + "docs/a.md".length + 50;
  const result = await reviewFiles({ ...options([{ path: "docs/a.md", text }], async () => { called = true; return completion(clean); }),
    project: projector((value) => (value === text ? 10 : 200)), maxRequestChars: budget });
  assert.equal(called, false);
  assert.equal(result.unreviewed[0].code, "too-large");
  assert.equal(result.unreviewed[0].reason, `ontology too large for the configured budget (projection 200 characters, budget ${budget})`);
});

test("an empty file is sent once with its projection and records no entries", async () => {
  let requests = 0;
  const result = await reviewFiles({ ...options([{ path: "docs/empty.md", text: "" }], async () => { requests++; return completion(clean); }),
    project: projector(() => 25) });
  assert.equal(requests, 1);
  assert.deepEqual(result.reviewed, ["docs/empty.md"]);
  assert.deepEqual(result.projections, [{ path: "docs/empty.md", mode: "matched", entriesSent: 0, entriesTotal: 1, largestChars: 25,
    fullChars: catalogOntology(ontology, sections).projection.length }]);
});

test("B21 without a projector the request and result are today's, with a full summary", async () => {
  let system;
  const result = await reviewFiles(options([{ path: "docs/a.md", text: "wrong term" }], async (_url, request) => {
    system = JSON.parse(request.body).messages[0].content; return completion(clean); }));
  const catalog = catalogOntology(ontology, sections);
  assert.ok(system.endsWith(`\n\n${catalog.projection}`));
  assert.deepEqual(result.projections, [{ path: "docs/a.md", mode: "full", entriesSent: 1, entriesTotal: 1,
    largestChars: catalog.projection.length, fullChars: catalog.projection.length }]);
});

test("B10 entries are counted once across chunks and the largest projection is kept", async () => {
  const text = "Invoice one\n\nplain two\n\nInvoice three\n";
  const project = projector((value) => (value.includes("Invoice") ? 30 : 12), (value) => (value.includes("Invoice") ? ["Entities:Invoice"] : []));
  const result = await reviewFiles({ ...options([{ path: "docs/a.md", text }], async () => completion(clean)), project,
    maxRequestChars: REQUEST_OVERHEAD + 30 + "docs/a.md".length + 14 });
  assert.deepEqual(result.projections.map(({ entriesSent, largestChars }) => ({ entriesSent, largestChars })), [{ entriesSent: 1, largestChars: 30 }]);
});

test("B19 each half of a 413 split is projected again", async () => {
  const seen = [];
  const project = Object.assign(async (_catalog, value) => { seen.push(value); return { text: "p", keys: [] }; }, { mode: "matched" });
  let first = true;
  const text = "a".repeat(40);
  await reviewFiles({ ...options([{ path: "docs/a.md", text }], async () => {
    if (first) { first = false; return { ok: false, status: 413 }; } return completion(clean); }), project });
  assert.deepEqual(seen, [text, text, text.slice(0, 20), text.slice(20)]);
});

test("B12 B14 B16 citations resolve against the whole catalog whatever the projection sent", async () => {
  const reply = (key) => async () => completion(JSON.stringify({ findings: [{ quote: "wrong term", evidenceKey: key, reason: "r", suggestion: "s" }] }));
  const nameOnly = projector(() => 5);
  const matched = await reviewFiles({ ...options([{ path: "docs/a.md", text: "wrong term" }], reply("Entities:Invoice")), project: nameOnly });
  const full = await reviewFiles(options([{ path: "docs/a.md", text: "wrong term" }], reply("Entities:Invoice")));
  assert.equal(matched.findings.length, 1);
  assert.equal(matched.findings[0].id, full.findings[0].id);
  const unknown = await reviewFiles({ ...options([{ path: "docs/a.md", text: "wrong term" }], reply("Entities:Nowhere")), project: nameOnly });
  assert.deepEqual(unknown.unreviewed, [{ path: "docs/a.md", reason: "finding cites an unknown evidence key" }]);
  assert.deepEqual(unknown.projections, []);
});
```

- [x] **Step 3: Run the tests.** Run `node --test templates/scripts/semantic-review-model.test.mjs`. The new tests fail.
- [x] **Step 4: Implement** as described above.
- [x] **Step 5: Run the tests.** Run the focused test and `npm test`. The graph-naming and #111 budget tests pass unchanged.
- [x] **Step 6: Commit.** `feat: semantic review requests carry a per-chunk projection (#135)`.

## Task 4 — the `semanticReview.projection` setting

**Files:** `templates/scripts/ontology-config.mjs`, `tests/ontology-config.test.mjs`.

**Produces:** `validateModelReview(value, label, { allowProjection = false } = {})`.
- Only the `semanticReview` call passes `{ allowProjection: true }`.
- With the option, `"projection"` is an allowed key. The result gains `projection`: `"matched"` when the key is undefined, including when the whole section is absent.
- Any value other than `"matched"` or `"full"` throws `${CONFIG_FILENAME}: ${label}.projection must be "matched" or "full", got ${JSON.stringify(value.projection)}`.
- Test against `undefined`, not with `??`, so that `null` is rejected.
- Without the option, nothing changes. `namingReview` has no `projection`, and the key is unknown there.
- Update the `OntologyConfig` typedef: `semanticReview: { enabled, model, baseUrl, projection: "matched" | "full" }`.

- [x] **Step 1: Update the existing tests.** Three existing assertions pin the old shape. Add `projection: "matched"` to the `semanticReview` value in each:
  - "a minimal config is filled in with empty defaults";
  - "semantic review is disabled when the section is absent";
  - "enabled semantic review accepts a maintainer endpoint and model".
- [x] **Step 2: Add the failing tests:**

```js
test("B20 B21 semanticReview.projection defaults to matched and accepts matched or full", () => {
  const settings = { enabled: true, model: "m", baseUrl: "https://model.example/v1" };
  assert.equal(validateConfig(minimal, { ontologyExists: () => true }).semanticReview.projection, "matched");
  assert.equal(validateConfig({ ...minimal, semanticReview: settings }, { ontologyExists: () => true }).semanticReview.projection, "matched");
  for (const projection of ["matched", "full"]) {
    assert.equal(validateConfig({ ...minimal, semanticReview: { ...settings, projection } },
      { ontologyExists: () => true }).semanticReview.projection, projection);
  }
});

test("B22 any other projection value is rejected, naming the key and the value", () => {
  for (const [projection, shown] of [["Full", '"Full"'], ["", '""'], [null, "null"], [1, "1"], ["embedding", '"embedding"']]) {
    assert.throws(() => validateConfig({ ...minimal, semanticReview: { enabled: false, projection } }, { ontologyExists: () => true }),
      (error) => error.message.includes("semanticReview.projection") && error.message.includes(shown), JSON.stringify(projection));
  }
});

test("B22 projection is not a sourceGraph.namingReview setting", () => {
  assert.throws(() => validateConfig({ ...minimal, sourceGraph: { enabled: false, namingReview: { enabled: false, projection: "full" } } },
    { ontologyExists: () => true }), /unknown key "sourceGraph\.namingReview\.projection"/);
  assert.equal("projection" in validateConfig(minimal, { ontologyExists: () => true }).sourceGraph.namingReview, false);
});
```

- [x] **Step 3: Run the tests, implement, and run them again.** Run `node --test tests/ontology-config.test.mjs` before and after implementing, then `npm test`.
- [x] **Step 4: Commit.** `feat: semanticReview.projection chooses matched or full (#135)`.

## Task 5 — the ledger prints the projection line

**Files:** `templates/scripts/semantic-review-ledger.mjs`, `templates/scripts/semantic-review-ledger.test.mjs`.

**Consumes:** `run.projections`, which is optional.

**Produces:** in `renderRun`, directly after the `Eligible: ...` line and before the `Not reviewed` lines, one line per item, but only when `Array.isArray(run.projections)`. Each value passes through `display`:

```
- Ontology projection for `<path>`: <mode>, <entriesSent> of <entriesTotal> entries with full rows; largest <largestChars> characters (full projection <fullChars>).
```

Numbers are printed with plain string conversion, not `toLocaleString`, so output never depends on locale. `statusFor`,
the record marker, part splitting and `readLatestRun` do not change.

- [x] **Step 1: Add the failing tests:**

```js
const projection = { path: "docs/a.md", mode: "matched", entriesSent: 3, entriesTotal: 9, largestChars: 812, fullChars: 2400 };

test("B10 the record shows each reviewed file's projection and keeps it in the data", async () => {
  const client = mockClient();
  const value = { ...run, findings: [], projections: [projection] };
  await publishRun(client, pull, value);
  assert.match(client.comments[0].body, /- Ontology projection for `docs\/a\.md`: matched, 3 of 9 entries with full rows; largest 812 characters \(full projection 2400\)\./);
  assert.deepEqual((await readLatestRun(client, pull)).projections, [projection]);
});

test("B15 projections change neither the status nor a record that has none", async () => {
  const visible = async (value) => { const client = mockClient(); await publishRun(client, pull, value);
    return client.comments[0].body.replace(/<!--[\s\S]*-->/, ""); };
  for (const outcome of ["reviewed", "partial", "unavailable", "too-large", "no-eligible"]) {
    const plain = { ...run, outcome, findings: [] };
    assert.deepEqual(statusFor({ ...plain, projections: [projection] }), statusFor(plain));
  }
  assert.equal(await visible({ ...run, projections: [] }), await visible(run));
  assert.equal(await visible({ ...run, projections: "junk" }), await visible(run));
});

test("a projection path cannot open a marker in the record", async () => {
  const client = mockClient();
  await publishRun(client, pull, { ...run, findings: [], projections: [{ ...projection, path: "docs/<!--x.md" }] });
  assert.match(client.comments[0].body, /docs\/&lt;!--x\.md/);
});
```

- [x] **Step 2: Run the tests, implement, and run them again.** Run `node --test templates/scripts/semantic-review-ledger.test.mjs` before and after implementing, then `npm test`.
- [x] **Step 3: Commit.** `feat: semantic run record shows each file's ontology projection (#135)`.

## Task 6 — the worker builds the projector and records `projections`

**Files:**
- `templates/scripts/semantic-review-worker.mjs`;
- `templates/scripts/semantic-review-worker.test.mjs`;
- `tests/semantic-budget-acceptance.test.mjs`.

**Consumes:** Tasks 2 to 5.

**Produces:**
- `import { createProjector } from "./ontology-projection.mjs"`.
- Inside the existing `try` around `api.reviewFiles`, build `createProjector({ mode: config.semanticReview.projection ?? "matched", bannedAliases: config.bannedAliases ?? [] })` and pass it as `project`. The `??` fallbacks serve hand-built configs in tests; parsed configs always carry both.
- After the call, set `run.projections = result.projections` only when it is an array.
- Outcome logic, `finalizeSemanticReview` and `planSemanticReviews` are unchanged.

- [x] **Step 1: Add the failing tests** to `semantic-review-worker.test.mjs`:

```js
const enabledConfig = { ...config, bannedAliases: [{ phrase: "bill", nameInstead: ["Invoice"] }],
  semanticReview: { enabled: true, model: "m", baseUrl: "https://model.example/v1", projection: "matched" } };

test("B6 B20 the worker passes a matched projector, with the banned aliases, by default", async () => {
  const { catalogOntology } = await import("./semantic-review-model.mjs");
  let seen;
  const support = deps({ reviewFiles: async (args) => { seen = args; return { reviewed: ["docs/a.md"], unreviewed: [], findings: [] }; } });
  const { projection, ...withoutKey } = enabledConfig.semanticReview;
  await runSemanticReview({ client: {}, pull, config: { ...enabledConfig, semanticReview: withoutKey },
    auth: authFor("k"), env: {}, deps: support.value });
  assert.equal(seen.project.mode, "matched");
  const catalog = catalogOntology(input.ontologyText, config.sections);
  assert.deepEqual(seen.project(catalog, "the bill").keys, ["Entities:Invoice"]);
  assert.deepEqual(seen.project(catalog, "nothing").keys, []);
});

test("B21 projection full reaches the model module", async () => {
  let seen;
  const support = deps({ reviewFiles: async (args) => { seen = args; return { reviewed: ["docs/a.md"], unreviewed: [], findings: [] }; } });
  await runSemanticReview({ client: {}, pull, config: { ...enabledConfig, semanticReview: { ...enabledConfig.semanticReview, projection: "full" } },
    auth: authFor("k"), env: {}, deps: support.value });
  assert.equal(seen.project.mode, "full");
});

test("B10 the run record carries the projections, and has none when the model module gives none", async () => {
  const summary = [{ path: "docs/a.md", mode: "matched", entriesSent: 1, entriesTotal: 1, largestChars: 10, fullChars: 20 }];
  const withSummary = deps({ reviewFiles: async () => ({ reviewed: ["docs/a.md"], unreviewed: [], findings: [], projections: summary }) });
  const run = await runSemanticReview({ client: {}, pull, config: enabledConfig, auth: authFor("k"), env: {}, deps: withSummary.value });
  assert.deepEqual(run.projections, summary);
  assert.equal(run.outcome, "reviewed");
  const without = deps({ reviewFiles: async () => ({ reviewed: ["docs/a.md"], unreviewed: [], findings: [] }) });
  const older = await runSemanticReview({ client: {}, pull, config: enabledConfig, auth: authFor("k"), env: {}, deps: without.value });
  assert.equal("projections" in older, false);
});

test("B12 a finding has the same identity in matched and full mode", async () => {
  const reply = { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ findings: [
    { quote: "wrong term", evidenceKey: "Entities:Invoice", reason: "r", suggestion: "s" }] }) } }] }) };
  const ids = [];
  for (const projection of ["matched", "full"]) {
    const support = deps();
    const run = await runSemanticReview({ client: {}, pull, config: { ...enabledConfig, semanticReview: { ...enabledConfig.semanticReview, projection } },
      auth: authFor("k"), env: {}, modelFetch: async () => reply, deps: support.value });
    ids.push(run.findings.map((item) => item.id));
  }
  assert.equal(ids[0].length, 1);
  assert.deepEqual(ids[0], ids[1]);
});
```

- [x] **Step 2: Update the #111 acceptance test.** In `tests/semantic-budget-acceptance.test.mjs`, the test "B7 B8 a too-large run publishes success naming the budget, never an outage" expects the 60 KB ontology not to fit 24,000 characters. Under the new default, the name index (about 12,500 characters) fits, so the run would reach the unreachable model and be `unavailable`.
  - Add `projection: "full"` to that test's `semanticReview`.
  - Add the comment `// #111 proves the full projection's too-large path; #135's acceptance covers matched.`
  - This is the only existing acceptance test the default changes. The prototype run confirmed it.
- [x] **Step 3: Run the tests, implement, and run them again.** Run `node --test templates/scripts/semantic-review-worker.test.mjs tests/semantic-budget-acceptance.test.mjs` before and after implementing, then `npm test`.
- [x] **Step 4: Commit.** `feat: semantic worker sends matched projections by default (#135)`.

## Task 7 — runbook and README

> Replaced by Task 16.

**Files:** `templates/docs/ontology-semantic-review.md`, `README.md`.

- [x] **Step 1: Add an "Ontology projection" section** to the runbook, after "Request budget". It covers:
  - **The two modes.** `"matched"` is the default. `"full"` sends today's whole projection.
  - **The setting.** Show the exact JSON: `"semanticReview": { ..., "projection": "full" }`. It is read from the default branch.
  - **The matching rules (ADR 0027):**
    - exact name;
    - banned-alias phrase;
    - name words of four letters or more, with "s" or "es";
    - enum value words;
    - PascalCase split in the Markdown;
    - one hop through backticked names and Relationships rows;
    - the name index always sent.
  - **The stop list,** written exactly as `data, info, item, kind, list, name, type, value, values, state, status, record, result, config, event, events`.
  - **The record line,** quoted with its fields, beginning "Ontology projection for". Status descriptions do not change.
  - **The caveat.** A matched review can miss a paraphrase that shares no name word with its entry; set `"full"` if that matters more than request size.
  - **The update order.** Update the kit first, then set `"full"`, because older scripts reject the unknown key. Include the words "update the kit first".
  - **The measured sizes.** The median request is about 74% of the full projection for JEPA-Speech, 78% for InternalOntology and 95% for EventBooking, so the saving is modest and mostly limited by the one hop.

  Use backticks only for the key names, values, file names and ontology terms (`OntologyProjection`, `ProjectionMode`).
- [x] **Step 2: Add one sentence to README.md** beside the semantic pilot paragraph: requests now carry the matched `OntologyProjection` by default, and `semanticReview.projection: "full"` restores the whole ontology; see the runbook.
- [x] **Step 3: Check and commit.** Run `node scripts/check-ontology-terms.mjs` and `npm test`, then commit: `docs: document matched ontology projections (#135)`.

## Task 8 — acceptance against the installed reviewer

> One assertion of the first test changed in Task 14 (the grouped name index), and the B23 test grows in Task 16. The user phase regenerates these acceptance tests.

**Files:** `tests/matched-projection-acceptance.test.mjs` (new).

The test installs the kit with `withSemanticReview`, imports the installed scripts, and talks to a local `node:http` stand-in for the model endpoint. Nothing calls a real model, GitHub or the gateway. B23 passes once Task 7 has landed.

- [x] **Step 1: Write the test file in full:**

```js
// Acceptance tests for feature #135 (docs/features/matched-ontology-projection/): the INSTALLED
// semantic reviewer sends matched projections to a local stand-in for the model endpoint.
// Nothing here calls a real model, GitHub or the gateway.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { install } from "../bin/install-ontology.mjs";
import { withTempRepo } from "./helpers/temp-repo.mjs";

const KIT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const head = "a".repeat(40);
const pull = { number: 7, head: { sha: head }, merge_commit_sha: "b".repeat(40) };
const sections = { required: ["Entities", "Enums", "Relationships"], optional: [] };
const ontology = [
  "## Entities", "",
  "| Name | Description |", "| --- | --- |",
  "| `AuditEvent` | One metadata record. |",
  "| `SessionRemoval` | Removes a `StudySession`. |",
  "| `StudySession` | One stored session. |",
  "| `Microphone` | Unrelated. |",
  "",
  "## Enums", "",
  "| Name | Values | Description |", "| --- | --- | --- |",
  "| `SessionRemovalState` | `Requested`, `Removing`, `Removed`, `Failed` | Where a `SessionRemoval` stands. |",
  "",
  "## Relationships", "",
  "| From | Relationship | To | Cardinality |", "| --- | --- | --- | --- |",
  "| `SessionRemoval` | removes | `StudySession` | 1 → 1 |",
  "",
].join("\n");
const passage = "the removal moves through the states pending, running, done and failed";

async function modelStandIn(findings = []) {
  const state = { bodies: [] };
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      state.bodies.push(body);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ findings }) } }] }));
    });
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return { state, url: `http://127.0.0.1:${server.address().port}/v1`, close: () => server.close() };
}

function fakeClient() {
  const comments = [];
  const statuses = [];
  return { comments, statuses,
    get: async () => pull,
    getAll: async () => comments,
    post: async (path, body) => {
      if (path === "/issues/7/comments") {
        const comment = { id: comments.length + 1, body: body.body, user: { login: "github-actions[bot]" },
          html_url: `https://github.example/c/${comments.length + 1}` };
        comments.push(comment);
        return comment;
      }
      statuses.push(body);
      return {};
    } };
}

const installed = async (repo, name) => import(pathToFileURL(join(repo.dir, "scripts", name)).href);

async function load(repo) {
  const { createModelAuth } = await installed(repo, "llm-auth.mjs");
  return { model: await installed(repo, "semantic-review-model.mjs"), worker: await installed(repo, "semantic-review-worker.mjs"),
    config: await installed(repo, "ontology-config.mjs"), auth: createModelAuth({ env: { K: "k" }, staticKeyVar: "K" }) };
}

async function workerRun(modules, url, semanticReview, text = passage, env = {}) {
  const client = fakeClient();
  const config = { ontologyPath: "docs/ontology.md", ignorePaths: [], sections, bannedAliases: [],
    semanticReview: { enabled: true, model: "m", baseUrl: url, ...semanticReview } };
  const run = await modules.worker.runSemanticReview({ client, pull, config, auth: modules.auth, env,
    deps: { isEligiblePull: async () => true, triggerRunId: "81:1",
      collectReviewInput: async () => ({ files: [{ path: "docs/a.md", text }], ontologyText: ontology, unreviewed: [] }) } });
  return { run, client };
}

const system = (body) => JSON.parse(body).messages[0].content;

test("B1 B10 B15 B20 an unchanged config sends a matched projection and records it", async () => {
  const stand = await modelStandIn();
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
      const modules = await load(repo);
      const parsed = modules.config.validateConfig({ ontologyPath: "docs/ontology.md",
        semanticReview: { enabled: true, model: "m", baseUrl: stand.url } }, { ontologyExists: () => true });
      assert.equal(parsed.semanticReview.projection, "matched");
      const { run, client } = await workerRun(modules, stand.url, { projection: parsed.semanticReview.projection });
      const prompt = system(stand.state.bodies[0]);
      assert.match(prompt, /\| `SessionRemovalState` \|/);
      assert.match(prompt, /\| `SessionRemoval` \| Removes/);
      assert.doesNotMatch(prompt, /\| `Microphone` \|/);
      assert.match(prompt, /- Entities:Microphone/);
      assert.equal(run.outcome, "reviewed");
      const catalog = modules.model.catalogOntology(ontology, sections);
      assert.deepEqual(run.projections.map(({ path, mode, entriesTotal, fullChars }) => ({ path, mode, entriesTotal, fullChars })),
        [{ path: "docs/a.md", mode: "matched", entriesTotal: catalog.evidenceKeys.size, fullChars: catalog.projection.length }]);
      assert.ok(run.projections[0].largestChars < catalog.projection.length);
      assert.match(client.comments.at(-1).body, /- Ontology projection for `docs\/a\.md`: matched, \d+ of 6 entries with full rows/);
      assert.equal(client.statuses.at(-1).description, "Semantic match reviewed 1 file(s); no active findings");
    });
  } finally { stand.close(); }
});

test("B21 projection full sends today's request byte for byte", async () => {
  const stand = await modelStandIn();
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
      const modules = await load(repo);
      const { run } = await workerRun(modules, stand.url, { projection: "full" });
      await modules.model.reviewFiles({ files: [{ path: "docs/a.md", text: passage }], ontologyText: ontology, sections,
        model: "m", baseUrl: stand.url, auth: modules.auth, headSha: head });
      assert.equal(stand.state.bodies.length, 2);
      assert.equal(stand.state.bodies[0], stand.state.bodies[1]);
      assert.equal(run.projections[0].mode, "full");
      assert.equal(run.projections[0].largestChars, run.projections[0].fullChars);
    });
  } finally { stand.close(); }
});

test("B9 B12 B14 a name-only citation is accepted with the same identity in both modes, and runs repeat exactly", async () => {
  const stand = await modelStandIn([{ quote: "pending, running, done and failed", evidenceKey: "Entities:Microphone", reason: "r", suggestion: "s" }]);
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
      const modules = await load(repo);
      const matched = await workerRun(modules, stand.url, {});
      const again = await workerRun(modules, stand.url, {});
      const full = await workerRun(modules, stand.url, { projection: "full" });
      assert.doesNotMatch(system(stand.state.bodies[0]), /\| `Microphone` \|/);
      assert.equal(stand.state.bodies[0], stand.state.bodies[1]);
      assert.equal(matched.run.findings.length, 1);
      assert.equal(matched.run.findings[0].id, full.run.findings[0].id);
      assert.equal(again.run.findings[0].id, matched.run.findings[0].id);
      assert.equal(matched.client.statuses.at(-1).state, "failure");
    });
  } finally { stand.close(); }
});

test("B16 a key outside the name index is still rejected", async () => {
  const stand = await modelStandIn([{ quote: "pending", evidenceKey: "Entities:Nowhere", reason: "r", suggestion: "s" }]);
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
      const { run } = await workerRun(await load(repo), stand.url, {});
      assert.deepEqual(run.unreviewed, [{ path: "docs/a.md", reason: "finding cites an unknown evidence key" }]);
    });
  } finally { stand.close(); }
});

test("B13 B18 a budget below the name index is too-large; a matchless file is reviewed with the name index", async () => {
  const stand = await modelStandIn();
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
      const modules = await load(repo);
      const nothing = await workerRun(modules, stand.url, {}, "Plain words only.");
      assert.equal(nothing.run.outcome, "reviewed");
      assert.equal(nothing.run.projections[0].entriesSent, 0);
      assert.doesNotMatch(system(stand.state.bodies[0]), /\| `/);
      const tooLarge = await workerRun(modules, stand.url, {}, "Plain words only.", { ONTOLOGY_MAX_REQUEST_CHARS: "1100" });
      assert.equal(tooLarge.run.outcome, "too-large");
      assert.equal(stand.state.bodies.length, 1);
    });
  } finally { stand.close(); }
});

test("B20 the projection module is installed with the semantic reviewer only", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
    for (const name of ["ontology-projection.mjs", "ontology-projection.test.mjs"]) {
      assert.equal(readFileSync(join(repo.dir, "scripts", name), "utf8"), readFileSync(join(KIT, "templates/scripts", name), "utf8"));
    }
  });
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withSourceGraph: true, withGraphNamingReview: true });
    assert.equal(existsSync(join(repo.dir, "scripts/ontology-projection.mjs")), false);
    await installed(repo, "semantic-review-model.mjs");
    await installed(repo, "graph-naming-worker.mjs");
  });
});

test("B23 the installed runbook describes the modes, the record line and the caveats", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
    const doc = readFileSync(join(repo.dir, "docs/ontology-semantic-review.md"), "utf8");
    for (const expected of ['"matched"', '"full"', "Ontology projection for", "paraphrase", "update the kit first",
      "data, info, item, kind, list, name, type, value, values, state, status, record, result, config, event, events"]) {
      assert.ok(doc.includes(expected), `runbook lacks ${expected}`);
    }
  });
});
```

- [x] **Step 2: Run the tests.** Run `node --test tests/matched-projection-acceptance.test.mjs`, then `npm test`. All pass.
- [x] **Step 3: Commit.** `test: acceptance for matched ontology projections (#135)`.

## Task 9 — wrap-up

- [x] **Step 1: Check the ontology.** Confirm that `docs/ontology.md` still matches the code: `OntologyProjection`, `ProjectionMode`, the `OntologyConfig` row and the `SemanticReviewRun` row.
- [x] **Step 2: Run the full suite.** Run `npm test` and check its exit status.
- [x] **Step 3: Run the shipped tests on every Node version.** Run each shipped test file alone, including `ontology-projection.test.mjs`, from `templates/scripts` on Node 20, 22 and 24 in Docker, as `.github/workflows/test.yml` does.
- [x] **Step 4: Report the measured sizes.** Repeat the size measurement against the JEPA-Speech, InternalOntology and EventBooking checkouts with the built module, and report the medians in the build handoff. The prototype gave 75% for JEPA-Speech with all ten recorded findings kept.
- [x] **Step 5: Hand off.** In lite mode the user phase opens the build PR, so post the handoff to the user instead of opening one. The handoff includes:
  - links to ADRs 0026–0028;
  - the per-consumer follow-up: re-run the installer with `--force --with-semantic-review`, and set `"full"` only after updating;
  - what was not verified: a live model run on a real pull request, and the JEPA-Speech replay, which U12 assigns to acceptance.

# Part 3 — the build-review amendment

Execute Tasks 18–21 in order after this plan merges and the build gate opens. The worktree must be on the existing `feature/matched-ontology-projection/build` branch with the seven Task 10–16 commits ending at `148d96f` (or that commit as an ancestor). Fetch main and read these approved plans from main if the build branch predates them. Preserve the published commits. Task 17 is replaced by Task 21. Part 2 shipped in #141.

The two ADRs are [0034](../../adr/0034-semantic-review-reads-raw-ontology-contents.md) and [0035](../../adr/0035-matched-planner-budgets-whole-code-points.md). Keep the existing test names and assertions. The fixture changes below switch existing collector doubles to the new transport. Run the new assertions against the build baseline first. Stage only the task's files, review the cached diff, run the ontology term check and run unfiltered `npm test` before each commit. Check the actual exit status and push each commit. Stop and report unexpected results.

## Task 18 — read raw ontology contents at the reviewed revision

**Files:** `templates/scripts/semantic-review-github.mjs`, `templates/scripts/semantic-review-github.test.mjs`, `tests/semantic-ontology-source.test.mjs`, `tests/semantic-feature-acceptance.test.mjs`.

**Consumes:** `ttlPathFor(ontologyPath)`, the shared Turtle renderer, and the existing GitHub client request boundary. **Produces:** `client.getContentText(path, ref) → Promise<string>`, a pinned GitHub Contents GET with `Accept: application/vnd.github.raw+json` and strict UTF-8 decoding. HTTP errors carry numeric `status`. JSON operations and changed Markdown blob decoding use their existing paths. Only the Turtle request's numeric 404 permits the Markdown fallback (B25).

- [ ] **Step 1: Add the raw transport tests.** Append to `templates/scripts/semantic-review-github.test.mjs`. The HTTP stand-in keeps the real client and collector under test.

```js
function rawCollectorClient(responses) {
  const calls = [];
  const client = createGitHubClient({ token: "token", repository: "org/repo", fetchImpl: async (url, request) => {
    const { pathname, search } = new URL(url);
    if (pathname.endsWith("/pulls/7/files")) return new Response("[]");
    const path = pathname.slice("/repos/org/repo/contents/".length);
    calls.push({ path, search, method: request.method, accept: request.headers.Accept });
    assert.ok(Object.hasOwn(responses, path), path);
    return responses[path];
  } });
  return { calls, client };
}

const rawCall = (path) => ({ path, search: `?ref=${headSha}`, method: "GET", accept: "application/vnd.github.raw+json" });

test("B25 a numeric source 404 tries raw Markdown once at the same reviewed revision", async () => {
  const { client, calls } = rawCollectorClient({
    "docs/my%20ontology.ttl": new Response('{"message":"Not found"}', { status: 404 }),
    "docs/my%20ontology.md": new Response("\uFEFF# proposed ontology — café\n"),
  });
  const result = await collectReviewInput(client, listed, { ontologyPath: "docs/my ontology.md", ignorePaths: [] });
  assert.equal(result.ontologyText, "# proposed ontology — café\n");
  assert.deepEqual(calls, [rawCall("docs/my%20ontology.ttl"), rawCall("docs/my%20ontology.md")]);
});

test("B25 a raw path without a Markdown extension is read once as Markdown", async () => {
  const { client, calls } = rawCollectorClient({
    "docs/ontology.markdown": new Response("# proposed ontology\n"),
  });
  const result = await collectReviewInput(client, listed, { ontologyPath: "docs/ontology.markdown", ignorePaths: [] });
  assert.equal(result.ontologyText, "# proposed ontology\n");
  assert.deepEqual(calls, [rawCall("docs/ontology.markdown")]);
});

test("B25 a non-404 response mentioning 404 cannot trigger the raw Markdown fallback", async () => {
  const { client, calls } = rawCollectorClient({
    "docs/ontology.ttl": new Response('{"message":"upstream returned 404 while handling this request"}', { status: 500 }),
  });
  await assert.rejects(collectReviewInput(client, listed, { ontologyPath: "docs/ontology.md", ignorePaths: [] }),
    { status: 500, message: /returned 500/ });
  assert.deepEqual(calls, [rawCall("docs/ontology.ttl")]);
});

test("B25 invalid UTF-8 in a raw source fails without trying Markdown", async () => {
  const { client, calls } = rawCollectorClient({
    "docs/ontology.ttl": new Response(Uint8Array.of(0xc3, 0x28)),
  });
  await assert.rejects(collectReviewInput(client, listed, { ontologyPath: "docs/ontology.md", ignorePaths: [] }),
    { code: "ERR_ENCODING_INVALID_ENCODED_DATA" });
  assert.deepEqual(calls, [rawCall("docs/ontology.ttl")]);
});
```

- [ ] **Step 2: Add the collector-to-planner test.** In `tests/semantic-ontology-source.test.mjs`, extend the owl import containing `ttlPathFor` with `modelToTriples, renderOntologyMarkdown, serializeTurtle`, and the GitHub import with `createGitHubClient`. Import `createProjector` from `../templates/scripts/ontology-projection.mjs` and extend the model import with `REQUEST_OVERHEAD`. Append:

```js
test("B17 B25 a raw Turtle source above 1 MiB reaches matched planning", async () => {
  const contexts = ["Cedar", "Quartz", "Aspen", "Hazel", "Birch", "Maple",
    "Willow", "Pine", "Juniper", "Spruce", "Cypress", "Alder"];
  const model = { projectName: "Widgets", invariants: [], sections: { Entities: contexts.flatMap((context) =>
    Array.from({ length: 90 }, (_, index) => ({ name: `${context}Element${index}`,
      cells: { Properties: "", Description: "One entry in the example ontology. ".repeat(32).trimEnd() } }))) } };
  const source = serializeTurtle(modelToTriples(model), { namespaceUri: "https://ontology.example/w#" });
  assert.ok(Buffer.byteLength(source) > 2 ** 20);
  const sha = "a".repeat(40);
  const path = "docs/broad.md";
  const text = contexts.map((context) => `The ${context} records are reconciled.`).join("\n\n");
  const calls = [];
  const client = createGitHubClient({ token: "token", repository: "org/repo", fetchImpl: async (url, request) => {
    const { pathname, search } = new URL(url);
    if (pathname.endsWith("/contents/docs/ontology.ttl")) {
      calls.push({ pathname, search, accept: request.headers.Accept });
      if (request.headers.Accept !== "application/vnd.github.raw+json") {
        return new Response('{"message":"file exceeds the inline Contents limit"}', { status: 403 });
      }
      return new Response(source);
    }
    assert.equal(request.headers.Accept, "application/vnd.github+json");
    if (pathname.endsWith("/pulls/7/files")) return new Response(JSON.stringify([
      { filename: path, status: "modified", sha: "broad" },
    ]));
    assert.ok(pathname.endsWith("/git/blobs/broad"), pathname);
    return new Response(JSON.stringify({ encoding: "base64", content: Buffer.from(text).toString("base64") }));
  } });
  const input = await collectReviewInput(client, { number: 7, head: { sha }, changed_files: 1 },
    { ontologyPath: "docs/ontology.md", ignorePaths: [] });
  assert.deepEqual(calls, [{ pathname: "/repos/org/repo/contents/docs/ontology.ttl",
    search: `?ref=${sha}`, accept: "application/vnd.github.raw+json" }]);
  assert.deepEqual(input.files, [{ path, text }]);
  assert.deepEqual(input.unreviewed, []);

  const sections = { required: ["Entities"], optional: [] };
  const catalog = catalogOntology(input.ontologyText, sections);
  assert.equal(catalog.evidenceKeys.size, 1080);
  assert.equal(catalog.projection, catalogOntology(renderOntologyMarkdown(model), sections).projection);
  const project = createProjector();
  const { chunks, unreviewed } = project.plan(catalog, input.files, 200_000);
  assert.deepEqual(unreviewed, []);
  assert.ok(chunks.length > 1);
  assert.equal(chunks.map((chunk) => chunk.text).join(""), text);
  for (const chunk of chunks) {
    const own = project(catalog, chunk.text);
    assert.deepEqual(chunk.keys, own.keys);
    assert.equal(chunk.chars, own.text.length);
    assert.ok(REQUEST_OVERHEAD + path.length + chunk.chars + chunk.text.length <= 200_000);
  }
});
```

- [ ] **Step 3: Run the focused tests on the build baseline.** Run `node --test templates/scripts/semantic-review-github.test.mjs tests/semantic-ontology-source.test.mjs tests/semantic-feature-acceptance.test.mjs`. The four new shipped tests and the large-source test fail. The previously shipped Task 12 tests and catalog-equivalence assertion pass.

- [ ] **Step 4: Migrate the existing test doubles.** In the shipped GitHub test, attach numeric `status: 404` to the error thrown by `absent` using `Object.assign`. The existing three collector mocks gain a `getContentText` property. The changed-blob test returns `"# proposed ontology"` for `docs/ontology.md` and calls `absent(path)` otherwise, and its `get` now serves only Git blobs. Both listing tests use `getContentText: async (path) => path === "docs/ontology.ttl" ? absent(path) : "# ontology"`. Keep the invalid blob's `get` returning `{ encoding: "base64", content: "%%%" }`. Remove the unused `get` from the pagination mock. In `sourceClient`, replace `get` with `getContentText: async (file) => { ... }`, push `"/contents/" + file` into `calls`, use `Object.hasOwn(contents, file)` to detect a missing fixture, propagate a stored exception, and return the stored string directly. Give its 500 error a numeric `status: 500` without changing the assertion.

  In `tests/semantic-ontology-source.test.mjs`, replace only the `get` operation of `diskClient` with `getContentText: async (path) => readFileSync(join(dir, path), "utf8")`. This fixture supplies the source that the equality test needs. In `tests/semantic-feature-acceptance.test.mjs`, remove both ontology Contents branches from `get` and add this operation to `makeClient`:

```js
    getContentText: async (path, ref) => {
      calls.push(`/contents/${path}?ref=${ref}`);
      if (path === "docs/ontology.md") return sourceOntology;
      throw Object.assign(new Error(`GitHub API GET returned 404 for ${path}`), { status: 404 });
    },
```

- [ ] **Step 5: Add raw Contents to the real client.** Add a private option `{ raw = false } = {}` after `body` in `request`. Select `application/vnd.github.raw+json` for a raw request and keep the current JSON accept header otherwise. Keep the current error message and attach `status: response.status` to the error with `Object.assign`. Keep Link parsing and use these branches for the response data:

```js
    const data = raw
      ? new TextDecoder("utf-8", { fatal: true }).decode(await response.arrayBuffer())
      : await response.json();
```

  Add this method beside `get`. Reuse the existing request validation, authentication and GitHub origin.

```js
    async getContentText(path, ref) {
      const encoded = path.split("/").map(encodeURIComponent).join("/");
      return (await request(`/contents/${encoded}?ref=${encodeURIComponent(ref)}`, "GET", undefined, { raw: true })).data;
    },
```

  Replace `readOntologyText` with:

```js
async function readOntologyText(client, ontologyPath, headSha) {
  const sourcePath = ttlPathFor(ontologyPath);
  if (sourcePath === ontologyPath) return client.getContentText(ontologyPath, headSha);
  let source;
  try {
    source = await client.getContentText(sourcePath, headSha);
  } catch (error) {
    if (error?.status !== 404) throw error;
    return client.getContentText(ontologyPath, headSha);
  }
  return renderOntologyMarkdown(triplesToModel(parseTurtle(source)));
}
```

- [ ] **Step 6: Verify and commit.** Rerun the focused tests from Step 3 and the matched-projection acceptance test, which pins full-mode request bytes. Run the shipped GitHub test alone from `templates/scripts`. Stage the four files, review the cached diff, run the ontology term check and run `npm test`. All must pass. Commit `fix: read pinned ontology files through raw GitHub Contents (#135)` and push.

## Task 19 — enforce the matched piece budget in the planner

**Files:** `templates/scripts/ontology-projection.mjs`, `templates/scripts/ontology-projection.test.mjs`.

**Consumes:** the current matched planner, its cached index, and `reviewFiles`. **Produces:** `plan` returns only chunks whose own `chars + text.length` fit the room after the request overhead and path. When a whole code point cannot fit, the file has no planned chunks and receives B18's line reason with the original line offset and the indivisible piece's projection size. The pre-send guard and HTTP 413 path keep their existing behaviour.

- [ ] **Step 1: Add these tests to the shipped projector test.** The new helper checks coverage, exact offsets, projection size and keys, and the complete character budget.

```js
const PIECE_SOURCE = [
  "## Entities", "",
  "| Name | Description |", "| --- | --- |",
  "| `Cat` | A small animal. |",
  `| \`Microphone\` | ${"A device that captures sound. ".repeat(12).trimEnd()} |`,
].join("\n");
const PIECE_SECTIONS = { required: ["Entities"], optional: [] };
const PIECE_CATALOG = catalogOntology(PIECE_SOURCE, PIECE_SECTIONS);

function checkPieces(text, budget) {
  const { chunks, unreviewed } = matched.plan(PIECE_CATALOG, [{ path: PATH, text }], budget);
  assert.deepEqual(unreviewed, []);
  assert.equal(chunks.map((chunk) => chunk.text).join(""), text);
  let offset = 0;
  for (const chunk of chunks) {
    assert.equal(chunk.path, PATH);
    assert.equal(chunk.offset, offset);
    const own = matched(PIECE_CATALOG, chunk.text);
    assert.deepEqual(chunk.keys, own.keys);
    assert.equal(chunk.chars, own.text.length);
    assert.ok(fixed + chunk.chars + chunk.text.length <= budget, JSON.stringify(chunk.text));
    assert.doesNotMatch(chunk.text, /^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u);
    offset += chunk.text.length;
  }
  return chunks;
}

test("B17 a cut inside a word records the new match when it fits", () => {
  const text = "Catapult Microphone";
  const whole = matched(PIECE_CATALOG, text);
  assert.deepEqual(whole.keys, ["Entities:Microphone"]);
  const budget = fixed + whole.text.length + 3;
  const first = checkPieces(text, budget)[0];
  assert.equal(first.text, "Cat");
  assert.deepEqual(first.keys, ["Entities:Cat"]);
  assert.equal(first.chars, matched(PIECE_CATALOG, "Cat").text.length);
});

test("B17 a cut that adds an over-budget match is divided again during planning", () => {
  const text = "Catapult";
  const whole = matched(PIECE_CATALOG, text);
  assert.deepEqual(whole.keys, []);
  const budget = fixed + whole.text.length + 3;
  const exposed = matched(PIECE_CATALOG, "Cat");
  assert.deepEqual(exposed.keys, ["Entities:Cat"]);
  assert.ok(fixed + exposed.text.length + 3 > budget);
  assert.deepEqual(checkPieces(text, budget).map((chunk) => chunk.text), ["Ca", "t", "apu", "lt"]);
});

test("B17 a surrogate pair may fit using its own projection when its line has one unit of room", () => {
  const text = "😀Microphone";
  const whole = matched(PIECE_CATALOG, text);
  assert.deepEqual(whole.keys, ["Entities:Microphone"]);
  const budget = fixed + whole.text.length + 1;
  const first = checkPieces(text, budget)[0];
  assert.equal(first.text, "😀");
  assert.deepEqual(first.keys, []);
  assert.equal(first.chars, matched(PIECE_CATALOG, "😀").text.length);
});

test("B18 an indivisible over-budget piece reports its original line and sends none of that file", async () => {
  const text = "x\n\n😀";
  const files = [{ path: PATH, text }, { path: "docs/b.md", text: "z" }];
  const chars = matched(PIECE_CATALOG, "😀").text.length;
  const budget = fixed + chars + 1;
  const entry = { path: PATH, code: "too-large",
    reason: `line at offset 3 selects too much of the ontology for the configured budget (projection ${chars} characters, budget ${budget}; raise ONTOLOGY_MAX_REQUEST_CHARS)` };

  const planned = matched.plan(PIECE_CATALOG, files, budget);
  assert.deepEqual(planned.unreviewed, [entry]);
  assert.deepEqual(planned.chunks, [{ path: "docs/b.md", offset: 0, text: "z", keys: [], chars }]);

  const sent = [];
  const result = await reviewFiles({ files, ontologyText: PIECE_SOURCE, sections: PIECE_SECTIONS,
    model: "m", baseUrl: "https://model.example/v1", headSha: "a".repeat(40), project: matched,
    auth: createModelAuth({ env: { K: "k" }, staticKeyVar: "K" }), maxRequestChars: budget,
    fetchImpl: async (_url, request) => {
      sent.push(JSON.parse(request.body).messages[1].content);
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"findings":[]}' } }] }) };
    } });
  assert.deepEqual(result.unreviewed, [entry]);
  assert.deepEqual(result.reviewed, ["docs/b.md"]);
  assert.deepEqual(sent, ["File: docs/b.md\nOffset: 0\nText:\nz"]);
});
```

- [ ] **Step 2: Run the test file.** Run `node --test templates/scripts/ontology-projection.test.mjs`. The two positive checks for a new match that fits and a pair that fits each pass on the baseline. The over-budget in-word test fails because the planner returns the oversized piece. The indivisible-piece test fails because the planner returns chunks for the rejected file and no B18 entry.

- [ ] **Step 3: Give each piece its own budget gate.** In `planFile`, insert this function after `tryAdd` and before `place`. Use the existing `cutLine`, which keeps line endings, whitespace preference and code point boundaries. When subdividing, the first-code-point-width check prevents the fallback from returning the same indivisible piece. The positive-width smaller pieces terminate.

```js
  const placePiece = (piece, lineOffset) => {
    const selected = select(index, piece.text);
    const chars = charsOf(index, selected);
    if (chars + piece.text.length <= room) {
      finish(piece, selected);
      return;
    }
    const firstWidth = piece.text.codePointAt(0) > 0xffff ? 2 : 1;
    if (piece.text.length === firstWidth) {
      throw new LineTooLarge(lineReason(lineOffset, chars, maxRequestChars));
    }
    for (const part of cutLine(piece, Math.ceil(piece.text.length / 2))) placePiece(part, lineOffset);
  };
```

  Keep the original line-projection room check in `place`. Replace its final one-line loop with:

```js
    for (const piece of cutLine(unit, room - chars)) placePiece(piece, unit.offset);
```

  The existing `plan` catches the typed failure outside `planFile`, which has its own local chunk array. This discards the file's previously collected chunks without blocking later files.

- [ ] **Step 4: Verify and commit.** Run `node --test templates/scripts/ontology-projection.test.mjs templates/scripts/semantic-review-model.test.mjs`, then run the shipped projector test alone from `templates/scripts`. Stage only the two files, review the cached diff, lint ontology terms and run `npm test`. All pass, including the existing pre-send and 413 tests. Commit `fix: enforce matched piece budgets before review (#135)` and push.

## Task 20 — omit the example key when the matched catalog is empty

**Files:** `templates/scripts/ontology-projection.mjs`, `templates/scripts/ontology-projection.test.mjs`.

- [ ] **Step 1: Add the test and run it.** Append to the shipped projector test:

```js
test("B13 B24 an empty optional-only catalog has no example key and can still be planned", () => {
  const empty = catalogOntology("# Ontology\n", { required: [], optional: ["Entities"] });
  assert.equal(empty.evidenceKeys.size, 0);
  const projection = "# Canonical ontology evidence\n\n## Evidence keys\n\n" +
    "Each key is a section name, a colon, and one name listed under it.\n";
  assert.deepEqual(matched(empty, ""), { text: projection, keys: [] });
  const budget = fixed + projection.length + 1;
  assert.deepEqual(matched.plan(empty, [{ path: PATH, text: "x" }], budget), {
    chunks: [{ path: PATH, offset: 0, text: "x", keys: [], chars: projection.length }], unreviewed: [],
  });
});
```

  Run `node --test templates/scripts/ontology-projection.test.mjs`. The new test fails because the index prints an undefined example.

- [ ] **Step 2: Implement.** In `groupedNameIndex`, after obtaining the first key, build the explanation and use it in the return value:

```js
  const explanation = "Each key is a section name, a colon, and one name listed under it";
  const help = example === undefined ? `${explanation}.` : `${explanation}, for example ${example}.`;
  return ["", "", "## Evidence keys", "", help, "", ...lines].join("\n");
```

- [ ] **Step 3: Verify and commit.** Run the focused projector test, stage the two files, review the cached diff, lint ontology terms and run `npm test`. All pass. Commit `fix: omit an example key from an empty matched index (#135)` and push.

## Task 21 — verify, measure and hand off the completed build

**Files:** none. This replaces Task 17 as the completion checkpoint. Reuse its measurement script and follow its required handoff contents.

- [ ] **Step 1: Verify the final tree.** Review the ontology against the B24 and B25 concepts and check the working and staged trees. Run the ontology term check and the unfiltered full suite. Run `ontology-projection.test.mjs`, `semantic-review-model.test.mjs`, `semantic-review-github.test.mjs` and `semantic-review-worker.test.mjs` individually from `templates/scripts` on Docker Node 20, 22 and 24. Read each exit status. The prototype passed 754 tests in the full suite and 117 shipped tests per Node version. Check the count and exit status of each run.
- [ ] **Step 2: Re-measure and replay.** Use Task 17's script with the built projector and the current checkouts of InternalOntology and JEPA-Speech. Compare against **Measurements** in the task plan. For a like-for-like check, measure the old InternalOntology input revision `63c1e5b` separately if its current input differs. Use a scratch checkout or Git object reads. Repeat the ten recorded findings from the hidden run markers on JEPA-Speech PRs #210 and #217. Plan each Markdown file and render `docs/ontology.ttl` at that record's revision, require the quote-containing chunk to have its cited key, and verify each chunk's size and keys against `project`. JEPA-Speech is read-only.

  Retrieve the comment pages with `gh api --paginate --slurp "repos/jamiemitchellconsultants/JEPA-Speech/issues/<number>/comments?per_page=100"` for 210 and 217. In comments from GitHub Actions, group the `ontology-semantic-run v1` markers by run id, concatenate the `data` values in part order, decode Base64 and parse the JSON. Require a complete part set and schema 1. The replay keys are the recorded `headSha`, path, quote and evidence key. Read the file, ontology and section config with `git show <revision>:<path>` in the consumer checkout.

- [ ] **Step 3: Verify the new boundaries.** Record that the Task 18 fixture goes through the pinned raw client, Turtle renderer and actual planner at greater than 1 MiB, and that the Task 19 file with an indivisible over-budget piece reports B18's original-line reason before any model request for that file. Run the focused tests again if the earlier logs are unavailable. The synthetic name-index ceiling is a projection limit, while GitHub's raw Contents endpoint has a separate size limit.
- [ ] **Step 4: Commit the verification checkpoint.** With an empty index and a green final suite, make the Task 21 verification-only commit with `git commit --allow-empty -m "test: verify the matched projection build amendment (#135)"` and push. Retain the push status. The user phase opens the build PR from this branch.
- [ ] **Step 5: Complete the issue and handoff.** Tick the two exact [Dev] Build criteria as they are met. Lint the handoff draft with `node scripts/check-ontology-terms.mjs --also <file>` and post it with `node scripts/feature.mjs handoff --feature 135 --body-file <file>`. Use the feature handoff template. Include links to ADRs 0029–0031 and 0034–0035, measured figures, tests and replay results, and the consumer reinstall command `--force --with-semantic-review`. Include the missing-Turtle fallback, the local-only acceptance commit `b1a2a41` on `feature/matched-ontology-projection/user` that the user phase regenerates, and the required live model run in JEPA-Speech with permission before committing or pushing there. Stop at the checkpoint.
