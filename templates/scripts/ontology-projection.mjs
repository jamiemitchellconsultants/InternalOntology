// Deterministic ontology projections for the semantic reviewer (ADRs 0026, 0027, 0030 and 0031).
// A projector maps (catalog, Markdown text) to { text, keys }: the ontology evidence one request
// carries, and the evidence keys whose rows it carries in full. No I/O and no model.

import { REQUEST_OVERHEAD } from "./semantic-review-model.mjs";

export const PROJECTION_MODES = ["matched", "full"];

// Fixed for every adopter (ADR 0027). Changing it changes every repository's requests.
export const STOP_WORDS = new Set(["data", "info", "item", "kind", "list", "name", "type", "value",
  "values", "state", "status", "record", "result", "config", "event", "events"]);

const HEADER = "# Canonical ontology evidence";

// Split at case changes ("RemovalStatus" -> "Removal Status", "HTTPServer" -> "HTTP Server"), then at
// anything that is not a letter or digit, and lowercase.
function splitWords(text) {
  return text
    .replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, "$1 $2")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

export function markdownWords(text) {
  return new Set(splitWords(text));
}

export function nameWords(name) {
  return [...new Set(splitWords(name))].filter((word) => word.length >= 4 && !STOP_WORDS.has(word));
}

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const cells = (row) => row.split("|").slice(1, -1).map((cell) => cell.trim());

function wholeWord(phrase, flags) {
  const pattern = phrase.trim().split(/\s+/u).map(escape).join("\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, `u${flags}`);
}

function wordsOf(group) {
  const words = nameWords(group.name);
  if (group.section === "Enums") {
    for (const row of group.rows) words.push(...nameWords(cells(row)[1] ?? ""));
  }
  return [...new Set(words)];
}

// The grouped name index (B24, ADR 0031): one line per section, names in ontology order.
function groupedNameIndex(catalog) {
  const lines = [];
  let section = null;
  for (const group of catalog.groups.values()) {
    if (group.section === section) lines[lines.length - 1] += `, ${group.name}`;
    else lines.push(`${(section = group.section)}: ${group.name}`);
  }
  const example = catalog.groups.keys().next().value;
  const explanation = "Each key is a section name, a colon, and one name listed under it";
  const help = example === undefined ? `${explanation}.` : `${explanation}, for example ${example}.`;
  return ["", "", "## Evidence keys", "", help, "", ...lines].join("\n");
}

// Built once per catalog and projector (ADR 0030). Every selection and size comes from here.
function buildIndex(catalog, bannedAliases) {
  const order = new Map([...catalog.groups.keys()].map((key, position) => [key, position]));
  const byWord = new Map();
  const byName = new Map();
  for (const [key, group] of catalog.groups) {
    for (const word of wordsOf(group)) {
      if (!byWord.has(word)) byWord.set(word, []);
      byWord.get(word).push(key);
    }
    if (!byName.has(group.name)) byName.set(group.name, []);
    byName.get(group.name).push(key);
  }
  // Names without whitespace cannot match across a line break, so a unit's matches are the chunk's.
  const names = [];
  const phrases = [];
  for (const [name, keys] of byName) {
    const matcher = { probe: name.trim().split(/\s+/u)[0], pattern: wholeWord(name, ""), keys };
    (/\s/u.test(name.trim()) ? phrases : names).push(matcher);
  }
  for (const alias of bannedAliases) {
    phrases.push({ probe: "", pattern: wholeWord(alias.phrase, "i"), keys: alias.nameInstead.flatMap((name) => byName.get(name) ?? []) });
  }
  const relationshipsOf = new Map();
  for (const relationship of catalog.relationships ?? []) {
    for (const end of [relationship.from, relationship.to]) {
      if (!relationshipsOf.has(end)) relationshipsOf.set(end, new Set());
      relationshipsOf.get(end).add(relationship.evidenceKey);
    }
  }
  const groupChars = new Map();
  for (const [key, group] of catalog.groups) groupChars.set(key, group.rows.reduce((sum, row) => sum + row.length + 1, 0));
  const indexText = groupedNameIndex(catalog);
  return { catalog, order, byWord, names, phrases, relationshipsOf, groupChars, indexText,
    emptyChars: HEADER.length + indexText.length };
}

const addAll = (target, keys) => { for (const key of keys) target.add(key); return target; };

// Matches that never span a line break: name words, enum value words and names without whitespace.
function unitMatches(index, text) {
  const found = new Set();
  for (const word of markdownWords(text)) {
    for (const candidate of [word, word.endsWith("s") && word.slice(0, -1), word.endsWith("es") && word.slice(0, -2)]) {
      if (candidate) addAll(found, index.byWord.get(candidate) ?? []);
    }
  }
  for (const name of index.names) if (text.includes(name.probe) && name.pattern.test(text)) addAll(found, name.keys);
  return found;
}

// Matches that can span a break: banned-alias phrases and names with whitespace (B6).
function phraseMatches(index, text, found) {
  for (const phrase of index.phrases) if ((!phrase.probe || text.includes(phrase.probe)) && phrase.pattern.test(text)) addAll(found, phrase.keys);
  return found;
}

// B7: each base entry adds the relationships whose domain or range it is, and nothing else.
function withRelationships(index, base) {
  const selected = new Set(base);
  for (const key of base) addAll(selected, index.relationshipsOf.get(index.catalog.groups.get(key).name) ?? []);
  return selected;
}

function select(index, text) {
  return withRelationships(index, phraseMatches(index, text, unitMatches(index, text)));
}

const ordered = (index, selected) => [...selected].sort((a, b) => index.order.get(a) - index.order.get(b));

function render(index, selected) {
  const output = [HEADER];
  let section = null;
  for (const key of ordered(index, selected)) {
    const group = index.catalog.groups.get(key);
    if (group.section !== section) output.push("", `## ${(section = group.section)}`);
    output.push(...group.rows);
  }
  return output.join("\n") + index.indexText;
}

// The rendered length of a selection's projection, without rendering it.
function charsOf(index, selected) {
  let chars = index.emptyChars;
  const sections = new Set();
  for (const key of selected) {
    chars += index.groupChars.get(key);
    sections.add(index.catalog.groups.get(key).section);
  }
  for (const section of sections) chars += section.length + 5;
  return chars;
}

// Units keep their line endings, so a file's units concatenate back to its text.
function splitLines(text, offset) {
  const units = [];
  for (const match of text.matchAll(/[^\n]*(?:\n|$)/g)) {
    if (match[0] === "") continue;
    units.push({ offset: offset + match.index, text: match[0] });
  }
  return units;
}

function splitParagraphs(text) {
  const units = [];
  for (const line of splitLines(text, 0)) {
    const blank = !line.text.trim();
    const last = units.at(-1);
    if (last && (blank || !last.closed)) {
      last.text += line.text;
      if (blank) last.closed = true;
    } else {
      units.push({ offset: line.offset, text: line.text, closed: blank });
    }
  }
  return units;
}

function cutLine(unit, size) {
  const pieces = [];
  const text = unit.text;
  for (let start = 0; start < text.length;) {
    let end = Math.min(text.length, start + size);
    if (end < text.length) {
      let space = end - 1;
      while (space > start && !/\s/u.test(text[space])) space--;
      if (space > start) end = space + 1;
      else if (/[\uD800-\uDBFF]/.test(text[end - 1]) && /[\uDC00-\uDFFF]/.test(text[end])) end = end - 1 > start ? end - 1 : end + 1;
    }
    pieces.push({ offset: unit.offset + start, text: text.slice(start, end) });
    start = end;
  }
  return pieces;
}

const nameIndexReason = (chars, budget) =>
  `ontology name index too large for the configured budget (name index ${chars} characters, budget ${budget}; raise ONTOLOGY_MAX_REQUEST_CHARS)`;
const lineReason = (offset, chars, budget) =>
  `line at offset ${offset} selects too much of the ontology for the configured budget (projection ${chars} characters, budget ${budget}; raise ONTOLOGY_MAX_REQUEST_CHARS)`;

class LineTooLarge extends Error {}

function planFile(index, file, maxRequestChars) {
  const room = maxRequestChars - REQUEST_OVERHEAD - file.path.length;
  const chunks = [];
  let current = null;
  const finish = (chunk, selected) => {
    chunks.push({ path: file.path, offset: chunk.offset, text: chunk.text, keys: ordered(index, selected), chars: charsOf(index, selected) });
  };
  const flush = () => {
    if (current) finish(current, current.selected);
    current = null;
  };
  const tryAdd = (unit) => {
    const text = current ? current.text + unit.text : unit.text;
    const found = current ? addAll(new Set(current.found), unit.found) : new Set(unit.found);
    const selected = withRelationships(index, phraseMatches(index, text, new Set(found)));
    if (charsOf(index, selected) + text.length > room) return false;
    current = { offset: current ? current.offset : unit.offset, text, found, selected };
    return true;
  };
  const placePiece = (piece, lineOffset) => {
    const selected = select(index, piece.text);
    const chars = charsOf(index, selected);
    if (chars + piece.text.length <= room) {
      finish(piece, selected);
      return;
    }
    const firstWidth = piece.text.codePointAt(0) > 0xffff ? 2 : 1;
    if (piece.text.length === firstWidth) {
      throw new LineTooLarge(lineReason(lineOffset, chars, maxRequestChars));
    }
    for (const part of cutLine(piece, Math.ceil(piece.text.length / 2))) placePiece(part, lineOffset);
  };
  const place = (unit, isLine) => {
    unit.found = unitMatches(index, unit.text);
    if (tryAdd(unit)) return;
    flush();
    if (tryAdd(unit)) return;
    if (!isLine) {
      for (const line of splitLines(unit.text, unit.offset)) place(line, true);
      return;
    }
    const chars = charsOf(index, select(index, unit.text));
    if (room - chars < 1) throw new LineTooLarge(lineReason(unit.offset, chars, maxRequestChars));
    for (const piece of cutLine(unit, room - chars)) placePiece(piece, unit.offset);
  };
  for (const paragraph of splitParagraphs(file.text)) place(paragraph, false);
  flush();
  return chunks;
}

export function createProjector({ mode = "matched", bannedAliases = [] } = {}) {
  if (!PROJECTION_MODES.includes(mode)) throw new Error(`unknown projection mode: ${JSON.stringify(mode)}`);
  if (mode === "full") return Object.assign((catalog) => ({ text: catalog.projection, keys: [...catalog.evidenceKeys] }), { mode });
  const indexes = new WeakMap();
  const indexFor = (catalog) => {
    if (!indexes.has(catalog)) indexes.set(catalog, buildIndex(catalog, bannedAliases));
    return indexes.get(catalog);
  };
  const project = (catalog, text) => {
    const index = indexFor(catalog);
    const selected = select(index, text);
    return { text: render(index, selected), keys: ordered(index, selected) };
  };
  const plan = (catalog, files, maxRequestChars) => {
    const index = indexFor(catalog);
    const chunks = [];
    const unreviewed = [];
    for (const file of files) {
      if (REQUEST_OVERHEAD + file.path.length + index.emptyChars >= maxRequestChars) {
        unreviewed.push({ path: file.path, code: "too-large", reason: nameIndexReason(index.emptyChars, maxRequestChars) });
        continue;
      }
      if (file.text.length === 0) {
        chunks.push({ path: file.path, offset: 0, text: "", keys: [], chars: index.emptyChars });
        continue;
      }
      try {
        for (const chunk of planFile(index, file, maxRequestChars)) {
          chunks.push(chunk);
        }
      } catch (error) {
        if (!(error instanceof LineTooLarge)) throw error;
        unreviewed.push({ path: file.path, code: "too-large", reason: error.message });
      }
    }
    return { chunks, unreviewed };
  };
  return Object.assign(project, { mode, plan });
}
