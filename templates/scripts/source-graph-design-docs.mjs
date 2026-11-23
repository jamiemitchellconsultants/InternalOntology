export const BEHAVIOUR_IRI = /^:behaviour-([a-z0-9]+(?:-[a-z0-9]+)*)-B([1-9][0-9]*)$/;
export const DECISION_IRI = /^:decision-([0-9]{4})$/;
const REFERENCE = /^([a-z0-9]+(?:-[a-z0-9]+)*)#B([1-9][0-9]*)$/;
const DECLARATION = /^\s*(?:[-*]\s+)?\*\*B([1-9][0-9]*)(?: — |\. | )(.+?)\.?\*\*/;
const RETIRED_HEADING = /^(#{2,6})\s+Retired behaviours\s*$/i;
const REPLACED_BY = /replaced by (?:([a-z0-9-]+)#)?B([1-9][0-9]*)/i;

export const behaviourIri = (slug, id) => `:behaviour-${slug}-B${id}`;
export const decisionIri = (number) => `:decision-${number}`;

export function parseBehaviourReference(text) {
  const m = REFERENCE.exec(text);
  return m ? { slug: m[1], id: Number(m[2]) } : null;
}

export function readBehaviours(text, { lite = false } = {}) {
  const lines = text.split(/\r?\n/);
  const marks = [];
  let fenced = false, analyst = !lite, retiredDepth = 0;
  lines.forEach((line, i) => {
    if (line.startsWith("```")) { fenced = !fenced; return; }
    if (fenced) return;
    if (lite) {
      if (line === "## Analyst: behaviours") { analyst = true; return; }
      if (line.startsWith("## ")) analyst = false;
    }
    const heading = /^(#{1,6})\s/.exec(line);
    if (heading) {
      if (retiredDepth && heading[1].length <= retiredDepth) retiredDepth = 0;
      const retired = RETIRED_HEADING.exec(line);
      if (retired) retiredDepth = retired[1].length;
      marks.push({ i, heading: true });
      return;
    }
    const m = analyst && DECLARATION.exec(line);
    if (m) marks.push({ i, id: Number(m[1]), title: m[2], retired: retiredDepth > 0 });
  });
  const found = [];
  marks.forEach((mark, k) => {
    if (mark.heading) return;
    const end = k + 1 < marks.length ? marks[k + 1].i : lines.length;
    const replacement = mark.retired ? REPLACED_BY.exec(lines.slice(mark.i, end).join("\n")) : null;
    found.push({ id: mark.id, title: mark.title, line: mark.i + 1, retired: mark.retired, replacement: replacement ? Number(replacement[2]) : null, replacementSlug: replacement?.[1] ?? null });
  });
  return found;
}

export function behavioursFile(tree, slug) {
  const full = `docs/features/${slug}/02-behaviours.md`, lite = `docs/features/${slug}/feature.md`;
  const declares = (path, isLite) => tree.has(path) && readBehaviours(tree.text(path), { lite: isLite }).length > 0;
  const hasFull = declares(full, false), hasLite = declares(lite, true);
  if (hasFull && hasLite) return { path: null, lite: null, conflict: [full, lite] };
  if (hasFull) return { path: full, lite: false, conflict: null };
  if (hasLite) return { path: lite, lite: true, conflict: null };
  return null;
}

export function readDecision(tree, number) {
  const path = tree.paths().filter((p) => p.startsWith(`docs/adr/${number}-`) && p.endsWith(".md")).sort()[0];
  if (!path) return null;
  const lines = tree.text(path).split(/\r?\n/);
  let title = null, titleLine = null, status = null, statusLine = null, successor = null;
  lines.forEach((line, i) => {
    if (titleLine === null) {
      const m = /^# ([0-9]{4}) — (.+?)\s*$/.exec(line);
      if (m && m[1] === number) { title = m[2]; titleLine = i + 1; }
    }
    if (statusLine === null) {
      const m = /^- \*\*Status:\*\*\s*(.+?)\s*$/.exec(line);
      if (m) {
        status = m[1].split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, "") || null;
        statusLine = i + 1;
        successor = /superseded by (?:\[)?ADR ([0-9]{4})/i.exec(m[1])?.[1] ?? null;
      }
    }
  });
  return { path, number, title, titleLine, status, statusLine, successor };
}
