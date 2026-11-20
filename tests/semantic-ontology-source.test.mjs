// Feature #135, B25 and ADR 0029: the semantic reviewer reads ontology.ttl and renders it exactly as
// build-ontology.mjs writes ontology.md, so evidence keys, rows and the full projection are unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { run } from "../templates/scripts/build-ontology.mjs";
import { modelToTriples, renderOntologyMarkdown, serializeTurtle, ttlPathFor } from "../templates/scripts/owl-ontology.mjs";
import { ttlPathFor as reexported } from "../templates/scripts/build-ontology.mjs";
import { collectReviewInput, createGitHubClient } from "../templates/scripts/semantic-review-github.mjs";
import { createProjector } from "../templates/scripts/ontology-projection.mjs";
import { catalogOntology, REQUEST_OVERHEAD } from "../templates/scripts/semantic-review-model.mjs";
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
  getContentText: async (path) => readFileSync(join(dir, path), "utf8"),
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
