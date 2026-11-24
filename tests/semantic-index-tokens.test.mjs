import assert from "node:assert/strict";
import { test } from "node:test";
import { estimateTokens, fitToCap } from "../templates/scripts/semantic-index-tokens.mjs";

test("B2 estimates code points divided by four, rounded up", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("abcde"), 2);
  assert.equal(estimateTokens("😀😀😀😀"), 1);
  assert.equal(estimateTokens("x".repeat(16_000)), 4000);
});

test("B2 the same text always gives the same estimate", () => {
  const text = JSON.stringify({ path: "src/a.txt", startLine: 1, endLine: 9 });
  assert.equal(estimateTokens(text), estimateTokens(String(text)));
});

test("B8 fitToCap keeps the largest leading count that fits", () => {
  const render = (n) => "x".repeat(n * 10);
  assert.equal(fitToCap(10, render, 100), 10);
  assert.equal(fitToCap(10, render, 5), 2);
  assert.equal(fitToCap(10, render, 0), 0);
  assert.equal(fitToCap(0, render, 5), 0);
});

test("B10 fitToCap returns zero when the fixed part alone exceeds the cap", () => {
  assert.equal(fitToCap(3, (n) => "y".repeat(40 + n), 5), 0);
});
