import { test } from "node:test";
import assert from "node:assert/strict";
import { createModelAuth } from "./llm-auth.mjs";
import { catalogOntology, chunkFiles, reviewFiles, REQUEST_OVERHEAD } from "./semantic-review-model.mjs";

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

test("catalog retains full invariant text and stable invariant evidence", () => {
  const source = "## Business Rules & Invariants\n\n- **`Invoice`** — must have an owner\n  before it is approved.\n";
  const value = catalogOntology(source, { required: ["Business Rules & Invariants"], optional: [] });
  assert.ok(value.evidenceKeys.has("Business Rules & Invariants:Invoice"));
  assert.match(value.projection, /before it is approved/);
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
  const result = chunkFiles([{ path: "docs/a.md", text }, { path: "docs/empty.md", text: "" }], catalog, 1300);
  assert.equal(result.chunks.map((item) => item.text).filter(Boolean).join(""), text);
  assert.ok(result.chunks.some((item) => item.path === "docs/empty.md" && item.text === ""));
  for (const item of result.chunks) {
    assert.ok(item.text.length + item.path.length + catalog.projection.length + REQUEST_OVERHEAD <= 1300);
  }
});

test("an oversized ontology is unavailable rather than a clean review", () => {
  const catalog = { projection: "x".repeat(5000), evidenceKeys: new Set() };
  const result = chunkFiles([{ path: "docs/a.md", text: "text" }], catalog, 1000);
  assert.equal(result.chunks.length, 0);
  assert.deepEqual(result.unreviewed.map((item) => item.path), ["docs/a.md"]);
});

const completion = (content) => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) });
const options = (files, fetchImpl) => ({ files, ontologyText: ontology, sections, model: "test-model",
  baseUrl: "https://model.example/v1", auth: createModelAuth({ env: { K: "test-key" }, staticKeyVar: "K" }), headSha: "a".repeat(40), fetchImpl });

test("a grounded finding has a stable ID and a correction", async () => {
  const fetchImpl = async (url, request) => {
    assert.equal(url, "https://model.example/v1/chat/completions");
    assert.equal(request.headers.Authorization, "Bearer test-key");
    assert.doesNotMatch(request.body, /GITHUB_TOKEN/);
    assert.equal(JSON.parse(request.body).model, "test-model");
    return completion(JSON.stringify({ findings: [{ quote: "wrong term", evidenceKey: "Entities:Invoice",
      reason: "conflicts with Invoice", suggestion: "use Invoice" }] }));
  };
  const input = options([{ path: "docs/a.md", text: "wrong term" }], fetchImpl);
  const first = await reviewFiles(input);
  const second = await reviewFiles(input);
  assert.equal(first.findings.length, 1);
  assert.equal(first.findings[0].id, second.findings[0].id);
  assert.equal(first.findings[0].path, "docs/a.md");
  assert.deepEqual(first.reviewed, ["docs/a.md"]);
  assert.deepEqual(first.unreviewed, []);
});

test("clean response reviews a file and duplicate findings collapse", async () => {
  const clean = await reviewFiles(options([{ path: "docs/a.md", text: "canonical" }],
    async () => completion('{"findings":[]}')));
  assert.deepEqual(clean, { reviewed: ["docs/a.md"], unreviewed: [], findings: [] });
  const finding = { quote: "wrong term", evidenceKey: "Entities:Invoice", reason: "wrong", suggestion: "use Invoice" };
  const duplicate = await reviewFiles(options([{ path: "docs/a.md", text: "wrong term" }],
    async () => completion(JSON.stringify({ findings: [finding, finding] }))));
  assert.equal(duplicate.findings.length, 1);
});

test("a fabricated quote or evidence, malformed JSON, and empty completion are unreviewed", async () => {
  const invalid = [
    { findings: [{ quote: "made up", evidenceKey: "Entities:Invoice", reason: "wrong", suggestion: "change" }] },
    { findings: [{ quote: "actual text", evidenceKey: "Entities:Fake", reason: "wrong", suggestion: "change" }] },
    "not JSON", "",
  ];
  for (const value of invalid) {
    const content = typeof value === "string" ? value : JSON.stringify(value);
    const result = await reviewFiles(options([{ path: "docs/a.md", text: "actual text" }], async () => completion(content)));
    assert.deepEqual(result.findings, []);
    assert.deepEqual(result.unreviewed.map((item) => item.path), ["docs/a.md"]);
  }
});

test("413 splits a large chunk, while a minimum chunk stays unreviewed", async () => {
  let calls = 0;
  const split = await reviewFiles(options([{ path: "docs/a.md", text: "a".repeat(200) }], async (_url, request) => {
    calls++;
    const body = JSON.parse(request.body);
    const source = body.messages[1].content;
    return source.length > 200 ? { ok: false, status: 413 } : completion('{"findings":[]}');
  }));
  assert.ok(calls > 1);
  assert.deepEqual(split.reviewed, ["docs/a.md"]);
  const minimum = await reviewFiles(options([{ path: "docs/a.md", text: "x" }],
    async () => ({ ok: false, status: 413 })));
  assert.deepEqual(minimum.unreviewed.map((item) => item.path), ["docs/a.md"]);
});

test("a failed file does not clear another file's finding", async () => {
  const result = await reviewFiles(options([
    { path: "docs/a.md", text: "wrong term" }, { path: "docs/b.md", text: "other text" },
  ], async (_url, request) => {
    const source = JSON.parse(request.body).messages[1].content;
    if (source.includes("other text")) return { ok: false, status: 503 };
    return completion(JSON.stringify({ findings: [{ quote: "wrong term", evidenceKey: "Entities:Invoice",
      reason: "wrong", suggestion: "use Invoice" }] }));
  }));
  assert.equal(result.findings.length, 1);
  assert.deepEqual(result.reviewed, ["docs/a.md"]);
  assert.deepEqual(result.unreviewed.map((item) => item.path), ["docs/b.md"]);
});

test("timeout marks only the affected file unreviewed", async () => {
  const result = await reviewFiles({ ...options([{ path: "docs/a.md", text: "text" }],
    (_url, request) => new Promise((_resolve, reject) => request.signal.addEventListener("abort", () => reject(new Error("aborted"))))),
    timeoutMs: 5 });
  assert.deepEqual(result.unreviewed.map((item) => item.path), ["docs/a.md"]);
});

const OIDC_ENV = { ONTOLOGY_OIDC_TOKEN_URL: "https://kc.example/token", ONTOLOGY_OIDC_CLIENT_ID: "cid",
  ONTOLOGY_OIDC_CLIENT_SECRET: "s3cr3t-value" };

test("an OIDC bearer is used and a 401 is retried once with a fresh token", async () => {
  let issued = 0;
  const auth = createModelAuth({ env: OIDC_ENV, staticKeyVar: "K",
    fetchImpl: async () => Response.json({ access_token: `tok${++issued}`, expires_in: 300 }) });
  const seen = [];
  const fetchImpl = async (_url, request) => {
    seen.push(request.headers.Authorization);
    return seen.length === 1 ? { ok: false, status: 401 } : completion(JSON.stringify({ findings: [] }));
  };
  const result = await reviewFiles({ ...options([{ path: "docs/a.md", text: "text" }], fetchImpl), auth });
  assert.deepEqual(seen, ["Bearer tok1", "Bearer tok2"]);
  assert.deepEqual(result.reviewed, ["docs/a.md"]);
});

test("a token failure leaves the file unreviewed with a fixed reason and no secret text", async () => {
  const auth = createModelAuth({ env: OIDC_ENV, staticKeyVar: "K",
    fetchImpl: async () => new Response("LEAK-BODY", { status: 500 }) });
  const result = await reviewFiles({ ...options([{ path: "docs/a.md", text: "text" }],
    async () => { throw new Error("must not call"); }), auth });
  assert.deepEqual(result.reviewed, []);
  const text = JSON.stringify(result);
  assert.match(text, /model credential could not be obtained/);
  assert.doesNotMatch(text, /LEAK-BODY|s3cr3t-value/);
});

test("a 60,000-character ontology is reviewed with the default budget", async () => {
  const rows = Array.from({ length: 600 }, (_, i) =>
    `| \`Entity${i}\` | A canonical entity number ${i} with a long description of its role. |`);
  const big = ["## Entities", "", "| Name | Description |", "| --- | --- |", ...rows, ""].join("\n");
  const sizes = [];
  const fetchImpl = async (_url, request) => {
    sizes.push(request.body.length);
    return completion(JSON.stringify({ findings: [] }));
  };
  const result = await reviewFiles({ ...options([{ path: "docs/a.md", text: "plain prose" }], fetchImpl),
    ontologyText: big });
  assert.deepEqual(result.reviewed, ["docs/a.md"]);
  assert.ok(sizes.length >= 1 && sizes.every((size) => size <= 200_000));
});

test("a budget the projection cannot fit makes no request and codes the file too-large", async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return completion("{}"); };
  const result = await reviewFiles({ ...options([{ path: "docs/a.md", text: "prose" }], fetchImpl),
    maxRequestChars: 1_005 });
  assert.equal(called, false);
  assert.deepEqual(result.reviewed, []);
  assert.equal(result.unreviewed[0].code, "too-large");
  assert.match(result.unreviewed[0].reason, /ontology too large for the configured budget/);
});

test("a persistent 413 on the smallest chunk is coded too-large", async () => {
  const result = await reviewFiles(options([{ path: "docs/a.md", text: "x" }],
    async () => ({ ok: false, status: 413 })));
  assert.equal(result.unreviewed[0].code, "too-large");
  assert.match(result.unreviewed[0].reason, /ontology too large/);
});

test("other failures carry no too-large code", async () => {
  const result = await reviewFiles(options([{ path: "docs/a.md", text: "x" }],
    async () => ({ ok: false, status: 500 })));
  assert.equal(result.unreviewed[0].code, undefined);
  assert.match(result.unreviewed[0].reason, /HTTP 500/);
});

test("the configured timeout aborts a hung request", async () => {
  const hang = (_url, request) => new Promise((_resolve, reject) => {
    // AbortSignal timers do not keep the event loop alive on Node 20 and 22, so hold a ref'd timer.
    const keepAlive = setTimeout(() => {}, 60_000);
    request.signal.addEventListener("abort", () => {
      clearTimeout(keepAlive);
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    });
  });
  const result = await reviewFiles({ ...options([{ path: "docs/a.md", text: "prose" }], hang), timeoutMs: 20 });
  assert.match(result.unreviewed[0].reason, /timed out/);
  assert.equal(result.unreviewed[0].code, undefined);
});
