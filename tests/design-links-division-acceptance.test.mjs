import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { openGraph } from "../templates/scripts/query-source-graph.mjs";
import { GRAPH_PREFIXES } from "../templates/scripts/source-graph-turtle.mjs";

const inputs = process.env.B23_SNAPSHOT;
const kit = GRAPH_PREFIXES.kit;
const field = (resource, predicate) => resource.first(predicate)?.object;
const evidenceRefs = (resource) => resource.values("kit:evidence").map(({ object }) => object);
const design = new Set([kit + "behaviour", kit + "decision"]);
const sourceCode = new Set([kit + "source-file", kit + "source-symbol"]);
const localName = (value) => value?.startsWith(kit) ? value.slice(kit.length) : value?.replace(/^kit:/, "");
const evidenceRole = (value) => localName(value)?.replace(/^role-/, "");

function codeRoutes(assertions, nodes, behaviourIri) {
  const routes = [];
  for (const edge of assertions.values()) {
    if (edge.object !== behaviourIri || edge.relationship !== kit + "implements") continue;
    const implementer = nodes.get(edge.subject);
    if (implementer.kind === kit + "source-symbol") {
      routes.push([edge.iri, implementer.iri, implementer.kind, implementer.label]);
    }
    if (implementer.kind !== kit + "component") continue;
    for (const containment of assertions.values()) {
      const target = nodes.get(containment.object);
      if (containment.subject === edge.subject && containment.relationship === kit + "contains" && sourceCode.has(target?.kind)) {
        routes.push([edge.iri, implementer.iri, containment.iri, target.iri, target.kind, target.label]);
      }
    }
  }
  return routes.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

test("B23: the pinned division snapshot preserves design records and traverses from a behaviour to code", {
  skip: inputs ? false : "requires B23_SNAPSHOT with a compatible division importer and pinned source graph",
}, async () => {
  const { importerCheckout, importerCommit, divisionRoot, catalogCommit, checkouts, sourceId, sourceCommit, behaviour } =
    JSON.parse(readFileSync(inputs, "utf8"));
  for (const commit of [importerCommit, catalogCommit, sourceCommit]) assert.match(commit, /^[a-f0-9]{40}$/);
  const git = (...args) => execFileSync("git", ["-C", importerCheckout, ...args], { encoding: "utf8" }).trim();
  assert.equal(git("rev-parse", "HEAD"), importerCommit, "run the pinned importer revision");
  assert.equal(git("status", "--porcelain"), "", "run a clean importer checkout");
  const { loadSnapshot } = await import(pathToFileURL(join(importerCheckout, "src/c4/snapshot.mjs")).href);
  const snapshot = loadSnapshot({ divisionRoot, catalogCommit, checkouts: new Map(Object.entries(checkouts)) });
  assert.equal(snapshot.id.catalogCommit, catalogCommit);
  const source = snapshot.sources.get(sourceId);
  assert.equal(source?.commit, sourceCommit, "use the intended source commit from the catalog");
  const imported = source.graphState;
  assert.equal(imported.status, "available");

  const { config, graph } = openGraph(checkouts[sourceId], sourceCommit);
  assert.deepEqual(graph.problems, []);
  const expand = (iri) => iri.startsWith(":") ? config.namespaceUri + iri.slice(1) : kit + iri.slice(4);
  const refs = (resource) => evidenceRefs(resource).map(expand).sort();
  const expectedNodes = new Map(graph.byType("kit:GraphNode").map((node) => {
    const iri = expand(node.iri);
    return [iri, { iri, kind: expand(field(node, "kit:kind")), label: field(node, "rdfs:label"), node }];
  }));
  const expectedDesign = [...expectedNodes.values()].filter((node) => design.has(node.kind));
  for (const kind of design) assert.ok(expectedDesign.some((node) => node.kind === kind), "fixture needs " + kind);
  const designIris = new Set(expectedDesign.map(({ iri }) => iri));
  assert.deepEqual([...imported.nodes.values()].filter(({ kind }) => design.has(kind)).map(({ iri }) => iri).sort(),
    [...designIris].sort(), "preserve exactly the design nodes from the catalog pin");
  const cited = new Set();
  for (const { iri, kind, label, node } of expectedDesign) {
    const actual = imported.nodes.get(iri);
    assert.equal(actual.kind, kind, iri);
    assert.equal(actual.label, label, iri);
    assert.equal(localName(actual.designStatus), localName(field(node, "kit:designStatus")), iri);
    assert.deepEqual([...actual.evidenceIris].sort(), refs(node), iri);
    refs(node).forEach((evidence) => cited.add(evidence));
  }

  const expectedAssertions = new Map(graph.byType("kit:GraphAssertion").map((assertion) => {
    const iri = expand(assertion.iri);
    return [iri, { iri, subject: expand(field(assertion, "kit:subject")), object: expand(field(assertion, "kit:object")),
      relationship: expand(field(assertion, "kit:relationship")), basis: localName(field(assertion, "kit:basis")),
      evidenceIris: refs(assertion) }];
  }));
  const designLink = ({ subject, object }) => designIris.has(subject) || designIris.has(object);
  const expectedLinks = [...expectedAssertions.values()].filter(designLink);
  assert.ok(expectedLinks.length, "fixture needs assertions incident on design nodes");
  const actualLinks = [...imported.assertions.values()].filter(designLink)
    .map(({ iri, subject, object, relationship, basis, evidenceIris }) => ({
      iri, subject, object, relationship, basis: localName(basis), evidenceIris: [...evidenceIris].sort(),
    }));
  const byIri = (left, right) => left.iri.localeCompare(right.iri);
  assert.deepEqual(actualLinks.sort(byIri), expectedLinks.sort(byIri));
  expectedLinks.flatMap(({ evidenceIris }) => evidenceIris).forEach((iri) => cited.add(iri));
  for (const expected of graph.byType("kit:GraphEvidence").filter((item) => cited.has(expand(item.iri)))) {
    const iri = expand(expected.iri);
    const actual = imported.evidence.get(iri);
    assert.ok(actual, "missing imported evidence " + iri);
    assert.deepEqual({
      iri: actual.iri, role: evidenceRole(actual.role), path: actual.path,
      blobId: actual.blobId, startLine: actual.startLine, endLine: actual.endLine,
    }, {
      iri, role: evidenceRole(field(expected, "kit:role")), path: field(expected, "kit:path"),
      blobId: field(expected, "kit:blobId"), startLine: field(expected, "kit:startLine"), endLine: field(expected, "kit:endLine"),
    });
  }

  const start = expectedDesign.find(({ kind, label }) => kind === kit + "behaviour" && label.startsWith(behaviour + " "));
  assert.ok(start, "supply a declared behaviour reference");
  const expectedRoutes = codeRoutes(expectedAssertions, expectedNodes, start.iri);
  assert.ok(expectedRoutes.length, "fixture needs a behaviour-to-code path");
  assert.deepEqual(codeRoutes(imported.assertions, imported.nodes, start.iri), expectedRoutes);
});
