# Matched ontology projection — detailed implementation plan

Execute after the [task plan](../../superpowers/plans/matched-ontology-projection/plan.md) has merged.
Before starting, read:
- the [behaviours and architecture](../../features/matched-ontology-projection/feature.md);
- [ADR 0026](../../adr/0026-matched-projection-as-an-injected-projector.md);
- [ADR 0027](../../adr/0027-deterministic-matching-rule-and-fixed-stop-list.md);
- [ADR 0028](../../adr/0028-projection-setting-and-run-record-summary.md).

Work on `feature/matched-ontology-projection/build`. Each task is a separate test-first commit and
push. Before each commit:
1. Run the task's focused test.
2. Stage only that task's files and review `git diff --cached`.
3. Run `node scripts/check-ontology-terms.mjs`.
4. Run `npm test` and **check the exit status**.

Every test below was run against a prototype of this plan before the plan was written:
- the tests pass against the prototype;
- each new test fails against `main` where it should;
- the five existing assertions the plan updates are the only existing failures.

Keep the test names. Code fragments are contracts. Write the bodies yourself, except where a step gives
an algorithm that the tests do not pin down.

## Task 1 — grouped rows in `catalogOntology`

**Files:** `templates/scripts/semantic-review-model.mjs`, `templates/scripts/semantic-review-model.test.mjs`.

**Produces:** `catalogOntology(markdown, sections)` returns its existing fields plus `groups`:
`Map<evidenceKey, { section, name, rows: string[] }>`.
- Keys are in order of first appearance.
- `rows` holds, in source order, every table line keyed to that evidence key, and every invariant bullet keyed to it.
- An invariant bullet's row is the bullet line plus its continuation lines, joined with `"\n"`, as `rows` builds it today.
- `projection`, `entries`, `evidenceKeys` and `rows` are unchanged. `rows` still keeps the last row per key.

- [ ] **Step 1: Add the failing tests** to the end of `semantic-review-model.test.mjs`:

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

- [ ] **Step 2: Run the tests.** Run `node --test templates/scripts/semantic-review-model.test.mjs`. The first test fails because `groups` is undefined. The second passes, which proves today's projection text before the change.
- [ ] **Step 3: Implement.** Use a local `groupFor(section, name)` that creates groups on demand.
  - Push each keyed table line.
  - Push each named invariant bullet, and remember its group and its index in `rows`.
  - Append each continuation line to that remembered row while the invariant is open, under the same condition that already appends to `rows`.
  - Return `groups` beside the existing fields.
- [ ] **Step 4: Run the tests.** Run the focused test, then `npm test`. Both pass.
- [ ] **Step 5: Commit.** `feat: catalog groups every ontology row by evidence key (#135)`.

## Task 2 — the projection module, its shipped test, the installer and CI

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

- [ ] **Step 1: Write the shipped test**, `templates/scripts/ontology-projection.test.mjs`, in full. It imports only `./semantic-review-model.mjs` and `./ontology-projection.mjs`, so it runs alone in an adopting repository:

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

- [ ] **Step 2: Run the test.** Run `node --test templates/scripts/ontology-projection.test.mjs`. It fails because the module is not found.
- [ ] **Step 3: Implement the word splitting.** The tests do not fully pin these expressions, so use them exactly:

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

- [ ] **Step 4: Implement the selection.** It follows ADR 0027 over `catalog.groups`:
  1. **Base keys:**
     - every group whose `name` matches as a whole word, case-sensitive;
     - every group with a word `w` among its words where the Markdown words include `w`, `w + "s"` or `w + "es"`. A group's words are `nameWords(group.name)`, plus, for the Enums section, `nameWords(cells[1])` of each of its rows, where `cells = row.split("|").slice(1, -1).map(trim)`;
     - for each banned alias whose `phrase` matches as whole words in any case, every group whose `name` is in its `nameInstead`. A name with no group selects nothing.
  2. **One hop, read from base groups only:**
     - every group whose `name` equals the content of a backtick span in one of the base group's rows;
     - every Relationships group with a row whose From (the group name) or To (`cells[2]` without backticks) is a base name. Select that group, plus every group named by that row's From or To.
     - Entries added in this step add nothing further.
- [ ] **Step 5: Implement the rendering.**
  - **Matched mode:**
    1. Start with `# Canonical ontology evidence`.
    2. Walk `catalog.groups` in order. Before the first selected group of each section, emit `""` and `## <section>`. Emit every row of each selected group.
    3. End with the name index: `["", "", "## Evidence keys", "", ...evidenceKeys.map((key) => "- " + key)].join("\n")`, appended directly.
    4. `keys` are the selected keys in `groups` order.
  - **Full mode:** `{ text: catalog.projection, keys: [...catalog.evidenceKeys] }`.
- [ ] **Step 6: Add the installer entries.** In `bin/install-ontology.mjs`, inside `if (options.withSemanticReview)`, after the `semantic-review-*` loop, add `scripts/ontology-projection.mjs` and `scripts/ontology-projection.test.mjs`, each with `substitute: false, ownedBy: "kit"`. Do not add them to the graph-naming block.
- [ ] **Step 7: Add the CI line.** In `.github/workflows/test.yml`, add `node --test ontology-projection.test.mjs` to the step that runs shipped test files from `templates/scripts`.
- [ ] **Step 8: Extend the installer test.** In `tests/install-ontology.test.mjs`:

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

- [ ] **Step 9: Run the tests.** Run the shipped test, then the shipped test alone from inside `templates/scripts`, then `npm test`. All pass.
- [ ] **Step 10: Commit.** `feat: deterministic ontology projector for the semantic reviewer (#135)`.

## Task 3 — `reviewFiles` projects per file and per request

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

- [ ] **Step 1: Update the existing test** "clean response reviews a file and duplicate findings collapse". It deep-compares the whole result, so add the `projections` it now returns: one entry with mode `"full"`, `entriesSent: 1`, `entriesTotal: 1`, and `largestChars` and `fullChars` both equal to `catalogOntology(ontology, sections).projection.length`.
- [ ] **Step 2: Add the failing tests.** Add `catalogOntology` to the file's import list if it is missing. Add these helpers below the existing `options` and `completion`, then the tests:

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

- [ ] **Step 3: Run the tests.** Run `node --test templates/scripts/semantic-review-model.test.mjs`. The new tests fail.
- [ ] **Step 4: Implement** as described above.
- [ ] **Step 5: Run the tests.** Run the focused test and `npm test`. The graph-naming and #111 budget tests pass unchanged.
- [ ] **Step 6: Commit.** `feat: semantic review requests carry a per-chunk projection (#135)`.

## Task 4 — the `semanticReview.projection` setting

**Files:** `templates/scripts/ontology-config.mjs`, `tests/ontology-config.test.mjs`.

**Produces:** `validateModelReview(value, label, { allowProjection = false } = {})`.
- Only the `semanticReview` call passes `{ allowProjection: true }`.
- With the option, `"projection"` is an allowed key. The result gains `projection`: `"matched"` when the key is undefined, including when the whole section is absent.
- Any value other than `"matched"` or `"full"` throws `${CONFIG_FILENAME}: ${label}.projection must be "matched" or "full", got ${JSON.stringify(value.projection)}`.
- Test against `undefined`, not with `??`, so that `null` is rejected.
- Without the option, nothing changes. `namingReview` has no `projection`, and the key is unknown there.
- Update the `OntologyConfig` typedef: `semanticReview: { enabled, model, baseUrl, projection: "matched" | "full" }`.

- [ ] **Step 1: Update the existing tests.** Three existing assertions pin the old shape. Add `projection: "matched"` to the `semanticReview` value in each:
  - "a minimal config is filled in with empty defaults";
  - "semantic review is disabled when the section is absent";
  - "enabled semantic review accepts a maintainer endpoint and model".
- [ ] **Step 2: Add the failing tests:**

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

- [ ] **Step 3: Run the tests, implement, and run them again.** Run `node --test tests/ontology-config.test.mjs` before and after implementing, then `npm test`.
- [ ] **Step 4: Commit.** `feat: semanticReview.projection chooses matched or full (#135)`.

## Task 5 — the ledger prints the projection line

**Files:** `templates/scripts/semantic-review-ledger.mjs`, `templates/scripts/semantic-review-ledger.test.mjs`.

**Consumes:** `run.projections`, which is optional.

**Produces:** in `renderRun`, directly after the `Eligible: ...` line and before the `Not reviewed` lines, one line per item, but only when `Array.isArray(run.projections)`. Each value passes through `display`:

```
- Ontology projection for `<path>`: <mode>, <entriesSent> of <entriesTotal> entries with full rows; largest <largestChars> characters (full projection <fullChars>).
```

Numbers are printed with plain string conversion, not `toLocaleString`, so output never depends on locale. `statusFor`,
the record marker, part splitting and `readLatestRun` do not change.

- [ ] **Step 1: Add the failing tests:**

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

- [ ] **Step 2: Run the tests, implement, and run them again.** Run `node --test templates/scripts/semantic-review-ledger.test.mjs` before and after implementing, then `npm test`.
- [ ] **Step 3: Commit.** `feat: semantic run record shows each file's ontology projection (#135)`.

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

- [ ] **Step 1: Add the failing tests** to `semantic-review-worker.test.mjs`:

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

- [ ] **Step 2: Update the #111 acceptance test.** In `tests/semantic-budget-acceptance.test.mjs`, the test "B7 B8 a too-large run publishes success naming the budget, never an outage" expects the 60 KB ontology not to fit 24,000 characters. Under the new default, the name index (about 12,500 characters) fits, so the run would reach the unreachable model and be `unavailable`.
  - Add `projection: "full"` to that test's `semanticReview`.
  - Add the comment `// #111 proves the full projection's too-large path; #135's acceptance covers matched.`
  - This is the only existing acceptance test the default changes. The prototype run confirmed it.
- [ ] **Step 3: Run the tests, implement, and run them again.** Run `node --test templates/scripts/semantic-review-worker.test.mjs tests/semantic-budget-acceptance.test.mjs` before and after implementing, then `npm test`.
- [ ] **Step 4: Commit.** `feat: semantic worker sends matched projections by default (#135)`.

## Task 7 — runbook and README

**Files:** `templates/docs/ontology-semantic-review.md`, `README.md`.

- [ ] **Step 1: Add an "Ontology projection" section** to the runbook, after "Request budget". It covers:
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
- [ ] **Step 2: Add one sentence to README.md** beside the semantic pilot paragraph: requests now carry the matched `OntologyProjection` by default, and `semanticReview.projection: "full"` restores the whole ontology; see the runbook.
- [ ] **Step 3: Check and commit.** Run `node scripts/check-ontology-terms.mjs` and `npm test`, then commit: `docs: document matched ontology projections (#135)`.

## Task 8 — acceptance against the installed reviewer

**Files:** `tests/matched-projection-acceptance.test.mjs` (new).

The test installs the kit with `withSemanticReview`, imports the installed scripts, and talks to a local `node:http` stand-in for the model endpoint. Nothing calls a real model, GitHub or the gateway. B23 passes once Task 7 has landed.

- [ ] **Step 1: Write the test file in full:**

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

- [ ] **Step 2: Run the tests.** Run `node --test tests/matched-projection-acceptance.test.mjs`, then `npm test`. All pass.
- [ ] **Step 3: Commit.** `test: acceptance for matched ontology projections (#135)`.

## Task 9 — wrap-up

- [ ] **Step 1: Check the ontology.** Confirm that `docs/ontology.md` still matches the code: `OntologyProjection`, `ProjectionMode`, the `OntologyConfig` row and the `SemanticReviewRun` row.
- [ ] **Step 2: Run the full suite.** Run `npm test` and check its exit status.
- [ ] **Step 3: Run the shipped tests on every Node version.** Run each shipped test file alone, including `ontology-projection.test.mjs`, from `templates/scripts` on Node 20, 22 and 24 in Docker, as `.github/workflows/test.yml` does.
- [ ] **Step 4: Report the measured sizes.** Repeat the size measurement against the JEPA-Speech, InternalOntology and EventBooking checkouts with the built module, and report the medians in the build handoff. The prototype gave 75% for JEPA-Speech with all ten recorded findings kept.
- [ ] **Step 5: Hand off.** In lite mode the user phase opens the build PR, so post the handoff to the user instead of opening one. The handoff includes:
  - links to ADRs 0026–0028;
  - the per-consumer follow-up: re-run the installer with `--force --with-semantic-review`, and set `"full"` only after updating;
  - what was not verified: a live model run on a real pull request, and the JEPA-Speech replay, which U12 assigns to acceptance.
