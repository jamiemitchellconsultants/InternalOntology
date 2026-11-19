// GraphNamingPublisher: one summary comment with a bot-written ledger, deferral issues and the fixed status (ADR 0022).
import { applyCommands, parseCommand, PERMITTED_ROLES } from "./graph-naming-commands.mjs";
import { readPermission } from "./graph-naming-github.mjs";

export const STATUS_CONTEXT = "ontology/graph-naming";
export const DEFERRED_LABEL = "graph-naming-deferred";
export const BOT_LOGIN = "github-actions[bot]";
export const MARKER_PREFIX = "<!-- ontology-graph-naming v1 data=";
const MARKER = /^<!-- ontology-graph-naming v1 data=([A-Za-z0-9+/=]+) -->$/;

export function emptyLedger(prNumber) {
  return { schema: 1, prNumber, run: null, labels: {}, next: 1, commands: {} };
}

export function encodeLedger(ledger) {
  return `${MARKER_PREFIX}${Buffer.from(JSON.stringify(ledger), "utf8").toString("base64")} -->`;
}

function decodeLedger(comment, prNumber) {
  if (comment?.user?.login !== BOT_LOGIN) return null;
  const match = MARKER.exec(String(comment.body ?? "").trimEnd().split("\n").at(-1));
  if (!match) return null;
  try {
    const ledger = JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
    const valid = ledger?.schema === 1 && ledger.prNumber === prNumber && Number.isInteger(ledger.next) &&
      ledger.labels && typeof ledger.labels === "object" && ledger.commands && typeof ledger.commands === "object";
    return valid ? ledger : null;
  } catch { return null; }
}

export function readLedger(comments, prNumber) {
  for (const comment of [...comments].sort((a, b) => a.id - b.id)) {
    const ledger = decodeLedger(comment, prNumber);
    if (ledger) return { ledger, comment };
  }
  return { ledger: emptyLedger(prNumber), comment: null };
}

export async function loadLedger(client, pull) {
  return readLedger(await client.getAll(`/issues/${pull.number}/comments?per_page=100`), pull.number);
}

export function assignLabels(ledger, results) {
  const added = [];
  for (const result of results) {
    if (Object.hasOwn(ledger.labels, result.key)) continue;
    ledger.labels[result.key] = `R${ledger.next++}`;
    added.push(result.key);
  }
  return added;
}

export function countResults(run, settlements) {
  const counts = { unsettled: [], accepted: [], rejected: [], deferred: [] };
  for (const result of run?.results ?? []) {
    const decision = settlements.get(result.key)?.decision;
    counts[decision ?? "unsettled"].push(result);
  }
  return counts;
}

export function statusFor(run, counts) {
  const [u, a, r, d] = [counts.unsettled.length, counts.accepted.length, counts.rejected.length, counts.deferred.length];
  if (u || a) return { state: "failure", description: `${u} unsettled, ${a} accepted awaiting correction; ${r} rejected, ${d} deferred` };
  if (r || d) return { state: "success", description: `Graph naming: no result holds the merge (${r} rejected, ${d} deferred)` };
  switch (run.outcome) {
    case "reviewed": return { state: "success", description: `Graph naming reviewed ${run.reviewed} node(s); no results` };
    case "partial": return { state: "success", description: `Partial graph naming review; ${run.unreviewedCount} node(s) not reviewed` };
    case "unavailable": return { state: "success", description: "Graph naming not reviewed: service or configuration unavailable" };
    case "too-large": return { state: "success", description: "Graph naming not reviewed: ontology too large for the configured budget (raise ONTOLOGY_MAX_REQUEST_CHARS)" };
    case "disabled": return { state: "success", description: "Graph naming review disabled; not reviewed" };
    case "out-of-scope": return { state: "success", description: "Graph naming not reviewed: PR is out of scope" };
    case "no-eligible": return { state: "success", description: "Graph naming: no eligible graph or ontology changes" };
    default: throw new Error("Unknown graph naming outcome");
  }
}

// Kept in step with semantic-review-worker.mjs's newerRun, which is private to the semantic reviewer.
export function isNewerTrigger(left, right) {
  if (left == null) return false;
  const a = String(left).split(":").map(Number), b = String(right).split(":").map(Number);
  return Number.isFinite(a[0]) && Number.isFinite(b[0]) && (a[0] > b[0] || a[0] === b[0] && (a[1] ?? 0) > (b[1] ?? 0));
}

export async function publishPending(client, pull) {
  for (const sha of [pull.head.sha, ...(pull.merge_commit_sha && pull.merge_commit_sha !== pull.head.sha ? [pull.merge_commit_sha] : [])]) {
    await client.post(`/statuses/${sha}`, { state: "pending", description: "Graph naming review in progress", context: STATUS_CONTEXT });
  }
}

// A run with nothing to show, such as a repository that has not opted in, gets a status and no comment (B34).
export async function publishStatusOnly(client, pull, run) {
  const current = await client.get(`/pulls/${pull.number}`);
  if (current.head?.sha !== run.headSha) return { published: false, newKeys: [] };
  const status = statusFor(run, countResults(run, new Map()));
  const targets = [run.headSha];
  if (run.mergeSha && current.merge_commit_sha === run.mergeSha && run.mergeSha !== run.headSha) targets.push(run.mergeSha);
  for (const sha of targets) await client.post(`/statuses/${sha}`, { ...status, context: STATUS_CONTEXT });
  return { published: true, newKeys: [] };
}

const display = (value) => String(value).replaceAll("<!--", "&lt;!--");
const labelNumber = (label) => Number(String(label).slice(1));

function resultLines(result) {
  return [
    `- Node: \`${display(result.node)}\` in \`${display(result.file)}\``,
    result.type === "synonym" ? `- Compared: label ${display(JSON.stringify(result.label))} (synonym)`
      : `- Compared: label ${display(JSON.stringify(result.label))} with \`${display(result.value)}\` (${result.type})`,
    `- Ontology item: \`${display(result.ontologyKey)}\``,
    `- Reason: ${display(result.reason)}`,
    `- Suggested correction: ${display(result.suggestion)}`,
  ];
}

function stateOf(settlement) {
  if (!settlement) return "unsettled";
  if (settlement.decision === "accepted") return `accepted by @${settlement.author}, awaiting correction`;
  if (settlement.decision === "rejected") return `rejected by @${settlement.author}: ${display(settlement.text)}`;
  return `deferred by @${settlement.author}${settlement.issue ? ` to #${settlement.issue}` : ""}${settlement.text ? ` (note: ${display(settlement.text)})` : ""}`;
}

const OUTCOME_NOTES = {
  unavailable: "Graph naming did not run; this result permits merge.",
  disabled: "Graph naming did not run; this result permits merge.",
  "out-of-scope": "Graph naming did not run; this result permits merge.",
  "too-large": "Graph naming did not run because the ontology is too large for the configured budget; this result permits merge. Raise the ONTOLOGY_MAX_REQUEST_CHARS repository variable.",
  partial: "Coverage is incomplete; only unsettled or accepted results block merge.",
};

export function renderSummary({ ledger, run, counts, settlements, ignored, notCurrent, openDeferrals, deferralsUrl }) {
  const byLabel = (a, b) => labelNumber(ledger.labels[a.key]) - labelNumber(ledger.labels[b.key]);
  const holding = [...counts.unsettled, ...counts.accepted].sort(byLabel);
  const lines = [
    `## Graph naming review — ${run.outcome}`, "",
    `Revision \`${run.headSha.slice(0, 7)}\` · compared ${run.compared} node(s); reviewed ${run.reviewed}; not reviewed ${run.unreviewedCount}; ${run.prefiltered} name(s) already contain their canonical term.`, "",
    holding.length ? `${holding.length} result(s) hold the merge: ${holding.map((r) => ledger.labels[r.key]).join(", ")}.` : "No result holds the merge.",
  ];
  for (const result of [...run.results].sort(byLabel)) {
    const label = ledger.labels[result.key];
    lines.push("", `### ${label} — ${stateOf(settlements.get(result.key))}`, ...resultLines(result),
      `- Settle: \`/graph-naming accept ${label}\` · \`/graph-naming reject ${label} <reason>\` · \`/graph-naming defer ${label} <optional note>\``);
  }
  if (run.unreviewed.length) {
    lines.push("", "### Not reviewed", ...run.unreviewed.map((item) => `- \`${display(item.node)}\` — ${display(item.reason)}`));
    if (run.unreviewedCount > run.unreviewed.length) lines.push(`- and ${run.unreviewedCount - run.unreviewed.length} more`);
  }
  if (ignored.length || notCurrent.length) {
    lines.push("", "### Commands",
      ...ignored.map((item) => `- [Command](${item.url}) by @${item.author} was ignored: ${display(item.reason)}`),
      ...notCurrent.map((item) => `- [Command](${item.url}) by @${item.author}: ${item.label} is no longer current`));
  }
  if (OUTCOME_NOTES[run.outcome]) lines.push("", OUTCOME_NOTES[run.outcome]);
  lines.push("", `Open deferral issues: ${openDeferrals} — [list](${deferralsUrl})`, "",
    "Settle every unsettled result at once with `/graph-naming accept all`, `/graph-naming reject all <reason>` or `/graph-naming defer all <optional note>`.",
    "Anyone with write access may settle a result; agents never settle results.");
  return lines.join("\n");
}

const byCreation = (a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id - b.id);

async function ensureLabel(client) {
  try { await client.get(`/labels/${DEFERRED_LABEL}`); }
  catch (error) {
    if (!/returned 404/.test(String(error))) throw error;
    await client.post("/labels", { name: DEFERRED_LABEL, color: "c5def5", description: "Deferred graph naming results awaiting review" });
  }
}

export async function publishState({ client, pull, run = null, readRole = readPermission }) {
  const current = await client.get(`/pulls/${pull.number}`);
  if (run && current.head?.sha !== run.headSha) return { published: false, newKeys: [] };
  const comments = await client.getAll(`/issues/${pull.number}/comments?per_page=100`);
  const { ledger, comment: summary } = readLedger(comments, pull.number);
  const newKeys = run ? (ledger.run = run, assignLabels(ledger, run.results)) : [];
  if (!ledger.run) return { published: false, newKeys: [] };
  const latest = ledger.run;

  const roles = new Map(), commands = [];
  for (const comment of [...comments].sort(byCreation)) {
    const login = comment.user?.login;
    if (login === BOT_LOGIN || parseCommand(comment.body) === null) continue;
    if (!roles.has(login)) {
      try { roles.set(login, { permitted: PERMITTED_ROLES.includes(await readRole(client, login)) }); }
      catch { roles.set(login, { permitted: false, reason: "author permission could not be checked" }); }
    }
    commands.push({ id: comment.id, author: login, url: comment.html_url, body: comment.body, ...roles.get(login) });
  }
  const { records, settlements, ignored, notCurrent } = applyCommands({ results: latest.results, labels: ledger.labels, commands, records: ledger.commands });
  ledger.commands = records;

  const repoUrl = current.base?.repo?.html_url ?? pull.base?.repo?.html_url;
  const pullUrl = `${repoUrl}/pull/${pull.number}`;
  const blob = (path) => `${repoUrl}/blob/${latest.headSha}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const resultByKey = new Map(latest.results.map((result) => [result.key, result]));
  let labelReady = false;
  const created = new Set();
  for (const command of commands) {
    const record = records[command.id];
    if (!record || record.decision !== "deferred" || record.issue || !record.keys.length) continue;
    const deferred = record.keys.map((key) => resultByKey.get(key)).filter(Boolean);
    if (!deferred.length) continue;
    if (!labelReady) { await ensureLabel(client); labelReady = true; }
    const { text } = parseCommand(command.body);
    const body = [`Deferred from ${pullUrl} at \`${latest.headSha}\` by @${command.author}.`, ...(text ? [`Note: ${display(text)}`] : []),
      ...deferred.flatMap((result) => ["", `### ${ledger.labels[result.key]}`, ...resultLines(result),
        `- Turtle: ${blob(result.file)}`, ...result.evidence.map((path) => `- Evidence: ${blob(path)}`)])].join("\n");
    const issue = await client.post("/issues", { title: `Deferred graph naming results from #${pull.number}: ${deferred.map((r) => ledger.labels[r.key]).join(", ")}`,
      body, labels: [DEFERRED_LABEL] });
    record.issue = issue.number;
    created.add(issue.number);
    for (const key of record.keys) { const settlement = settlements.get(key); if (settlement?.commandId === command.id) settlement.issue = issue.number; }
  }
  for (const command of commands) {
    const record = records[command.id];
    if (!record || record.decision !== "deferred" || !record.issue) continue;
    const replacing = new Map();
    for (const key of record.keys) {
      const settlement = settlements.get(key);
      if (!settlement || settlement.commandId === command.id || settlement.decision === "deferred" || record.notices.includes(settlement.commandId)) continue;
      if (!replacing.has(settlement.commandId)) replacing.set(settlement.commandId, { settlement, labels: [] });
      replacing.get(settlement.commandId).labels.push(ledger.labels[key]);
    }
    for (const [commandId, { settlement, labels }] of replacing) {
      const reason = settlement.decision === "rejected" ? `. Reason: ${display(settlement.text)}` : "";
      await client.post(`/issues/${record.issue}/comments`, { body:
        `${labels.join(", ")} ${labels.length > 1 ? "were" : "was"} ${settlement.decision} by @${settlement.author} on ${pullUrl}: ${settlement.url}${reason}` });
      record.notices.push(commandId);
    }
  }

  // GitHub's issue list can lag behind an issue this run just created, so count those too (#132).
  const listed = (await client.getAll(`/issues?state=open&labels=${DEFERRED_LABEL}&per_page=100`)).filter((issue) => !issue.pull_request);
  const open = new Set([...listed.map((issue) => issue.number), ...created]).size;
  const counts = countResults(latest, settlements);
  const body = `${renderSummary({ ledger, run: latest, counts, settlements, ignored, notCurrent, openDeferrals: open,
    deferralsUrl: `${repoUrl}/issues?q=is%3Aissue+is%3Aopen+label%3A${DEFERRED_LABEL}` })}\n\n${encodeLedger(ledger)}`;
  const published = summary ? await client.patch(`/issues/comments/${summary.id}`, { body })
    : await client.post(`/issues/${pull.number}/comments`, { body });
  if (run && newKeys.length) {
    await client.post(`/issues/${pull.number}/comments`, { body: `Graph naming review found ${newKeys.length} new result(s) ` +
      `(${newKeys.map((key) => ledger.labels[key]).join(", ")}) on ${run.headSha.slice(0, 7)}. Settle them from the summary: ${published.html_url}` });
  }
  if (latest.headSha === current.head?.sha) {
    const status = statusFor(latest, counts);
    const targets = [latest.headSha];
    if (latest.mergeSha && current.merge_commit_sha === latest.mergeSha && latest.mergeSha !== latest.headSha) targets.push(latest.mergeSha);
    for (const sha of targets) await client.post(`/statuses/${sha}`, { ...status, context: STATUS_CONTEXT, target_url: published.html_url });
  }
  return { published: true, newKeys };
}
