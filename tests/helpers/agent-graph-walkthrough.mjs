#!/usr/bin/env node
// Sets up a scratch repository for a person-run #122 walkthrough and prints the base commit to use with the check.
// Usage: node tests/helpers/agent-graph-walkthrough.mjs <symbol|widening|lookup> <new-directory>
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { install } from "../../bin/install-ontology.mjs";
import { symbolScenario, wideningBase, wideningScenario, lookupScenario } from "./agent-graph-scenarios.mjs";

const [scenario, target] = process.argv.slice(2);
if (!["symbol", "widening", "lookup"].includes(scenario) || !target) {
  console.error("usage: node tests/helpers/agent-graph-walkthrough.mjs <symbol|widening|lookup> <new-directory>");
  process.exit(2);
}
const dir = resolve(target);
if (existsSync(dir)) {
  console.error(`${dir} already exists; choose a new directory`);
  process.exit(2);
}
mkdirSync(dir, { recursive: true });
const git = (...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
const write = (rel, text) => { const path = join(dir, rel); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };
git("init", "-q", "-b", "main");
git("config", "user.email", "walkthrough@example.com");
git("config", "user.name", "Walkthrough");
git("config", "commit.gpgsign", "false");
git("config", "core.hooksPath", join(dir, ".git-hooks-disabled"));
const repo = { dir, git, write };
install({ target: dir, projectName: "Widgets", withSourceGraph: true });

if (scenario === "symbol") console.log((await symbolScenario(repo)).base);
else if (scenario === "widening") { const base = await wideningBase(repo); await wideningScenario(repo, base); console.log(base.base); }
else console.log((await lookupScenario(repo)).pinned);
