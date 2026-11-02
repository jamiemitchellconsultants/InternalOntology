import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderSchema } from "../templates/scripts/source-graph-model.mjs";

const template = (rel) => readFileSync(fileURLToPath(new URL(`../templates/${rel}`, import.meta.url)), "utf8");

test("the shipped schema file equals the generated one", () => {
  assert.equal(template("source-graph/graph-schema.ttl"), renderSchema());
});
