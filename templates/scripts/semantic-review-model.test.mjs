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

// The reply below is the verbatim content the live gateway returned for the JEPA-Speech trial
// (JEPA-Speech#208): fenced JSON, and singular "Enum:" evidence keys although the ontology section is "Enums".
const LIVE_REPLY = "```json\n" + JSON.stringify({ findings: [
  { quote: "pending, running, done and failed", evidenceKey: "Enum:SessionRemovalState",
    reason: "The file uses informal state names that conflict with the enum's defined values Requested, Removing, Removed, and Failed.",
    suggestion: "Requested, Removing, Removed and Failed" },
  { quote: "tester left, test run, bad take or miscellaneous", evidenceKey: "Enum:RemovalReason",
    reason: "The file uses informal reason labels that conflict with the enum's defined values TesterWithdrew, TestRecording, BadRecording, and Other.",
    suggestion: "tester withdrew, test recording, bad recording or other" },
] }, null, 2) + "\n```";

const ENUM_ONTOLOGY = ["## Enums", "", "| Name | Values |", "| --- | --- |",
  "| `SessionRemovalState` | `Requested`, `Removing`, `Removed`, `Failed` |",
  "| `RemovalReason` | `TesterWithdrew`, `TestRecording`, `BadRecording`, `Other` |", ""].join("\n");
const ENUM_FILE = "Removal states are pending, running, done and failed.\nReasons are tester left, test run, bad take or miscellaneous.\n";

const liveOptions = (reply, extra = {}) => ({ files: [{ path: "docs/removal.md", text: ENUM_FILE }],
  ontologyText: ENUM_ONTOLOGY, sections: { required: ["Enums"], optional: [] }, model: "ontology-review",
  baseUrl: "https://model.example/v1", auth: createModelAuth({ env: { K: "k" }, staticKeyVar: "K" }),
  headSha: "a".repeat(40), fetchImpl: async () => completion(reply), ...extra });

test("the live fenced reply with singular section keys is accepted and grounded to the catalog keys", async () => {
  const result = await reviewFiles(liveOptions(LIVE_REPLY));
  assert.deepEqual(result.reviewed, ["docs/removal.md"]);
  assert.deepEqual(result.unreviewed, []);
  assert.deepEqual(result.findings.map((item) => item.evidenceKey),
    ["Enums:SessionRemovalState", "Enums:RemovalReason"]);
  assert.equal(result.findings[0].quote, "pending, running, done and failed");
});

test("the same findings are accepted unfenced and with other fence shapes", async () => {
  const bare = LIVE_REPLY.replace(/^```json\n/, "").replace(/\n```$/, "");
  const variants = [bare, "```\n" + bare + "\n```", "```JSON\n" + bare + "\n```", "  \n```json\n" + bare + "\n```\n  ",
    "```json" + bare + "```"];
  for (const reply of variants) {
    const result = await reviewFiles(liveOptions(reply));
    assert.equal(result.findings.length, 2, JSON.stringify(reply.slice(0, 20)));
  }
});

test("exact catalog keys, wrong-section keys with a unique name and singular or plural prefixes resolve", async () => {
  const reply = (key) => JSON.stringify({ findings: [{ quote: "pending, running, done and failed", evidenceKey: key,
    reason: "r", suggestion: "s" }] });
  for (const key of ["Enums:SessionRemovalState", "Enum:SessionRemovalState", "enums:SessionRemovalState",
    "Entities:SessionRemovalState", "SessionRemovalState"]) {
    const result = await reviewFiles(liveOptions(reply(key)));
    assert.equal(result.findings[0]?.evidenceKey, "Enums:SessionRemovalState", key);
  }
});

test("each unusable reply gets its own fixed reason and no model content", async () => {
  const leak = "SECRET-MODEL-TEXT";
  const reasons = async (reply) => (await reviewFiles(liveOptions(reply))).unreviewed[0].reason;
  const finding = (patch) => JSON.stringify({ findings: [{ quote: "pending, running, done and failed",
    evidenceKey: "Enums:SessionRemovalState", reason: "r", suggestion: "s", ...patch }] });
  const cases = [
    ["", /model reply was empty/],
    ["   \n", /model reply was empty/],
    ["```json\n```", /model reply was empty/],
    [`not json ${leak}`, /model reply was not valid JSON/],
    [`\`\`\`json\n{"findings": [${leak}\n\`\`\``, /model reply was not valid JSON/],
    [JSON.stringify({ result: leak }), /model reply had no findings list/],
    [finding({ reason: "" }), /model finding was incomplete/],
    [finding({ quote: `${leak} not in file` }), /finding quote not found in the file/],
    [finding({ evidenceKey: "Enums:NoSuchName" }), /finding cites an unknown evidence key/],
  ];
  for (const [reply, pattern] of cases) {
    const reason = await reasons(reply);
    assert.match(reason, pattern, reply.slice(0, 30));
    assert.doesNotMatch(reason, new RegExp(leak));
  }
});

test("a name present in two sections is ambiguous unless the prefix picks one", async () => {
  const ontologyText = ["## Entities", "", "| Name | Description |", "| --- | --- |", "| `Session` | a session |", "",
    "## Enums", "", "| Name | Values |", "| --- | --- |", "| `Session` | `A`, `B` |", ""].join("\n");
  const reply = (key) => JSON.stringify({ findings: [{ quote: "pending, running, done and failed", evidenceKey: key,
    reason: "r", suggestion: "s" }] });
  const run = (key) => reviewFiles({ ...liveOptions(reply(key)), ontologyText,
    sections: { required: ["Entities", "Enums"], optional: [] } });
  assert.match((await run("Session")).unreviewed[0].reason, /finding cites an ambiguous evidence key/);
  assert.match((await run("Thing:Session")).unreviewed[0].reason, /finding cites an ambiguous evidence key/);
  assert.equal((await run("Enum:Session")).findings[0].evidenceKey, "Enums:Session");
  assert.equal((await run("Entities:Session")).findings[0].evidenceKey, "Entities:Session");
});

test("several rows under one evidence key are one candidate, not an ambiguity", async () => {
  const ontologyText = ["## Relationships", "", "| From | Relationship | To |", "| --- | --- | --- |",
    "| `Analysis` | reads | `Session` |", "| `Analysis` | writes | `Report` |", ""].join("\n");
  const reply = (key) => JSON.stringify({ findings: [{ quote: "pending, running, done and failed", evidenceKey: key,
    reason: "r", suggestion: "s" }] });
  const run = (key) => reviewFiles({ ...liveOptions(reply(key)), ontologyText,
    sections: { required: ["Relationships"], optional: [] } });
  for (const key of ["Analysis", "Relationship:Analysis", "Thing:Analysis"]) {
    const result = await run(key);
    assert.deepEqual(result.unreviewed, [], key);
    assert.equal(result.findings[0]?.evidenceKey, "Relationships:Analysis", key);
  }
});

test("the system prompt lists the exact evidence keys and the request budget counts them", async () => {
  let system;
  await reviewFiles(liveOptions(LIVE_REPLY, { fetchImpl: async (_url, request) => {
    system = JSON.parse(request.body).messages[0].content;
    return completion(LIVE_REPLY);
  } }));
  assert.match(system, /Enums:SessionRemovalState/);
  assert.match(system, /Enums:RemovalReason/);
  const catalog = catalogOntology(ENUM_ONTOLOGY, { required: ["Enums"], optional: [] });
  assert.ok(catalog.projection.includes("Enums:RemovalReason"), "keys are part of the projection the budget counts");
});

test("catalog rows keep each entry's source line by evidence key", () => {
  const value = catalogOntology("## Entities\n\n| Name | Description |\n| --- | --- |\n| `Invoice` | canonical bill |\n\n## Business Rules & Invariants\n\n- **`Invoice`** — must have an owner\n  before it is approved.\n",
    { required: ["Entities", "Business Rules & Invariants"], optional: [] });
  assert.equal(value.rows.get("Entities:Invoice"), "| `Invoice` | canonical bill |");
  assert.equal(value.rows.get("Business Rules & Invariants:Invoice"), "- **`Invoice`** — must have an owner\n  before it is approved.");
});
