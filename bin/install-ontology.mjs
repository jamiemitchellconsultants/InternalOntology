#!/usr/bin/env node
// Ontology kit installer. Copies the kit's templates into a target repository and splices the
// ontology protocol into that repository's agent-instruction file.
//
// The installer is mechanical. It does not write the target's ontology content — that is the
// skills/ontology-setup skill's job, because it needs judgement about the target's domain.
//
// Usage:
//   node bin/install-ontology.mjs --target <repo> [--dry-run] [--force] [--reset-content]
//                                 [--ontology-path <path>] [--default-branch <name>]
//                                 [--with-drift-review]
//                                 [--with-enum-tests csharp|typescript|python]
//   node bin/install-ontology.mjs --help

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { normaliseRepoRelativePath } from "../templates/scripts/ontology-config.mjs";

// Installed with a `.example` suffix so an SDK compile glob or test-runner collection never picks
// it up on its own — the template names an undefined example enum and has no test-framework
// import, so left as a bare `.cs`/`.ts`/`.py` file it breaks the next build rather than merely
// sitting unused. `ownedBy: "adopter"` because, once adapted and renamed, it is the adopter's file
// to edit — a later `--force` upgrade must not clobber their real enum tests.
const ENUM_TEST_TEMPLATES = {
  csharp: { template: "enum-tests/csharp-xunit.cs", dest: "tests/OntologyEnumTests.cs.example" },
  typescript: { template: "enum-tests/typescript-vitest.ts", dest: "tests/ontology-enums.test.ts.example" },
  python: { template: "enum-tests/python-pytest.py", dest: "tests/test_ontology_enums.py.example" },
};

// Turns a project name into the lowercase-hyphenated form usable as a URL fragment, for the
// default namespaceUri. Not the same shape as owl-ontology.mjs's slugify (which produces
// underscore-separated identifiers for Turtle local names) — this one is for a URL segment.
function slugifyForNamespace(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "ontology";
}

/**
 * @typedef {{ template: string, dest: string, substitute: boolean, ownedBy: "kit" | "adopter" }} PlanEntry
 */

/**
 * What an install writes, given its options. Pure — touches no filesystem, so --dry-run prints
 * exactly what a real run would do rather than approximating it.
 *
 * `ownedBy` decides what an upgrade is allowed to touch: `"kit"` entries are content the kit
 * itself owns and may replace wholesale (the scripts and the CI workflows); `"adopter"` entries
 * are content the adopter edits and owns (`ontology.config.json`, the ontology document, the enum
 * test) and must survive a plain `--force` upgrade. See `install`'s overwrite rule below.
 *
 * @param {{ ontologyPath?: string, withDriftReview?: boolean, withEnumTests?: string }} options
 * @returns {PlanEntry[]}
 */
export function buildPlan(options) {
  const ontologyPath = options.ontologyPath ?? "docs/ontology.md";

  /** @type {PlanEntry[]} */
  const plan = [
    { template: "scripts/ontology-config.mjs", dest: "scripts/ontology-config.mjs", substitute: false, ownedBy: "kit" },
    { template: "scripts/owl-ontology.mjs", dest: "scripts/owl-ontology.mjs", substitute: false, ownedBy: "kit" },
    { template: "scripts/build-ontology.mjs", dest: "scripts/build-ontology.mjs", substitute: false, ownedBy: "kit" },
    { template: "scripts/check-ontology-terms.mjs", dest: "scripts/check-ontology-terms.mjs", substitute: false, ownedBy: "kit" },
    { template: "ontology.config.json", dest: "ontology.config.json", substitute: true, ownedBy: "adopter" },
    { template: "docs/ontology.md", dest: ontologyPath, substitute: true, ownedBy: "adopter" },
    { template: "github/workflows/ontology-lint.yml", dest: ".github/workflows/ontology-lint.yml", substitute: true, ownedBy: "kit" },
  ];

  if (options.withDriftReview) {
    plan.push(
      { template: "scripts/review-ontology-drift.mjs", dest: "scripts/review-ontology-drift.mjs", substitute: false, ownedBy: "kit" },
      { template: "scripts/review-ontology-drift.test.mjs", dest: "scripts/review-ontology-drift.test.mjs", substitute: false, ownedBy: "kit" },
      { template: "github/workflows/ontology-drift-review.yml", dest: ".github/workflows/ontology-drift-review.yml", substitute: false, ownedBy: "kit" },
      { template: "docs/ontology-drift-review.md", dest: "docs/ontology-drift-review.md", substitute: true, ownedBy: "kit" },
    );
  }

  if (options.withEnumTests) {
    const chosen = ENUM_TEST_TEMPLATES[options.withEnumTests];
    if (!chosen) {
      throw new Error(
        `unsupported enum test language "${options.withEnumTests}" — ` +
          `expected one of ${Object.keys(ENUM_TEST_TEMPLATES).join(", ")}`,
      );
    }
    plan.push({ ...chosen, substitute: true, ownedBy: "adopter" });
  }

  return plan;
}

export const START_MARKER = "<!-- ontology-protocol:start -->";
export const END_MARKER = "<!-- ontology-protocol:end -->";

// A hand-written "## Ontology protocol" heading with none of the kit's own markers is exactly the
// state of a repository this kit was extracted from (the application repository's AGENTS.md) and its most likely
// first adopter. Splicing there would produce two contradictory protocol sections — one stale —
// with nothing to say so. Matched at start-of-line so a mention in running prose ("see the
// Ontology protocol section above") does not itself trigger the refusal.
const UNMARKED_PROTOCOL_HEADING_RE = /^##\s+Ontology protocol\s*$/m;

/**
 * True when `existing` contains a hand-written "## Ontology protocol" heading that is not one of
 * this kit's own marked blocks — the case `install` must refuse rather than silently duplicate.
 * @param {string} existing
 * @returns {boolean}
 */
export function hasUnmarkedProtocolSection(existing) {
  return UNMARKED_PROTOCOL_HEADING_RE.test(existing) && !existing.includes(START_MARKER);
}

/**
 * Replace the marked protocol block in `existing`, or append one if it has none.
 * Idempotent by construction: a second call with the same body yields the same text.
 *
 * Assumes the caller has already ruled out an unmarked hand-written section (see
 * `hasUnmarkedProtocolSection`) — this function only ever recognises its own markers.
 * @param {string} existing
 * @param {string} body
 * @returns {string}
 */
export function spliceProtocol(existing, body) {
  const block = `${START_MARKER}\n${body.trim()}\n${END_MARKER}\n`;
  const start = existing.indexOf(START_MARKER);

  if (start === -1) {
    if (existing.includes(END_MARKER)) {
      throw new Error("unterminated ontology-protocol marker: found an end marker with no start marker");
    }
    const separator = existing.trim() ? `${existing.replace(/\s*$/, "")}\n\n` : "";
    return `${separator}${block}`;
  }

  const end = existing.indexOf(END_MARKER, start);
  if (end === -1) {
    throw new Error("unterminated ontology-protocol marker: found a start marker with no end marker");
  }
  return existing.slice(0, start) + block + existing.slice(end + END_MARKER.length + 1);
}

/**
 * Which file the target repository treats as authoritative for agent instructions.
 * @param {string} target
 * @returns {{ path: string, created: boolean }}
 */
export function detectAgentFile(target) {
  for (const candidate of ["AGENTS.md", "CLAUDE.md"]) {
    if (existsSync(join(target, candidate))) return { path: candidate, created: false };
  }
  return { path: "AGENTS.md", created: true };
}

/**
 * The target repository's current branch, for the lint workflow's `push: branches:` trigger.
 * Falls back to "main" whenever detection cannot produce an answer — not only a missing `git`
 * binary, but also a target in a state `symbolic-ref` cannot resolve (e.g. a detached HEAD).
 * @param {string} target
 * @returns {string}
 */
export function detectDefaultBranch(target) {
  try {
    const branch = execFileSync("git", ["-C", target, "symbolic-ref", "--short", "HEAD"], {
      encoding: "utf8",
    }).trim();
    return branch || "main";
  } catch {
    return "main";
  }
}

// fileURLToPath, not new URL(...).pathname: the latter percent-encodes the path, so a directory
// containing a space or a `#` would yield a broken filesystem path.
const TEMPLATE_ROOT = fileURLToPath(new URL("../templates/", import.meta.url));

/**
 * @param {string} text
 * @param {Record<string, string>} values
 * @returns {string}
 */
export function substitute(text, values) {
  return text.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => {
    if (!(key in values)) throw new Error(`no value supplied for placeholder {{${key}}}`);
    return values[key];
  });
}

/**
 * Same as `substitute`, but JSON-escapes each value before splicing it in — for templates where
 * the placeholder sits inside a JSON string literal (`ontology.config.json`'s
 * `"ontologyPath": "{{ONTOLOGY_PATH}}"`). Plain `substitute` would let a quote in `--ontology-path`
 * (e.g. `docs/on"to.md`) land unescaped and corrupt the JSON; this escapes it to `\"` first, the
 * same way `JSON.stringify` would if it were producing the whole document.
 * @param {string} text
 * @param {Record<string, string>} values
 * @returns {string}
 */
export function substituteJsonString(text, values) {
  return text.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => {
    if (!(key in values)) throw new Error(`no value supplied for placeholder {{${key}}}`);
    // Slice off JSON.stringify's own wrapping quotes: the template already supplies them.
    return JSON.stringify(values[key]).slice(1, -1);
  });
}

/**
 * @param {{ target: string, projectName?: string, ontologyPath?: string, defaultBranch?: string,
 *           force?: boolean, resetContent?: boolean, dryRun?: boolean, withDriftReview?: boolean,
 *           withEnumTests?: string }} options
 * @returns {{ written: string[], skipped: { dest: string, ownedBy: "kit" | "adopter" }[],
 *             agentFile: string, enumTestExample: string | null }}
 */
export function install(options) {
  const { target, force = false, resetContent = false, dryRun = false } = options;
  if (!existsSync(join(target, ".git"))) {
    throw new Error(`${target} is not a git repository — run git init first, or point --target elsewhere`);
  }

  // Validate before writing anything: an unvalidated --ontology-path has previously written a
  // file above the target repository root (`../outside.md`) or outside it entirely (`/etc/x.md`),
  // both reported as success. Reuses the same rule ontology.config.json's own ontologyPath must
  // satisfy, so the two can never drift apart.
  const ontologyPath = options.ontologyPath
    ? normaliseRepoRelativePath(options.ontologyPath, "--ontology-path")
    : "docs/ontology.md";

  const agentFile = detectAgentFile(target);
  const agentPath = join(target, agentFile.path);
  const existingAgentText = existsSync(agentPath) ? readFileSync(agentPath, "utf8") : "";
  if (hasUnmarkedProtocolSection(existingAgentText)) {
    throw new Error(
      `${agentFile.path} already has a hand-written "## Ontology protocol" section with no ` +
        `ontology-kit markers — installing would add a second, contradictory copy. Remove the ` +
        `existing section, or wrap it in ${START_MARKER} / ${END_MARKER}, then re-run.`,
    );
  }

  const values = {
    PROJECT_NAME: options.projectName ?? basename(target),
    ONTOLOGY_PATH: ontologyPath,
    ONTOLOGY_TTL_PATH: ontologyPath.replace(/\.md$/, ".ttl"),
    DEFAULT_BRANCH: options.defaultBranch ?? detectDefaultBranch(target),
  };
  values.NAMESPACE_URI = `https://ontology.example/${slugifyForNamespace(values.PROJECT_NAME)}#`;

  const plan = buildPlan({ ...options, ontologyPath });
  const written = [];
  /** @type {{ dest: string, ownedBy: "kit" | "adopter" }[]} */
  const skipped = [];
  let enumTestExample = null;

  for (const entry of plan) {
    const destPath = join(target, entry.dest);
    const exists = existsSync(destPath);
    // --force replaces kit-owned content (the scripts and workflows this kit ships); it never
    // touches adopter-owned content (ontology.config.json, the ontology document, the enum test)
    // — that is what makes plain --force the safe, correct upgrade path. --reset-content is the
    // separate, deliberately-named escape hatch for someone who wants the adopter-owned templates
    // back too.
    const overwrite = entry.ownedBy === "kit" ? force : resetContent;
    if (exists && !overwrite) {
      skipped.push({ dest: entry.dest, ownedBy: entry.ownedBy });
      continue;
    }
    const source = readFileSync(join(TEMPLATE_ROOT, entry.template), "utf8");
    const content = entry.substitute
      ? (entry.template === "ontology.config.json" ? substituteJsonString : substitute)(source, values)
      : source;
    if (!dryRun) {
      mkdirSync(dirname(destPath), { recursive: true });
      writeFileSync(destPath, content);
    }
    written.push(entry.dest);
    if (entry.dest.endsWith(".example")) enumTestExample = entry.dest;
  }

  // The protocol is spliced, not copied, so it is never "skipped" — a re-run updates it in place.
  const protocolBody = substitute(
    readFileSync(join(TEMPLATE_ROOT, "protocol/ontology-protocol.md"), "utf8"),
    values,
  );
  if (!dryRun) writeFileSync(agentPath, spliceProtocol(existingAgentText, protocolBody));
  written.push(agentFile.path);

  return { written, skipped, agentFile: agentFile.path, enumTestExample };
}

const VALUE_OPTIONS = {
  "--target": "target",
  "--project-name": "projectName",
  "--ontology-path": "ontologyPath",
  "--default-branch": "defaultBranch",
  "--with-enum-tests": "withEnumTests",
};
const FLAG_OPTIONS = {
  "--with-drift-review": "withDriftReview",
  "--force": "force",
  "--reset-content": "resetContent",
  "--dry-run": "dryRun",
};

const USAGE =
  "usage: node bin/install-ontology.mjs --target <repo> [--project-name <name>]\n" +
  "         [--ontology-path <path>] [--default-branch <name>] [--with-drift-review]\n" +
  "         [--with-enum-tests csharp|typescript|python] [--force] [--reset-content] [--dry-run]\n" +
  "\n" +
  "Installs the ontology kit's scripts, CI workflow, starter config and ontology document into\n" +
  "--target, and splices an \"Ontology protocol\" section into its AGENTS.md (or CLAUDE.md).\n" +
  "\n" +
  "  --target <repo>          Required. The repository to install into (must be a git repository).\n" +
  "  --project-name <name>    Name used in the ontology's title. Defaults to the target directory's name.\n" +
  "  --ontology-path <path>   Where the ontology file goes. Defaults to docs/ontology.md. Must be\n" +
  "                           repository-relative, with no \"..\" segment.\n" +
  "  --default-branch <name>  Branch the lint workflow triggers on. Defaults to the target's current\n" +
  "                           branch (detected via git), falling back to \"main\".\n" +
  "  --with-drift-review      Also install the advisory semantic reviewer, its tests, workflow and runbook.\n" +
  "  --with-enum-tests <lang> Also install a worked-example enum lock test: csharp, typescript, or python.\n" +
  "  --force                  Overwrite existing kit-owned files (the scripts and CI workflows).\n" +
  "                           Never overwrites adopter-owned files (ontology.config.json, the ontology\n" +
  "                           document, the enum test) — this is the correct way to upgrade in place.\n" +
  "  --reset-content          Also overwrite adopter-owned files, discarding their content back to\n" +
  "                           the shipped templates. Destructive — use only to genuinely start over.\n" +
  "  --dry-run                Print the file plan and exit without writing.\n" +
  "  --help                   Print this message and exit 0.\n";

/**
 * @param {string[]} argv
 * @returns {Record<string, string | boolean>}
 */
export function parseCliArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    return { help: true };
  }
  const options = { withDriftReview: false, force: false, resetContent: false, dryRun: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg in VALUE_OPTIONS) {
      const value = argv[++index];
      if (value === undefined || value.startsWith("--")) throw new Error(`${arg} needs a value`);
      options[VALUE_OPTIONS[arg]] = value;
    } else if (arg in FLAG_OPTIONS) {
      options[FLAG_OPTIONS[arg]] = true;
    } else {
      throw new Error(`unknown option "${arg}"`);
    }
  }
  if (!options.target) {
    throw new Error(
      "--target is required — usage: node bin/install-ontology.mjs --target <repo> " +
        "[--project-name <name>] [--ontology-path <path>] [--default-branch <name>] " +
        "[--with-drift-review] [--with-enum-tests csharp|typescript|python] " +
        "[--force] [--reset-content] [--dry-run]",
    );
  }
  return options;
}

// pathToFileURL, not `new URL(`file://${process.argv[1]}`)`: the latter percent-encodes the path
// (breaking on spaces/`#`) and additionally mishandles Windows paths (backslashes, drive letters).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    if (options.help) {
      console.log(USAGE);
    } else {
      const result = install(options);
      const verb = options.dryRun ? "would write" : "wrote";
      console.log(`ontology kit: ${verb} ${result.written.length} file(s) into ${options.target}`);
      for (const file of result.written) console.log(`  + ${file}`);
      for (const { dest, ownedBy } of result.skipped) {
        if (ownedBy === "adopter") {
          console.log(`  ~ ${dest} (adopter-owned — kept; re-run with --reset-content to replace it)`);
        } else {
          console.log(`  = ${dest} (exists — re-run with --force to replace)`);
        }
      }
      if (options.dryRun) {
        console.log(`\nProtocol would be spliced into ${result.agentFile}.`);
      } else {
        console.log(`\nProtocol spliced into ${result.agentFile}.`);
      }
      if (result.enumTestExample) {
        console.log(
          `\nNote: ${result.enumTestExample} is a worked example, not working code — it will not ` +
            `compile or run as-is. Adapt it to this repository's real enums, then rename it ` +
            `(dropping the .example suffix) so your build or test runner picks it up.`,
        );
      }
      console.log("Next: run `node scripts/build-ontology.mjs` to create ontology.ttl, then fill it in.");
      console.log("The skills/ontology-setup skill can seed the ontology from this repository's own docs and code.");
    }
  } catch (error) {
    console.error(`ontology kit: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
