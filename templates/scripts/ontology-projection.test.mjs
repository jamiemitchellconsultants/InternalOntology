// Shipped with the semantic reviewer. Runs standalone in an adopting repository: the fixtures are
// inline and synthetic, modelled on the ten findings JEPA-Speech recorded (feature #135, B11).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createModelAuth } from "./llm-auth.mjs";
import { catalogOntology, REQUEST_OVERHEAD, reviewFiles } from "./semantic-review-model.mjs";
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
  "| `Microphone` | `model` | Unrelated to removal or audit; used by a `Speaker`. |",
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

test("B17 a file with 140,000 one-character chunks is planned in order", () => {
  const text = "x".repeat(140_000);
  const { chunks, unreviewed } = matched.plan(catalog,
    [{ path: PATH, text }, { path: "docs/b.md", text: "z" }], fixed + EMPTY + 1);

  assert.deepEqual(unreviewed, []);
  assert.equal(chunks.length, text.length + 1);
  for (let offset = 0; offset < text.length; offset++) {
    assert.deepEqual(chunks[offset], { path: PATH, offset, text: "x", keys: [], chars: EMPTY });
  }
  assert.deepEqual(chunks.at(-1), { path: "docs/b.md", offset: 0, text: "z", keys: [], chars: EMPTY });
});
