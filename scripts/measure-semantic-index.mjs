#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { estimateTokens } from "../templates/scripts/semantic-index-tokens.mjs";
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

const count = (value) => Number.isSafeInteger(value) && value >= 0;
const round4 = (value) => Math.round(value * 10000) / 10000;

function requireRows(rows, message) {
  if (!Array.isArray(rows) || !rows.length) throw new Error(message);
}

function requireCount(value, name) {
  if (!count(value)) throw new Error(name + " must be a safe integer of at least 0.");
}

export function compareEstimates(samples) {
  requireRows(samples, "Supply at least one estimate sample.");
  let sum = 0;
  let relativeSum = 0;
  let largest;
  for (const { id, estimate, independent } of samples) {
    if (!Number.isSafeInteger(independent) || independent < 1) throw new Error("Sample " + id + " needs a positive independent count.");
    requireCount(estimate, "Sample " + id + " estimate");
    const difference = estimate - independent;
    sum += difference;
    relativeSum += difference / independent;
    if (!largest || Math.abs(difference) > Math.abs(largest.difference)) largest = { id, difference };
  }
  return {
    samples: samples.length, meanDifference: round4(sum / samples.length),
    meanRelativeDifference: round4(relativeSum / samples.length), largest,
  };
}

export function compactLocations(response) {
  return response.results.map((result) => ({ commit: response.indexCommit, ...result }));
}

export function checkCap({ cap, notice, responses }) {
  requireRows(responses, "Supply at least one response.");
  requireCount(cap, "The cap");
  requireCount(notice, "The notice");
  let largest;
  for (const { id, tokens } of responses) {
    requireCount(tokens, "Response " + id + " tokens");
    if (!largest || tokens > largest.tokens) largest = { id, tokens };
  }
  return { cap, notice, largest, withinCap: largest.tokens <= cap + notice };
}

export function protocolCost({ previousText, currentText, rules, runs }) {
  requireRows(rules, "Supply at least one rule.");
  requireRows(runs, "Supply at least one run.");
  if (typeof previousText !== "string" || typeof currentText !== "string") throw new Error("Supply both protocol texts.");
  const known = new Set(rules);
  const followed = { previous: new Set(), current: new Set() };
  for (const run of runs) {
    if (!Object.hasOwn(followed, run.protocol)) throw new Error("Unknown protocol " + run.protocol + ".");
    for (const id of run.followed) {
      if (!known.has(id)) throw new Error("Unknown rule ID " + id + ".");
      followed[run.protocol].add(id);
    }
  }
  const previousTokens = estimateTokens(previousText);
  const currentTokens = estimateTokens(currentText);
  return {
    previousTokens, currentTokens, change: currentTokens - previousTokens,
    dropped: rules.filter((id) => followed.previous.has(id) && !followed.current.has(id)),
  };
}

export function graphFirstSavings(questions) {
  requireRows(questions, "Supply at least one question.");
  const previous = { searches: 0, tokens: 0 };
  const current = { searches: 0, tokens: 0 };
  const uncited = [];
  for (const question of questions) {
    for (const [total, side] of [[previous, question.previous], [current, question.current]]) {
      requireCount(side?.searches, "Question " + question.id + " searches");
      requireCount(side?.tokens, "Question " + question.id + " tokens");
      total.searches += side.searches;
      total.tokens += side.tokens;
    }
    if (question.citesEvidence !== true) uncited.push(question.id);
  }
  return {
    questions: questions.length, previous, current,
    change: { searches: current.searches - previous.searches, tokens: current.tokens - previous.tokens }, uncited,
  };
}

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const DISCOVERY_COUNTS = ["inputTokens", "filesOpened", "searchCalls", "indexCommands"];

export function discoveryFromTranscript(jsonl) {
  const counted = new Set();
  const opened = new Set();
  const figures = { inputTokens: 0, filesOpened: 0, searchCalls: 0, indexCommands: 0, edited: false };
  const lines = jsonl.split("\n");
  for (let index = 0; index < lines.length && !figures.edited; index += 1) {
    if (!lines[index].trim()) continue;
    let record;
    try { record = JSON.parse(lines[index]); } catch { throw new Error("Transcript line " + (index + 1) + " is not JSON."); }
    if (record?.type !== "assistant") continue;
    const message = record.message ?? {};
    if (message.usage && !counted.has(message.id)) {
      counted.add(message.id);
      const usage = message.usage;
      figures.inputTokens += (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
    }
    for (const item of Array.isArray(message.content) ? message.content : []) {
      if (item?.type !== "tool_use") continue;
      if (EDIT_TOOLS.has(item.name)) figures.edited = true;
      else if (item.name === "Read") opened.add(item.input?.file_path);
      else if (item.name === "Grep" || item.name === "Glob") figures.searchCalls += 1;
      else if (item.name === "Bash") {
        const command = String(item.input?.command ?? "");
        if (command.includes("semantic-index.mjs")) figures.indexCommands += 1;
        else if (/^\s*(?:rg|grep|git\s+grep|find)\b/.test(command)) figures.searchCalls += 1;
      }
    }
  }
  figures.filesOpened = opened.size;
  return figures;
}

export function compareDiscovery(tasks) {
  requireRows(tasks, "Supply at least one task.");
  const difference = (a, b) => Object.fromEntries(DISCOVERY_COUNTS.map((name) => [name, a[name] - b[name]]));
  const zero = () => Object.fromEntries(DISCOVERY_COUNTS.map((name) => [name, 0]));
  const totals = { withIndex: zero(), vsBaseline: zero(), vsWithoutIndex: zero() };
  const incomplete = [];
  const rows = tasks.map(({ id, note, baseline, withIndex, withoutIndex }) => {
    if (typeof note !== "string" || !note.trim()) throw new Error("Task " + id + " needs a developer note.");
    for (const figures of [baseline, withIndex, withoutIndex]) {
      for (const name of DISCOVERY_COUNTS) requireCount(figures?.[name], "Task " + id + " " + name);
    }
    if ([baseline, withIndex, withoutIndex].some((figures) => figures.edited === false)) incomplete.push(id);
    const row = { id, note, withIndex, vsBaseline: difference(withIndex, baseline), vsWithoutIndex: difference(withIndex, withoutIndex) };
    for (const section of Object.keys(totals)) {
      for (const name of DISCOVERY_COUNTS) totals[section][name] += (section === "withIndex" ? withIndex : row[section])[name];
    }
    return row;
  });
  return { tasks: rows, totals, incomplete };
}

function tokensReport(inputFile) {
  const input = JSON.parse(readFileSync(inputFile, "utf8"));
  const base = dirname(resolve(inputFile));
  const report = {};
  if (input.estimates !== undefined) report.estimates = compareEstimates(input.estimates);
  if (input.cap !== undefined) report.cap = checkCap(input.cap);
  if (input.protocol !== undefined) {
    const { previous, current, rules, runs } = input.protocol;
    report.protocol = protocolCost({
      previousText: readFileSync(resolve(base, previous), "utf8"),
      currentText: readFileSync(resolve(base, current), "utf8"), rules, runs,
    });
  }
  if (input.graphQuestions !== undefined) report.graphFirst = graphFirstSavings(input.graphQuestions);
  if (input.tasks !== undefined) {
    requireRows(input.tasks, "Supply at least one task.");
    const figuresFrom = (source) => typeof source === "string"
      ? discoveryFromTranscript(readFileSync(resolve(base, source), "utf8"))
      : source;
    report.discovery = compareDiscovery(input.tasks.map((task) => ({
      ...task, baseline: figuresFrom(task.baseline), withIndex: figuresFrom(task.withIndex), withoutIndex: figuresFrom(task.withoutIndex),
    })));
  }
  if (!Object.keys(report).length) {
    throw new Error("Supply at least one of estimates, cap, protocol, graphQuestions or tasks.");
  }
  return report;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === "--tokens") {
      const [file, ...rest] = process.argv.slice(3);
      if (!file || rest.length) throw new Error("Usage: node scripts/measure-semantic-index.mjs --tokens <input.json>");
      console.log(JSON.stringify(tokensReport(file)));
    } else {
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
      const scope = { include: input.scope?.include, exclude: input.scope?.exclude ?? [] };
      if (!Array.isArray(scope.include) || !Array.isArray(scope.exclude) || !Array.isArray(input.questions)) {
        throw new Error("Supply the pilot source scope and reviewed questions.");
      }
      const questions = input.questions.map((question) => {
        if (typeof question.text !== "string" || !question.text.trim()) throw new Error("Each pilot question needs its query text.");
        return { ...question, keyword: rankKeywordLocations(tree, scope, question.text) };
      });
      const report = { commit: tree.id, keywordMethod, ...measurePilot({ commit: tree.id, questions, locate }) };
      if (questions.every((question) => question.compact)) {
        const compact = measurePilot({
          commit: tree.id, locate,
          questions: questions.map((question) => ({ ...question, semantic: compactLocations(question.compact) })),
        });
        report.compactHits = compact.semanticHits;
        report.compactRate = compact.semanticRate;
      }
      console.log(JSON.stringify(report));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
