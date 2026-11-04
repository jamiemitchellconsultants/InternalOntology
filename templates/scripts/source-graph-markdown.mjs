import { createHash } from "node:crypto";
import { normaliseRepoRelativePath } from "./ontology-config.mjs";
import { encodeProvenance, RenderError } from "./source-graph-render-input.mjs";

const value = (resource, predicate) => resource.first(predicate)?.object;
const ordinal = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const compare = (...parts) => (a, b) => {
  for (const part of parts) { const result = ordinal(part(a), part(b)); if (result) return result; }
  return 0;
};
const PHRASES = {
  "kit:contains": "contains", "kit:implements": "implements", "kit:tested-by": "is tested by",
  "kit:depends-on": "depends on", "kit:documented-by": "is documented by", "kit:calls": "calls",
  "kit:communicates-with": "communicates with", "kit:deployed-by": "is deployed by",
};
const ROLES = {
  "kit:role-implementation": "Implementation", "kit:role-test": "Test",
  "kit:role-selected-document": "Selected document", "kit:role-ontology": "Ontology", "kit:role-deployment": "Deployment",
};
const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "`": "&#96;", "|": "&#124;", "\n": "<br>" };
const text = (raw) => String(raw ?? "").replace(/\r\n?/g, "\n").replace(/[&<>`|\n\\*_\[\]#~]/g, (c) => ESCAPES[c] ?? "\\" + c);
const localName = (iri) => iri.replace(/^(?:kit)?:/, "");
const anchor = (input, type, iri) => `${type}-${createHash("sha256").update(input.config.namespaceUri + iri).digest("hex")}`;

export function sourceLink(input, path, startLine, endLine = startLine) {
  if (input.tree.kind !== "commit" || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(input.tree.id)) {
    throw new RenderError("source links require a committed source snapshot");
  }
  const normalized = normaliseRepoRelativePath(path, "source link path");
  if (normalized !== path || !path || path.split("/").some((p) => p === "." || !p) ||
      !Number.isInteger(startLine) || startLine < 1 || !Number.isInteger(endLine) || endLine < startLine) {
    throw new RenderError("invalid source link path or line range");
  }
  const fragment = `#L${startLine}${endLine === startLine ? "" : `-L${endLine}`}`;
  return `${input.repositoryUrl}/blob/${input.tree.id}/${path.split("/").map(segment => encodeURIComponent(segment).replace(/[()]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase())).join("/")}${fragment}`;
}

export function renderMarkdown(input) {
  const { graph } = input;
  const nodes = graph.byType("kit:GraphNode").sort(compare((r) => value(r, "rdfs:label"), (r) => r.iri));
  const assertions = graph.byType("kit:GraphAssertion").sort(compare(
    (r) => value(r, "kit:subject"), (r) => value(r, "kit:relationship"), (r) => value(r, "kit:object"), (r) => r.iri));
  const lines = [encodeProvenance({ sourceRevision: input.tree.id, fingerprint: input.fingerprint }).trimEnd(),
    "# Source knowledge graph", "", "Generated from canonical Turtle. Edit the Turtle source and regenerate this document.", "",
    "Recorded claims for human assessment; structural validity does not establish semantic accuracy.", "", "## Nodes", ""];
  for (const node of nodes) {
    const outgoing = assertions.some((a) => value(a, "kit:subject") === node.iri);
    const connected = outgoing || assertions.some((a) => value(a, "kit:object") === node.iri);
    const suffix = outgoing ? ` — [View claims](#${anchor(input, "node", node.iri)})` : connected ? "" : " — no recorded assertions";
    lines.push(`- ${text(value(node, "rdfs:label"))} (${text(localName(value(node, "kit:kind")).replaceAll("-", " "))})${suffix}`);
  }
  if (!nodes.length) lines.push("No recorded nodes.");
  lines.push("", "## Current claims", "");
  if (!assertions.length) lines.push("No recorded assertions. Missing graph knowledge does not prove that a relationship is absent.", "");
  for (const subject of nodes) {
    const claims = assertions.filter((a) => value(a, "kit:subject") === subject.iri);
    if (!claims.length) continue;
    lines.push(`<a id="${anchor(input, "node", subject.iri)}"></a>`, "", `### ${text(value(subject, "rdfs:label"))}`, "");
    for (const assertion of claims) {
      const object = graph.resources.get(value(assertion, "kit:object"));
      const relationship = value(assertion, "kit:relationship");
      const phrase = PHRASES[relationship] ?? `${text(localName(relationship))} ([definition](#${anchor(input, "vocabulary", relationship)}))`;
      const basis = value(assertion, "kit:basis") === "kit:inferred" ? "Inferred (tentative)" : "Direct";
      const evidence = assertion.values("kit:evidence").map((p) => graph.resources.get(p.object)).sort(compare(
        (r) => value(r, "kit:path"), (r) => Number(value(r, "kit:startLine")), (r) => Number(value(r, "kit:endLine")),
        (r) => value(r, "kit:role"), (r) => r.iri));
      const citations = evidence.map((e) => {
        const path = value(e, "kit:path"), start = Number(value(e, "kit:startLine")), end = Number(value(e, "kit:endLine"));
        return `[${text(path)}:${start}${end === start ? "" : `–${end}`}](${sourceLink(input, path, start, end)}) (${ROLES[value(e, "kit:role")]})`;
      });
      const claim = `**${text(value(subject, "rdfs:label"))}** ${phrase} **${text(value(object, "rdfs:label"))}**. **${basis}**.`;
      lines.push(`<a id="${anchor(input, "claim", assertion.iri)}"></a>`, "",
        `${claim} Evidence: ${citations.join("; ")}. [Turtle source](${sourceLink(input, assertion.file, assertion.line)}).`, "");
    }
  }
  lines.push("## Coverage", "", "The highest matching priority wins. Unmatched paths remain unknown. Covered files may still have unrecorded relationships.", "",
    "| Selector | Status | Priority | Reason |", "| --- | --- | --- | --- |");
  const coverage = graph.byType("kit:GraphCoverage").sort(compare((r) => -Number(value(r, "kit:priority")),
    (r) => value(r, "kit:pathSelector"), (r) => r.iri));
  for (const rule of coverage) lines.push(`| ${text(value(rule, "kit:pathSelector"))} | ${text(localName(value(rule, "kit:status")))} | ${value(rule, "kit:priority")} | ${text(value(rule, "kit:reason"))} |`);
  if (!coverage.length) lines.push("| All unmatched paths | unknown | — | No coverage declared | ");
  const used = new Set([...nodes.map((r) => value(r, "kit:kind")), ...assertions.map((r) => value(r, "kit:relationship"))]);
  const definitions = [...graph.byType("kit:GraphKindDefinition"), ...graph.byType("kit:GraphRelationshipDefinition")]
    .filter((r) => used.has(r.iri)).sort(compare((r) => r.iri));
  if (definitions.length) {
    lines.push("", "## Local vocabulary", "");
    for (const definition of definitions) lines.push(`<a id="${anchor(input, "vocabulary", definition.iri)}"></a>`, "",
      `- **${text(localName(definition.iri))}**: ${text(value(definition, "rdfs:comment"))}`, "");
  }
  lines.push("", "## Source details", "", "<details>", "<summary>Source identifiers and provenance</summary>", "",
    `Source commit: [${input.tree.id}](${input.repositoryUrl}/commit/${input.tree.id}).`, "",
    `Input fingerprint: ${input.fingerprint}.`, "", `Graph namespace: ${text(input.config.namespaceUri)}.`, "");
  for (const assertion of [...assertions].sort(compare((r) => r.iri))) lines.push(
    `- ${text(assertion.iri)} — [Claim](#${anchor(input, "claim", assertion.iri)})`);
  lines.push("", "</details>", "");
  return lines.join("\n");
}
