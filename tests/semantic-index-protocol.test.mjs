import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { estimateTokens } from "../templates/scripts/semantic-index-tokens.mjs";

const text = readFileSync(new URL("../templates/protocol/semantic-index-protocol.md", import.meta.url), "utf8");
// Estimate of the protocol before feature #178 (2,352 characters).
const PREVIOUS_TOKENS = 588;

const rules = {
  "applies only when installed and enabled": [/`scripts\/semantic-index\.mjs` exists/, /`semanticIndex\.enabled` is true/],
  "when to use and when to skip": [/do not know the file, symbol or subsystem/, /skip it when the task names one/],
  "ontology first": [/Read the ontology first and use its terms/],
  "status and refresh check": [/`status --json`/, /`missing`, `stale`, `incompatible` or `unreadable`/, /`refresh --json` once/, /sends approved source/],
  "one focused query": [/one focused question/, /read the first relevant result before searching again/],
  "failure handling": [/report the error and use exact search/, /Do not retry in a loop/, /writer\.lock/, /PID and hostname/],
  "results are leads": [/leads, not evidence/, /never the score alone/],
  "read cited lines at the cited commit": [/`show --path <path> --lines <start>-<end> --json`/, /`git show <commit>:<path>`/],
  "dirty notice": [/dirty notice/, /read the working tree before changing them/],
  "empty result": [/not proof that nothing exists/, /confirm with exact search/],
  "ontology conflict": [/use the ontology term and name the conflict/],
  "prohibitions": [/`upload` or `download`/, /endpoints, tokens or model settings/, /widen `semanticIndex\.scope`/, /only a maintainer changes settings/],
  "graph first": [/`sourceGraph` is enabled/, /`node scripts\/query-source-graph\.mjs search <term>`/, /unknown, excluded or empty/],
};

test("B13 the shortened protocol keeps every rule an agent needs", () => {
  for (const [rule, patterns] of Object.entries(rules)) {
    for (const pattern of patterns) assert.match(text, pattern, rule);
  }
});

test("B13 and B14 the protocol costs fewer estimated tokens than before", () => {
  assert.ok(estimateTokens(text) < PREVIOUS_TOKENS, `estimate ${estimateTokens(text)} is not below ${PREVIOUS_TOKENS}`);
});

test("B15 the graph-first rule is conditional on the graph being enabled and installed", () => {
  assert.match(text, /If `sourceGraph` is enabled and `scripts\/query-source-graph\.mjs` exists, ask the graph first/);
  assert.match(text, /search the index only when the reader reports/);
});
