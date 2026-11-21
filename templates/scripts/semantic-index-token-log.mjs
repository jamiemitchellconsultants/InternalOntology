import { constants } from "node:fs";
import { lstat, open, readFile, rename } from "node:fs/promises";
import { join } from "node:path";

export const TOKEN_LOG = "token-log.jsonl";
export const PREVIOUS_TOKEN_LOG = "token-log.1.jsonl";
export const TOKEN_LOG_BYTES = 1_048_576;

const KEYS = ["command", "count", "time", "tokens", "truncated"];
const COMMANDS = new Set(["search", "show"]);

export async function appendTokenRecord(root, { time, command, count, tokens, truncated }, { maxBytes = TOKEN_LOG_BYTES } = {}) {
  try {
    const store = join(root, ".ontology-index");
    const storeStat = await lstat(store).catch(() => null);
    if (!storeStat?.isDirectory()) return { recorded: false, message: "Token log not recorded: .ontology-index is not a directory." };
    const line = JSON.stringify({ time, command, count, tokens, truncated }) + "\n";
    const log = join(store, TOKEN_LOG);
    const logStat = await lstat(log).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (logStat && !logStat.isFile()) return { recorded: false, message: "Token log not recorded: the token log is not a regular file." };
    if (logStat && logStat.size + Buffer.byteLength(line) > maxBytes) await rename(log, join(store, PREVIOUS_TOKEN_LOG));
    const file = await open(log, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | (constants.O_NOFOLLOW ?? 0), 0o600);
    try {
      await file.write(line);
    } finally {
      await file.close();
    }
    return { recorded: true };
  } catch (error) {
    return { recorded: false, message: `Token log not recorded: ${error.code ?? error.message}.` };
  }
}

const safeCount = (value) => Number.isSafeInteger(value) && value >= 0;

function parseRecord(line) {
  let value;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  if (Object.keys(value).sort().join() !== KEYS.join()) return null;
  if (typeof value.time !== "string" || Number.isNaN(Date.parse(value.time))) return null;
  if (!COMMANDS.has(value.command)) return null;
  if (!safeCount(value.count) || !safeCount(value.tokens)) return null;
  if (typeof value.truncated !== "boolean") return null;
  return value;
}

async function readLog(path) {
  let stats;
  try {
    stats = await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") return { text: "", ignored: 0 };
    throw error;
  }
  if (!stats.isFile()) return { text: "", ignored: 1 };
  return { text: await readFile(path, "utf8"), ignored: 0 };
}

export async function readTokenRecords(root) {
  const records = [];
  let skipped = 0;
  for (const name of [PREVIOUS_TOKEN_LOG, TOKEN_LOG]) {
    const { text, ignored } = await readLog(join(root, ".ontology-index", name));
    skipped += ignored;
    for (const line of text.split("\n")) {
      if (line.trim() === "") continue;
      const record = parseRecord(line);
      if (record) records.push(record);
      else skipped += 1;
    }
  }
  return { records, skipped };
}

const mean = (total, count) => (count === 0 ? 0 : Math.round((total / count) * 10) / 10);

export function summariseTokenUse(records, { since = null } = {}) {
  const sinceTime = since === null ? null : Date.parse(since);
  const kept = sinceTime === null ? records : records.filter(({ time }) => Date.parse(time) >= sinceTime);
  let totalTokens = 0;
  let largest = null;
  const groups = {};
  for (const record of kept) {
    totalTokens += record.tokens;
    if (!largest || record.tokens > largest.tokens) largest = { time: record.time, command: record.command, tokens: record.tokens };
    const group = (groups[record.command] ??= { commands: 0, totalTokens: 0 });
    group.commands += 1;
    group.totalTokens += record.tokens;
  }
  const byCommand = {};
  for (const name of Object.keys(groups).sort()) {
    byCommand[name] = { commands: groups[name].commands, totalTokens: groups[name].totalTokens, meanTokens: mean(groups[name].totalTokens, groups[name].commands) };
  }
  return {
    commands: kept.length,
    totalTokens,
    meanTokens: mean(totalTokens, kept.length),
    largest,
    byCommand,
    since: sinceTime === null ? null : new Date(sinceTime).toISOString(),
  };
}
