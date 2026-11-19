// Deterministic ontology projections for the semantic reviewer (ADR 0026, ADR 0027).
// A projector maps (catalog, Markdown text) to { text, keys }: the ontology evidence one request
// carries, and the evidence keys whose rows it carries in full. No I/O and no model.

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
const unticked = (cell) => (cell ?? "").replace(/^`|`$/g, "");

function wholeWord(text, phrase, flags) {
  const pattern = phrase.trim().split(/\s+/u).map(escape).join("\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, `u${flags}`).test(text);
}

function wordsOf(group) {
  const words = nameWords(group.name);
  if (group.section === "Enums") {
    for (const row of group.rows) words.push(...nameWords(cells(row)[1] ?? ""));
  }
  return [...new Set(words)];
}

function hasWord(words, word) {
  return words.has(word) || words.has(`${word}s`) || words.has(`${word}es`);
}

function keysNamed(catalog, name) {
  const keys = [];
  for (const [key, group] of catalog.groups) if (group.name === name) keys.push(key);
  return keys;
}

function selectEntries(catalog, text, bannedAliases = []) {
  const words = markdownWords(text);
  const base = new Set();
  for (const [key, group] of catalog.groups) {
    if (wholeWord(text, group.name, "") || wordsOf(group).some((word) => hasWord(words, word))) base.add(key);
  }
  for (const alias of bannedAliases) {
    if (!wholeWord(text, alias.phrase, "i")) continue;
    for (const name of alias.nameInstead) for (const key of keysNamed(catalog, name)) base.add(key);
  }
  const selected = new Set(base);
  const baseNames = new Set([...base].map((key) => catalog.groups.get(key).name));
  for (const key of base) {
    for (const row of catalog.groups.get(key).rows) {
      for (const match of row.matchAll(/`([^`]+)`/g)) for (const named of keysNamed(catalog, match[1].trim())) selected.add(named);
    }
  }
  for (const [key, group] of catalog.groups) {
    if (group.section !== "Relationships") continue;
    for (const row of group.rows) {
      const from = group.name;
      const to = unticked(cells(row)[2]);
      if (!baseNames.has(from) && !baseNames.has(to)) continue;
      selected.add(key);
      for (const named of [...keysNamed(catalog, from), ...keysNamed(catalog, to)]) selected.add(named);
    }
  }
  return selected;
}

function nameIndex(catalog) {
  return ["", "", "## Evidence keys", "", ...[...catalog.evidenceKeys].map((key) => `- ${key}`)].join("\n");
}

function renderProjection(catalog, selected) {
  const output = [HEADER];
  let section = null;
  for (const [key, group] of catalog.groups) {
    if (!selected.has(key)) continue;
    if (group.section !== section) {
      section = group.section;
      output.push("", `## ${section}`);
    }
    output.push(...group.rows);
  }
  return output.join("\n") + nameIndex(catalog);
}

export function createProjector({ mode = "matched", bannedAliases = [] } = {}) {
  if (!PROJECTION_MODES.includes(mode)) throw new Error(`unknown projection mode: ${JSON.stringify(mode)}`);
  const project = mode === "full"
    ? (catalog) => ({ text: catalog.projection, keys: [...catalog.evidenceKeys] })
    : (catalog, text) => {
      const selected = selectEntries(catalog, text, bannedAliases);
      return { text: renderProjection(catalog, selected), keys: [...catalog.groups.keys()].filter((key) => selected.has(key)) };
    };
  return Object.assign(project, { mode });
}
