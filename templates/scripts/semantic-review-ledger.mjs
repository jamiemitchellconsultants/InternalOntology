// Immutable PR-visible semantic run records and the fixed required commit status.
import { randomUUID } from "node:crypto";

export const STATUS_CONTEXT = "ontology/semantic-match";
const BOT_LOGIN = "github-actions[bot]";
const MARKER = /(?:^|\n)<!-- ontology-semantic-run v1 id=([0-9a-f-]{36}) part=(\d+)\/(\d+) data=([A-Za-z0-9+/=]*) -->$/;
const PART_CHARS = 20_000;

export function statusFor(run, dismissals = []) {
  const dismissed = new Set(dismissals.filter((item) => item.headSha === run.headSha).map((item) => item.findingId));
  const active = run.findings.filter((item) => !dismissed.has(item.id));
  if (active.length) return { state: "failure", description: `${active.length} semantic finding(s) require correction` };
  switch (run.outcome) {
    case "reviewed": return { state: "success", description: `Semantic match reviewed ${run.reviewed.length} file(s); no active findings` };
    case "partial": return { state: "success", description: `Partial semantic review; ${run.unreviewed.length} file(s) not reviewed` };
    case "unavailable": return { state: "success", description: "Semantic match not reviewed: service or configuration unavailable" };
    case "disabled": return { state: "success", description: "Semantic match disabled; not reviewed" };
    case "out-of-scope": return { state: "success", description: "Semantic match not reviewed: PR is out of scope" };
    case "no-eligible": return { state: "success", description: "Semantic match: no eligible changed Markdown files" };
    default: throw new Error("Unknown semantic review outcome");
  }
}

async function currentTargets(client, pull, run) {
  const current = await client.get(`/pulls/${pull.number}`);
  if (current.head?.sha !== run.headSha || current.number && current.number !== run.prNumber) {
    throw new Error("stale semantic review run: PR head changed");
  }
  const targets = [run.headSha];
  if (run.mergeSha && current.merge_commit_sha === run.mergeSha && run.mergeSha !== run.headSha) targets.push(run.mergeSha);
  return targets;
}

async function postStatuses(client, pull, run, status, targetUrl) {
  for (const sha of await currentTargets(client, pull, run)) {
    await client.post(`/statuses/${sha}`, { ...status, context: STATUS_CONTEXT,
      ...(targetUrl ? { target_url: targetUrl } : {}) });
  }
}

export async function publishPending(client, pull, run) {
  await postStatuses(client, pull, run, { state: "pending", description: "Semantic match review in progress" });
}

function renderRun(run, dismissals) {
  const display = (value) => String(value).replaceAll("<!--", "&lt;!--");
  const lines = [
    `## Semantic ontology review — ${run.outcome}`,
    `PR #${run.prNumber} · revision \`${run.headSha}\` · workflow run ${run.triggerRunId}`,
    `Eligible: ${run.eligible.length}; reviewed: ${run.reviewed.length}; not reviewed: ${run.unreviewed.length}.`,
  ];
  for (const item of run.unreviewed) lines.push(`- Not reviewed: \`${display(item.path)}\` — ${display(item.reason)}`);
  const dismissed = new Set(dismissals.filter((item) => item.headSha === run.headSha).map((item) => item.findingId));
  for (const item of run.findings) {
    lines.push(`- ${dismissed.has(item.id) ? "Dismissed" : "Finding"} \`${display(item.id)}\` in \`${display(item.path)}\``);
    lines.push(`  - Passage: ${display(JSON.stringify(item.quote))}`);
    lines.push(`  - Ontology evidence: \`${display(item.evidenceKey)}\``);
    lines.push(`  - Reason: ${display(item.reason)}`);
    lines.push(`  - Suggested correction: ${display(item.suggestion)}`);
  }
  if (run.outcome === "unavailable" || run.outcome === "disabled" || run.outcome === "out-of-scope") {
    lines.push("Semantic matching did not run; this result permits merge.");
  } else if (run.outcome === "partial") {
    lines.push("Coverage is incomplete; only active findings block merge.");
  }
  return lines.join("\n");
}

function partsOf(value) {
  const parts = [];
  for (let offset = 0; offset < value.length; offset += PART_CHARS) parts.push(value.slice(offset, offset + PART_CHARS));
  return parts.length ? parts : [""];
}

export async function publishRun(client, pull, run, dismissals = []) {
  await currentTargets(client, pull, run);
  const id = randomUUID();
  const data = partsOf(Buffer.from(JSON.stringify(run), "utf8").toString("base64"));
  const visible = partsOf(renderRun(run, dismissals));
  const count = Math.max(data.length, visible.length);
  let firstUrl;
  for (let index = 0; index < count; index++) {
    const marker = `<!-- ontology-semantic-run v1 id=${id} part=${index + 1}/${count} data=${data[index] ?? ""} -->`;
    const comment = await client.post(`/issues/${pull.number}/comments`, {
      body: `${index === 0 ? "" : `Semantic review continued (${index + 1}/${count})\n\n`}${visible[index] ?? ""}\n\n${marker}`,
    });
    firstUrl ??= comment.html_url;
  }
  await postStatuses(client, pull, run, statusFor(run, dismissals), firstUrl);
}

async function latestRecord(client, pull) {
  const current = await client.get(`/pulls/${pull.number}`);
  const comments = await client.getAll(`/issues/${pull.number}/comments?per_page=100`);
  const groups = new Map();
  for (const [index, comment] of comments.entries()) {
    if (comment.user?.login !== BOT_LOGIN) continue;
    const match = MARKER.exec(comment.body ?? "");
    if (!match) continue;
    const [, id, part, total, data] = match;
    const count = Number(total);
    const number = Number(part);
    if (!Number.isSafeInteger(count) || count < 1 || count > 1000 || number < 1 || number > count) continue;
    if (!groups.has(id)) groups.set(id, { count, parts: new Map(), index, url: comment.html_url });
    const group = groups.get(id);
    if (group.count !== count || group.parts.has(number)) continue;
    group.parts.set(number, data);
  }
  let latest = null;
  for (const group of groups.values()) {
    if (group.parts.size !== group.count) continue;
    try {
      const serialized = Array.from({ length: group.count }, (_, index) => group.parts.get(index + 1)).join("");
      const run = JSON.parse(Buffer.from(serialized, "base64").toString("utf8"));
      if (run.schema !== 1 || run.prNumber !== pull.number || run.headSha !== current.head?.sha ||
          !Array.isArray(run.findings) || !Array.isArray(run.reviewed) || !Array.isArray(run.unreviewed)) continue;
      if (!latest || group.index > latest.index) latest = { run, index: group.index, url: group.url };
    } catch { /* Ignore a malformed historical marker. */ }
  }
  return latest;
}

export async function readLatestRun(client, pull) {
  return (await latestRecord(client, pull))?.run ?? null;
}

export async function reconcileStatus(client, pull, run, dismissals = []) {
  const latest = await latestRecord(client, pull);
  const url = latest?.run.triggerRunId === run.triggerRunId && latest.run.headSha === run.headSha ? latest.url : undefined;
  await postStatuses(client, pull, run, statusFor(run, dismissals), url);
}
