import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const wf = (name) => readFileSync(fileURLToPath(new URL(`../templates/github/workflows/ontology-graph-naming-${name}.yml`, import.meta.url)), "utf8");
const count = (text, needle) => text.split(needle).length - 1;

test("B31: the trigger runs on every pull request with no secret, checkout or path filter", () => {
  const text = wf("request");
  assert.match(text, /^name: Ontology graph naming request$/m);
  assert.match(text, /pull_request:\n\s+types: \[opened, synchronize, reopened, ready_for_review\]/);
  assert.match(text, /permissions:\n\s+contents: read/);
  for (const absent of [/paths:/, /secrets\./, /actions\/checkout/, /pull_request_target/]) assert.doesNotMatch(text, absent);
});

test("B32: the worker runs default-branch code for identify, review and finalize, with the semantic environment for review only", () => {
  const text = wf("review");
  assert.match(text, /workflow_run:\n\s+workflows: \[Ontology graph naming request\]\n\s+types: \[completed\]/);
  assert.equal(count(text, "ref: ${{ github.event.repository.default_branch }}"), 3);
  assert.equal(count(text, "persist-credentials: false"), 3);
  for (const mode of ["identify", "review", "finalize"]) assert.match(text, new RegExp(`run: node scripts/graph-naming-worker\\.mjs ${mode}$`, "m"));
  assert.equal(count(text, "name: ontology-semantic-review"), 1);
  assert.equal(count(text, "group: ontology-graph-naming-${{ matrix.number }}"), 2);
  assert.match(text, /permissions:\n\s+contents: read\n\s+pull-requests: read\n\s+outputs:/);
  assert.equal(count(text, "contents: read\n      pull-requests: write\n      issues: write\n      statuses: write"), 2);
  assert.match(text, /if: always\(\) && needs\.identify\.result == 'success' && needs\.identify\.outputs\.all_count != '0'/);
  for (const line of ["ONTOLOGY_SEMANTIC_LLM_API_KEY: ${{ secrets.ONTOLOGY_SEMANTIC_LLM_API_KEY }}", "ONTOLOGY_OIDC_TOKEN_URL: ${{ vars.ONTOLOGY_OIDC_TOKEN_URL }}",
    "ONTOLOGY_OIDC_CLIENT_ID: ${{ vars.ONTOLOGY_OIDC_CLIENT_ID }}", "ONTOLOGY_OIDC_CLIENT_SECRET: ${{ secrets.KEYCLOAK_CLIENT_SECRET }}",
    "ONTOLOGY_MAX_REQUEST_CHARS: ${{ vars.ONTOLOGY_MAX_REQUEST_CHARS }}", "ONTOLOGY_MODEL_TIMEOUT_MS: ${{ vars.ONTOLOGY_MODEL_TIMEOUT_MS }}"]) {
    assert.equal(count(text, line), 1, line);
  }
});

test("B42: the settlement handler holds no model secret and uses no environment", () => {
  const text = wf("settle");
  assert.match(text, /issue_comment:\n\s+types: \[created, edited, deleted\]/);
  assert.match(text, /if: github\.event\.issue\.pull_request != null/);
  assert.match(text, /group: ontology-graph-naming-\$\{\{ github\.event\.issue\.number \}\}/);
  assert.match(text, /contents: read\n\s+pull-requests: write\n\s+issues: write\n\s+statuses: write/);
  assert.match(text, /run: node scripts\/graph-naming-worker\.mjs settle$/m);
  assert.match(text, /persist-credentials: false/);
  for (const absent of [/secrets\./, /environment:/, /vars\./]) assert.doesNotMatch(text, absent);
});
