#!/usr/bin/env node
// Feature lifecycle command line. The persona skills and the feature-gate workflow call this,
// so the gate rules are the same in every agent and in CI. GitHub access is all in feature-gh.mjs.
//
// Usage: node scripts/feature.mjs <subcommand> [--option value ...]

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { makeGh } from "./feature-gh.mjs";
import {
  FULL_ARTEFACTS,
  PHASES,
  classifyPr,
  currentPhase,
  evaluateGate,
  getPhase,
  nextSkill,
  parseLiteSections,
  parseParent,
  parseSubIssue,
  phaseIndex,
  renderParentBody,
  renderSubIssueBody,
  setParentMode,
  slugify,
  subIssueFor,
  tickItem,
  untickSection,
} from "./feature-lib.mjs";

class UsageError extends Error {}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const FLAGS = new Set(["lite"]);

function parseOptions(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new UsageError(`unexpected argument "${arg}"`);
    const key = arg.slice(2);
    if (FLAGS.has(key)) {
      opts[key] = true;
      continue;
    }
    const value = argv[++i];
    if (value === undefined || value.startsWith("--")) throw new UsageError(`${arg} needs a value`);
    opts[key] = value;
  }
  return opts;
}

function need(opts, ...keys) {
  for (const key of keys) if (opts[key] === undefined) throw new UsageError(`--${key} is required`);
}

function issueNumber(opts, key) {
  const n = Number(opts[key]);
  if (!Number.isInteger(n) || n <= 0) throw new UsageError(`--${key} must be an issue or PR number`);
  return n;
}

function phaseOption(opts, key) {
  try {
    return getPhase(opts[key]).id;
  } catch (error) {
    throw new UsageError(error.message);
  }
}

function findSub(state, phaseId) {
  const sub = subIssueFor(state, phaseId);
  if (!sub) throw new Error(`feature #${state.number} has no sub-issue for ${getPhase(phaseId).title}`);
  return sub;
}

function start(opts, { gh, out, cwd }) {
  need(opts, "name");
  const slug = opts.slug ?? slugify(opts.name);
  if (!SLUG.test(slug)) throw new UsageError(`--slug must match ${SLUG} (lowercase words joined by single hyphens)`);
  const mode = opts.lite ? "lite" : "full";
  const existing = gh.listFeatures().find((f) => parseParent(f.body)?.slug === slug);
  if (existing) {
    out(`feature "${slug}" already exists as #${existing.number}; nothing created`);
    return 1;
  }
  const parent = gh.createIssue({
    title: `Feature: ${opts.name}`,
    body: renderParentBody({ name: opts.name, slug, mode, owner: opts.owner }),
    labels: ["feature"],
    assignee: opts.owner,
  });
  if (mode === "full") {
    const children = PHASES.map((p) =>
      gh.createIssue({ title: p.title, body: renderSubIssueBody({ phaseId: p.id, parentNumber: parent }), labels: [p.label], assignee: opts.owner }),
    );
    for (const child of children) gh.addSubIssue(parent, child);
  }
  const dir = join(cwd, "docs", "features", slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".gitkeep"), "");
  out(`started feature #${parent} (${mode} mode) in docs/features/${slug}/`);
  out(`next: run the ${nextSkill(PHASES[0].id)} skill`);
  return 0;
}

function status(opts, { gh, out }) {
  if (opts.feature === undefined) {
    const features = gh.listFeatures();
    if (features.length === 0) out("no open features");
    for (const f of features) out(`#${f.number} ${f.title} (${parseParent(f.body)?.mode ?? "unknown"} mode)`);
    return 0;
  }
  const n = issueNumber(opts, "feature");
  const state = gh.loadFeature(n);
  out(`feature #${n} ${state.slug} (${state.mode} mode)`);
  for (const s of state.subIssues ?? []) {
    if (s.labels.includes("pushback")) out(`pushback: ${getPhase(s.phaseId).title} (#${s.number})`);
  }
  for (const side of gh.listSideIssues(n)) out(`side issue: #${side.number} ${side.title}`);
  const current = currentPhase(state);
  if (current === null) {
    out("all phases are done");
    return 0;
  }
  const result = evaluateGate(state, current);
  out(`current phase: ${getPhase(current).title}`);
  const currentSub = subIssueFor(state, current);
  const linked = currentSub ? gh.linkedPullRequests(currentSub.number) : [];
  for (const pr of linked) out(`pull request: #${pr.number} (${pr.state})`);
  const waiting = linked.find((pr) => pr.state === "open");
  if (waiting) out(`next: wait for review of #${waiting.number}, then merge it`);
  else out(result.open ? `next: run the ${nextSkill(current)} skill` : "next: the gate is closed, because:");
  for (const reason of result.reasons) out(`  - ${reason}`);
  return 0;
}

function gate(opts, { gh, out }) {
  need(opts, "feature", "phase");
  const phaseId = phaseOption(opts, "phase");
  const result = evaluateGate(gh.loadFeature(issueNumber(opts, "feature")), phaseId);
  out(`gate ${result.open ? "open" : "closed"}: ${getPhase(phaseId).title}`);
  for (const reason of result.reasons) out(`  - ${reason}`);
  return result.open ? 0 : 2;
}

function readBodyFile(opts, cwd) {
  need(opts, "body-file");
  return readFileSync(resolve(cwd, opts["body-file"]), "utf8");
}

function pushback(opts, { gh, out, cwd }) {
  need(opts, "feature", "from", "to");
  const from = phaseOption(opts, "from");
  const to = phaseOption(opts, "to");
  if (phaseIndex(to) >= phaseIndex(from)) throw new UsageError("--to must be an earlier phase than --from");
  const body = readBodyFile(opts, cwd);
  const n = issueNumber(opts, "feature");
  const state = gh.loadFeature(n);
  if (state.mode === "lite") {
    gh.editBody(n, untickSection(state.body, to));
    gh.comment(n, body);
  } else {
    const earlier = findSub(state, to);
    const current = findSub(state, from);
    gh.comment(earlier.number, body);
    gh.reopen(earlier.number);
    gh.addLabels(earlier.number, ["pushback"]);
    gh.comment(current.number, `Blocked by #${earlier.number} (pushback from ${getPhase(from).title}).`);
  }
  out(`pushback recorded against ${getPhase(to).title}.`);
  if (state.mode === "full") {
    out("The blocked pull request's feature-gate check does not re-run by itself: re-run it with gh run rerun or push to the branch, so it reflects the pushback.");
  }
  out(`Checkpoint reached: stop and take a break, then re-run ${nextSkill(to)} in amendment mode.`);
  return 0;
}

function park(opts, { gh, out, cwd }) {
  need(opts, "feature", "title");
  const n = issueNumber(opts, "feature");
  const text = readBodyFile(opts, cwd);
  const current = currentPhase(gh.loadFeature(n));
  const during = current ? getPhase(current).title : "a completed feature";
  const issue = gh.createIssue({
    title: opts.title,
    body: `Side issue of #${n}, noticed during ${during}.\n\n${text}`,
    labels: ["side-issue"],
  });
  out(`parked as #${issue}. Back to ${during}.`);
  return 0;
}

function handoff(opts, { gh, out, cwd }) {
  need(opts, "feature");
  const n = issueNumber(opts, "feature");
  gh.comment(n, readBodyFile(opts, cwd));
  out(`handoff posted on #${n}.`);
  out("Checkpoint reached: stop here and take a break before the next role starts.");
  return 0;
}

function tick(opts, { gh, out }) {
  need(opts, "feature", "phase", "text");
  const phaseId = phaseOption(opts, "phase");
  const n = issueNumber(opts, "feature");
  const state = gh.loadFeature(n);
  const target = state.mode === "lite"
    ? { number: n, body: state.body, section: getPhase(phaseId).title }
    : { ...findSub(state, phaseId), section: null };
  const result = tickItem(target.body, opts.text, target.section);
  if (!result.found) throw new Error(`no exit criterion "${opts.text}" on ${getPhase(phaseId).title}`);
  gh.editBody(target.number, result.body);
  out(`ticked on #${target.number}: ${opts.text}`);
  return 0;
}

function clearPushback(opts, { gh, out }) {
  need(opts, "feature", "phase");
  const phaseId = phaseOption(opts, "phase");
  const state = gh.loadFeature(issueNumber(opts, "feature"));
  if (state.mode === "lite") {
    out("lite features carry no pushback label; nothing to clear");
    return 0;
  }
  const sub = findSub(state, phaseId);
  gh.removeLabels(sub.number, ["pushback"]);
  out(`pushback cleared on ${getPhase(phaseId).title} (#${sub.number})`);
  return 0;
}

function promote(opts, { gh, out }) {
  need(opts, "feature");
  const n = issueNumber(opts, "feature");
  const state = gh.loadFeature(n);
  if (state.mode !== "lite") throw new UsageError(`feature #${n} is already in full mode`);
  const sections = parseLiteSections(state.body);
  const children = PHASES.map((p) => {
    const items = sections[p.id];
    const done = items.length > 0 && items.every((i) => i.checked);
    const ticked = new Set(items.filter((i) => i.checked).map((i) => i.text));
    const number = gh.createIssue({
      title: p.title,
      body: renderSubIssueBody({ phaseId: p.id, parentNumber: n, mode: done ? "lite" : "full", ticked }),
      labels: [p.label],
    });
    return { number, done };
  });
  for (const child of children) gh.addSubIssue(n, child.number);
  for (const child of children.filter((c) => c.done)) gh.close(child.number);
  gh.editBody(n, setParentMode(state.body, "full"));
  out(`feature #${n} promoted to full mode. Regenerate docs/features/${state.slug}/feature.md as:`);
  for (const file of FULL_ARTEFACTS) out(`  - docs/features/${state.slug}/${file}`);
  return 0;
}

const BRANCH_PHASE = { design: "architect", plan: "dev-plan", build: "dev-build" };

function litePhaseFromBranch(head) {
  const m = (head ?? "").match(/^feature\/[^/]+\/(design|plan|build)$/);
  return m ? BRANCH_PHASE[m[1]] : null;
}

function gatePr(opts, { gh, out }) {
  need(opts, "pr");
  const pr = gh.viewPr(issueNumber(opts, "pr"));
  const { phasePr, slugs, closes, override } = classifyPr(pr);
  if (!phasePr) {
    out("not a phase PR: the feature gate does not apply");
    return 0;
  }
  if (override) {
    out("gate-override label present: the feature gate is not enforced. Give the reason in the Narrative sections.");
    return 0;
  }
  // feature number → the phases the PR is for (null means "its current phase").
  const targets = new Map();
  const addTarget = (number, phaseId) => {
    if (!targets.has(number)) targets.set(number, new Set());
    targets.get(number).add(phaseId);
  };
  for (const number of closes) {
    const sub = parseSubIssue(gh.viewIssue(number).body);
    if (sub?.parentNumber) addTarget(sub.parentNumber, sub.phaseId);
  }
  const features = slugs.length > 0 ? gh.listFeatures() : [];
  for (const slug of slugs) {
    const feature = features.find((f) => parseParent(f.body)?.slug === slug);
    if (!feature) {
      out(`no open feature for docs/features/${slug}/: skipped`);
      continue;
    }
    if (!targets.has(feature.number)) addTarget(feature.number, null);
  }
  let code = 0;
  for (const [number, phases] of targets) {
    const state = gh.loadFeature(number);
    for (const phaseId of phases) {
      const phase = phaseId ?? (state.mode === "lite" ? litePhaseFromBranch(pr.head) : null) ?? currentPhase(state);
      if (phase === null) {
        out(`feature #${number}: all phases are done`);
        continue;
      }
      const result = evaluateGate(state, phase);
      out(`feature #${number}: gate ${result.open ? "open" : "closed"} for ${getPhase(phase).title}`);
      for (const reason of result.reasons) out(`  - ${reason}`);
      if (!result.open) code = 2;
    }
  }
  return code;
}

const COMMANDS = {
  start,
  status,
  gate,
  "gate-pr": gatePr,
  pushback,
  park,
  handoff,
  tick,
  "clear-pushback": clearPushback,
  promote,
};

export const SUBCOMMANDS = Object.keys(COMMANDS);

export function main(argv, { gh, out = console.log, cwd = process.cwd() } = {}) {
  const [name, ...rest] = argv;
  const command = Object.hasOwn(COMMANDS, name ?? "") ? COMMANDS[name] : undefined;
  if (!command) {
    out(`usage: feature.mjs <${SUBCOMMANDS.join("|")}> [options]`);
    return 1;
  }
  try {
    return command(parseOptions(rest), { gh, out, cwd });
  } catch (error) {
    out(`feature ${name}: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2), { gh: makeGh() });
}
