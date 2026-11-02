export const GRAPH_PREFIXES = { kit: "https://ontology-kit.dev/schema#", rdfs: "http://www.w3.org/2000/01/rdf-schema#" };

export class GraphTurtleError extends Error {
  constructor(file, line, rule) {
    super(`${file}:${line}: ${rule}`);
    this.file = file;
    this.line = line;
    this.rule = rule;
  }
}

const iriPattern = /^(?::|kit:|rdfs:)[A-Za-z0-9_][A-Za-z0-9_-]*$/;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export function parseGraphTurtle(text, file = "<graph>") {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const fail = (line, rule) => { throw new GraphTurtleError(file, line, rule); };
  const first = /^@prefix : <([^<>\s]+)> \.$/.exec(lines[0] ?? "");
  if (!first) fail(1, "expected default prefix");
  const namespace = first[1];
  for (const [index, prefix] of ["kit", "rdfs"].entries()) {
    if (lines[index + 1] !== `@prefix ${prefix}: <${GRAPH_PREFIXES[prefix]}> .`) fail(index + 2, "expected fixed prefix");
  }
  const blocks = [];
  let current = null;
  let ended = true;
  for (let i = 3; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    if (/^[^\s]/.test(raw)) {
      if (!ended) fail(i + 1, "unfinished block");
      const m = /^(\S+)\s+a\s+(\S+)\s*([;.])\s*$/.exec(raw);
      if (!m || !iriPattern.test(m[1]) || !iriPattern.test(m[2])) fail(i + 1, "invalid subject or class");
      current = { subject: m[1], type: m[2], line: i + 1, pairs: [] };
      blocks.push(current);
      ended = m[3] === ".";
      continue;
    }
    if (!current || ended) fail(i + 1, "unexpected predicate");
    const m = /^\s+(\S+)\s+(.+?)\s*([;.])\s*$/.exec(raw);
    if (!m || !iriPattern.test(m[1])) fail(i + 1, "invalid predicate");
    const token = m[2];
    let object, objectType;
    if (iriPattern.test(token)) { object = token; objectType = "iri"; }
    else if (/^(0|[1-9][0-9]*)$/.test(token)) { object = Number(token); objectType = "integer"; }
    else if (/^"(?:[^"\\\x00-\x1f]|\\[\\"n])*"$/.test(token)) {
      object = token.slice(1, -1).replace(/\\([\\"n])/g, (_, c) => c === "n" ? "\n" : c);
      objectType = "string";
    } else fail(i + 1, "invalid object");
    current.pairs.push({ predicate: m[1], object, objectType, line: i + 1 });
    ended = m[3] === ".";
  }
  if (!ended) fail(lines.length, "unfinished block");
  return { namespace, blocks };
}

function token(pair) {
  if (pair.objectType === "string") return `"${pair.object.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
  return String(pair.object);
}

export function formatGraphTurtle({ namespace, blocks }) {
  let result = `@prefix : <${namespace}> .\n@prefix kit: <${GRAPH_PREFIXES.kit}> .\n@prefix rdfs: <${GRAPH_PREFIXES.rdfs}> .\n`;
  for (const block of [...blocks].sort((a, b) => compare(a.subject, b.subject))) {
    const pairs = [...block.pairs].sort((a, b) => compare(a.predicate, b.predicate) || compare(token(a), token(b)));
    result += `\n${block.subject} a ${block.type} ${pairs.length ? ";" : "."}\n`;
    pairs.forEach((p, i) => { result += `    ${p.predicate} ${token(p)} ${i === pairs.length - 1 ? "." : ";"}\n`; });
  }
  return result;
}

export function canonicalProblems(text) {
  if (text.includes("\r")) return [{ line: text.slice(0, text.indexOf("\r")).split("\n").length, rule: "line endings must be LF" }];
  const expected = formatGraphTurtle(parseGraphTurtle(text));
  if (text === expected) return [];
  const actualLines = text.split("\n"), expectedLines = expected.split("\n");
  let line = 0;
  while (line < Math.max(actualLines.length, expectedLines.length) && actualLines[line] === expectedLines[line]) line++;
  return [{ line: line + 1, rule: "canonical formatting required" }];
}
