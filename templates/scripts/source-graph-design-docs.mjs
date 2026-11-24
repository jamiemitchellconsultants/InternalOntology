export const BEHAVIOUR_IRI = /^:behaviour-([a-z0-9]+(?:-[a-z0-9]+)*)-B([1-9][0-9]*)$/;
export const DECISION_IRI = /^:decision-([0-9]{4})$/;
const REFERENCE = /^([a-z0-9]+(?:-[a-z0-9]+)*)#B([1-9][0-9]*)$/;
const DECLARATION = /^\s*(?:[-*]\s+)?\*\*B([1-9][0-9]*)(?: — |\. | )/;
const RETIRED_HEADING = /^(#{2,6})\s+Retired behaviours\s*$/i;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const QUIET_HEADING = /^#{1,6}\s+(?:Uncertainties|Terms)\s*$/i;
const REPLACED_BY = /replaced by (?:([a-z0-9-]+)#)?B([1-9][0-9]*)/i;

export const behaviourIri = (slug, id) => `:behaviour-${slug}-B${id}`;
export const decisionIri = (number) => `:decision-${number}`;

export function parseBehaviourReference(text) {
  const m = REFERENCE.exec(text);
  return m ? { slug: m[1], id: Number(m[2]) } : null;
}

function declaration(line) {
  const m = DECLARATION.exec(line);
  if (!m) return null;
  const rest = line.slice(m[0].length);
  let depth = 1, last = -1;
  const finish = (j) => {
    const raw = rest.slice(0, j), title = raw.length > 1 && raw.endsWith(".") ? raw.slice(0, -1) : raw;
    return title ? { id: Number(m[1]), title } : null;
  };
  for (let j = rest.indexOf("**"); j !== -1; j = rest.indexOf("**", j + 2)) {
    const opens = (j === 0 || /\s/.test(rest[j - 1])) && j + 2 < rest.length && !/\s/.test(rest[j + 2]);
    depth += opens ? 1 : -1;
    last = j;
    if (depth === 0) return finish(j);
  }
  return last === -1 ? null : finish(last);
}

export function readBehaviours(text, { lite = false } = {}) {
  const lines = text.split(/\r?\n/);
  const marks = [], fencedLines = new Set();
  let fence = null, analyst = !lite, retiredDepth = 0, quietDepth = 0;
  lines.forEach((line, i) => {
    const f = FENCE.exec(line);
    if (fence) {
      fencedLines.add(i);
      if (f && f[1][0] === fence.char && f[1].length >= fence.length) fence = null;
      return;
    }
    if (f) { fence = { char: f[1][0], length: f[1].length }; fencedLines.add(i); return; }
    const heading = /^(#{1,6})\s/.exec(line);
    if (lite) {
      if (line === "## Analyst: behaviours") analyst = true;
      else if (line.startsWith("## ") && !(analyst && RETIRED_HEADING.test(line))) analyst = false;
    }
    if (heading) {
      const depth = heading[1].length;
      if (retiredDepth && depth <= retiredDepth) retiredDepth = 0;
      if (quietDepth && depth <= quietDepth) quietDepth = 0;
      const retired = RETIRED_HEADING.exec(line);
      if (retired && (!lite || analyst)) retiredDepth = depth;
      if (QUIET_HEADING.test(line)) quietDepth = depth;
      marks.push({ i, heading: true });
      return;
    }
    const d = analyst && !quietDepth && declaration(line);
    if (d) marks.push({ i, id: d.id, title: d.title, retired: retiredDepth > 0 });
  });
  const found = [];
  marks.forEach((mark, k) => {
    if (mark.heading) return;
    const end = k + 1 < marks.length ? marks[k + 1].i : lines.length;
    const entry = mark.retired ? lines.slice(mark.i, end).filter((_, n) => !fencedLines.has(mark.i + n)).join("\n") : "";
    const replacement = mark.retired ? REPLACED_BY.exec(entry) : null;
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
  const matches = tree.paths().filter((p) => p.startsWith(`docs/adr/${number}-`) && p.endsWith(".md") && !p.slice(`docs/adr/${number}-`.length).includes("/")).sort();
  const [path, ...duplicates] = matches;
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
        successor = /superseded by \[?ADR ([0-9]{4})(?![0-9])/i.exec(m[1])?.[1] ?? null;
      }
    }
  });
  return { path, number, title, titleLine, status, statusLine, successor, duplicates };
}
