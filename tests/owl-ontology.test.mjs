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
    { subject: ":Widget", predicate: "kit:invariant", object: "must have a non-empty id.", objectType: "literal" },
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
