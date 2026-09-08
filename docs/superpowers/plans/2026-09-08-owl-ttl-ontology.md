# OWL/TTL Machine-Readable Ontology Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `ontology.ttl` the source of truth for an adopting repository's ontology, with `ontology.md` generated from it (never hand-edited again), and give both a human and an AI agent a minimal-interaction path to install and seed the whole mechanism.

**Architecture:** A new `templates/scripts/owl-ontology.mjs` module holds a small, deliberately narrow Turtle reader/writer (it only ever has to round-trip Turtle this same module wrote) plus the Markdown table reader/writer, both built around one plain-object intermediate model. A new `templates/scripts/build-ontology.mjs` CLI wraps that module: migrate `.md` → `.ttl` once if no `.ttl` exists yet, then always render `.md` from `.ttl`. The installer, CI workflow, protocol text, and `ontology-setup` skill are updated to point at the new flow, and a new agent-facing runbook plus README updates cover the end-to-end adoption path.

**Tech Stack:** Plain Node.js `.mjs` (Node >= 18), `node --test`, zero dependencies — matching every other script this kit ships.

**Spec:** [docs/superpowers/specs/2026-09-08-owl-ttl-ontology-design.md](../specs/2026-09-08-owl-ttl-ontology-design.md)

## Global Constraints

- Node >= 18, plain `.mjs`, zero runtime dependencies (`package.json` has none; keep it that way).
- `npm test` (`node --test` over `tests/`) must pass before any commit.
- Scripts under `templates/scripts/` must ship byte-identical to every adopting repository — no repository-specific value baked into a script; anything that varies goes through `ontology.config.json`.
- False positives cost more than missed detections — `build-ontology.mjs --check` follows the same posture `check-ontology-terms.mjs` already does.
- No placeholders (`TBD`, `TODO`) in any shipped file.
- Every git commit message ends with:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  ```

---

### Task 1: `owl-ontology.mjs` — vocabulary constants and text helpers

**Files:**
- Create: `templates/scripts/owl-ontology.mjs`
- Test: `tests/owl-ontology.test.mjs`

**Interfaces:**
- Produces: `KIT_NS`, `OWL_NS`, `RDFS_NS` (string constants); `SECTION_COLUMNS` (`Record<string, string[]>`); `SECTION_CLASS` (`Record<string, string>`); `SECTION_ORDER` (`string[]`); `stripBacktickTerm(cell: string | undefined): string | null`; `splitBacktickList(cell: string | undefined): string[]`; `slugify(text: string): string`; `escapeTurtleString(text: string): string`; `unescapeTurtleString(text: string): string` — all consumed by Tasks 2–4.

- [ ] **Step 1: Write the failing tests**

```js
// tests/owl-ontology.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  KIT_NS,
  OWL_NS,
  RDFS_NS,
  SECTION_COLUMNS,
  SECTION_CLASS,
  SECTION_ORDER,
  stripBacktickTerm,
  splitBacktickList,
  slugify,
  escapeTurtleString,
  unescapeTurtleString,
} from "../templates/scripts/owl-ontology.mjs";

test("namespace constants are stable strings", () => {
  assert.equal(KIT_NS, "https://ontology-kit.dev/schema#");
  assert.match(OWL_NS, /^http:\/\/www\.w3\.org\/2002\/07\/owl#$/);
  assert.match(RDFS_NS, /^http:\/\/www\.w3\.org\/2000\/01\/rdf-schema#$/);
});

test("every SECTION_CLASS key has matching SECTION_COLUMNS, except Relationships and invariants", () => {
  for (const section of Object.keys(SECTION_CLASS)) {
    assert.ok(SECTION_COLUMNS[section], `${section} has a class but no columns`);
  }
});

test("SECTION_ORDER lists every table-shaped section plus Relationships and invariants, once each", () => {
  const tableShaped = Object.keys(SECTION_COLUMNS);
  for (const section of tableShaped) assert.ok(SECTION_ORDER.includes(section));
  assert.ok(SECTION_ORDER.includes("Business Rules & Invariants"));
  assert.equal(new Set(SECTION_ORDER).size, SECTION_ORDER.length);
});

test("stripBacktickTerm extracts the term from a single backticked cell", () => {
  assert.equal(stripBacktickTerm("`ExampleEntity`"), "ExampleEntity");
  assert.equal(stripBacktickTerm("  `ExampleEntity`  "), "ExampleEntity");
});

test("stripBacktickTerm returns null for anything that is not exactly one backticked term", () => {
  assert.equal(stripBacktickTerm("not backticked"), null);
  assert.equal(stripBacktickTerm("`a`, `b`"), null);
  assert.equal(stripBacktickTerm(""), null);
  assert.equal(stripBacktickTerm(undefined), null);
});

test("splitBacktickList splits a comma-separated list of backticked terms", () => {
  assert.deepEqual(splitBacktickList("`id`, `status`"), ["id", "status"]);
  assert.deepEqual(splitBacktickList("`Pending`, `Active`, `Closed`"), ["Pending", "Active", "Closed"]);
});

test("splitBacktickList returns an empty array for blank or missing cells", () => {
  assert.deepEqual(splitBacktickList(""), []);
  assert.deepEqual(splitBacktickList("   "), []);
  assert.deepEqual(splitBacktickList(undefined), []);
});

test("slugify collapses non-alphanumeric runs to a single underscore and trims the ends", () => {
  assert.equal(slugify("Pending Review"), "Pending_Review");
  assert.equal(slugify("  raises  "), "raises");
  assert.equal(slugify("1 → 1"), "1_1");
});

test("escapeTurtleString and unescapeTurtleString are inverses for quotes, backslashes and newlines", () => {
  const original = 'Say "hi"\\then a newline\nhere.';
  const escaped = escapeTurtleString(original);
  assert.equal(escaped.includes("\n"), false);
  assert.equal(unescapeTurtleString(escaped), original);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/owl-ontology.test.mjs`
Expected: FAIL — `Cannot find module '../templates/scripts/owl-ontology.mjs'`

- [ ] **Step 3: Write the implementation**

```js
// templates/scripts/owl-ontology.mjs
// Machine-readable OWL/TTL ontology support. ontology.ttl is the source of truth; ontology.md is
// generated from it — see build-ontology.mjs, the CLI entry point that drives this module.
//
// This file's Turtle reader (parseTurtle, added in a later task) only ever has to read Turtle this
// same module's own writer (serializeTurtle) produced. It is deliberately not a general RDF/Turtle
// implementation — see that function's own comment for what that scope limit buys.

export const KIT_NS = "https://ontology-kit.dev/schema#";
export const OWL_NS = "http://www.w3.org/2002/07/owl#";
export const RDFS_NS = "http://www.w3.org/2000/01/rdf-schema#";

/**
 * Column headers for each table-shaped section, in table order. The first column is always the
 * row's identifying, backticked name (or, for Relationships, the "From" reference).
 * @type {Record<string, string[]>}
 */
export const SECTION_COLUMNS = {
  "External Systems": ["Name", "What it is", "Description"],
  "Subsystems": ["Name", "What it is", "Responsibility", "Boundary"],
  "Aggregate Roots": ["Name", "Description", "Repository Interface"],
  "Entities": ["Name", "Properties", "Description"],
  "Value Objects": ["Name", "Properties", "Description"],
  "Domain Events": ["Name", "Raising Aggregate", "Payload Properties", "Description"],
  "Enums": ["Name", "Values", "Description"],
  "Use Cases": ["Name", "Actor", "Description"],
  "Relationships": ["From", "Relationship", "To", "Cardinality"],
};

/**
 * The fixed kit: class every row of a table-shaped section becomes a subclass of. Relationships
 * has none — its rows become owl:ObjectProperty individuals, not classes; see modelToTriples.
 * @type {Record<string, string>}
 */
export const SECTION_CLASS = {
  "External Systems": "ExternalSystem",
  "Subsystems": "Subsystem",
  "Aggregate Roots": "AggregateRoot",
  "Entities": "Entity",
  "Value Objects": "ValueObject",
  "Domain Events": "DomainEvent",
  "Enums": "Enum",
  "Use Cases": "UseCase",
};

/** Section rendering/parsing order — must match the shipped ontology.md template's own order. */
export const SECTION_ORDER = [
  "External Systems",
  "Subsystems",
  "Aggregate Roots",
  "Entities",
  "Value Objects",
  "Domain Events",
  "Enums",
  "Use Cases",
  "Relationships",
  "Business Rules & Invariants",
];

/**
 * Strips a single pair of surrounding backticks, e.g. "`ExampleEntity`" -> "ExampleEntity".
 * Returns null when the cell is not exactly one backticked term, so callers can tell "absent"
 * apart from "empty".
 * @param {string | undefined} cell
 * @returns {string | null}
 */
export function stripBacktickTerm(cell) {
  if (!cell) return null;
  const match = cell.trim().match(/^`([^`]+)`$/);
  return match ? match[1] : null;
}

/**
 * Splits a comma-separated cell of backticked terms, e.g. "`id`, `status`" -> ["id", "status"].
 * A blank or missing cell returns [].
 * @param {string | undefined} cell
 * @returns {string[]}
 */
export function splitBacktickList(cell) {
  if (!cell || !cell.trim()) return [];
  return cell
    .split(",")
    .map((part) => stripBacktickTerm(part))
    .filter((term) => term !== null);
}

/**
 * Turns free text into an IRI-safe local-name segment: letters, digits and underscores only,
 * every run of anything else collapsed to a single underscore, leading/trailing underscores
 * trimmed. Used for the parts of the ontology whose source text is not already a clean
 * identifier (enum individuals, relationship property names).
 * @param {string} text
 * @returns {string}
 */
export function slugify(text) {
  return text
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Escapes a JS string as the body of a Turtle double-quoted string literal (no surrounding quotes). */
export function escapeTurtleString(text) {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

/** Inverse of escapeTurtleString. */
export function unescapeTurtleString(text) {
  return text.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/owl-ontology.test.mjs`
Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add templates/scripts/owl-ontology.mjs tests/owl-ontology.test.mjs
git commit -m "$(cat <<'EOF'
feat: add OWL vocabulary constants and text helpers

First piece of the ontology.md <-> ontology.ttl conversion module:
the fixed kit: vocabulary and the small text-shape helpers the
parser, serializer and renderer all share.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `owl-ontology.mjs` — parse ontology.md into a model

**Files:**
- Modify: `templates/scripts/owl-ontology.mjs`
- Modify: `tests/owl-ontology.test.mjs`

**Interfaces:**
- Consumes: `SECTION_COLUMNS`, `stripBacktickTerm` from Task 1.
- Produces: `parseOntologyMarkdown(text: string): OntologyModel` where
  `OntologyModel = { projectName: string, sections: Record<string, Row[]>, invariants: Invariant[] }`,
  `Row = { name: string, cells: Record<string, string> }`, `Invariant = { concept: string, text: string }`.
  Consumed by Task 3 (`modelToTriples`) and Task 5 (round-trip test).

- [ ] **Step 1: Write the failing tests**

```js
// append to tests/owl-ontology.test.mjs
import { parseOntologyMarkdown } from "../templates/scripts/owl-ontology.mjs";

const FIXTURE_MD = `# Widgets — Application Ontology

Some preamble prose that is not part of any section.

---

## Entities

| Name | Properties | Description |
| --- | --- | --- |
| \`Widget\` | \`id\`, \`status\` | A thing that gets made. |
| \`Order\` | \`id\` | A request for widgets. |

---

## Enums

| Name | Values | Description |
| --- | --- | --- |
| \`WidgetStatus\` | \`Pending\`, \`Shipped\` | Lifecycle state. |

---

## Relationships

| From | Relationship | To | Cardinality |
| --- | --- | --- | --- |
| \`Order\` | requests | \`Widget\` | 1 → 1 |

---

## Business Rules & Invariants

- **\`Widget\`** — must have a non-empty id.
- **\`Order\`** — must reference at least one Widget.
`;

test("parseOntologyMarkdown reads the project name from the title", () => {
  assert.equal(parseOntologyMarkdown(FIXTURE_MD).projectName, "Widgets");
});

test("parseOntologyMarkdown reads table rows, keyed by their non-name columns", () => {
  const model = parseOntologyMarkdown(FIXTURE_MD);
  assert.deepEqual(model.sections.Entities, [
    { name: "Widget", cells: { Properties: "`id`, `status`", Description: "A thing that gets made." } },
    { name: "Order", cells: { Properties: "`id`", Description: "A request for widgets." } },
  ]);
});

test("parseOntologyMarkdown reads Enums like any other table-shaped section", () => {
  const model = parseOntologyMarkdown(FIXTURE_MD);
  assert.deepEqual(model.sections.Enums, [
    { name: "WidgetStatus", cells: { Values: "`Pending`, `Shipped`", Description: "Lifecycle state." } },
  ]);
});

test("parseOntologyMarkdown reads Relationships, with the From column as the row name", () => {
  const model = parseOntologyMarkdown(FIXTURE_MD);
  assert.deepEqual(model.sections.Relationships, [
    { name: "Order", cells: { Relationship: "requests", To: "`Widget`", Cardinality: "1 → 1" } },
  ]);
});

test("parseOntologyMarkdown reads Business Rules & Invariants bullets", () => {
  const model = parseOntologyMarkdown(FIXTURE_MD);
  assert.deepEqual(model.invariants, [
    { concept: "Widget", text: "must have a non-empty id." },
    { concept: "Order", text: "must reference at least one Widget." },
  ]);
});

test("parseOntologyMarkdown omits a section entirely absent from the text", () => {
  const model = parseOntologyMarkdown(FIXTURE_MD);
  assert.equal("External Systems" in model.sections, false);
  assert.equal("Subsystems" in model.sections, false);
});

test("parseOntologyMarkdown ignores a heading it does not recognise", () => {
  const withExtra = FIXTURE_MD.replace(
    "---\n\n## Entities",
    "---\n\n## Ontology protocol\n\nSome spliced text.\n\n---\n\n## Entities",
  );
  const model = parseOntologyMarkdown(withExtra);
  assert.deepEqual(Object.keys(model.sections), ["Entities", "Enums", "Relationships"]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/owl-ontology.test.mjs`
Expected: FAIL — `parseOntologyMarkdown is not a function`

- [ ] **Step 3: Write the implementation**

Append to `templates/scripts/owl-ontology.mjs`:

```js
/**
 * @typedef {{ name: string, cells: Record<string, string> }} Row
 * @typedef {{ concept: string, text: string }} Invariant
 * @typedef {{ projectName: string, sections: Record<string, Row[]>, invariants: Invariant[] }} OntologyModel
 */

const TITLE_RE = /^# (.+?) — Application Ontology\s*$/m;
const HEADING_RE = /^##\s+(.+?)\s*$/m;
const INVARIANT_RE = /^-\s+\*\*`([^`]+)`\*\*\s+—\s+(.*)$/;

/**
 * Parses the human-readable ontology.md into a structured model. A section header this module
 * does not recognise (e.g. a spliced "## Ontology protocol") is skipped, not an error — this
 * reader only ever needs to see the ontology's own sections. A recognised section absent from the
 * text is simply absent from `sections`, matching "delete the sections that do not apply".
 * @param {string} text
 * @returns {OntologyModel}
 */
export function parseOntologyMarkdown(text) {
  const titleMatch = text.match(TITLE_RE);
  const projectName = titleMatch ? titleMatch[1] : "";

  /** @type {Record<string, Row[]>} */
  const sections = {};
  /** @type {Invariant[]} */
  const invariants = [];

  for (const block of text.split(/\n---\n/)) {
    const headingMatch = block.match(HEADING_RE);
    if (!headingMatch) continue;
    const name = headingMatch[1].trim();

    if (name === "Business Rules & Invariants") {
      for (const line of block.split("\n")) {
        const match = line.match(INVARIANT_RE);
        if (match) invariants.push({ concept: match[1], text: match[2].trim() });
      }
      continue;
    }

    const columns = SECTION_COLUMNS[name];
    if (!columns) continue;
    sections[name] = parseTableRows(block, columns);
  }

  return { projectName, sections, invariants };
}

/**
 * @param {string} block - text of one "## Heading" section, including the heading line
 * @param {string[]} columns
 * @returns {Row[]}
 */
function parseTableRows(block, columns) {
  const tableLines = block.split("\n").filter((line) => line.trim().startsWith("|"));
  // tableLines[0] is the header row, tableLines[1] the "| --- | --- |" separator; data is [2..].
  /** @type {Row[]} */
  const rows = [];
  for (const line of tableLines.slice(2)) {
    const cellValues = line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
    if (cellValues.length < columns.length) continue;
    const name = stripBacktickTerm(cellValues[0]);
    if (name === null) continue;
    /** @type {Record<string, string>} */
    const cells = {};
    for (let index = 1; index < columns.length; index++) {
      cells[columns[index]] = cellValues[index];
    }
    rows.push({ name, cells });
  }
  return rows;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/owl-ontology.test.mjs`
Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add templates/scripts/owl-ontology.mjs tests/owl-ontology.test.mjs
git commit -m "$(cat <<'EOF'
feat: parse ontology.md tables and invariant bullets into a model

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `owl-ontology.mjs` — model to Turtle (the migrate direction)

**Files:**
- Modify: `templates/scripts/owl-ontology.mjs`
- Modify: `tests/owl-ontology.test.mjs`

**Interfaces:**
- Consumes: `OntologyModel`, `Row`, `SECTION_ORDER`, `SECTION_CLASS`, `splitBacktickList`, `stripBacktickTerm`, `slugify`, `KIT_NS`, `OWL_NS`, `RDFS_NS`, `escapeTurtleString` from Tasks 1–2.
- Produces: `Triple = { subject: string, predicate: string, object: string, objectType: "iri" | "literal" }`;
  `modelToTriples(model: OntologyModel): Triple[]`;
  `serializeTurtle(triples: Triple[], options: { namespaceUri: string }): string`.
  Consumed by Task 6 (`build-ontology.mjs`'s migrate step) and Task 4/5 (round-trip).

- [ ] **Step 1: Write the failing tests**

```js
// append to tests/owl-ontology.test.mjs
import { modelToTriples, serializeTurtle } from "../templates/scripts/owl-ontology.mjs";

const SIMPLE_MODEL = {
  projectName: "Widgets",
  sections: {
    Entities: [{ name: "Widget", cells: { Properties: "`id`, `status`", Description: "A thing that gets made." } }],
    Enums: [{ name: "WidgetStatus", cells: { Values: "`Pending`, `Shipped`", Description: "Lifecycle state." } }],
    Relationships: [{ name: "Order", cells: { Relationship: "requests", To: "`Widget`", Cardinality: "1 → 1" } }],
  },
  invariants: [{ concept: "Widget", text: "must have a non-empty id." }],
};

test("modelToTriples records the project name once, on the : subject", () => {
  const triples = modelToTriples(SIMPLE_MODEL);
  assert.deepEqual(
    triples.filter((t) => t.subject === ":"),
    [{ subject: ":", predicate: "kit:projectName", object: "Widgets", objectType: "literal" }],
  );
});

test("modelToTriples makes each entity row an owl:Class with its properties and comment", () => {
  const triples = modelToTriples(SIMPLE_MODEL).filter((t) => t.subject === ":Widget");
  assert.deepEqual(triples, [
    { subject: ":Widget", predicate: "a", object: "owl:Class", objectType: "iri" },
    { subject: ":Widget", predicate: "rdfs:subClassOf", object: "kit:Entity", objectType: "iri" },
    { subject: ":Widget", predicate: "rdfs:label", object: "Widget", objectType: "literal" },
    { subject: ":Widget", predicate: "rdfs:comment", object: "A thing that gets made.", objectType: "literal" },
    { subject: ":Widget", predicate: "kit:hasProperty", object: "id", objectType: "literal" },
    { subject: ":Widget", predicate: "kit:hasProperty", object: "status", objectType: "literal" },
  ]);
});

test("modelToTriples makes each enum value a named individual of its enum class", () => {
  const triples = modelToTriples(SIMPLE_MODEL);
  const pending = triples.filter((t) => t.subject === ":WidgetStatus_Pending");
  assert.deepEqual(pending, [
    { subject: ":WidgetStatus_Pending", predicate: "a", object: ":WidgetStatus", objectType: "iri" },
    { subject: ":WidgetStatus_Pending", predicate: "rdfs:label", object: "Pending", objectType: "literal" },
  ]);
});

test("modelToTriples makes each relationship row an owl:ObjectProperty with domain/range/cardinality", () => {
  const triples = modelToTriples(SIMPLE_MODEL).filter((t) => t.subject === ":requests");
  assert.deepEqual(triples, [
    { subject: ":requests", predicate: "a", object: "owl:ObjectProperty", objectType: "iri" },
    { subject: ":requests", predicate: "rdfs:domain", object: ":Order", objectType: "iri" },
    { subject: ":requests", predicate: "rdfs:range", object: ":Widget", objectType: "iri" },
    { subject: ":requests", predicate: "rdfs:label", object: "requests", objectType: "literal" },
    { subject: ":requests", predicate: "kit:cardinality", object: "1 → 1", objectType: "literal" },
  ]);
});

test("modelToTriples de-duplicates a relationship local name only when the (from, to) pair differs", () => {
  const model = {
    projectName: "W",
    sections: {
      Relationships: [
        { name: "Order", cells: { Relationship: "contains", To: "`Widget`", Cardinality: "1 → *" } },
        { name: "Crate", cells: { Relationship: "contains", To: "`Widget`", Cardinality: "1 → *" } },
      ],
    },
    invariants: [],
  };
  const subjects = new Set(modelToTriples(model).map((t) => t.subject));
  assert.ok(subjects.has(":contains"));
  assert.ok(subjects.has(":contains_2"));
});

test("modelToTriples records an invariant as kit:invariant on its concept", () => {
  const triples = modelToTriples(SIMPLE_MODEL).filter((t) => t.predicate === "kit:invariant");
  assert.deepEqual(triples, [
    { subject: ":Widget", predicate: "kit:invariant", object: "must have a non-empty id.", objectType: "literal" },
  ]);
});

test("serializeTurtle writes the four fixed prefixes, using the given namespaceUri for the default one", () => {
  const text = serializeTurtle([], { namespaceUri: "https://ontology.example/widgets#" });
  assert.match(text, /^@prefix : <https:\/\/ontology\.example\/widgets#> \.\n/);
  assert.match(text, /@prefix kit: <https:\/\/ontology-kit\.dev\/schema#> \.\n/);
  assert.match(text, /@prefix owl: <http:\/\/www\.w3\.org\/2002\/07\/owl#> \.\n/);
  assert.match(text, /@prefix rdfs: <http:\/\/www\.w3\.org\/2000\/01\/rdf-schema#> \.\n/);
});

test("serializeTurtle groups a subject's triples into one semicolon-joined block ending in a period", () => {
  const text = serializeTurtle(
    [
      { subject: ":Widget", predicate: "a", object: "owl:Class", objectType: "iri" },
      { subject: ":Widget", predicate: "rdfs:label", object: "Widget", objectType: "literal" },
    ],
    { namespaceUri: "https://ontology.example/widgets#" },
  );
  assert.match(text, /:Widget a owl:Class ;\n {4}rdfs:label "Widget" \.\n/);
});

test("serializeTurtle quotes and escapes literal objects", () => {
  const text = serializeTurtle(
    [{ subject: ":Widget", predicate: "rdfs:comment", object: 'Say "hi".', objectType: "literal" }],
    { namespaceUri: "https://ontology.example/widgets#" },
  );
  assert.match(text, /rdfs:comment "Say \\"hi\\"\." \./);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/owl-ontology.test.mjs`
Expected: FAIL — `modelToTriples is not a function`

- [ ] **Step 3: Write the implementation**

Append to `templates/scripts/owl-ontology.mjs`:

```js
/** @typedef {{ subject: string, predicate: string, object: string, objectType: "iri" | "literal" }} Triple */

/**
 * Converts a parsed ontology.md model into the triples that describe it, applying the kit's
 * vocabulary mapping (see the design spec's "OWL vocabulary" section). This is the migration
 * direction: an existing ontology.md becomes a new ontology.ttl.
 * @param {OntologyModel} model
 * @returns {Triple[]}
 */
export function modelToTriples(model) {
  /** @type {Triple[]} */
  const triples = [];
  const literal = (subject, predicate, text) => {
    if (!text || !text.trim()) return;
    triples.push({ subject, predicate, object: text.trim(), objectType: "literal" });
  };
  const iri = (subject, predicate, object) => {
    triples.push({ subject, predicate, object, objectType: "iri" });
  };

  literal(":", "kit:projectName", model.projectName);

  for (const sectionName of SECTION_ORDER) {
    const rows = model.sections[sectionName];
    if (!rows) continue;

    if (sectionName === "Relationships") {
      addRelationshipTriples(rows, iri, literal);
      continue;
    }

    const kitClass = SECTION_CLASS[sectionName];
    for (const row of rows) {
      const subject = `:${row.name}`;
      iri(subject, "a", "owl:Class");
      iri(subject, "rdfs:subClassOf", `kit:${kitClass}`);
      literal(subject, "rdfs:label", row.name);
      literal(subject, "rdfs:comment", row.cells.Description);
      literal(subject, "kit:whatItIs", row.cells["What it is"]);
      literal(subject, "kit:responsibility", row.cells.Responsibility);
      literal(subject, "kit:boundary", row.cells.Boundary);
      literal(subject, "kit:repositoryInterface", row.cells["Repository Interface"]);
      literal(subject, "kit:actor", row.cells.Actor);
      for (const prop of splitBacktickList(row.cells.Properties)) literal(subject, "kit:hasProperty", prop);
      for (const prop of splitBacktickList(row.cells["Payload Properties"])) literal(subject, "kit:hasProperty", prop);
      const raisedBy = stripBacktickTerm(row.cells["Raising Aggregate"]);
      if (raisedBy) iri(subject, "kit:raisedBy", `:${raisedBy}`);

      if (sectionName === "Enums") {
        for (const value of splitBacktickList(row.cells.Values)) {
          const individual = `:${row.name}_${slugify(value)}`;
          iri(individual, "a", subject);
          literal(individual, "rdfs:label", value);
        }
      }
    }
  }

  for (const invariant of model.invariants) {
    literal(`:${invariant.concept}`, "kit:invariant", invariant.text);
  }

  return triples;
}

/**
 * @param {Row[]} rows
 * @param {(subject: string, predicate: string, object: string) => void} iri
 * @param {(subject: string, predicate: string, text: string | undefined) => void} literal
 */
function addRelationshipTriples(rows, iri, literal) {
  /** @type {Map<string, Set<string>>} */
  const pairsByLocalName = new Map();
  for (const row of rows) {
    const fromName = row.name;
    const toName = stripBacktickTerm(row.cells.To) ?? row.cells.To;
    const relText = row.cells.Relationship ?? "";
    const pairKey = `${fromName}|${toName}`;
    const baseName = slugify(relText) || "relationship";

    let localName = baseName;
    let suffix = 2;
    while (pairsByLocalName.has(localName) && !pairsByLocalName.get(localName).has(pairKey)) {
      localName = `${baseName}_${suffix}`;
      suffix++;
    }
    if (!pairsByLocalName.has(localName)) pairsByLocalName.set(localName, new Set());
    pairsByLocalName.get(localName).add(pairKey);

    const subject = `:${localName}`;
    iri(subject, "a", "owl:ObjectProperty");
    iri(subject, "rdfs:domain", `:${fromName}`);
    iri(subject, "rdfs:range", `:${toName}`);
    literal(subject, "rdfs:label", relText);
    literal(subject, "kit:cardinality", row.cells.Cardinality);
  }
}

/**
 * Serializes triples as Turtle: the four fixed prefixes, then one blank-line-separated block per
 * subject, each a semicolon-joined predicate-object list ending in a period. Every logical
 * predicate-object pair is written on its own physical line — literal newlines are already escaped
 * by the time they reach here — which is what lets parseTurtle read this format back with a plain
 * line-oriented parser instead of a full tokenizer.
 * @param {Triple[]} triples
 * @param {{ namespaceUri: string }} options
 * @returns {string}
 */
export function serializeTurtle(triples, { namespaceUri }) {
  /** @type {Map<string, Triple[]>} */
  const bySubject = new Map();
  for (const triple of triples) {
    if (!bySubject.has(triple.subject)) bySubject.set(triple.subject, []);
    bySubject.get(triple.subject).push(triple);
  }

  const header =
    `@prefix : <${namespaceUri}> .\n` +
    `@prefix kit: <${KIT_NS}> .\n` +
    `@prefix owl: <${OWL_NS}> .\n` +
    `@prefix rdfs: <${RDFS_NS}> .\n`;

  const blocks = [];
  for (const [subject, subjectTriples] of bySubject) {
    const lines = subjectTriples.map((triple, index) => {
      const objectText =
        triple.objectType === "literal" ? `"${escapeTurtleString(triple.object)}"` : triple.object;
      const terminator = index === subjectTriples.length - 1 ? "." : ";";
      const prefix = index === 0 ? `${subject} ${triple.predicate} ` : `    ${triple.predicate} `;
      return `${prefix}${objectText} ${terminator}`;
    });
    blocks.push(lines.join("\n"));
  }

  return blocks.length ? `${header}\n${blocks.join("\n\n")}\n` : `${header}\n`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/owl-ontology.test.mjs`
Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add templates/scripts/owl-ontology.mjs tests/owl-ontology.test.mjs
git commit -m "$(cat <<'EOF'
feat: convert an ontology model into OWL/Turtle triples

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `owl-ontology.mjs` — Turtle to model, and model to Markdown (the render direction)

**Files:**
- Modify: `templates/scripts/owl-ontology.mjs`
- Modify: `tests/owl-ontology.test.mjs`

**Interfaces:**
- Consumes: `Triple`, `OntologyModel`, `Row`, `SECTION_ORDER`, `SECTION_COLUMNS`, `SECTION_CLASS`, `unescapeTurtleString` from Tasks 1–3.
- Produces: `parseTurtle(text: string): Triple[]`; `triplesToModel(triples: Triple[]): OntologyModel`;
  `renderOntologyMarkdown(model: OntologyModel): string`.
  Consumed by Task 5 (round-trip test) and Task 6 (`build-ontology.mjs`'s render step).

- [ ] **Step 1: Write the failing tests**

```js
// append to tests/owl-ontology.test.mjs
import { parseTurtle, triplesToModel, renderOntologyMarkdown } from "../templates/scripts/owl-ontology.mjs";

test("parseTurtle skips @prefix lines and reads a single-triple block", () => {
  const text = `@prefix : <https://ontology.example/w#> .\n@prefix kit: <${KIT_NS}> .\n\n:Widget a owl:Class .\n`;
  assert.deepEqual(parseTurtle(text), [{ subject: ":Widget", predicate: "a", object: "owl:Class", objectType: "iri" }]);
});

test("parseTurtle reads a multi-line semicolon-joined block", () => {
  const text = `@prefix : <https://x#> .\n\n:Widget a owl:Class ;\n    rdfs:label "Widget" ;\n    kit:hasProperty "id" .\n`;
  assert.deepEqual(parseTurtle(text), [
    { subject: ":Widget", predicate: "a", object: "owl:Class", objectType: "iri" },
    { subject: ":Widget", predicate: "rdfs:label", object: "Widget", objectType: "literal" },
    { subject: ":Widget", predicate: "kit:hasProperty", object: "id", objectType: "literal" },
  ]);
});

test("parseTurtle unescapes quoted string literals", () => {
  const text = `@prefix : <https://x#> .\n\n:Widget rdfs:comment "Say \\"hi\\"." .\n`;
  assert.deepEqual(parseTurtle(text), [
    { subject: ":Widget", predicate: "rdfs:comment", object: 'Say "hi".', objectType: "literal" },
  ]);
});

test("parseTurtle is the inverse of serializeTurtle for a representative triple set", () => {
  const triples = modelToTriples(SIMPLE_MODEL);
  const text = serializeTurtle(triples, { namespaceUri: "https://ontology.example/widgets#" });
  assert.deepEqual(parseTurtle(text), triples);
});

test("parseTurtle rejects a line with no terminating ';' or '.'", () => {
  assert.throws(() => parseTurtle(":Widget a owl:Class\n"), /expected ";" or "\." at end/);
});

test("triplesToModel is the inverse of modelToTriples for a representative model", () => {
  const triples = modelToTriples(SIMPLE_MODEL);
  assert.deepEqual(triplesToModel(triples), SIMPLE_MODEL);
});

test("renderOntologyMarkdown emits the project title", () => {
  const text = renderOntologyMarkdown({ projectName: "Widgets", sections: {}, invariants: [] });
  assert.match(text, /^# Widgets — Application Ontology\n/);
});

test("renderOntologyMarkdown omits a section with no rows", () => {
  const text = renderOntologyMarkdown({ projectName: "Widgets", sections: {}, invariants: [] });
  assert.doesNotMatch(text, /## Entities/);
});

test("renderOntologyMarkdown renders a table-shaped section with its header, separator and rows", () => {
  const text = renderOntologyMarkdown(SIMPLE_MODEL);
  assert.match(text, /## Entities\n\n\| Name \| Properties \| Description \|\n\| --- \| --- \| --- \|\n\| `Widget` \| `id`, `status` \| A thing that gets made\. \|/);
});

test("renderOntologyMarkdown renders invariant bullets", () => {
  const text = renderOntologyMarkdown(SIMPLE_MODEL);
  assert.match(text, /## Business Rules & Invariants\n\n- \*\*`Widget`\*\* — must have a non-empty id\./);
});

test("renderOntologyMarkdown round-trips a model through parseOntologyMarkdown", () => {
  const rendered = renderOntologyMarkdown(SIMPLE_MODEL);
  const reparsed = parseOntologyMarkdown(rendered);
  assert.deepEqual(reparsed, SIMPLE_MODEL);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/owl-ontology.test.mjs`
Expected: FAIL — `parseTurtle is not a function`

- [ ] **Step 3: Write the implementation**

Append to `templates/scripts/owl-ontology.mjs`:

```js
/**
 * Parses the Turtle subset this module's own serializeTurtle produces: @prefix lines (skipped —
 * every token in the body is already written in prefixed form, so nothing needs expanding), then
 * blank-line-separated subject blocks of "subject predicate object ;\n    predicate object ;\n
 * ... predicate object .". This is not a general Turtle parser — it relies on every
 * predicate-object pair sitting on its own physical line, which serializeTurtle guarantees by
 * escaping literal newlines. It is meant only to read this same module's own output back.
 * @param {string} text
 * @returns {Triple[]}
 */
export function parseTurtle(text) {
  /** @type {Triple[]} */
  const triples = [];
  const blocks = text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block && !block.startsWith("@prefix"));

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    let subject = null;
    for (const rawLine of lines) {
      const terminator = rawLine.at(-1);
      if (terminator !== ";" && terminator !== ".") {
        throw new Error(`malformed Turtle line (expected ";" or "." at end): "${rawLine}"`);
      }
      const body = rawLine.slice(0, -1).trim();
      let rest = body;
      if (subject === null) {
        const firstSpace = body.indexOf(" ");
        if (firstSpace === -1) throw new Error(`malformed Turtle line (no subject found): "${rawLine}"`);
        subject = body.slice(0, firstSpace);
        rest = body.slice(firstSpace + 1).trim();
      }
      const predicateSpace = rest.indexOf(" ");
      if (predicateSpace === -1) throw new Error(`malformed Turtle line (no predicate/object split): "${rawLine}"`);
      const predicate = rest.slice(0, predicateSpace);
      const objectToken = rest.slice(predicateSpace + 1).trim();
      if (objectToken.startsWith('"')) {
        if (!objectToken.endsWith('"') || objectToken.length < 2) {
          throw new Error(`malformed Turtle string literal: "${rawLine}"`);
        }
        triples.push({
          subject,
          predicate,
          object: unescapeTurtleString(objectToken.slice(1, -1)),
          objectType: "literal",
        });
      } else {
        triples.push({ subject, predicate, object: objectToken, objectType: "iri" });
      }
    }
  }
  return triples;
}

/**
 * Converts triples back into an ontology model — the inverse of modelToTriples. This is the
 * render direction: ontology.ttl becomes the ontology.md that gets written to disk.
 * @param {Triple[]} triples
 * @returns {OntologyModel}
 */
export function triplesToModel(triples) {
  /** @type {Map<string, Triple[]>} */
  const bySubject = new Map();
  for (const triple of triples) {
    if (!bySubject.has(triple.subject)) bySubject.set(triple.subject, []);
    bySubject.get(triple.subject).push(triple);
  }
  const get = (subjectTriples, predicate) => subjectTriples.find((t) => t.predicate === predicate)?.object;

  let projectName = "";
  /** @type {Record<string, Row[]>} */
  const sections = {};
  /** @type {Map<string, string>} */
  const classSection = new Map();

  // Pass 1: classes (every table-shaped section except Relationships and enum individuals).
  for (const [subject, subjectTriples] of bySubject) {
    if (subject === ":") {
      projectName = get(subjectTriples, "kit:projectName") ?? "";
      continue;
    }
    const type = get(subjectTriples, "a");
    if (type !== "owl:Class") continue;

    const subClass = get(subjectTriples, "rdfs:subClassOf");
    const sectionName = Object.entries(SECTION_CLASS).find(([, kitClass]) => subClass === `kit:${kitClass}`)?.[0];
    if (!sectionName) continue;
    classSection.set(subject, sectionName);

    const name = subject.slice(1);
    /** @type {Record<string, string>} */
    const cells = { Description: get(subjectTriples, "rdfs:comment") ?? "" };
    const whatItIs = get(subjectTriples, "kit:whatItIs");
    if (whatItIs !== undefined) cells["What it is"] = whatItIs;
    const responsibility = get(subjectTriples, "kit:responsibility");
    if (responsibility !== undefined) cells.Responsibility = responsibility;
    const boundary = get(subjectTriples, "kit:boundary");
    if (boundary !== undefined) cells.Boundary = boundary;
    const repositoryInterface = get(subjectTriples, "kit:repositoryInterface");
    if (repositoryInterface !== undefined) cells["Repository Interface"] = repositoryInterface;
    const actor = get(subjectTriples, "kit:actor");
    if (actor !== undefined) cells.Actor = actor;

    const properties = subjectTriples.filter((t) => t.predicate === "kit:hasProperty").map((t) => t.object);
    if (sectionName === "Domain Events") {
      if (properties.length) cells["Payload Properties"] = properties.map((p) => `\`${p}\``).join(", ");
      const raisedBy = get(subjectTriples, "kit:raisedBy");
      if (raisedBy) cells["Raising Aggregate"] = `\`${raisedBy.slice(1)}\``;
    } else if (properties.length) {
      cells.Properties = properties.map((p) => `\`${p}\``).join(", ");
    }

    if (!sections[sectionName]) sections[sectionName] = [];
    sections[sectionName].push({ name, cells });
  }

  // Pass 2: relationships.
  /** @type {Row[]} */
  const relationshipRows = [];
  for (const [, subjectTriples] of bySubject) {
    if (get(subjectTriples, "a") !== "owl:ObjectProperty") continue;
    const domain = get(subjectTriples, "rdfs:domain")?.slice(1) ?? "";
    const range = get(subjectTriples, "rdfs:range")?.slice(1) ?? "";
    relationshipRows.push({
      name: domain,
      cells: {
        Relationship: get(subjectTriples, "rdfs:label") ?? "",
        To: `\`${range}\``,
        Cardinality: get(subjectTriples, "kit:cardinality") ?? "",
      },
    });
  }
  if (relationshipRows.length) sections.Relationships = relationshipRows;

  // Pass 3: enum individuals, grouped back onto their enum class's Values cell, in file order.
  /** @type {Map<string, string[]>} */
  const valuesByEnumClass = new Map();
  for (const [subject, subjectTriples] of bySubject) {
    const type = get(subjectTriples, "a");
    if (type === "owl:Class" || type === "owl:ObjectProperty" || !type) continue;
    if (classSection.get(type) !== "Enums") continue;
    if (!valuesByEnumClass.has(type)) valuesByEnumClass.set(type, []);
    valuesByEnumClass.get(type).push(get(subjectTriples, "rdfs:label") ?? "");
  }
  for (const row of sections.Enums ?? []) {
    const values = valuesByEnumClass.get(`:${row.name}`) ?? [];
    row.cells.Values = values.map((v) => `\`${v}\``).join(", ");
  }

  // Invariants: kit:invariant triples on any subject, in file order.
  /** @type {Invariant[]} */
  const invariants = [];
  for (const [subject, subjectTriples] of bySubject) {
    if (subject === ":") continue;
    for (const triple of subjectTriples) {
      if (triple.predicate === "kit:invariant") invariants.push({ concept: subject.slice(1), text: triple.object });
    }
  }

  return { projectName, sections, invariants };
}

const PREAMBLE = (projectName) => `# ${projectName} — Application Ontology

<!-- GENERATED FROM ontology.ttl. Edit that file, not this one. -->

> **AI instructions:** Read this file in full before starting any task that touches domain
> concepts. To change it, edit \`ontology.ttl\` and run \`node scripts/build-ontology.mjs\`. This
> file must never lag behind the code. See the Ontology protocol section in this repository's
> agent-instruction file.

Every domain concept is named here exactly once, as a backticked PascalCase term. Code, specs,
plans and prose use those names; \`ontology.ttl\` is the source, this file and they are the
consumers. A term that appears in Markdown but not here fails the deterministic check in
\`scripts/check-ontology-terms.mjs\`.

**Delete the sections that do not apply to this repository from \`ontology.ttl\`**, and remove the
matching names from \`sections\` in \`ontology.config.json\`. An empty section is worse than an
absent one — the optional semantic reviewer treats an empty required section as a configuration
error.
`;

/**
 * Renders a model as the human-readable ontology.md: the fixed preamble above, then each
 * non-empty section from SECTION_ORDER as a Markdown table (or, for Business Rules & Invariants,
 * bullets), separated by "---" lines. This is the render direction's other half — the inverse of
 * parseOntologyMarkdown for any model that only uses columns this vocabulary defines.
 * @param {OntologyModel} model
 * @returns {string}
 */
export function renderOntologyMarkdown(model) {
  const parts = [PREAMBLE(model.projectName).trimEnd()];

  for (const sectionName of SECTION_ORDER) {
    if (sectionName === "Business Rules & Invariants") {
      if (!model.invariants.length) continue;
      const bullets = model.invariants.map((inv) => `- **\`${inv.concept}\`** — ${inv.text}`).join("\n");
      parts.push(`## ${sectionName}\n\n${bullets}\n`);
      continue;
    }
    const rows = model.sections[sectionName];
    if (!rows || !rows.length) continue;
    const columns = SECTION_COLUMNS[sectionName];
    const header = `| ${columns.join(" | ")} |`;
    const separator = `| ${columns.map(() => "---").join(" | ")} |`;
    const dataLines = rows.map((row) => {
      const cellValues = columns.map((column, index) => (index === 0 ? `\`${row.name}\`` : row.cells[column] ?? ""));
      return `| ${cellValues.join(" | ")} |`;
    });
    parts.push(`## ${sectionName}\n\n${[header, separator, ...dataLines].join("\n")}\n`);
  }

  return `${parts.join("\n---\n\n").trimEnd()}\n`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/owl-ontology.test.mjs`
Expected: PASS — all tests green. If `triplesToModel`/`renderOntologyMarkdown` round-trip tests fail, compare the assertion's actual-vs-expected output and fix `modelToTriples`/`triplesToModel`/`renderOntologyMarkdown` until they are exact inverses for every column — do not weaken the test.

- [ ] **Step 5: Commit**

```bash
git add templates/scripts/owl-ontology.mjs tests/owl-ontology.test.mjs
git commit -m "$(cat <<'EOF'
feat: render OWL/Turtle triples back into ontology.md

Completes the round trip: parseTurtle reads this module's own
serializeTurtle output, triplesToModel is the inverse of
modelToTriples, and renderOntologyMarkdown produces the generated
ontology.md.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Normalize the shipped example ontology and prove the full round trip

**Files:**
- Modify: `templates/docs/ontology.md`
- Modify: `tests/owl-ontology.test.mjs`

**Interfaces:**
- Consumes: `parseOntologyMarkdown`, `modelToTriples`, `serializeTurtle`, `parseTurtle`, `triplesToModel`, `renderOntologyMarkdown` from Tasks 2–4.
- Produces: nothing new — this task proves the whole pipeline is lossless on the kit's own shipped content, which Task 6's migrate step depends on being true.

The current `templates/docs/ontology.md` has hand-tweaked table separator widths (e.g. `|------|------------|-------------|`) and one invariant bullet wrapped across two physical lines. Neither is meaningful now that this file is machine-generated — normalize both to what `renderOntologyMarkdown` actually produces (3-dash separators, one line per row and per bullet), and update the preamble to the new "generated, edit ontology.ttl instead" wording from Task 4's `PREAMBLE`.

- [ ] **Step 1: Write the failing test**

```js
// append to tests/owl-ontology.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const EXAMPLE_ONTOLOGY_PATH = fileURLToPath(new URL("../templates/docs/ontology.md", import.meta.url));

test("the shipped example ontology round-trips exactly through migrate then render", () => {
  const original = readFileSync(EXAMPLE_ONTOLOGY_PATH, "utf8");
  const model = parseOntologyMarkdown(original);
  const triples = modelToTriples(model);
  const ttlText = serializeTurtle(triples, { namespaceUri: "https://ontology.example/example#" });
  const rendered = renderOntologyMarkdown(triplesToModel(parseTurtle(ttlText)));
  assert.equal(rendered, original);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/owl-ontology.test.mjs`
Expected: FAIL — the rendered text differs from the current hand-formatted template (different separator dashes, and the two-line invariant bullet collapses to one line with no continuation).

- [ ] **Step 3: Normalize the template**

Edit `templates/docs/ontology.md`:

1. Replace the preamble (current lines 1–15) with the `PREAMBLE("{{PROJECT_NAME}}")` text from Task 4 — i.e.:

```markdown
# {{PROJECT_NAME}} — Application Ontology

<!-- GENERATED FROM ontology.ttl. Edit that file, not this one. -->

> **AI instructions:** Read this file in full before starting any task that touches domain
> concepts. To change it, edit `ontology.ttl` and run `node scripts/build-ontology.mjs`. This
> file must never lag behind the code. See the Ontology protocol section in this repository's
> agent-instruction file.

Every domain concept is named here exactly once, as a backticked PascalCase term. Code, specs,
plans and prose use those names; `ontology.ttl` is the source, this file and they are the
consumers. A term that appears in Markdown but not here fails the deterministic check in
`scripts/check-ontology-terms.mjs`.

**Delete the sections that do not apply to this repository from `ontology.ttl`**, and remove the
matching names from `sections` in `ontology.config.json`. An empty section is worse than an absent
one — the optional semantic reviewer treats an empty required section as a configuration error.
```

2. Replace every table's separator row with the 3-dash form, e.g. change
   `|------|-----------|-------------|` to `| --- | --- | --- |` (and likewise for every other
   table in the file — External Systems, Subsystems, Aggregate Roots, Entities, Value Objects,
   Domain Events, Enums, Use Cases, Relationships), and give the header row the same
   `| Col1 | Col2 | Col3 |` spacing style.

3. Collapse the wrapped Business Rules & Invariants bullet onto one line:

```markdown
- **`ExampleEntity`** — must not move to `Closed` before an `ExampleApproved` event is received for it. Replace this bullet.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/owl-ontology.test.mjs`
Expected: PASS. If it still fails, `console.log` both strings and diff them by eye — the mismatch is almost always a stray extra/missing blank line or a column whose value Task 3/4 didn't map; fix the mapping, not the test.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — this also confirms `install-ontology.test.mjs`'s existing
`"placeholders are substituted in the files that carry them"` test still passes against the
reformatted template (it only checks the title line and absence of `{{`, both unaffected).

- [ ] **Step 6: Commit**

```bash
git add templates/docs/ontology.md tests/owl-ontology.test.mjs
git commit -m "$(cat <<'EOF'
docs: normalize the example ontology for machine generation

Updates the preamble to describe ontology.ttl as the source and this
file as generated, and normalizes table separators and the one
wrapped invariant bullet to the single-line form build-ontology.mjs
now produces. Proven lossless with a full migrate-then-render
round-trip test against this exact file.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `build-ontology.mjs` CLI

**Files:**
- Create: `templates/scripts/build-ontology.mjs`
- Create: `tests/build-ontology.test.mjs`

**Interfaces:**
- Consumes: `loadConfig` from `templates/scripts/ontology-config.mjs` (Task 7 adds `namespaceUri` to it — write this task's code against `config.namespaceUri` now, it will be `undefined` until Task 7 lands, which is fine since Task 6's own tests supply their own `ontology.config.json` fixtures and Task 7 runs immediately after); `parseOntologyMarkdown`, `modelToTriples`, `serializeTurtle`, `parseTurtle`, `triplesToModel`, `renderOntologyMarkdown` from Tasks 2–4.
- Produces: `ttlPathFor(ontologyPath: string): string`; `run(options: { cwd?: string, check?: boolean, force?: boolean }): { migrated: boolean, changed: boolean, mdPath: string, ttlPath: string }`; `parseCliArgs(argv: string[]): { help: true } | { check: boolean, force: boolean }`. Consumed by Task 8 (installer wiring) and Task 9 (CI workflow).

- [ ] **Step 1: Write the failing tests**

```js
// tests/build-ontology.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { run, ttlPathFor, parseCliArgs } from "../templates/scripts/build-ontology.mjs";
import { withTempRepo } from "./helpers/temp-repo.mjs";

const CLI = fileURLToPath(new URL("../templates/scripts/build-ontology.mjs", import.meta.url));

function writeMinimalConfig(repo, overrides = {}) {
  repo.write(
    "ontology.config.json",
    JSON.stringify({ ontologyPath: "docs/ontology.md", namespaceUri: "https://ontology.example/w#", ...overrides }),
  );
}

const MINIMAL_MD = `# Widgets — Application Ontology

## Entities

| Name | Properties | Description |
| --- | --- | --- |
| \`Widget\` | \`id\` | A thing that gets made. |
`;

test("ttlPathFor swaps the .md extension for .ttl", () => {
  assert.equal(ttlPathFor("docs/ontology.md"), "docs/ontology.ttl");
});

test("with no ontology.ttl yet, run() migrates and reports migrated: true", async () => {
  await withTempRepo(async (repo) => {
    repo.write("docs/ontology.md", MINIMAL_MD);
    writeMinimalConfig(repo);
    const result = run({ cwd: repo.dir });
    assert.equal(result.migrated, true);
    assert.ok(existsSync(join(repo.dir, "docs/ontology.ttl")));
  });
});

test("migrating then rendering reproduces an equivalent ontology.md", async () => {
  await withTempRepo(async (repo) => {
    repo.write("docs/ontology.md", MINIMAL_MD);
    writeMinimalConfig(repo);
    run({ cwd: repo.dir });
    const rendered = readFileSync(join(repo.dir, "docs/ontology.md"), "utf8");
    assert.match(rendered, /# Widgets — Application Ontology/);
    assert.match(rendered, /\| `Widget` \| `id` \| A thing that gets made\. \|/);
  });
});

test("a second run with no ontology.ttl edit is a no-op — changed: false", async () => {
  await withTempRepo(async (repo) => {
    repo.write("docs/ontology.md", MINIMAL_MD);
    writeMinimalConfig(repo);
    run({ cwd: repo.dir });
    const result = run({ cwd: repo.dir });
    assert.equal(result.migrated, false);
    assert.equal(result.changed, false);
  });
});

test("editing ontology.ttl and running again regenerates ontology.md", async () => {
  await withTempRepo(async (repo) => {
    repo.write("docs/ontology.md", MINIMAL_MD);
    writeMinimalConfig(repo);
    run({ cwd: repo.dir });
    const ttlPath = join(repo.dir, "docs/ontology.ttl");
    const ttl = readFileSync(ttlPath, "utf8").replace('"A thing that gets made."', '"Edited description."');
    repo.write("docs/ontology.ttl", ttl);
    const result = run({ cwd: repo.dir });
    assert.equal(result.changed, true);
    assert.match(readFileSync(join(repo.dir, "docs/ontology.md"), "utf8"), /Edited description\./);
  });
});

test("--check reports changed: true without writing, when ontology.md is stale", async () => {
  await withTempRepo(async (repo) => {
    repo.write("docs/ontology.md", MINIMAL_MD);
    writeMinimalConfig(repo);
    run({ cwd: repo.dir }); // establishes ontology.ttl and a fresh ontology.md
    repo.write("docs/ontology.md", "stale content\n");
    const result = run({ cwd: repo.dir, check: true });
    assert.equal(result.changed, true);
    assert.equal(readFileSync(join(repo.dir, "docs/ontology.md"), "utf8"), "stale content\n");
  });
});

test("--check reports changed: false when ontology.md already matches", async () => {
  await withTempRepo(async (repo) => {
    repo.write("docs/ontology.md", MINIMAL_MD);
    writeMinimalConfig(repo);
    run({ cwd: repo.dir });
    const result = run({ cwd: repo.dir, check: true });
    assert.equal(result.changed, false);
  });
});

test("--force rewrites ontology.md even though it already matches", async () => {
  await withTempRepo(async (repo) => {
    repo.write("docs/ontology.md", MINIMAL_MD);
    writeMinimalConfig(repo);
    run({ cwd: repo.dir });
    const before = readFileSync(join(repo.dir, "docs/ontology.md"), "utf8");
    const result = run({ cwd: repo.dir, force: true });
    assert.equal(readFileSync(join(repo.dir, "docs/ontology.md"), "utf8"), before);
    assert.equal(result.changed, false); // it already matched; --force wrote the same bytes again
  });
});

test("parseCliArgs rejects combining --check and --force", () => {
  assert.throws(() => parseCliArgs(["--check", "--force"]), /--check and --force are contradictory/);
});

test("parseCliArgs recognises --help and short-circuits other parsing", () => {
  assert.deepEqual(parseCliArgs(["--help"]), { help: true });
});

test("parseCliArgs rejects an unknown flag", () => {
  assert.throws(() => parseCliArgs(["--wat"]), /unknown argument "--wat"/);
});

test("the CLI exits 1 when --check finds ontology.md stale", async () => {
  await withTempRepo(async (repo) => {
    repo.write("docs/ontology.md", MINIMAL_MD);
    writeMinimalConfig(repo);
    execFileSync("node", [CLI], { cwd: repo.dir, encoding: "utf8" });
    repo.write("docs/ontology.md", "stale\n");
    let status = 0;
    try {
      execFileSync("node", [CLI, "--check"], { cwd: repo.dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      status = error.status;
    }
    assert.equal(status, 1);
  });
});

test("the CLI exits 0 and prints usage for --help without touching any file", async () => {
  await withTempRepo(async (repo) => {
    const stdout = execFileSync("node", [CLI, "--help"], { cwd: repo.dir, encoding: "utf8" });
    assert.match(stdout, /usage: node scripts\/build-ontology\.mjs/);
    assert.equal(existsSync(join(repo.dir, "ontology.config.json")), false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/build-ontology.test.mjs`
Expected: FAIL — `Cannot find module '../templates/scripts/build-ontology.mjs'`

- [ ] **Step 3: Write the implementation**

```js
#!/usr/bin/env node
// Ontology build tool. ontology.ttl is the source of truth; ontology.md is generated from it.
// Installed by the ontology kit — this file is identical in every repository, like
// check-ontology-terms.mjs.
//
// Usage:
//   node scripts/build-ontology.mjs           migrate (only if ontology.ttl does not exist yet),
//                                              then regenerate ontology.md if it is stale
//   node scripts/build-ontology.mjs --force    regenerate ontology.md unconditionally
//   node scripts/build-ontology.mjs --check    report staleness without writing (what CI runs)
//   node scripts/build-ontology.mjs --help

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { loadConfig } from "./ontology-config.mjs";
import {
  modelToTriples,
  parseOntologyMarkdown,
  parseTurtle,
  renderOntologyMarkdown,
  serializeTurtle,
  triplesToModel,
} from "./owl-ontology.mjs";

/** @param {string} ontologyPath */
export function ttlPathFor(ontologyPath) {
  return ontologyPath.replace(/\.md$/, ".ttl");
}

/**
 * @param {{ cwd?: string, check?: boolean, force?: boolean }} [options]
 * @returns {{ migrated: boolean, changed: boolean, mdPath: string, ttlPath: string, rendered?: string }}
 */
export function run(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const config = loadConfig({ cwd });
  const relativeTtlPath = ttlPathFor(config.ontologyPath);
  const mdPath = resolve(cwd, config.ontologyPath);
  const ttlPath = resolve(cwd, relativeTtlPath);

  let migrated = false;
  if (!existsSync(ttlPath)) {
    const model = parseOntologyMarkdown(readFileSync(mdPath, "utf8"));
    const triples = modelToTriples(model);
    writeFileSync(ttlPath, serializeTurtle(triples, { namespaceUri: config.namespaceUri }));
    migrated = true;
  }

  const triples = parseTurtle(readFileSync(ttlPath, "utf8"));
  const rendered = renderOntologyMarkdown(triplesToModel(triples));
  const existing = existsSync(mdPath) ? readFileSync(mdPath, "utf8") : null;
  const changed = existing !== rendered;

  if (!options.check && (changed || options.force)) {
    writeFileSync(mdPath, rendered);
  }

  return { migrated, changed, mdPath: config.ontologyPath, ttlPath: relativeTtlPath, rendered };
}

/** @param {string[]} argv */
export function parseCliArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  const check = argv.includes("--check");
  const force = argv.includes("--force");
  if (check && force) {
    throw new Error("--check and --force are contradictory — --check never writes, --force always writes");
  }
  const known = new Set(["--check", "--force", "--help", "-h"]);
  for (const arg of argv) {
    if (arg.startsWith("--") && !known.has(arg)) {
      throw new Error(`unknown argument "${arg}" — usage: build-ontology.mjs [--check | --force]`);
    }
  }
  return { check, force };
}

const HELP =
  "usage: node scripts/build-ontology.mjs [--check | --force]\n" +
  "\n" +
  "ontology.ttl is the source of truth; ontology.md is generated from it.\n" +
  "\n" +
  "  (no flags)  Migrate ontology.md into ontology.ttl if ontology.ttl does not exist yet, then\n" +
  "              regenerate ontology.md from ontology.ttl if it is out of date.\n" +
  "  --force     Regenerate ontology.md from ontology.ttl unconditionally.\n" +
  "  --check     Report whether ontology.md is stale relative to ontology.ttl, without writing.\n" +
  "              Exits 1 if stale, printing what the regenerated file would contain. This is what\n" +
  "              CI runs.\n" +
  "  --help      Print this message and exit 0.\n";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  try {
    const options = parseCliArgs(argv);
    if (options.help) {
      console.log(HELP);
    } else {
      const result = run(options);
      if (result.migrated) console.log(`ontology build: migrated ${result.mdPath} into ${result.ttlPath}`);
      if (options.check) {
        if (result.changed) {
          console.error(`ontology build: ${result.mdPath} is stale relative to ${result.ttlPath}\n`);
          console.error(result.rendered);
          process.exit(1);
        }
        console.log(`ontology build: ${result.mdPath} is up to date with ${result.ttlPath}`);
      } else if (result.changed || options.force) {
        console.log(`ontology build: regenerated ${result.mdPath} from ${result.ttlPath}`);
      } else {
        console.log(`ontology build: ${result.mdPath} already matches ${result.ttlPath}`);
      }
    }
  } catch (error) {
    console.error(`ontology build: ${error instanceof Error ? error.message : error}`);
    process.exit(2);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/build-ontology.test.mjs`
Expected: PASS — all tests green. (`config.namespaceUri` will be `undefined` until Task 7, which just means `@prefix : <undefined> .` in the `.ttl` these tests write — harmless for these tests since none of them inspect the raw `.ttl` prefix line. Task 7 fixes it for real use.)

- [ ] **Step 5: Commit**

```bash
git add templates/scripts/build-ontology.mjs tests/build-ontology.test.mjs
git commit -m "$(cat <<'EOF'
feat: add build-ontology.mjs CLI (migrate / render / --check / --force)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `ontology-config.mjs` — `namespaceUri`

**Files:**
- Modify: `templates/scripts/ontology-config.mjs`
- Modify: `tests/ontology-config.test.mjs`

**Interfaces:**
- Produces: `OntologyConfig` gains a `namespaceUri: string` field, always present after `validateConfig`/`loadConfig` (defaulted when the input omits it). Consumed by `build-ontology.mjs` (Task 6, already written against `config.namespaceUri`) and by the installer (Task 8).

- [ ] **Step 1: Write the failing tests**

```js
// append to tests/ontology-config.test.mjs
test("namespaceUri defaults to a generic placeholder when omitted", () => {
  const config = validateConfig(minimal, { ontologyExists: () => true });
  assert.equal(config.namespaceUri, "https://ontology.example/ontology#");
});

test("a supplied namespaceUri is trimmed and kept", () => {
  const config = validateConfig(
    { ...minimal, namespaceUri: "  https://ontology.example/widgets#  " },
    { ontologyExists: () => true },
  );
  assert.equal(config.namespaceUri, "https://ontology.example/widgets#");
});

test("an empty-string namespaceUri is rejected, not silently defaulted", () => {
  assert.throws(
    () => validateConfig({ ...minimal, namespaceUri: "   " }, { ontologyExists: () => true }),
    /namespaceUri must be a non-empty string/,
  );
});

test("a non-string namespaceUri is rejected", () => {
  assert.throws(
    () => validateConfig({ ...minimal, namespaceUri: 42 }, { ontologyExists: () => true }),
    /namespaceUri must be a non-empty string/,
  );
});
```

Also update the existing `"a minimal config is filled in with empty defaults"` test's expected object (it currently `assert.deepEqual`s the whole config, which will now fail because the real object also carries `namespaceUri`):

```js
test("a minimal config is filled in with empty defaults", () => {
  const config = validateConfig(minimal, { ontologyExists: () => true });
  assert.deepEqual(config, {
    ontologyPath: "docs/ontology.md",
    namespaceUri: "https://ontology.example/ontology#",
    sections: { required: [], optional: [] },
    allowlist: [],
    bannedAliases: [],
    ignorePaths: [],
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/ontology-config.test.mjs`
Expected: FAIL — the new `namespaceUri` assertions fail (`undefined` where a string is expected), and the updated `deepEqual` fails on the missing key.

- [ ] **Step 3: Write the implementation**

In `templates/scripts/ontology-config.mjs`, add `"namespaceUri"` to `KNOWN_KEYS`:

```js
const KNOWN_KEYS = new Set([
  "$schema",
  "ontologyPath",
  "namespaceUri",
  "sections",
  "allowlist",
  "bannedAliases",
  "ignorePaths",
]);
```

Add a default constant near the top of the file:

```js
const DEFAULT_NAMESPACE_URI = "https://ontology.example/ontology#";
```

In `validateConfig`, after the `ontologyPath` block, add:

```js
  let namespaceUri = DEFAULT_NAMESPACE_URI;
  if (input.namespaceUri !== undefined) {
    if (typeof input.namespaceUri !== "string" || !input.namespaceUri.trim()) {
      throw new Error(`${CONFIG_FILENAME}: namespaceUri must be a non-empty string`);
    }
    namespaceUri = input.namespaceUri.trim();
  }
```

And add `namespaceUri` to the returned object:

```js
  return {
    ontologyPath,
    namespaceUri,
    sections: {
      required: requireStringArray(sections.required, "sections.required"),
      optional: requireStringArray(sections.optional, "sections.optional"),
    },
    allowlist,
    bannedAliases,
    ignorePaths: requireStringArray(input.ignorePaths, "ignorePaths"),
  };
```

Also update the module-level `@typedef` comment for `OntologyConfig` to include `namespaceUri: string`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/ontology-config.test.mjs && node --test tests/build-ontology.test.mjs`
Expected: PASS for both files — `build-ontology.test.mjs` now gets a real `namespaceUri` value from `loadConfig` instead of `undefined`.

- [ ] **Step 5: Commit**

```bash
git add templates/scripts/ontology-config.mjs tests/ontology-config.test.mjs
git commit -m "$(cat <<'EOF'
feat: add namespaceUri to ontology.config.json

Optional, defaulted field giving each repository's OWL terms a base
IRI distinct from the kit's own kit: schema namespace.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Wire the new scripts and `namespaceUri` into the installer

**Files:**
- Modify: `bin/install-ontology.mjs`
- Modify: `templates/ontology.config.json`
- Modify: `tests/install-ontology.test.mjs`

**Interfaces:**
- Consumes: nothing new from other tasks (this task only touches the installer and its templates).
- Produces: `buildPlan()`'s core plan now includes `scripts/owl-ontology.mjs` and `scripts/build-ontology.mjs`; `install()`'s substitution `values` gains `NAMESPACE_URI`.

- [ ] **Step 1: Write the failing tests**

Update the existing test in `tests/install-ontology.test.mjs`:

```js
test("a core install writes the scripts, config, ontology and lint workflow", () => {
  const plan = buildPlan({});
  assert.deepEqual(plan.map((entry) => entry.dest).sort(), [
    ".github/workflows/ontology-lint.yml",
    "docs/ontology.md",
    "ontology.config.json",
    "scripts/build-ontology.mjs",
    "scripts/check-ontology-terms.mjs",
    "scripts/ontology-config.mjs",
    "scripts/owl-ontology.mjs",
  ]);
});
```

Add new tests:

```js
test("ontology.config.json gets a namespaceUri derived from the project name", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets Co" });
    const config = JSON.parse(readFileSync(join(repo.dir, "ontology.config.json"), "utf8"));
    assert.equal(config.namespaceUri, "https://ontology.example/widgets-co#");
  });
});

test("the newly installed owl-ontology.mjs and build-ontology.mjs are byte-identical to the kit's templates", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets" });
    for (const rel of ["scripts/owl-ontology.mjs", "scripts/build-ontology.mjs"]) {
      const templatePath = fileURLToPath(new URL(`../templates/${rel}`, import.meta.url));
      assert.equal(readFileSync(join(repo.dir, rel), "utf8"), readFileSync(templatePath, "utf8"));
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/install-ontology.test.mjs`
Expected: FAIL — the plan's dest list is missing the two new entries, and `ontology.config.json` has no `namespaceUri`.

- [ ] **Step 3: Write the implementation**

In `bin/install-ontology.mjs`, add the two new plan entries to `buildPlan`'s core `plan` array (alongside the other kit-owned scripts):

```js
  const plan = [
    { template: "scripts/ontology-config.mjs", dest: "scripts/ontology-config.mjs", substitute: false, ownedBy: "kit" },
    { template: "scripts/owl-ontology.mjs", dest: "scripts/owl-ontology.mjs", substitute: false, ownedBy: "kit" },
    { template: "scripts/build-ontology.mjs", dest: "scripts/build-ontology.mjs", substitute: false, ownedBy: "kit" },
    { template: "scripts/check-ontology-terms.mjs", dest: "scripts/check-ontology-terms.mjs", substitute: false, ownedBy: "kit" },
    { template: "ontology.config.json", dest: "ontology.config.json", substitute: true, ownedBy: "adopter" },
    { template: "docs/ontology.md", dest: ontologyPath, substitute: true, ownedBy: "adopter" },
    { template: "github/workflows/ontology-lint.yml", dest: ".github/workflows/ontology-lint.yml", substitute: true, ownedBy: "kit" },
  ];
```

Add a small slugify helper near the top of the file (below the existing `ENUM_TEST_TEMPLATES` constant), and compute `NAMESPACE_URI` in `install()`'s `values` object:

```js
// Turns a project name into the lowercase-hyphenated form usable as a URL fragment, for the
// default namespaceUri. Not the same shape as owl-ontology.mjs's slugify (which produces
// underscore-separated identifiers for Turtle local names) — this one is for a URL segment.
function slugifyForNamespace(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "ontology";
}
```

In `install()`, extend the `values` object:

```js
  const values = {
    PROJECT_NAME: options.projectName ?? basename(target),
    ONTOLOGY_PATH: ontologyPath,
    DEFAULT_BRANCH: options.defaultBranch ?? detectDefaultBranch(target),
  };
  values.NAMESPACE_URI = `https://ontology.example/${slugifyForNamespace(values.PROJECT_NAME)}#`;
```

Update `templates/ontology.config.json` to carry the new placeholder:

```json
{
  "ontologyPath": "{{ONTOLOGY_PATH}}",
  "namespaceUri": "{{NAMESPACE_URI}}",
  "sections": {
    "required": ["Entities", "Enums", "Relationships", "Business Rules & Invariants"],
    "optional": ["External Systems", "Subsystems", "Aggregate Roots", "Value Objects", "Domain Events", "Use Cases"]
  },
  "allowlist": [],
  "bannedAliases": [],
  "ignorePaths": []
}
```

Finally, update the printed post-install hint at the bottom of `bin/install-ontology.mjs`:

```js
      console.log("Next: run `node scripts/build-ontology.mjs` to create ontology.ttl, then fill it in.");
      console.log("The skills/ontology-setup skill can seed the ontology from this repository's own docs and code.");
```

(replacing the current `"Next: fill in the ontology, then run..."` / `"The skills/ontology-setup skill can seed..."` pair — keep the second line as-is, only the first line changes).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/install-ontology.test.mjs`
Expected: PASS — all tests green

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add bin/install-ontology.mjs templates/ontology.config.json tests/install-ontology.test.mjs
git commit -m "$(cat <<'EOF'
feat: install owl-ontology.mjs and build-ontology.mjs, set namespaceUri

A core install now writes the two new scripts alongside the existing
ones, and ontology.config.json gets a namespaceUri derived from the
project name.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: CI check, protocol text, and the `ontology-setup` skill

**Files:**
- Modify: `templates/github/workflows/ontology-lint.yml`
- Modify: `templates/protocol/ontology-protocol.md`
- Modify: `bin/install-ontology.mjs`
- Modify: `skills/ontology-setup/SKILL.md`
- Modify: `tests/install-ontology.test.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new consumed by later tasks — this is documentation/CI wiring, verified by existing test patterns.

- [ ] **Step 1: Write the failing test**

Add to `tests/install-ontology.test.mjs`:

```js
test("the lint workflow runs build-ontology.mjs --check before the term check", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets" });
    const workflow = readFileSync(join(repo.dir, ".github/workflows/ontology-lint.yml"), "utf8");
    const checkIndex = workflow.indexOf("build-ontology.mjs --check");
    const termIndex = workflow.indexOf("check-ontology-terms.mjs");
    assert.ok(checkIndex > -1, "missing build-ontology.mjs --check step");
    assert.ok(checkIndex < termIndex, "build-ontology.mjs --check must run before the term check");
  });
});

test("the spliced protocol section points at ontology.ttl as the editable source", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets" });
    const agents = readFileSync(join(repo.dir, "AGENTS.md"), "utf8");
    assert.match(agents, /docs\/ontology\.ttl/);
    assert.match(agents, /node scripts\/build-ontology\.mjs/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/install-ontology.test.mjs`
Expected: FAIL — neither the workflow nor the spliced protocol mention `build-ontology.mjs` yet.

- [ ] **Step 3: Update the CI workflow template**

`templates/github/workflows/ontology-lint.yml`:

```yaml
# Deterministic ontology term check. Installed by the ontology kit.
# Needs no secrets and no network access.
#
# This is the blocking half of the drift defence. The optional companion,
# ontology-drift-review.yml, is advisory.

name: Ontology term check

on:
  pull_request:
  push:
    branches: ["{{DEFAULT_BRANCH}}"]

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: node scripts/build-ontology.mjs --check
      - run: node scripts/check-ontology-terms.mjs
```

- [ ] **Step 4: Update the protocol template**

Replace `templates/protocol/ontology-protocol.md` in full:

```markdown
## Ontology protocol

The application ontology's source is `{{ONTOLOGY_TTL_PATH}}`. [`{{ONTOLOGY_PATH}}`]({{ONTOLOGY_PATH}})
is generated from it and must never be hand-edited — read it for reference, but make every change
in `{{ONTOLOGY_TTL_PATH}}` and run `node scripts/build-ontology.mjs` to regenerate
`{{ONTOLOGY_PATH}}`. It is the canonical source for all domain terminology. Code, specs and plan
documents must match the ontology — not the other way around.

### Before writing anything that touches domain concepts

1. Read `{{ONTOLOGY_PATH}}` in full.
2. Use the exact names defined there. Do not invent synonyms, abbreviations, or alternative
   spellings.
3. If a concept you need is not in the ontology, define it in `{{ONTOLOGY_TTL_PATH}}` first, run
   `node scripts/build-ontology.mjs`, then write the code.

### Before local validation and commit

1. Stage only the files intended for the proposed commit.
2. Review the staged file list and cached diff with `git diff --cached --name-only` and
   `git diff --cached` before validation.
3. Run `node scripts/build-ontology.mjs` after editing `{{ONTOLOGY_TTL_PATH}}`, so
   `{{ONTOLOGY_PATH}}` reflects it before you stage either file.
4. Run `node scripts/check-ontology-terms.mjs` after the intended files are staged and reviewed,
   but before creating the commit.
5. Stage newly created Markdown intended for the commit — the checker discovers Git-tracked
   Markdown with `git ls-files "*.md"` and does not see an untracked file.
6. Staging is not committing: files can still be corrected or unstaged before the commit is made.
7. Do not stage unrelated untracked or working files merely to expose them to validation.
8. CI remains the independent validation of the committed state.

### Checking text that is not a tracked file

A drafted pull-request body is Markdown that no tracked file contains, so the checker cannot see
it — and a bare backticked term sitting only in a PR description passes silently. Save the drafted
body to a scratch file and lint it explicitly:

```bash
node scripts/check-ontology-terms.mjs --also /path/to/drafted-body.md
```

### After completing any task that touches domain objects

1. Update `{{ONTOLOGY_TTL_PATH}}` — add, rename, or remove entities, value objects, events, enums,
   relationships, or invariants as needed.
2. Run `node scripts/build-ontology.mjs` to regenerate `{{ONTOLOGY_PATH}}` from it.
3. Include both files in the same commit as the code change.

### Enforcement

`scripts/build-ontology.mjs --check` and `scripts/check-ontology-terms.mjs` both run on every pull
request and every push to the default branch, via `.github/workflows/ontology-lint.yml`. The first
fails the build if `{{ONTOLOGY_PATH}}` does not match what `{{ONTOLOGY_TTL_PATH}}` would generate —
catching a forgotten `node scripts/build-ontology.mjs` before the second check even runs. The
second fails the build if any Markdown file uses a backticked PascalCase term not defined in the
ontology, or — where the ontology names External Systems — paraphrases one instead of naming it.

If the term check flags your term, there are exactly three correct responses:

1. Use the canonical name.
2. Add the concept to `{{ONTOLOGY_TTL_PATH}}` first, regenerate, then use it.
3. Only for a genuinely non-domain term — a framework type, an interface name, a config key — add
   it to `allowlist` in `ontology.config.json` **with a written reason**. An entry without a reason
   is rejected by the checker.

Reaching for option 3 by default is how this control decays. Prefer 1 and 2.
```

- [ ] **Step 5: Substitute the new placeholder**

In `bin/install-ontology.mjs`'s `install()`, add `ONTOLOGY_TTL_PATH` to the `values` object (next to
`ONTOLOGY_PATH`):

```js
  const values = {
    PROJECT_NAME: options.projectName ?? basename(target),
    ONTOLOGY_PATH: ontologyPath,
    ONTOLOGY_TTL_PATH: ontologyPath.replace(/\.md$/, ".ttl"),
    DEFAULT_BRANCH: options.defaultBranch ?? detectDefaultBranch(target),
  };
  values.NAMESPACE_URI = `https://ontology.example/${slugifyForNamespace(values.PROJECT_NAME)}#`;
```

- [ ] **Step 6: Update the `ontology-setup` skill**

In `skills/ontology-setup/SKILL.md`, replace **Step 1 — Install the mechanism**'s closing paragraph
and **Step 3 — Seed the real ontology** as follows.

Append to the end of Step 1 (after "that is a signal to read it and extend it, not to replace
it."):

```markdown
Then run `node scripts/build-ontology.mjs` once, to create `ontology.ttl` from whatever
`docs/ontology.md` is now on disk. From this point on, `ontology.ttl` is what you edit —
`docs/ontology.md` is generated from it and must never be hand-edited.
```

Replace Step 3's body:

```markdown
## Step 3 — Seed the real ontology

This is the substantial part. Read `references/seeding-an-ontology.md` before starting.

Draft the ontology directly in `ontology.ttl`, following the same section-by-section shape
`references/seeding-an-ontology.md` describes — it is written in terms of ontology *concepts*, not
Markdown syntax, so its guidance applies unchanged now that the file you edit is Turtle rather than
Markdown. Do not invent concepts to fill placeholder rows — remove what you cannot justify from the
repository's own material. After each round of edits, run `node scripts/build-ontology.mjs` to
regenerate `docs/ontology.md` and review it — that generated file remains the easiest surface to
read the whole ontology on, even though it is no longer what you edit.
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test tests/install-ontology.test.mjs`
Expected: PASS — all tests green

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add templates/github/workflows/ontology-lint.yml templates/protocol/ontology-protocol.md bin/install-ontology.mjs skills/ontology-setup/SKILL.md tests/install-ontology.test.mjs
git commit -m "$(cat <<'EOF'
feat: enforce and document ontology.ttl as the editable source

CI now runs build-ontology.mjs --check before the term check, the
spliced agent protocol tells agents to edit ontology.ttl (not
ontology.md), and the ontology-setup skill's seeding step targets
ontology.ttl.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Agent install runbook, README, and the Narrative recommendation

**Files:**
- Create: `docs/ai-agent-install.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing new — this task is documentation only, describing commands every prior task already implemented and tested.
- Produces: nothing consumed elsewhere; verified by manual review against the spec (no new test — there is no executable behaviour here beyond commands already covered by Tasks 6–9's tests).

- [ ] **Step 1: Write `docs/ai-agent-install.md`**

```markdown
# Installing the ontology kit as an AI agent

You were likely given this repository, or pointed at it, with a short prompt — "add the ontology
kit to this repo", "set up domain ontology tracking from ontology-kit". This file is the
minimal-interaction path through that request. Follow it in order; the two points where you must
stop and ask are called out explicitly. Everything else proceeds without a prompt back to the user.

## 1. Confirm the target

```bash
git -C <target-repo> rev-parse --is-inside-work-tree
```

If this fails, **stop and ask** — the installer refuses a non-git target, and there is no
reasonable default to fall back to.

## 2. Install the mechanism

```bash
node bin/install-ontology.mjs --target <target-repo> --dry-run
node bin/install-ontology.mjs --target <target-repo>
```

Add `--with-drift-review` only if the target repository already has a reachable OpenAI-compatible
model endpoint configured (see `docs/ontology-drift-review.md` after installing) — otherwise
core-only is the right default. Add `--with-enum-tests <language>` only if the user's prompt asked
for enum lock tests specifically.

If this step refuses because of an existing unmarked `## Ontology protocol` section in `AGENTS.md`
or `CLAUDE.md`, **stop and ask** how the user wants that resolved — removing or marking someone
else's hand-written section is not a call to make unprompted.

## 3. Create the initial ontology.ttl

```bash
cd <target-repo>
node scripts/build-ontology.mjs
```

This migrates whatever `docs/ontology.md` now exists (the kit's shipped example, since nothing has
been seeded yet) into `docs/ontology.ttl`, and regenerates `docs/ontology.md` from it.

## 4. Draft the real ontology

Edit `docs/ontology.ttl` directly — it is now the source; `docs/ontology.md` is generated from it
and must never be hand-edited again. Read `skills/ontology-setup/references/seeding-an-ontology.md`
for the method (where to look in the target repository, how to write a row, what "done" looks
like) — that guidance is about ontology *content*, not file format, and applies unchanged here.

If the target repository's domain concepts are genuinely ambiguous from its own code and docs —
not just effortful to work out, but actually indeterminate — **stop and ask**, rather than
inventing a domain model. Everything else about drafting proceeds on your own judgement.

After drafting, run `node scripts/build-ontology.mjs` again to regenerate `docs/ontology.md` from
the real content, and read the result — it is the easiest surface to review the whole ontology on.

## 5. Check and triage

```bash
node scripts/check-ontology-terms.mjs
```

Sort every violation into exactly two piles: real drift (fix the prose, or add the missing concept
to `ontology.ttl`), or a genuinely non-domain term (add it to `allowlist` in `ontology.config.json`
with a written reason — see `skills/ontology-setup/references/allowlist-discipline.md`). Repeat
until clean.

## 6. Commit

One commit containing the installed kit files, `docs/ontology.ttl`, the regenerated
`docs/ontology.md`, `ontology.config.json`, and the spliced protocol section.

## 7. Recommend Project Narrative

This kit's own repository also uses a second, complementary discipline: [Project
Narrative](https://github.com/jamiemitchellconsultants/Narrative), a deterministic, review-first
decision history recorded alongside the domain vocabulary. It is not part of this kit and this
step never installs it without being asked — **recommend it, then stop and ask**:

> This repository now tracks its domain vocabulary. Would you also like to track *decisions* —
> a reviewed history of what was decided and why, alongside the code? [Project
> Narrative](https://github.com/jamiemitchellconsultants/Narrative) does that; I can set it up the
> same way this repository (ontology-kit) uses it on itself, if you'd like.

Only on an explicit yes, scaffold it using this repository's own files as the pattern to replicate
in the target: `.project-narrative.json`, `narrative/preamble.md`, an initially-empty
`narrative/entries/`, `.github/workflows/maintain-narrative.yml`,
`.github/workflows/validate-narrative.yml`, and the `## Narrative Context` / `## Narrative
Decision` / `## Narrative Consequences` pull-request template headings plus the
`narrative-required` label convention this repository's own `AGENTS.md` documents. There is no
installer for this — copy and adapt this repository's own files by hand, the same way you would
read any other worked example.
```

- [ ] **Step 2: Update `README.md`**

Add a new section immediately after the intro paragraph and before "## Install into a repository"
(i.e. right after the `docs/how-it-works.md` link, line 8 of the current file):

```markdown
## Installing via an AI agent

If you were pointed at this repository with a short prompt — "add the ontology kit to this repo" —
follow [docs/ai-agent-install.md](docs/ai-agent-install.md) instead of the manual steps below. It
covers the same install-and-seed path end to end, written for minimal back-and-forth with the
person who gave you the prompt.
```

Add a new section after the existing "## Then seed it" section (before "## Upgrading an installed
repository"):

```markdown
## Then, consider Narrative

This repository — ontology-kit itself — also uses [Project
Narrative](https://github.com/jamiemitchellconsultants/Narrative): a deterministic, review-first
decision history, complementary to the vocabulary discipline this kit installs. It is a separate
tool, not part of this kit, and installing the ontology mechanism never sets it up on its own.

If you'd like it too, this repository's own files are the worked example to copy:
`.project-narrative.json`, `narrative/preamble.md`, `narrative/entries/`,
`.github/workflows/maintain-narrative.yml`, `.github/workflows/validate-narrative.yml`, and the
`## Narrative Context` / `## Narrative Decision` / `## Narrative Consequences` pull-request
template headings described in this repository's own `AGENTS.md`.
```

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: PASS — this task touched no code, so this just confirms nothing else broke.

- [ ] **Step 4: Commit**

```bash
git add docs/ai-agent-install.md README.md
git commit -m "$(cat <<'EOF'
docs: add agent install runbook and Narrative recommendation

docs/ai-agent-install.md is a minimal-interaction, agent-agnostic
path through installing and seeding the kit end to end, including a
firm but optional recommendation to also adopt Project Narrative.
README.md links to it and carries the same Narrative recommendation
for a human reader.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** TTL-as-source-of-truth + `.md` generation (Tasks 2–6), `--force`/`--check`
  semantics (Task 6), OWL vocabulary mapping table (Tasks 3–4), `namespaceUri` config (Task 7),
  installer/CI/protocol wiring (Tasks 8–9), `docs/ai-agent-install.md` + README link (Task 10),
  Narrative recommendation in both surfaces (Task 10). All spec sections have a task.
- **Refinement over the spec, not a scope change:** the spec's migrate step said the `.md` is "left
  untouched" immediately after migration; Task 6's `run()` always renders after migrating instead,
  so the freshly-created `.ttl` and the on-disk `.md` are certain to match immediately — otherwise
  the very next `--check` in CI would fail on a repository that just migrated and changed nothing
  else, which the spec did not intend. Noted here since it is a correction discovered while
  designing the exact CLI flow, not a re-litigation of anything the user decided.
- **`--check`'s "diff":** the spec says `--check` "prints a unified diff of what would change".
  Task 6 implements this as printing the full regenerated content on staleness, not a computed
  line-by-line unified diff (no diff library, and hand-writing one is unjustified scope for a CI
  log message) — sufficient for a human or CI log to see what's wrong, without a dependency or a
  hand-rolled diff algorithm.
- **Type consistency:** `Row`, `Invariant`, `OntologyModel`, and `Triple` shapes are defined once
  (Tasks 2 and 3) and used with the same field names in every later task. `config.namespaceUri`
  (Task 7) matches the property name Task 6's `build-ontology.mjs` already reads.
