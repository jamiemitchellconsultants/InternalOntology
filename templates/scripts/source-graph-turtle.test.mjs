import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGraphTurtle, formatGraphTurtle, canonicalProblems, GraphTurtleError } from "./source-graph-turtle.mjs";

const NS = "https://ontology.example/widgets#";
const head = `@prefix : <${NS}> .\n@prefix kit: <https://ontology-kit.dev/schema#> .\n` +
  `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n`;
const canonical = `${head}\n:node-a a kit:GraphNode ;\n    kit:kind kit:concept ;\n` +
  `    rdfs:label "Say \\"hi\\"\\nthere" .\n\n:node-b a kit:GraphNode ;\n    kit:kind kit:test ;\n` +
  `    rdfs:label "B" .\n`;

test("a canonical document parses, formats back byte for byte and has no problems", () => {
  const parsed = parseGraphTurtle(canonical, "g.ttl");
  assert.equal(parsed.namespace, NS);
  assert.equal(parsed.blocks[0].pairs.find((p) => p.predicate === "rdfs:label").object, 'Say "hi"\nthere');
  assert.equal(formatGraphTurtle(parsed), canonical);
  assert.deepEqual(canonicalProblems(canonical), []);
});

test("integers and iris keep their types", () => {
  const text = `${head}\n:evidence-a a kit:GraphEvidence ;\n    kit:endLine 12 ;\n    kit:role kit:role-test .\n`;
  const [block] = parseGraphTurtle(text).blocks;
  assert.deepEqual(block.pairs.map((p) => [p.predicate, p.objectType]),
    [["kit:endLine", "integer"], ["kit:role", "iri"]]);
});

test("each construct outside the subset is rejected with its line number", () => {
  const body = (line) => `${head}\n:n a kit:GraphNode ;\n    ${line}\n    rdfs:label "x" .\n`;
  const cases = [
    ["kit:kind [ a kit:concept ] ;", "blank node"],
    ["kit:kind kit:concept , kit:test ;", "multi-object"],
    ["kit:kind ( kit:concept ) ;", "collection"],
    ["kit:kind << :a :b :c >> ;", "RDF-star"],
    ['rdfs:comment """long""" ;', "multiline"],
    ["kit:kind other:thing ;", "unknown prefix"],
    ['rdfs:comment "bad\\t" ;', "escape"],
  ];
  for (const [line, label] of cases) {
    assert.throws(() => parseGraphTurtle(body(line), "g.ttl"),
      (error) => error instanceof GraphTurtleError && error.line === 6, label);
  }
  assert.throws(() => parseGraphTurtle(`@base <x> .\n${head}`, "g.ttl"), GraphTurtleError);
});

test("order, spacing and line-ending departures are reported as noncanonical", () => {
  const swapped = canonical.replace(":node-a", ":zz").replace(":node-b", ":node-a").replace(":zz", ":node-b");
  assert.equal(canonicalProblems(swapped).length, 1);
  const predicatesSwapped = `${head}\n:node-b a kit:GraphNode ;\n    rdfs:label "B" ;\n    kit:kind kit:test .\n`;
  assert.equal(canonicalProblems(predicatesSwapped).length, 1);
  assert.equal(canonicalProblems(canonical.replace("\n\n:node-b", "\n:node-b")).length, 1);
  assert.equal(canonicalProblems(canonical + "\n").length, 1);
  assert.equal(canonicalProblems(canonical.replace(/\n/g, "\r\n"))[0].rule, "line endings must be LF");
});

test("the formatter sorts what the caller hands it", () => {
  const out = formatGraphTurtle({ namespace: NS, blocks: [
    { subject: ":z", type: "kit:GraphNode", line: 0, pairs: [
      { predicate: "rdfs:label", object: "Z", objectType: "string" },
      { predicate: "kit:kind", object: "kit:test", objectType: "iri" }] },
    { subject: ":a", type: "kit:GraphNode", line: 0, pairs: [
      { predicate: "kit:kind", object: "kit:test", objectType: "iri" },
      { predicate: "rdfs:label", object: "A", objectType: "string" }] },
  ] });
  assert.ok(out.indexOf(":a a") < out.indexOf(":z a"));
  assert.ok(out.indexOf("kit:kind") < out.indexOf("rdfs:label"));
  assert.deepEqual(canonicalProblems(out), []);
});
