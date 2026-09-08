// Advisory ontology paraphrase-drift review — the second half of the drift defence.
//
// The deterministic linter catches exact-name misuse. This pass reviews only added Markdown prose
// for semantic paraphrases and contradictions, against a compact projection of the ontology. It
// never edits files and never fails on findings; only infrastructure failure turns its job red,
// which is deliberately visually distinct from "reviewed, found nothing."
//
// It talks to any OpenAI-compatible chat-completions endpoint, configured entirely through
// environment variables. The GitHub token is used only for the GitHub REST calls and is never sent
// to the model endpoint — see modelJson versus githubJson.
//
// This file is identical in every repository that installs the ontology kit; do not edit it
// locally. Repository-specific values live in ontology.config.json.

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { loadConfig } from "./ontology-config.mjs";

export const COMMENT_MARKER = "<!-- ontology-drift-review -->";
export const NO_DRIFT_TOKEN = "NO_DRIFT";

// A complete-request character budget, not a diff-only one. Character counts are a planning
// heuristic; a 413 from the endpoint is handled authoritatively by recursive splitting.
export const MAX_REQUEST_CHARS = 24_000;

export const SYSTEM_PROMPT = `You are a domain-terminology reviewer for a repository whose canonical
vocabulary is defined in an ontology document. You will be given a compact projection generated
from that ontology, followed by added Markdown lines identified by file and new-file line number.
Your ONLY job is to find semantic paraphrase drift: prose that refers to a domain concept, enum
value, event, or external system by a non-canonical name, or contradicts the ontology's definitions.

Rules:
- The ontology projection provided first is the sole source of canonical names and definitions.
- Every supplied source line is an addition; there is no removed or unchanged diff context.
- Only report prose that ASSERTS current state using wrong/paraphrased names. Do not report:
  - terms inside double quotes (those are meta-mentions, deliberately non-canonical);
  - struck-through text (~~like this~~) — it is preserved history;
  - text that describes PAST states, mistakes, or examples of drift;
  - ordinary English that is not referring to a domain concept.
- A backticked term that exactly matches the ontology is correct; do not report it.
- Be precise and sparing. A false alarm costs reviewer trust. If unsure, do not report.

Output format:
- If there are no findings, respond with exactly: ${NO_DRIFT_TOKEN}
- Otherwise respond with a markdown bullet list, one bullet per finding:
  - **<file>:<line>** — "<offending prose, quoted briefly>": <what is wrong> — suggest: <canonical phrasing>
- No preamble, no summary, nothing else.`;

/**
 * @typedef {{ line: number, text: string }} AddedLine
 * @typedef {{ file: string, lines: AddedLine[] }} ReviewChunk
 */

const SEPARATOR_ROW = /^\|[-| :]+\|$/;

/**
 * Keep the ontology's canonical catalogues and invariants; discard orientation and workflow prose.
 * @param {string} markdown
 * @param {{ required: string[], optional: string[] }} sections
 * @returns {string}
 */
export function projectOntology(markdown, sections) {
  const kept = new Set([...sections.required, ...sections.optional]);
  // An empty section list is never a meaningful configuration for this reviewer: it would run
  // real requests against a projection with no content, silently reviewing nothing on every pull
  // request while looking exactly like a clean bill of health. `sections` being absent or a typo'd
  // key producing `{required: [], optional: []}` are both caught by validateConfig for the known
  // shape, but only projectOntology — the consumer that actually needs section names — is in a
  // position to say "empty is unusable" without also breaking a core (linter-only) install that
  // legitimately never reads `sections` at all.
  if (kept.size === 0) {
    throw new Error(
      "ontology.config.json: sections.required and sections.optional are both empty — " +
        "configure at least one section for the drift reviewer to project",
    );
  }
  const lines = markdown.split(/\r?\n/);
  const headingCounts = new Map();
  const contentCounts = new Map();
  let current;

  for (const [index, line] of lines.entries()) {
    const heading = line.match(/^## (.+)$/);
    if (heading) {
      current = heading[1];
      if (kept.has(current)) headingCounts.set(current, (headingCounts.get(current) ?? 0) + 1);
      continue;
    }
    if (
      current &&
      kept.has(current) &&
      (line.startsWith("- **") ||
        (line.startsWith("|") && !SEPARATOR_ROW.test(line) && !SEPARATOR_ROW.test(lines[index + 1] ?? "")))
    ) {
      contentCounts.set(current, (contentCounts.get(current) ?? 0) + 1);
    }
  }

  for (const section of sections.required) {
    if ((headingCounts.get(section) ?? 0) === 0) {
      throw new Error(`missing required ontology section: ${section}`);
    }
  }
  for (const section of kept) {
    const headings = headingCounts.get(section) ?? 0;
    if (headings === 0) continue;
    if (headings > 1) throw new Error(`duplicate ontology section: ${section}`);
    if ((contentCounts.get(section) ?? 0) === 0) throw new Error(`empty ontology section: ${section}`);
  }

  const output = ["# Canonical ontology projection"];
  let keep = false;
  for (const line of lines) {
    const heading = line.match(/^## (.+)$/);
    if (heading) {
      keep = kept.has(heading[1]);
      if (keep) output.push("", line);
      continue;
    }
    if (!keep || !line.trim() || SEPARATOR_ROW.test(line)) continue;
    // Tables and invariant bullets are the canonical data. Linking prose is omitted.
    if (line.startsWith("|") || line.startsWith("- **")) output.push(line);
  }
  return output.join("\n");
}

/**
 * Parse a zero-context unified diff into compact, attributed added lines.
 * @param {string} diff
 * @returns {AddedLine[]}
 */
export function extractAddedLines(diff) {
  const additions = [];
  let newLine = 0;
  let inHunk = false;
  for (const raw of diff.split(/\r?\n/)) {
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      newLine = Number(hunk[1]);
      inHunk = true;
      continue;
    }
    if (!inHunk || raw.startsWith("+++")) continue;
    if (raw.startsWith("+")) {
      const text = raw.slice(1);
      if (text.trim() && !SEPARATOR_ROW.test(text)) additions.push({ line: newLine, text });
      newLine++;
    } else if (raw.startsWith(" ")) {
      newLine++;
    }
  }
  return additions;
}

/**
 * @param {ReviewChunk} chunk
 * @returns {string}
 */
export function renderChunk(chunk) {
  return `## Added lines: ${chunk.file}\n${chunk.lines.map((line) => `L${line.line}: ${line.text}`).join("\n")}`;
}

/**
 * @param {string} file
 * @param {AddedLine[]} lines
 * @param {number} maxSectionChars
 * @returns {ReviewChunk[]}
 */
function splitLinesToFit(file, lines, maxSectionChars) {
  const chunks = [];
  let current = [];
  for (const line of lines) {
    if (current.length && renderChunk({ file, lines: [...current, line] }).length > maxSectionChars) {
      chunks.push({ file, lines: current });
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length) chunks.push({ file, lines: current });
  return chunks;
}

/**
 * @param {{ file: string, lines: AddedLine[] }[]} files
 * @param {string} ontologyProjection
 * @param {number} [maxRequestChars]
 * @returns {ReviewChunk[][]}
 */
export function buildBatches(files, ontologyProjection, maxRequestChars = MAX_REQUEST_CHARS) {
  const staticChars = SYSTEM_PROMPT.length + ontologyProjection.length + 16;
  const available = maxRequestChars - staticChars;
  if (available < 500) {
    throw new Error("ontology projection and system prompt leave no useful diff budget");
  }

  const chunks = files.flatMap(({ file, lines }) => splitLinesToFit(file, lines, available));
  const batches = [];
  let current = [];
  for (const chunk of chunks) {
    const candidate = [...current, chunk];
    const size = staticChars + candidate.reduce((sum, item) => sum + renderChunk(item).length + 5, 0);
    if (current.length && size > maxRequestChars) {
      batches.push(current);
      current = [chunk];
    } else {
      current = candidate;
    }
  }
  if (current.length) batches.push(current);
  return batches;
}

/**
 * @param {string} ontologyProjection
 * @param {ReviewChunk[]} batch
 * @returns {string}
 */
export function userPrompt(ontologyProjection, batch) {
  return [ontologyProjection, ...batch.map(renderChunk)].join("\n\n---\n\n");
}

export class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} responseBody
   * @param {string} message
   */
  constructor(status, responseBody, message) {
    super(message);
    this.status = status;
    this.responseBody = responseBody;
  }
}

function isTokenLimitError(error) {
  return (
    error instanceof HttpError &&
    (error.status === 413 || error.responseBody.includes("context_length_exceeded"))
  );
}

/**
 * @param {string} name
 * @returns {string}
 */
export function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

/**
 * Talks only to the model endpoint, authenticated with ONTOLOGY_LLM_API_KEY. Never pass a GitHub
 * token here — githubJson below is the sole GitHub-authenticated path.
 *
 * The timeout is sized to match reviewBatch's max_tokens: a reasoning model spends part of its
 * budget before emitting any content, so raise the two together or not at all.
 * @param {string} url
 * @param {RequestInit} [init]
 * @param {typeof fetch} [fetchImpl]
 * @param {number} [timeoutMs]
 */
export async function modelJson(url, init, fetchImpl = fetch, timeoutMs = 300_000) {
  const apiKey = process.env.ONTOLOGY_LLM_API_KEY;
  const response = await fetchImpl(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new HttpError(response.status, body, `model request failed: ${response.status}: ${body}`);
  }
  return response.json();
}

async function githubJson(token, url, init) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new HttpError(response.status, body, `${init?.method ?? "GET"} ${url} -> ${response.status}: ${body}`);
  }
  return response.json();
}

/**
 * Deliberately sends no sampling parameters — those belong where the model is configured.
 * max_tokens covers any reasoning tokens as well as the final content, so it is the binding
 * constraint; raise it and modelJson's timeout together.
 * @param {string} baseUrl
 * @param {string} model
 * @param {string} ontologyProjection
 * @param {ReviewChunk[]} batch
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<string>}
 */
export async function reviewBatch(baseUrl, model, ontologyProjection, batch, fetchImpl = fetch) {
  const completion = await modelJson(
    `${baseUrl}/chat/completions`,
    {
      method: "POST",
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt(ontologyProjection, batch) },
        ],
      }),
    },
    fetchImpl,
  );
  const answer = (completion.choices?.[0]?.message?.content ?? "").trim();
  if (!answer) throw new Error("empty response from model");
  return answer;
}

/**
 * @param {ReviewChunk[]} batch
 * @param {(candidate: ReviewChunk[]) => Promise<string>} review
 * @returns {Promise<string[]>}
 */
export async function reviewResilient(batch, review) {
  try {
    return [await review(batch)];
  } catch (error) {
    if (!isTokenLimitError(error)) throw error;
    if (batch.length > 1) {
      const middle = Math.ceil(batch.length / 2);
      return [
        ...(await reviewResilient(batch.slice(0, middle), review)),
        ...(await reviewResilient(batch.slice(middle), review)),
      ];
    }
    const [chunk] = batch;
    if (chunk.lines.length < 2) {
      throw new Error(
        `token limit persists for one added line in ${chunk.file}; the ontology projection is too large`,
      );
    }
    const middle = Math.ceil(chunk.lines.length / 2);
    return [
      ...(await reviewResilient([{ ...chunk, lines: chunk.lines.slice(0, middle) }], review)),
      ...(await reviewResilient([{ ...chunk, lines: chunk.lines.slice(middle) }], review)),
    ];
  }
}

async function main() {
  const config = loadConfig({});
  const model = process.env.ONTOLOGY_MODEL || "ontology-review";
  const baseRef = process.env.BASE_REF || "origin/main";
  const changedFiles = process.argv.slice(2).filter((file) => file !== config.ontologyPath);
  if (!changedFiles.length) {
    console.log("no changed markdown files to review — nothing to do");
    return;
  }

  const projection = projectOntology(readFileSync(config.ontologyPath, "utf8"), config.sections);
  const files = changedFiles.flatMap((file) => {
    const diff = execFileSync("git", ["diff", "--unified=0", `${baseRef}...HEAD`, "--", file], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    const lines = extractAddedLines(diff);
    return lines.length ? [{ file, lines }] : [];
  });
  if (!files.length) {
    console.log(`no added Markdown prose against ${baseRef} — nothing to do`);
    return;
  }

  const batches = buildBatches(files, projection);
  if (process.env.DRY_RUN) {
    console.log(`DRY_RUN — model: ${model}, base: ${baseRef}, ${files.length} file(s) in ${batches.length} batch(es)`);
    batches.forEach((batch, index) => {
      console.log(
        `  batch ${index + 1}: ${batch.map((chunk) => chunk.file).join(", ")} ` +
          `(~${SYSTEM_PROMPT.length + userPrompt(projection, batch).length} complete-request chars)`,
      );
    });
    return;
  }

  const token = requireEnv("GITHUB_TOKEN");
  const repo = requireEnv("GITHUB_REPOSITORY");
  const prNumber = requireEnv("PR_NUMBER");
  const baseUrl = requireEnv("ONTOLOGY_LLM_BASE_URL");

  const findings = [];
  for (const [index, batch] of batches.entries()) {
    const answers = await reviewResilient(batch, (candidate) =>
      reviewBatch(baseUrl, model, projection, candidate));
    console.log(`batch ${index + 1}/${batches.length}: ${answers.length} request(s) after token-limit splitting`);
    for (const answer of answers) {
      if (!answer.startsWith(NO_DRIFT_TOKEN)) findings.push(answer);
    }
  }

  const noDrift = findings.length === 0;
  const answer = findings.join("\n");
  console.log(noDrift ? "no drift found" : `findings:\n${answer}`);

  const api = `https://api.github.com/repos/${repo}`;
  const comments = await githubJson(token, `${api}/issues/${prNumber}/comments?per_page=100`);
  const existing = comments.find(
    (comment) => typeof comment.body === "string" && comment.body.includes(COMMENT_MARKER),
  );
  const header = `${COMMENT_MARKER}\n### Ontology drift review (AI-assisted, advisory)\n\n`;
  const footer =
    `\n\n---\n*Model: \`${model}\`. Advisory only — human review is the gate. ` +
    `The deterministic term check is a separate, blocking status.*`;
  const body = noDrift
    ? `${header}No paraphrase drift found in the changed markdown files of this revision.${footer}`
    : header + answer + footer;

  if (existing) {
    await githubJson(token, `${api}/issues/comments/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    });
    console.log(`updated comment ${existing.id}`);
  } else if (!noDrift) {
    const created = await githubJson(token, `${api}/issues/${prNumber}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
    console.log(`created comment ${created.id}`);
  } else {
    console.log("no findings and no prior comment — staying silent");
  }
}

// pathToFileURL, not `new URL(`file://${process.argv[1]}`)`: the latter percent-encodes the path
// (breaking on spaces/`#`) and additionally mishandles Windows paths (backslashes, drive letters).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
