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
