// Feature #135, B25 and ADR 0029: the semantic reviewer reads ontology.ttl and renders it exactly as
// build-ontology.mjs writes ontology.md, so evidence keys, rows and the full projection are unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";

import { ttlPathFor } from "../templates/scripts/owl-ontology.mjs";
import { ttlPathFor as reexported } from "../templates/scripts/build-ontology.mjs";

test("ttlPathFor lives in owl-ontology.mjs, and build-ontology.mjs re-exports the same function", () => {
  assert.equal(reexported, ttlPathFor);
  assert.equal(ttlPathFor("docs/ontology.md"), "docs/ontology.ttl");
  assert.equal(ttlPathFor("docs/ontology.markdown"), "docs/ontology.markdown");
});
