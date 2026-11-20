import assert from "node:assert/strict";
import { test } from "node:test";
import { createEmbeddingAdapter } from "../templates/scripts/semantic-index-embed.mjs";

const profile = { endpoint: "https://owner.test/v1/embeddings", model: "pilot", dimensions: 2, documentPrefix: "doc: ", queryPrefix: "query: " };

test("B14 sends only the approved model and purpose, then reorders response indexes", async () => {
  const inputs = [];
  const adapter = createEmbeddingAdapter(profile, { token: "test-token", fetchImpl: async (url, options) => {
    assert.equal(String(url), profile.endpoint);
    assert.equal(options.redirect, "error");
    assert.equal(new Headers(options.headers).get("authorization"), "Bearer test-token");
    const body = JSON.parse(options.body);
    assert.equal(body.model, "pilot");
    inputs.push(body.input);
    const data = body.input.map((_, index) => ({ index, embedding: index === 0 ? [3, 0] : [0, -4] })).reverse();
    return Response.json({ data });
  } });
  assert.deepEqual((await adapter.embedSource(["one", "two"])).map((vector) => [...vector]), [[1, 0], [0, -1]]);
  assert.deepEqual([...await adapter.embedQuery("where?")], [1, 0]);
  assert.deepEqual(inputs, [["doc: one", "doc: two"], ["query: where?"]]);
});

test("B12 and B16 reject duplicate indexes and suppress service response bodies", async () => {
  let count = 0;
  const adapter = createEmbeddingAdapter(profile, { fetchImpl: async () => {
    count += 1;
    if (count === 1) return Response.json({ data: [{ index: 0, embedding: [1, 0] }, { index: 0, embedding: [0, 1] }] });
    return new Response("sensitive source text", { status: 502 });
  } });
  await assert.rejects(adapter.embedSource(["one", "two"]), /invalid embedding response/);
  await assert.rejects(adapter.embedQuery("query"), (error) => /502/.test(error.message) && !error.message.includes("sensitive"));
  assert.equal(count, 2);
});

test("B12 rejects missing, malformed, out-of-range, and unusable Float32 vectors", async () => {
  for (const data of [[], [{ index: 1, embedding: [1, 0] }], ...[
    [0, 0], [1e-60, 0], [1e40, 0], ["1", 0], [1], [0, null],
  ].map((embedding) => [{ index: 0, embedding }])]) {
    const adapter = createEmbeddingAdapter(profile, { fetchImpl: async () => Response.json({ data }) });
    await assert.rejects(adapter.embedQuery("x"), /invalid embedding response/);
  }
});

test("B14 bounds requests and rejects a later failed batch without returning partial vectors", async () => {
  const counts = [];
  const adapter = createEmbeddingAdapter(profile, { fetchImpl: async (_url, { body, headers, signal }) => {
    assert.equal(new Headers(headers).has("authorization"), false);
    assert.ok(signal instanceof AbortSignal);
    const { input } = JSON.parse(body);
    counts.push(input.length);
    if (counts.length === 2) throw new DOMException("secret", "AbortError");
    return Response.json({ data: input.map((_, index) => ({ index, embedding: [1, 0] })) });
  } });
  assert.deepEqual(await adapter.embedSource([]), []);
  await assert.rejects(adapter.embedSource(Array(17).fill("a")), (error) => !error.message.includes("secret"));
  assert.deepEqual(counts, [16, 1]);
  await assert.rejects(adapter.embedQuery("x".repeat(64 * 1024)), /request limit/);
  assert.deepEqual(counts, [16, 1]);
});

test("B12 caps provider response bytes before decoding", async () => {
  const adapter = createEmbeddingAdapter(profile, { fetchImpl: async () => new Response("x".repeat(8 * 1024 * 1024 + 1)) });
  await assert.rejects(adapter.embedQuery("x"), /invalid embedding response/);
});
