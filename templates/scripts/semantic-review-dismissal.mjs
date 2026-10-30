// A dismissal is an accountable maintainer comment, scoped to one finding and one PR head.
import { readLatestRun, reconcileStatus } from "./semantic-review-ledger.mjs";

export function parseDismissal(text) {
  if (typeof text !== "string") return null;
  const match = /^\/ontology-dismiss ([a-f0-9]{64}) ([a-f0-9]{40}) ([\s\S]+)$/i.exec(text.trim());
  if (!match || !match[3].trim()) return null;
  return { findingId: match[1].toLowerCase(), headSha: match[2].toLowerCase(), reason: match[3].trim() };
}

async function isMaintainer(client, login) {
  if (!login) return false;
  try {
    const role = await client.get(`/collaborators/${encodeURIComponent(login)}/permission`);
    return ["owner", "admin", "maintain"].includes(role.role_name);
  } catch (error) {
    if (/returned 404/.test(String(error))) return false;
    throw error;
  }
}

export async function readDismissals(client, pull, run) {
  if (pull.head?.sha !== run.headSha) return [];
  const findings = new Set(run.findings.map((item) => item.id));
  const comments = await client.getAll(`/issues/${pull.number}/comments?per_page=100`);
  const roleCache = new Map();
  const result = [];
  for (const comment of comments) {
    const parsed = parseDismissal(comment.body);
    if (!parsed || parsed.headSha !== run.headSha || !findings.has(parsed.findingId)) continue;
    const author = comment.user?.login;
    if (!roleCache.has(author)) roleCache.set(author, await isMaintainer(client, author));
    if (roleCache.get(author)) result.push({ ...parsed, author });
  }
  return result;
}

export async function handleDismissal({ client, event }) {
  if (!event.issue?.pull_request || !Number.isInteger(event.issue.number) ||
      !["created", "edited", "deleted"].includes(event.action)) {
    return { handled: false, reason: "not a PR dismissal event" };
  }
  if (event.action === "created") {
    if (!parseDismissal(event.comment?.body)) return { handled: false, reason: "not a dismissal command" };
    if (!await isMaintainer(client, event.comment?.user?.login)) return { handled: false, reason: "not a maintainer" };
  }
  const pull = await client.get(`/pulls/${event.issue.number}`);
  const run = await readLatestRun(client, pull);
  if (!run) return { handled: false, reason: "no current semantic review run" };
  const dismissals = await readDismissals(client, pull, run);
  await reconcileStatus(client, pull, run, dismissals);
  return { handled: true, reason: "status reconciled" };
}
