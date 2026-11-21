#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createEmbeddingAdapter } from "./semantic-index-embed.mjs";
import { createReleaseTransport, downloadIndex, uploadIndex } from "./semantic-index-release.mjs";
import { hasIndexEdits, listIndexEntries, readIndexedLines, readIndexPassages, resolveIndexContext } from "./semantic-index-source.mjs";
import { appendTokenRecord } from "./semantic-index-token-log.mjs";
import { estimateTokens, fitToCap } from "./semantic-index-tokens.mjs";
import { indexReadiness, openIndex, withIndexWriter } from "./semantic-index-store.mjs";

const recovery = {
  missing: "Download a compatible release snapshot or run refresh to build an index.",
  stale: "Run refresh to index the current commit and scope.",
  incompatible: "Download a compatible snapshot or run refresh with the configured embedding model.",
  unreadable: "Download a fresh snapshot or run refresh to rebuild the index.",
};

function problem(code, message) {
  return Object.assign(new Error(message), { code });
}

function parseCommand(argv) {
  const [command, ...args] = argv;
  const optionsFor = { status: [], refresh: [], search: ["query", "limit"], show: ["path", "lines", "commit"], download: ["release", "allow-ancestor"], upload: ["release"] };
  if (!Object.hasOwn(optionsFor, command)) throw problem("usage", "Use status, refresh, search, show, usage, download, or upload.");
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const match = /^--([a-z-]+)(?:=(.*))?$/s.exec(args[i]);
    if (!match) throw problem("usage", "Expected a named command option.");
    const [, key, inline] = match;
    if (Object.hasOwn(options, key)) throw problem("usage", "Option given more than once: --" + key);
    if ((key === "json" || (command === "search" && key === "compact") || (command === "download" && key === "allow-ancestor")) && inline === undefined) {
      options[key] = true;
      continue;
    }
    if (!optionsFor[command].includes(key) || key === "allow-ancestor") throw problem("usage", "Unexpected option: --" + key);
    const value = inline ?? args[++i];
    if (!value || (inline === undefined && value.startsWith("-"))) throw problem("usage", "Missing value for --" + key);
    options[key] = value;
  }
  if (command === "search" && !options.query?.trim()) throw problem("usage", "Provide a non-empty --query.");
  if ((command === "download" || command === "upload") && (!options.release || /[\x00-\x20]/.test(options.release))) {
    throw problem("usage", "Provide an explicit GitHub Release tag with --release.");
  }
  if (command === "show") {
    if (!options.path) throw problem("usage", "Provide --path for show.");
    const range = /^(\d+)-(\d+)$/.exec(options.lines ?? "");
    if (!range || Number(range[1]) < 1 || Number(range[1]) > Number(range[2])) {
      throw problem("usage", "--lines must be <start>-<end> with 1 <= start <= end.");
    }
    options.startLine = Number(range[1]);
    options.endLine = Number(range[2]);
    if (options.commit !== undefined && !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(options.commit)) {
      throw problem("usage", "--commit must be a full commit ID.");
    }
  }
  if (options.compact && !options.json) throw problem("usage", "--compact needs --json.");
  const limit = options.limit === undefined ? 5 : Number(options.limit);
  if (options.limit !== undefined && (!/^\d+$/.test(options.limit) || limit < 1 || limit > 100)) {
    throw problem("usage", "--limit must be an integer from 1 to 100.");
  }
  return { command, options, limit };
}

async function inspect(context) {
  let reader;
  try {
    reader = await openIndex(context.root);
  } catch (error) {
    return { state: error.code === "ENOENT" ? "missing" : "unreadable" };
  }
  return { reader, state: indexReadiness(reader.header, context) };
}

function describe(context, state, indexCommit) {
  const value = {
    state, configurationCommit: context.configurationCommit, sourceCommit: context.sourceTree.id,
    indexCommit: indexCommit ?? null, committedOnly: true, dirty: hasIndexEdits(context),
  };
  if (recovery[state]) value.message = recovery[state];
  return value;
}

function headerFor(context) {
  return {
    kind: "header", version: 1, repository: context.policy.release?.repository ?? null,
    sourceCommit: context.sourceTree.id, scope: context.policy.scope, scopeDigest: context.scopeDigest,
    embeddingDigest: context.embeddingDigest, dimensions: context.policy.embedding.dimensions,
  };
}

function compatibleReader(reader, header) {
  return reader && reader.header.repository === header.repository &&
    reader.header.embeddingDigest === header.embeddingDigest && reader.header.dimensions === header.dimensions;
}

async function refresh(context, adapter, resolveCurrent) {
  const started = performance.now();
  const header = headerFor(context);
  let sourceEmbeddings = 0;
  await withIndexWriter(context.root, async (writer) => {
    const { reader, state } = await inspect(context);
    try {
      if (state === "current") return;
      async function* records() {
        const previous = compatibleReader(reader, header) ? reader.records() : null;
        let prior = await previous?.next();
        try {
          for (const entry of listIndexEntries(context.sourceTree, context.policy.scope)) {
            while (prior && !prior.done && prior.value.path < entry.path) prior = await previous.next();
            if (prior && !prior.done && prior.value.path === entry.path && prior.value.blobId === entry.blobId) {
              do {
                yield prior.value;
                prior = await previous.next();
              } while (!prior.done && prior.value.path === entry.path);
              continue;
            }
            const pieces = readIndexPassages(context.sourceTree, entry);
            for (let from = 0; from < pieces.length; from += 16) {
              const batch = pieces.slice(from, from + 16);
              const vectors = await adapter.embedSource(batch.map(({ text }) => text));
              sourceEmbeddings += vectors.length;
              for (let i = 0; i < batch.length; i += 1) {
                const { text, ...source } = batch[i];
                yield { ...source, vector: vectors[i] };
              }
            }
          }
        } finally {
          await previous?.return();
        }
      }
      await writer.replace({ header, records: records() });
    } finally {
      await reader?.close();
    }
  });
  const current = resolveCurrent();
  return {
    ...describe(current, indexReadiness(header, current), header.sourceCommit),
    metrics: { sourceEmbeddings, elapsedMs: performance.now() - started },
  };
}

function cosine(a, b) {
  let dot = 0;
  let aSquared = 0;
  let bSquared = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    aSquared += a[i] * a[i];
    bSquared += b[i] * b[i];
  }
  return Math.min(1, Math.max(-1, dot / Math.sqrt(aSquared * bSquared)));
}

function rank(a, b) {
  return b.score - a.score || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) ||
    a.startLine - b.startLine || a.endLine - b.endLine || a.position - b.position;
}

async function search(reader, query, limit, adapter) {
  const vector = await adapter.embedQuery(query);
  const best = [];
  for await (const row of reader.records()) {
    const { path, startLine, endLine, position } = row;
    const result = { path, startLine, endLine, position, score: cosine(vector, row.vector) };
    if (best.length === limit && rank(result, best.at(-1)) >= 0) continue;
    best.push(result);
    best.sort(rank);
    if (best.length > limit) best.pop();
  }
  return best.map(({ position, ...result }) => ({ commit: reader.header.sourceCommit, ...result }));
}

async function measureAndLog({ total, build, mark, render, cap, root, command, now }) {
  const kept = fitToCap(total, (n) => render(build(n)), cap);
  const payload = build(kept);
  if (kept < total) payload.truncated = mark(kept);
  const estimate = estimateTokens(render(payload));
  const response = { ...payload, tokens: { estimate, estimated: true } };
  const logged = await appendTokenRecord(root, { time: now().toISOString(), command, count: kept, tokens: estimate, truncated: kept < total });
  if (!logged.recorded) response.tokenLog = logged.message;
  return response;
}

export async function runIndexCommand(argv, { cwd = process.cwd(), env = process.env, fetchImpl = fetch, releaseTransport, now = () => new Date() } = {}) {
  try {
    const { command, options, limit } = parseCommand(argv);
    const resolveCurrent = () => resolveIndexContext(cwd, env);
    const context = resolveCurrent();
    const adapter = () => createEmbeddingAdapter(context.policy.embedding, { fetchImpl, token: env.ONTOLOGY_INDEX_EMBEDDING_TOKEN });
    let value;
    if (command === "refresh") {
      value = await refresh(context, adapter(), resolveCurrent);
    } else if (command === "download" || command === "upload") {
      const exchange = command === "download" ? downloadIndex : uploadIndex;
      const exchanged = await exchange({ context, tag: options.release, allowAncestor: Boolean(options["allow-ancestor"]),
        transport: releaseTransport ?? createReleaseTransport() });
      const current = resolveCurrent();
      const { reader, state } = await inspect(current);
      try {
        value = { ...describe(current, state, reader?.header.sourceCommit), ...exchanged };
      } finally {
        await reader?.close();
      }
    } else {
      const { reader, state } = await inspect(context);
      try {
        value = describe(context, state, reader?.header.sourceCommit);
        if (command === "search") {
          if (state !== "current") throw problem(state, recovery[state]);
          const results = await search(reader, options.query, limit, adapter());
          const current = resolveCurrent();
          const latest = indexReadiness(reader.header, current);
          if (latest !== "current") throw problem(latest, recovery[latest]);
          const commit = reader.header.sourceCommit;
          const rows = options.compact ? results.map(({ commit: _commit, ...location }) => location) : results;
          const render = options.json ? JSON.stringify : formatIndexResponse;
          return { exitCode: 0, value: await measureAndLog({
            total: rows.length,
            build: (n) => ({ ok: true, ...describe(current, latest, commit), results: rows.slice(0, n) }),
            mark: (kept) => ({ returned: kept, omitted: rows.length - kept }),
            render, cap: context.policy.responseCap, root: context.root, command: "search", now,
          }) };
        }
        if (command === "show") {
          if (state !== "current") throw problem(state, recovery[state]);
          const commit = reader.header.sourceCommit;
          if (options.commit !== undefined && options.commit !== commit) {
            throw problem("refused", "Show reads only the indexed commit " + commit + ".");
          }
          const { path, startLine, endLine } = options;
          const lines = readIndexedLines(context.sourceTree, context.policy.scope, { path, startLine, endLine });
          return { exitCode: 0, value: await measureAndLog({
            total: lines.length,
            build: (n) => ({ ok: true, ...describe(context, "current", commit), commit, path, startLine, endLine, text: lines.slice(0, n).join("") }),
            mark: (kept) => ({ lastLine: kept ? startLine + kept - 1 : null, nextLine: startLine + kept }),
            render: options.json ? JSON.stringify : formatIndexResponse,
            cap: context.policy.responseCap, root: context.root, command: "show", now,
          }) };
        }
      } finally {
        await reader?.close();
      }
    }
    return { exitCode: 0, value: { ok: true, ...value } };
  } catch (error) {
    const argument = ["config", "disabled", "unborn", "usage", "refused"].includes(error.code);
    const code = argument || error.code === "release" || Object.hasOwn(recovery, error.code) ? error.code : "operation";
    return { exitCode: argument ? 2 : 1, value: { ok: false, code, message: error.message } };
  }
}

export function formatIndexResponse(value) {
  if (!value.ok) return value.message;
  const lines = [value.state + (value.indexCommit ? " at " + value.indexCommit : "")];
  if (value.message) lines.push(value.message);
  if (value.dirty) lines.push("Search uses committed content. Approved files have uncommitted edits.");
  if (value.text !== undefined) lines.push(
    JSON.stringify(value.path) + ":" + value.startLine + "-" + value.endLine + " at " + value.commit,
    value.text.replace(/\n$/, ""),
  );
  for (const result of value.results ?? []) lines.push(
    JSON.stringify(result.path) + ":" + result.startLine + "-" + result.endLine + " " + result.score.toFixed(4),
  );
  if (value.metrics) lines.push("Source embeddings: " + value.metrics.sourceEmbeddings);
  if (value.asset) lines.push(value.repository + " " + value.release + " " + value.asset + " (" + value.bytes + " bytes)");
  if (value.truncated && value.text !== undefined) lines.push(
    "Truncated at the response cap: " + (value.truncated.lastLine === null ? "no lines returned" :
      "lines " + value.startLine + "-" + value.truncated.lastLine + " returned") + "; request again from line " + value.truncated.nextLine + ".",
  );
  else if (value.truncated) lines.push(
    "Truncated at the response cap: " + value.truncated.returned + " results returned, " + value.truncated.omitted + " omitted.",
  );
  if (value.tokens) lines.push("Estimated tokens: " + value.tokens.estimate);
  if (value.tokenLog) lines.push(value.tokenLog);
  return lines.join("\n");
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const { value, exitCode } = await runIndexCommand(argv);
  const output = argv.includes("--json") ? JSON.stringify(value) : formatIndexResponse(value);
  console.log(output);
  process.exitCode = exitCode;
}
