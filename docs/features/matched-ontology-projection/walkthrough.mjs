#!/usr/bin/env node
// Walkthrough driver for feature #135 acceptance. Runs an INSTALLED semantic reviewer (any repository's
// scripts/ directory) over local Markdown files against a local stand-in for the model, then prints what
// each request carried and the pull request record. Nothing here calls a real model or GitHub.
//
//   node docs/features/matched-ontology-projection/walkthrough.mjs --repo <installed repo> [options] <file.md>...
//
//   --projection matched|full   semanticReview.projection to run with (default: the repository's config)
//   --budget <n>                ONTOLOGY_MAX_REQUEST_CHARS
//   --ontology <path>           Markdown ontology path relative to the installed repo
//   --finding "<quote>=><Section:Name>"  the stand-in reports this finding for any chunk containing the quote
//   --reject-whole              the stand-in answers 413 to any request carrying a whole file of several lines
//   --rows                      print every row each request carried, not just the evidence keys
//   --head <sha>                the pull request head revision, which finding identities hash (default: forty "a"s)
//   --finding=<quote>=>...      use the = form when the quote starts with "-"
//   --dismiss                   send a maintainer dismissal for the first finding
//   --json                      print the observed requests and outcomes as JSON

import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import assert from "node:assert/strict";

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  repo: { type: "string" }, projection: { type: "string" }, budget: { type: "string" }, ontology: { type: "string" },
  finding: { type: "string", multiple: true, default: [] }, "reject-whole": { type: "boolean" }, rows: { type: "boolean" },
  head: { type: "string", default: "a".repeat(40) }, dismiss: { type: "boolean" }, json: { type: "boolean" },
} });
if (!values.repo || positionals.length === 0) {
  console.error("usage: walkthrough.mjs --repo <installed repo> [options] <file.md>...");
  process.exit(2);
}
const repo = resolve(values.repo);
const load = (name) => import(pathToFileURL(join(repo, "scripts", name)).href);
const [{ runSemanticReview }, { catalogOntology }, { createProjector }, { createModelAuth }, { validateConfig },
  { collectReviewInput }, { handleDismissal }] = await Promise.all([
  load("semantic-review-worker.mjs"), load("semantic-review-model.mjs"), load("ontology-projection.mjs"),
  load("llm-auth.mjs"), load("ontology-config.mjs"), load("semantic-review-github.mjs"), load("semantic-review-dismissal.mjs")]);

const raw = JSON.parse(readFileSync(join(repo, "ontology.config.json"), "utf8"));
const parsed = validateConfig({ ...raw, ...(values.ontology ? { ontologyPath: values.ontology } : {}),
  semanticReview: { enabled: true, model: "stand-in", baseUrl: "http://127.0.0.1:1/v1",
  ...(values.projection ? { projection: values.projection } : raw.semanticReview?.projection !== undefined ? { projection: raw.semanticReview.projection } : {}) } },
{ ontologyExists: () => true });
const findings = values.finding.map((spec) => {
  const at = spec.lastIndexOf("=>");
  assert.ok(at > 0 && at + 2 < spec.length, "use --finding '<quote>=><Section:Name>'");
  return { quote: spec.slice(0, at), evidenceKey: spec.slice(at + 2) };
});
const files = positionals.map((path) => ({ path: relative(repo, resolve(path)).startsWith("..") ? path : relative(repo, resolve(path)),
  text: readFileSync(path, "utf8") }));

const comments = [];
const statuses = [];
const ontologyReads = [];
const head = values.head;
const pull = { number: 1, head: { sha: head }, merge_commit_sha: "b".repeat(40), changed_files: files.length };
const client = {
  get: async (path) => {
    if (path === "/pulls/1") return pull;
    if (path === "/collaborators/maintainer/permission") return { role_name: "maintain" };
    const blob = /^\/git\/blobs\/(\d+)$/.exec(path);
    assert.ok(blob && files[Number(blob[1])], path);
    return { encoding: "base64", content: Buffer.from(files[Number(blob[1])].text).toString("base64") };
  },
  getContentText: async (path, ref) => {
    assert.equal(ref, head);
    ontologyReads.push(path);
    try {
      return readFileSync(join(repo, path), "utf8");
    } catch (error) {
      if (error.code === "ENOENT") throw Object.assign(error, { status: 404 });
      throw error;
    }
  },
  getAll: async (path) => {
    if (path === "/pulls/1/files?per_page=100") return files.map((file, index) => ({
      filename: file.path, status: "modified", sha: String(index),
    }));
    assert.equal(path, "/issues/1/comments?per_page=100");
    return comments;
  },
  post: async (path, body) => {
    if (path.endsWith("/comments")) {
      const comment = { id: comments.length + 1, body: body.body, user: { login: "github-actions[bot]" }, html_url: "local" };
      comments.push(comment);
      return comment;
    }
    statuses.push(body);
    return {};
  },
};
const input = await collectReviewInput(client, pull, parsed);
const catalog = catalogOntology(input.ontologyText, parsed.sections);
const project = createProjector({ mode: parsed.semanticReview.projection, bannedAliases: parsed.bannedAliases ?? [] });
ontologyReads.length = 0;

const requests = [];
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    const messages = JSON.parse(body).messages;
    const userText = messages[1].content;
    const path = /^File: (.*)$/m.exec(userText)[1];
    const offset = Number(/^Offset: (\d+)$/m.exec(userText)[1]);
    const text = userText.slice(userText.indexOf("\nText:\n") + 7);
    const sent = messages[0].content.slice(messages[0].content.indexOf("# Canonical ontology evidence"));
    const expected = project(catalog, text);
    const whole = files.find((file) => file.path === path)?.text === text && text.includes("\n");
    const rejected = Boolean(values["reject-whole"] && whole);
    const found = rejected ? [] : findings.filter((item) => text.includes(item.quote)).map((item) => ({ ...item, reason: "walkthrough", suggestion: "walkthrough" }));
    requests.push({ path, offset, chars: text.length, projectionChars: sent.length, keys: expected.keys, reproduced: expected.text === sent,
      digest: createHash("sha256").update(body).digest("hex"),
      index: sent.split("\n## Evidence keys\n")[1].trim().split("\n"),
      rows: sent.split("\n").filter((line) => line.startsWith("| `") || line.startsWith("- **")), rejected, found: found.map((item) => item.evidenceKey) });
    if (rejected) { res.statusCode = 413; res.end(); return; }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ findings: found }) } }] }));
  });
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));

const config = { ...parsed, semanticReview: { ...parsed.semanticReview, baseUrl: `http://127.0.0.1:${server.address().port}/v1` } };
let run;
try {
  run = await runSemanticReview({ client, pull, config, auth: createModelAuth({ env: { K: "k" }, staticKeyVar: "K" }),
    env: values.budget ? { ONTOLOGY_MAX_REQUEST_CHARS: values.budget } : {},
    deps: { isEligiblePull: async () => true, triggerRunId: "1:1" } });
} finally {
  server.close();
}

const record = (comments.at(-1)?.body ?? "").split("\n").filter((line) => !line.startsWith("<!--")).join("\n");
const beforeDismissal = statuses.at(-1);
if (values.dismiss) {
  assert.ok(run.findings[0], "--dismiss needs a finding");
  const comment = { user: { login: "maintainer" },
    body: `/ontology-dismiss ${run.findings[0].id} ${head} Acceptance walkthrough.` };
  comments.push(comment);
  const result = await handleDismissal({ client, event: { action: "created", issue: { number: 1, pull_request: {} }, comment } });
  assert.equal(result.handled, true);
}
assert.ok(requests.every(({ reproduced }) => reproduced), "request projection differs from projection of its own text");
if (values.json) {
  console.log(JSON.stringify({ ontologyReads, entries: catalog.evidenceKeys.size, fullChars: catalog.projection.length,
    mode: project.mode, requests, run, beforeDismissal, status: statuses.at(-1), record }, null, 2));
} else {
  console.log(`ontology: ${catalog.evidenceKeys.size} entries, full projection ${catalog.projection.length} characters`);
  console.log(`projection mode: ${project.mode}`);
  console.log(`ontology reads at ${head}: ${ontologyReads.join(", ")}`);
  requests.forEach((request, index) => {
    console.log(`request ${index + 1}: ${request.path} offset ${request.offset}, ${request.chars} characters of Markdown, ` +
      `projection ${request.projectionChars} characters${request.rejected ? ", answered 413" : ""}${request.reproduced ? "" : ", NOT REPRODUCED"}`);
    console.log(`  entries with full rows (${request.keys.length}): ${request.keys.join(", ") || "none"}`);
    if (values.rows) {
      for (const row of request.rows) console.log(`    ${row}`);
      console.log(`  evidence index: ${request.index.join(" / ")}`);
    }
    for (const key of request.found) console.log(`  finding cites ${key}: ${request.keys.includes(key) ? "sent with full rows" : "sent by name only"}`);
  });
  console.log(`outcome: ${run.outcome}`);
  console.log(`findings: ${run.findings.map((item) => `${item.evidenceKey} (${JSON.stringify(item.quote)}) id ${item.id.slice(0, 12)}`).join("; ") || "none"}`);
  console.log(`status: ${statuses.at(-1)?.state} - ${statuses.at(-1)?.description}`);
  console.log("record:");
  console.log(record.split("\n").map((line) => `  ${line}`).join("\n"));
}
