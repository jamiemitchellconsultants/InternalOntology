#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { listIndexEntries } from "../templates/scripts/semantic-index-source.mjs";
import { lineCount, treeFromRevision } from "../templates/scripts/source-graph-git.mjs";

const TOP = 5;
const FILE_BYTES = 8 * 1024 * 1024;
const keywordMethod = "distinct case-insensitive query word matches, then ordinal path and line";

function sameLocation(a, b) {
  return a.commit === b.commit && a.path === b.path && a.startLine <= b.endLine && b.startLine <= a.endLine;
}

export function measurePilot({ commit, questions, locate }) {
  if (!Array.isArray(questions) || !questions.length) throw new Error("The pilot requires reviewed questions.");
  const ids = new Set();
  let semanticHits = 0;
  let keywordHits = 0;
  for (const { id, expected, semantic, keyword } of questions) {
    if (typeof id !== "string" || !id || ids.has(id) || !Array.isArray(expected) || !expected.length ||
        !Array.isArray(semantic) || !Array.isArray(keyword)) {
      throw new Error("Each pilot question needs a unique ID and complete expected and actual locations.");
    }
    ids.add(id);
    const invalid = (row) => !row || row.commit !== commit || typeof row.path !== "string" ||
      !Number.isSafeInteger(row.startLine) || row.startLine < 1 || !Number.isSafeInteger(row.endLine) ||
      row.startLine > row.endLine || !locate(commit, row.path, row.startLine, row.endLine);
    if (expected.some(invalid) || semantic.some(invalid) || keyword.some(invalid)) {
      throw new Error("Unresolvable source citation for pilot question " + id + ".");
    }
    const hasHit = (locations) => locations.slice(0, TOP).some((result) => expected.some((location) => sameLocation(result, location)));
    semanticHits += Number(hasHit(semantic));
    keywordHits += Number(hasHit(keyword));
  }
  return {
    questions: questions.length, semanticHits, keywordHits,
    semanticRate: semanticHits / questions.length, keywordRate: keywordHits / questions.length,
  };
}

function words(text) {
  return new Set(text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []);
}

function keywordRank(a, b) {
  return b.score - a.score || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) || a.startLine - b.startLine;
}

export function rankKeywordLocations(tree, scope, query) {
  const queryWords = words(query);
  const hits = [];
  if (!queryWords.size) return hits;
  for (const { path } of listIndexEntries(tree, scope)) {
    const buffer = tree.readBounded(path, FILE_BYTES);
    if (buffer.includes(0)) continue;
    let text;
    try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buffer); } catch { continue; }
    let line = 0;
    for (const [body] of text.matchAll(/[^\n]*\n|[^\n]+$/g)) {
      line += 1;
      let score = 0;
      for (const word of words(body)) if (queryWords.has(word)) score += 1;
      if (!score) continue;
      const result = { commit: tree.id, path, startLine: line, endLine: line, score };
      if (hits.length === TOP && keywordRank(result, hits.at(-1)) >= 0) continue;
      hits.push(result);
      hits.sort(keywordRank);
      if (hits.length > TOP) hits.pop();
    }
  }
  return hits;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [inputFile, root = process.cwd(), ...extra] = process.argv.slice(2);
    if (!inputFile || extra.length) throw new Error("Usage: node scripts/measure-semantic-index.mjs <report-input.json> [checkout]");
    const input = JSON.parse(readFileSync(inputFile, "utf8"));
    const tree = treeFromRevision(root, input.commit);
    if (tree.id !== input.commit) throw new Error("The pilot input must identify a full Git commit.");
    const counts = new Map();
    const locate = (_revision, path, _start, end) => {
      if (!tree.has(path)) return false;
      if (!counts.has(path)) counts.set(path, lineCount(tree.readBounded(path, FILE_BYTES)));
      return end <= counts.get(path);
    };
    const questions = input.questions.map((question) => ({
      ...question, keyword: question.keyword ?? rankKeywordLocations(tree, input.scope, question.text),
    }));
    console.log(JSON.stringify({ commit: tree.id, keywordMethod, ...measurePilot({ commit: tree.id, questions, locate }) }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
