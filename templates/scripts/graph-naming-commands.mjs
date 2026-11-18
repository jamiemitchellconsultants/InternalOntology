// `/graph-naming` settlement commands (ADR 0021) and the pure fold that turns them into NamingSettlements.
import { createHash } from "node:crypto";

export const PERMITTED_ROLES = ["write", "maintain", "admin"];
const ACTIONS = { accept: "accepted", reject: "rejected", defer: "deferred" };
const TARGETS_HINT = "name R labels, such as R1 or R1,R3, or all";

export function parseCommand(body) {
  if (typeof body !== "string") return null;
  const [firstLine, ...later] = body.split(/\r?\n/);
  const first = firstLine.trim();
  const prefix = /^\/graph-naming(?=\s|$)/i.exec(first);
  if (!prefix) return null;
  const rest = first.slice(prefix[0].length).trim();
  if (!rest) return { invalid: "name an action: accept, reject or defer" };
  const verb = rest.split(/\s+/, 1)[0];
  const decision = ACTIONS[verb.toLowerCase()];
  if (!decision) return { invalid: `unknown action ${verb}; use accept, reject or defer` };
  const remainder = rest.slice(verb.length).trim();
  const match = /^(all|r\d+(?:\s*,\s*r\d+)*)(?=\s|$)/i.exec(remainder);
  if (!match) return { invalid: TARGETS_HINT };
  const targets = match[1].toLowerCase() === "all" ? "all"
    : [...new Set(match[1].split(",").map((label) => `R${Number(label.trim().slice(1))}`))];
  const text = [remainder.slice(match[0].length), ...later].join("\n").trim();
  if (decision === "rejected" && !text) return { invalid: "a rejection needs a reason" };
  return { decision, targets, text };
}

const hashOf = (body) => createHash("sha256").update(body).digest("hex");

export function applyCommands({ results, labels, commands, records }) {
  const present = new Set(commands.map((command) => String(command.id)));
  const kept = {};
  for (const [id, record] of Object.entries(structuredClone(records ?? {}))) if (present.has(id)) kept[id] = record;
  const current = new Set(results.map((result) => result.key));
  const keyByLabel = new Map(Object.entries(labels).map(([key, label]) => [label, key]));
  const settlements = new Map(), ignored = [], notCurrent = [];
  for (const command of commands) {
    const parsed = parseCommand(command.body);
    if (!parsed) continue;
    const ref = { id: command.id, author: command.author, url: command.url };
    if (parsed.invalid) { ignored.push({ ...ref, reason: parsed.invalid }); continue; }
    if (!command.permitted) { ignored.push({ ...ref, reason: command.reason ?? "author does not have write access" }); continue; }
    const hash = hashOf(command.body);
    let record = kept[command.id];
    if (!record || record.hash !== hash) {
      const keys = [], stale = [], unknown = [];
      if (parsed.targets === "all") {
        for (const result of results) if (!settlements.has(result.key)) keys.push(result.key);
      } else {
        for (const label of parsed.targets) {
          const key = keyByLabel.get(label);
          if (!key) unknown.push(label);
          else if (!current.has(key)) stale.push(label);
          else keys.push(key);
        }
      }
      record = { hash, decision: parsed.decision, targets: parsed.targets, keys, notCurrent: stale, unknown,
        issue: record?.issue ?? null, notices: record?.notices ?? [] };
      kept[command.id] = record;
    }
    for (const label of record.unknown) ignored.push({ ...ref, reason: `unknown label ${label}` });
    for (const label of record.notCurrent) notCurrent.push({ ...ref, label });
    if (record.targets === "all" && !record.keys.length) ignored.push({ ...ref, reason: "no unsettled results to settle" });
    for (const key of record.keys) {
      settlements.set(key, { decision: record.decision, author: command.author, text: parsed.text, commandId: command.id, url: command.url, issue: record.issue });
    }
  }
  return { records: kept, settlements, ignored, notCurrent };
}
