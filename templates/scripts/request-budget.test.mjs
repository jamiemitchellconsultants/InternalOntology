// Ships with the model reviewers. Depends on nothing but the script beside it.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_REQUEST_CHARS,
  MODEL_TIMEOUT_MS,
  readPositiveInteger,
  resolveRequestBudget,
} from "./request-budget.mjs";

test("the defaults are 200,000 characters and 300,000 ms", () => {
  assert.equal(MAX_REQUEST_CHARS, 200_000);
  assert.equal(MODEL_TIMEOUT_MS, 300_000);
  assert.deepEqual(resolveRequestBudget({}), { maxRequestChars: 200_000, modelTimeoutMs: 300_000 });
});

test("unset, empty and whitespace settings fall back to the defaults", () => {
  for (const value of [undefined, "", "   "]) {
    assert.deepEqual(
      resolveRequestBudget({ ONTOLOGY_MAX_REQUEST_CHARS: value, ONTOLOGY_MODEL_TIMEOUT_MS: value }),
      { maxRequestChars: 200_000, modelTimeoutMs: 300_000 },
    );
  }
});

test("valid settings override the defaults", () => {
  assert.deepEqual(
    resolveRequestBudget({ ONTOLOGY_MAX_REQUEST_CHARS: " 500000 ", ONTOLOGY_MODEL_TIMEOUT_MS: "900000" }),
    { maxRequestChars: 500_000, modelTimeoutMs: 900_000 },
  );
  assert.equal(readPositiveInteger({ X: "7" }, "X", 1), 7);
});

test("junk settings are rejected naming the variable and the value", () => {
  for (const junk of ["abc", "0", "-5", "1.5", "2e5", "200_000", "1000 chars", "9007199254740993"]) {
    assert.throws(() => resolveRequestBudget({ ONTOLOGY_MAX_REQUEST_CHARS: junk }),
      (error) => error.message.includes("ONTOLOGY_MAX_REQUEST_CHARS") && error.message.includes(junk), junk);
    assert.throws(() => resolveRequestBudget({ ONTOLOGY_MODEL_TIMEOUT_MS: junk }),
      (error) => error.message.includes("ONTOLOGY_MODEL_TIMEOUT_MS"), junk);
  }
});
