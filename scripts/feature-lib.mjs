// Pure model of the feature lifecycle: phases, exit criteria, checklists, issue markers, gates
// and pull-request classification. No I/O — feature-gh.mjs reads GitHub and feature.mjs wires
// the two together, so the same rules run in every agent and in CI.

export const PHASES = [
  { id: "po", persona: "po", title: "[PO] Vision", label: "phase:po" },
  { id: "analyst", persona: "analyst", title: "[Analyst] Behaviours", label: "phase:analyst" },
  { id: "architect", persona: "architect", title: "[Architect] Structure", label: "phase:architect" },
  { id: "dev-plan", persona: "dev", title: "[Dev] Plan", label: "phase:dev" },
  { id: "dev-build", persona: "dev", title: "[Dev] Build", label: "phase:dev" },
  { id: "user", persona: "user", title: "[User] Docs & acceptance", label: "phase:user" },
];

export const FULL_ARTEFACTS = [
  "01-vision.md",
  "02-behaviours.md",
  "03-architecture.md",
  "05-runbook.md",
  "05-user-guide.md",
  "05-acceptance.md",
];

const item = (text, lite) => ({ text, lite });

export const EXIT_CRITERIA = {
  po: [
    item("the problem is stated in user terms", true),
    item("the target users are named", true),
    item("outcomes and success measures are listed", false),
    item("scope and out-of-scope are explicit", true),
    item("research findings are summarised with sources", false),
  ],
  analyst: [
    item("every outcome is covered by at least one behaviour", false),
    item("each behaviour is a Given/When/Then scenario", true),
    item("no uncertainty is left unresolved (each one is either decided or explicitly deferred as out of scope)", true),
    item("new domain terms are added to the target repo's ontology", true),
  ],
  architect: [
    item("components are listed with their responsibilities", true),
    item("every behaviour is served by at least one component", false),
    item("deployment and runtime are described", false),
    item("each significant decision has an ADR, linked from the Narrative sections", true),
  ],
  "dev-plan": [
    item("a superpowers plan exists", true),
    item("the detailed implementation plan exists, following the target repo's convention", true),
  ],
  "dev-build": [
    item("every task in the detailed plan is executed and committed", true),
    item("tests pass", true),
  ],
  user: [
    item("the runbook covers deploy, operate and recover", false),
    item("the user guide covers each user-facing behaviour", true),
    item("every behaviour has a scripted walkthrough and an executable acceptance test", true),
    item("in a local build, every walkthrough has been followed and passed, and every executable test has been approved and passes", true),
    item("in the deployed environment, every walkthrough has been followed and passed, and every executable test passes", true),
    item("the results are recorded in 05-acceptance.md", true),
  ],
};

const PARENT_MARKER = /<!--\s*feature:\s*slug=([a-z0-9-]+)\s+mode=(full|lite)\s*-->/;
const PHASE_MARKER = /<!--\s*feature-phase:\s*([a-z-]+)\s*-->/;
const PHASE_OF = /Phase of #(\d+)\./;
const CHECKBOX = /^(\s*[-*+]\s+)\[([ xX])\]\s+(.*?)\s*$/;
const HEADING = /^#{1,6}\s+(.*?)\s*$/;
const CLOSING = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+(?:(?:[\w.-]+\/[\w.-]+#)|(?:https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/)|#)(\d+)/gi;
const FEATURE_PATH = /^docs\/features\/([^/]+)\//;

const normalise = (text) => text.replace(/\s+/g, " ").trim();

export function getPhase(id) {
  const phase = PHASES.find((p) => p.id === id);
  if (!phase) throw new Error(`unknown phase "${id}" (expected one of ${PHASES.map((p) => p.id).join(", ")})`);
  return phase;
}

export function phaseIndex(id) {
  return PHASES.indexOf(getPhase(id));
}

export function nextSkill(id) {
  return `feature-${getPhase(id).persona}`;
}

export function slugify(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) throw new Error(`cannot make a slug from "${name}"; pass --slug`);
  return slug;
}

export function renderChecklist(phaseId, mode = "full", ticked = new Set()) {
  getPhase(phaseId);
  return EXIT_CRITERIA[phaseId]
    .filter((c) => mode === "full" || c.lite)
    .map((c) => `- [${ticked.has(c.text) ? "x" : " "}] ${c.text}`)
    .join("\n");
}

export function parseChecklist(markdown) {
  return (markdown ?? "").split("\n").flatMap((line) => {
    const m = line.match(CHECKBOX);
    return m ? [{ text: normalise(m[3]), checked: m[2] !== " " }] : [];
  });
}

export function renderParentBody({ name, slug, mode, owner }) {
  const lines = [`<!-- feature: slug=${slug} mode=${mode} -->`, "", `**Feature:** ${name}`];
  if (owner) lines.push(`**Owner:** ${owner}`);
  lines.push(`**Artefacts:** docs/features/${slug}/`, "");
  if (mode === "full") {
    lines.push("## Phases", "", ...PHASES.map((p) => `- ${p.title}`));
  } else {
    lines.push("## Checklist");
    for (const p of PHASES) lines.push("", `### ${p.title}`, "", renderChecklist(p.id, "lite"));
  }
  return `${lines.join("\n")}\n`;
}

export function parseParent(body) {
  const m = (body ?? "").match(PARENT_MARKER);
  return m ? { slug: m[1], mode: m[2] } : null;
}

export function setParentMode(body, mode) {
  return body.replace(PARENT_MARKER, (_, slug) => `<!-- feature: slug=${slug} mode=${mode} -->`);
}

export function renderSubIssueBody({ phaseId, parentNumber, mode = "full", ticked = new Set() }) {
  return [
    `<!-- feature-phase: ${phaseId} -->`,
    "",
    `Phase of #${parentNumber}.`,
    "",
    "## Exit criteria",
    "",
    renderChecklist(phaseId, mode, ticked),
    "",
  ].join("\n");
}

export function parseSubIssue(body) {
  const phase = (body ?? "").match(PHASE_MARKER);
  if (!phase || !PHASES.some((p) => p.id === phase[1])) return null;
  const parent = body.match(PHASE_OF);
  return { phaseId: phase[1], parentNumber: parent ? Number(parent[1]) : null };
}

export function parseLiteSections(body) {
  const sections = Object.fromEntries(PHASES.map((p) => [p.id, []]));
  let current = null;
  for (const line of (body ?? "").split("\n")) {
    const heading = line.match(HEADING);
    if (heading) {
      current = PHASES.find((p) => p.title === heading[1])?.id ?? null;
      continue;
    }
    if (current) sections[current].push(...parseChecklist(line));
  }
  return sections;
}

// Walks the body line by line, tracking which "###" section each line is in, and lets edit()
// rewrite the checkbox lines that pass inSection.
function mapCheckboxes(body, inSection, edit) {
  let section = null;
  return body
    .split("\n")
    .map((line) => {
      const heading = line.match(HEADING);
      if (heading) section = heading[1];
      const box = line.match(CHECKBOX);
      return box && inSection(section) ? edit(line, box) : line;
    })
    .join("\n");
}

export function tickItem(body, text, sectionTitle = null) {
  const wanted = normalise(text);
  let found = false;
  const next = mapCheckboxes(
    body,
    (section) => sectionTitle === null || section === sectionTitle,
    (line, box) => {
      if (found || normalise(box[3]) !== wanted) return line;
      found = true;
      return `${box[1]}[x] ${box[3]}`;
    },
  );
  return { body: next, found };
}

export function untickSection(body, phaseId) {
  const title = getPhase(phaseId).title;
  return mapCheckboxes(body, (section) => section === title, (line, box) => `${box[1]}[ ] ${box[3]}`);
}

export function subIssueFor(state, phaseId) {
  return state.subIssues?.find((s) => s.phaseId === phaseId);
}

export function isDone(state, phaseId) {
  if (state.mode === "lite") {
    const items = parseLiteSections(state.body)[phaseId];
    return items.length > 0 && items.every((i) => i.checked);
  }
  return subIssueFor(state, phaseId)?.state === "closed";
}

export function currentPhase(state) {
  return PHASES.find((p) => !isDone(state, p.id))?.id ?? null;
}

export function evaluateGate(state, phaseId) {
  const reasons = [];
  for (const p of PHASES.slice(0, phaseIndex(phaseId))) {
    if (state.mode === "lite") {
      const items = parseLiteSections(state.body)[p.id];
      if (items.length === 0) reasons.push(`${p.title} has no checklist on feature #${state.number}.`);
      for (const i of items.filter((x) => !x.checked)) {
        reasons.push(`${p.title} has an unticked exit criterion: "${i.text}". Tick it on feature #${state.number} once it is met.`);
      }
      continue;
    }
    const sub = subIssueFor(state, p.id);
    if (!sub) {
      reasons.push(`${p.title} has no sub-issue on feature #${state.number}. It may have been deleted or not linked; link or recreate it on GitHub as a sub-issue of #${state.number}.`);
      continue;
    }
    if (sub.state !== "closed") reasons.push(`${p.title} (#${sub.number}) is still open. Merge the PR that closes it first.`);
    if (sub.labels.includes("pushback")) {
      reasons.push(
        sub.state === "closed"
          ? `${p.title} (#${sub.number}) has pushback but is closed. Run node scripts/feature.mjs clear-pushback --feature ${state.number} --phase ${p.id} once its amendment has merged.`
          : `${p.title} (#${sub.number}) has pushback. Re-run ${nextSkill(p.id)} in amendment mode.`,
      );
    }
    for (const i of parseChecklist(sub.body).filter((x) => !x.checked)) {
      reasons.push(`${p.title} (#${sub.number}) has an unticked exit criterion: "${i.text}". Tick it once it is met.`);
    }
  }
  return { open: reasons.length === 0, reasons };
}

export function classifyPr({ body, files, labels }) {
  const slugs = [...new Set(files.map((f) => f.match(FEATURE_PATH)?.[1]).filter(Boolean))].sort();
  const closes = [...new Set([...(body ?? "").matchAll(CLOSING)].map((m) => Number(m[1])))];
  return { phasePr: slugs.length > 0 || closes.length > 0, slugs, closes, override: labels.includes("gate-override") };
}
