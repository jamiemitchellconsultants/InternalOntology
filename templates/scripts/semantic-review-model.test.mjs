import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogOntology, chunkFiles, REQUEST_OVERHEAD } from "./semantic-review-model.mjs";

const ontology = "# Ontology\n\n## Entities\n\n| Name | Description |\n| --- | --- |\n| `Invoice` | canonical bill |\n";
const sections = { required: ["Entities"], optional: [] };

test("catalog contains the canonical row as evidence", () => {
  const catalog = catalogOntology(ontology, sections);
  assert.ok(catalog.evidenceKeys.has("Entities:Invoice"));
  assert.match(catalog.projection, /canonical bill/);
});

test("catalog keeps optional canonical sections but rejects missing required ones", () => {
  assert.throws(() => catalogOntology(ontology, { required: ["Enums"], optional: ["Entities"] }), /missing required ontology section: Enums/);
  const value = catalogOntology(ontology, { required: ["Entities"], optional: ["Enums"] });
  assert.match(value.projection, /## Entities/);
  assert.doesNotMatch(value.projection, /## Enums/);
});

test("chunks cover all text, including an unchanged line and one oversized line", () => {
  const content = `first paragraph\n\n${"x".repeat(5000)}\nunchanged tail\n`;
  const catalog = catalogOntology(ontology, sections);
  const result = chunkFiles([{ path: "docs/a.md", text: content }], catalog, 2000);
  const chunks = result.chunks.filter((item) => item.path === "docs/a.md");
  assert.ok(chunks.length > 1);
  assert.equal(chunks.map((item) => item.text).join(""), content);
  assert.equal(chunks[0].offset, 0);
  for (const item of chunks) assert.equal(content.slice(item.offset, item.offset + item.text.length), item.text);
  assert.deepEqual(result.unreviewed, []);
});

test("paragraph boundaries, empty files, and full request budget are honored", () => {
  const catalog = catalogOntology(ontology, sections);
  const text = "first paragraph\n\nsecond paragraph\n\nthird paragraph\n";
  const result = chunkFiles([{ path: "docs/a.md", text }, { path: "docs/empty.md", text: "" }], catalog, 800);
  assert.equal(result.chunks.map((item) => item.text).filter(Boolean).join(""), text);
  assert.ok(result.chunks.some((item) => item.path === "docs/empty.md" && item.text === ""));
  for (const item of result.chunks) {
    assert.ok(item.text.length + item.path.length + catalog.projection.length + REQUEST_OVERHEAD <= 800);
  }
});

test("an oversized ontology is unavailable rather than a clean review", () => {
  const catalog = { projection: "x".repeat(5000), evidenceKeys: new Set() };
  const result = chunkFiles([{ path: "docs/a.md", text: "text" }], catalog, 1000);
  assert.equal(result.chunks.length, 0);
  assert.deepEqual(result.unreviewed.map((item) => item.path), ["docs/a.md"]);
});
