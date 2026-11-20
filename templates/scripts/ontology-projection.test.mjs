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
