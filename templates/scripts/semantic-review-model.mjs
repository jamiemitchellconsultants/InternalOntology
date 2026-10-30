// Complete-file inputs for the semantic ontology reviewer. No diff hunk is used here.

// Reserve space for the request wrapper and prompt before splitting any source text.
export const REQUEST_OVERHEAD = 600;
export const MAX_REQUEST_CHARS = 24_000;

export function catalogOntology(markdown, sections) {
  const required = sections?.required ?? [];
  const selected = new Set([...required, ...(sections?.optional ?? [])]);
  if (selected.size === 0) throw new Error("no ontology sections configured for semantic review");
  const lines = markdown.split(/\r?\n/);
  const headings = new Map();
  const content = new Map();
  const evidenceKeys = new Set();
  const output = ["# Canonical ontology evidence"];
  let current = null;
  let headerSeen = false;
  for (const line of lines) {
    const heading = /^## (.+)$/.exec(line);
    if (heading) {
      current = selected.has(heading[1]) ? heading[1] : null;
      if (current) {
        headings.set(current, (headings.get(current) ?? 0) + 1);
        output.push("", line);
      }
      headerSeen = false;
      continue;
    }
    if (!current) continue;
    if (line.startsWith("|")) {
      output.push(line);
      if (/^\|[-| :]+\|$/.test(line)) { headerSeen = true; continue; }
      if (headerSeen) {
        const name = line.split("|")[1]?.trim().replace(/^`|`$/g, "");
        if (name) {
          evidenceKeys.add(`${current}:${name}`);
          content.set(current, (content.get(current) ?? 0) + 1);
        }
      }
    } else if (line.startsWith("- **")) {
      output.push(line);
      const name = /^- \*\*(.+?)\*\*/.exec(line)?.[1];
      if (name) evidenceKeys.add(`${current}:${name}`);
      content.set(current, (content.get(current) ?? 0) + 1);
    }
  }
  for (const section of required) {
    if (!headings.has(section)) throw new Error(`missing required ontology section: ${section}`);
  }
  for (const section of selected) {
    if ((headings.get(section) ?? 0) > 1) throw new Error(`duplicate ontology section: ${section}`);
    if (headings.has(section) && !content.has(section)) throw new Error(`empty ontology section: ${section}`);
  }
  return { projection: output.join("\n"), evidenceKeys };
}

function chunkEnd(text, start, capacity) {
  let end = Math.min(text.length, start + capacity);
  if (end === text.length) return end;
  const paragraph = text.lastIndexOf("\n\n", end - 1);
  if (paragraph >= start) return paragraph + 2;
  const line = text.lastIndexOf("\n", end - 1);
  if (line >= start) return line + 1;
  // A line may exceed the budget. Do not split a UTF-16 surrogate pair.
  if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1]) && /[\uDC00-\uDFFF]/.test(text[end])) end--;
  return end;
}

export function chunkFiles(files, catalog, maxRequestChars = MAX_REQUEST_CHARS) {
  const chunks = [];
  const unreviewed = [];
  for (const file of files) {
    const capacity = maxRequestChars - REQUEST_OVERHEAD - catalog.projection.length - file.path.length;
    if (capacity < 1) {
      unreviewed.push({ path: file.path, reason: "ontology projection exceeds semantic review request budget" });
      continue;
    }
    if (file.text.length === 0) {
      chunks.push({ path: file.path, offset: 0, text: "" });
      continue;
    }
    for (let offset = 0; offset < file.text.length;) {
      const end = chunkEnd(file.text, offset, capacity);
      if (end <= offset) {
        unreviewed.push({ path: file.path, reason: "semantic review request budget cannot hold one character" });
        break;
      }
      chunks.push({ path: file.path, offset, text: file.text.slice(offset, end) });
      offset = end;
    }
  }
  return { chunks, unreviewed };
}
