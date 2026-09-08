// Ships with the reviewer. Runs in the adopting repository's blocking preparation job, and in the
// ontology kit's own suite. Depends on nothing but the script beside it — no repository fixtures.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildBatches,
  extractAddedLines,
  projectOntology,
  renderChunk,
} from "./review-ontology-drift.mjs";

const SECTIONS = {
  required: ["Entities", "Enums", "Business Rules & Invariants"],
  optional: ["External Systems"],
};

function ontology({ entities = "| `Invoice` | An invoice. |", extra = "" } = {}) {
  return [
    "# Ontology",
    "orientation prose",
    "",
    "## Entities",
    "linking prose",
    "| Name | Description |",
    "|------|-------------|",
    entities,
    "",
    "## Enums",
    "| `InvoiceStatus` | `Approved`, `Paid` |",
    "",
    "## Business Rules & Invariants",
    "- **`Invoice`** — must be approved before payment.",
    "ordinary explanation",
    extra,
    "",
    "## Not A Canonical Section",
    "| ignored | row |",
  ].join("\n");
}

test("projects every required section and drops orientation prose", () => {
  const projection = projectOntology(ontology(), SECTIONS);
  for (const section of SECTIONS.required) assert.match(projection, new RegExp(`## ${section}`));
  assert.match(projection, /Invoice/);
  assert.doesNotMatch(projection, /orientation prose|linking prose|ordinary explanation/);
  assert.doesNotMatch(projection, /Not A Canonical Section/);
  assert.doesNotMatch(projection, /\|------\|/);
});

test("an absent optional section is not an error", () => {
  const projection = projectOntology(ontology(), SECTIONS);
  assert.doesNotMatch(projection, /External Systems/);
});

test("a present optional section is projected", () => {
  const withExternal = `${ontology()}\n\n## External Systems\n| \`Vendor\` | The vendor. |`;
  assert.match(projectOntology(withExternal, SECTIONS), /## External Systems/);
});

test("a missing required section fails clearly", () => {
  const withoutEnums = ontology().replace("## Enums\n| `InvoiceStatus` | `Approved`, `Paid` |\n\n", "");
  assert.throws(() => projectOntology(withoutEnums, SECTIONS), /missing required ontology section: Enums/);
});

test("a duplicated required section fails clearly", () => {
  const duplicated = `${ontology()}\n\n## Entities\n| \`Other\` | Another. |`;
  assert.throws(() => projectOntology(duplicated, SECTIONS), /duplicate ontology section: Entities/);
});

test("a required section containing only prose fails clearly", () => {
  const empty = ontology({ entities: "" }).replace("| Name | Description |", "just prose");
  assert.throws(() => projectOntology(empty, SECTIONS), /empty ontology section: Entities/);
});

test("a required section containing only a table header fails clearly", () => {
  const headerOnly = ontology({ entities: "" });
  assert.throws(() => projectOntology(headerOnly, SECTIONS), /empty ontology section: Entities/);
});

test("an empty required-plus-optional section list fails clearly rather than projecting no content", () => {
  // Regression guard: a config with sections omitted, or with a typo'd key that validateConfig now
  // rejects but an older config might still carry, resolves to {required: [], optional: []}. That
  // used to project as "# Canonical ontology projection" with nothing else — a projection the
  // reviewer would run against on every pull request, finding nothing, forever. An empty section
  // list is never a meaningful configuration for this consumer.
  assert.throws(
    () => projectOntology(ontology(), { required: [], optional: [] }),
    /sections\.required and sections\.optional are both empty/,
  );
});

test("extracts only attributed added lines from a zero-context diff", () => {
  const diff = [
    "diff --git a/x.md b/x.md",
    "--- a/x.md",
    "+++ b/x.md",
    "@@ -3,2 +3,3 @@",
    "-removed",
    "+first addition",
    "+|---|---|",
    "+second addition",
    "@@ -20 +21 @@",
    "+later addition",
  ].join("\n");
  assert.deepEqual(extractAddedLines(diff), [
    { line: 3, text: "first addition" },
    { line: 5, text: "second addition" },
    { line: 21, text: "later addition" },
  ]);
});

test("batches against the complete prompt budget and splits oversized file additions", () => {
  const files = [{
    file: "large.md",
    lines: Array.from({ length: 30 }, (_, index) => ({ line: index + 1, text: "x".repeat(120) })),
  }];
  const batches = buildBatches(files, "# ontology\n| A | B |", 3_600);
  assert.ok(batches.length > 1);
  assert.deepEqual(batches.flat().flatMap((chunk) => chunk.lines), files[0].lines);
  assert.ok(batches.every((batch) => batch.every((chunk) => renderChunk(chunk).length < 3_600)));
});

test("a budget too small to leave room for any diff is an error, not an infinite split", () => {
  assert.throws(() => buildBatches([], "x".repeat(5_000), 5_100), /leave no useful diff budget/);
});

import {
  HttpError,
  modelJson,
  requireEnv,
  reviewBatch,
  reviewResilient,
} from "./review-ontology-drift.mjs";

test("recursively splits a token-limited request without losing lines", async () => {
  const batch = [{
    file: "a.md",
    lines: Array.from({ length: 4 }, (_, index) => ({ line: index + 1, text: `line ${index + 1}` })),
  }];
  const reviewed = [];
  const answers = await reviewResilient(batch, async (candidate) => {
    const lines = candidate.flatMap((chunk) => chunk.lines.map((line) => line.line));
    if (lines.length > 1) throw new HttpError(413, "tokens_limit_reached", "too large");
    reviewed.push(lines);
    return "NO_DRIFT";
  });
  assert.deepEqual(reviewed, [[1], [2], [3], [4]]);
  assert.deepEqual(answers, ["NO_DRIFT", "NO_DRIFT", "NO_DRIFT", "NO_DRIFT"]);
});

test("a 413 on a single line is a hard error, not an infinite split", async () => {
  const batch = [{ file: "a.md", lines: [{ line: 1, text: "text" }] }];
  await assert.rejects(
    reviewResilient(batch, async () => {
      throw new HttpError(413, "tokens_limit_reached", "too large");
    }),
    /token limit persists for one added line in a\.md/,
  );
});

test("a non-413 error is not retried", async () => {
  const batch = [{ file: "a.md", lines: [{ line: 1, text: "text" }] }];
  let attempts = 0;
  await assert.rejects(
    reviewResilient(batch, async () => {
      attempts++;
      throw new HttpError(500, "failure", "server error");
    }),
    /server error/,
  );
  assert.equal(attempts, 1);
});

test("requireEnv names the missing variable", () => {
  delete process.env.ONTOLOGY_LLM_BASE_URL;
  assert.throws(() => requireEnv("ONTOLOGY_LLM_BASE_URL"), /ONTOLOGY_LLM_BASE_URL is required/);
});

test("modelJson authenticates with ONTOLOGY_LLM_API_KEY, never GITHUB_TOKEN", async () => {
  process.env.ONTOLOGY_LLM_API_KEY = "model-key";
  process.env.GITHUB_TOKEN = "github-token";
  try {
    let seenAuth;
    const fakeFetch = async (_url, init) => {
      seenAuth = init.headers.Authorization;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    await modelJson("http://endpoint/chat/completions", { method: "POST" }, fakeFetch);
    assert.equal(seenAuth, "Bearer model-key");
  } finally {
    delete process.env.ONTOLOGY_LLM_API_KEY;
    delete process.env.GITHUB_TOKEN;
  }
});

test("modelJson throws a typed HttpError carrying status and body", async () => {
  const fakeFetch = async () => new Response("tokens_limit_reached", { status: 413 });
  await assert.rejects(
    modelJson("http://endpoint/chat/completions", { method: "POST" }, fakeFetch),
    (error) => error instanceof HttpError && error.status === 413,
  );
});

test("modelJson aborts a hanging request instead of waiting indefinitely", async () => {
  const hangingFetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")));
    });
  await assert.rejects(
    modelJson("http://endpoint/chat/completions", { method: "POST" }, hangingFetch, 10),
    /aborted/i,
  );
});

test("reviewBatch posts the configured model to <baseUrl>/chat/completions", async () => {
  let seenUrl;
  let seenBody;
  const fakeFetch = async (url, init) => {
    seenUrl = url;
    seenBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: "NO_DRIFT" } }] }), { status: 200 });
  };
  const batch = [{ file: "a.md", lines: [{ line: 1, text: "text" }] }];
  const answer = await reviewBatch("http://endpoint/v1", "some-model", "# ontology", batch, fakeFetch);
  assert.equal(seenUrl, "http://endpoint/v1/chat/completions");
  assert.equal(seenBody.model, "some-model");
  assert.equal(seenBody.max_tokens, 8192);
  assert.equal(answer, "NO_DRIFT");
});

test("reviewBatch sends no sampling parameters, so the endpoint's own defaults win", async () => {
  // Regression guard. Sampling belongs where the model is configured, not in CI: a value sent
  // from here silently overrides the endpoint's tuned defaults for that model.
  let seenBody;
  const fakeFetch = async (_url, init) => {
    seenBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: "NO_DRIFT" } }] }), { status: 200 });
  };
  await reviewBatch("http://endpoint/v1", "some-model", "# ontology",
    [{ file: "a.md", lines: [{ line: 1, text: "text" }] }], fakeFetch);
  for (const key of ["temperature", "top_p", "top_k", "presence_penalty", "frequency_penalty"]) {
    assert.equal(key in seenBody, false, `reviewBatch must not send ${key}`);
  }
});

test("reviewBatch rejects an empty completion rather than reporting no drift", async () => {
  const fakeFetch = async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: "  " } }] }), { status: 200 });
  await assert.rejects(
    reviewBatch("http://endpoint/v1", "some-model", "# ontology",
      [{ file: "a.md", lines: [{ line: 1, text: "text" }] }], fakeFetch),
    /empty response from model/,
  );
});
