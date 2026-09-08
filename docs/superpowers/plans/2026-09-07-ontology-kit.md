# Ontology Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a kit that installs a self-contained domain-ontology discipline — canonical vocabulary file, agent protocol, deterministic CI linter, and optional semantic reviewer and enum lock tests — into any git repository with one command, with no coupling between adopting repositories.

**Architecture:** Two halves. A mechanical installer (`bin/install-ontology.mjs`) copies templates into a target repository, substitutes placeholders, and splices a protocol section into that repository's agent-instruction file between HTML comment markers so re-runs update in place. A skill (`skills/ontology-setup/`) does the judgement the installer cannot: seeding the target's real `docs/ontology.md` from its existing docs and code, then triaging the first lint run. All per-repository variation lives in `ontology.config.json` inside the target, so the installed scripts are byte-identical everywhere.

**Tech Stack:** Node.js (>= 18), plain ESM `.mjs` with JSDoc types, zero runtime dependencies, `node --test` + `node:assert/strict` for tests, GitHub Actions for the installed workflows.

**Source material:** `../the integration repository/scripts/check-ontology-terms.ts`, `../the integration repository/scripts/review-ontology-drift.ts`, `../the integration repository/scripts/review-ontology-drift.test.ts`, `../the integration repository/.github/workflows/ontology-*.yml`, `../the integration repository/CLAUDE.md` §2, `../the application repository/AGENTS.md` (Ontology protocol section), `../the application repository/tests/the application repository.Domain.Tests/OntologyEnumTests.cs`. The spec is `docs/superpowers/specs/2026-09-07-ontology-kit-design.md`.

---

## File Structure

Files created by this plan, and what each one is responsible for.

**Kit tooling (lives here, never copied):**

| File | Responsibility |
|---|---|
| `package.json` | Declares ESM, the `test` script. No dependencies. |
| `bin/install-ontology.mjs` | CLI + pure plan/splice functions for installing into a target repo. |
| `tests/ontology-config.test.mjs` | Config loading and validation. |
| `tests/check-ontology-terms.test.mjs` | Linter unit tests against fixtures. |
| `tests/check-ontology-terms.cli.test.mjs` | Linter end-to-end through a real temp git repo. |
| `tests/install-ontology.test.mjs` | Installer: plan, splice, apply, idempotence. |
| `tests/templates.test.mjs` | Template integrity — every template referenced by the installer exists. |
| `tests/acceptance.test.mjs` | Full install into a temp git repo, then a real lint run. |
| `tests/helpers/temp-repo.mjs` | Shared helper: create/destroy a temporary git repository. |

**Templates (copied verbatim or with placeholder substitution into a target repo):**

| File | Responsibility |
|---|---|
| `templates/scripts/ontology-config.mjs` | Loads and validates `ontology.config.json`. Shared by both installed scripts. |
| `templates/scripts/check-ontology-terms.mjs` | The deterministic linter. |
| `templates/scripts/review-ontology-drift.mjs` | The optional semantic reviewer. |
| `templates/scripts/review-ontology-drift.test.mjs` | Ships with the reviewer; run by the target's blocking preparation job **and** by this repo's own `node --test`. |
| `templates/ontology.config.json` | Starter config with placeholders. |
| `templates/docs/ontology.md` | Annotated ontology template, every known section. |
| `templates/docs/ontology-drift-review.md` | Optional runbook for the reviewer. |
| `templates/protocol/ontology-protocol.md` | The protocol section spliced into the agent-instruction file. |
| `templates/github/workflows/ontology-lint.yml` | Blocking CI. |
| `templates/github/workflows/ontology-drift-review.yml` | Optional CI: blocking preparation job + advisory review job. |
| `templates/enum-tests/csharp-xunit.cs` | Enum lock test pattern, C#/xUnit. |
| `templates/enum-tests/typescript-vitest.ts` | Enum lock test pattern, TypeScript/Vitest. |
| `templates/enum-tests/python-pytest.py` | Enum lock test pattern, Python/pytest. |

**Skill and docs:**

| File | Responsibility |
|---|---|
| `skills/ontology-setup/SKILL.md` | Orchestrates: run installer, seed the ontology, triage the first lint run. |
| `skills/ontology-setup/references/seeding-an-ontology.md` | How to derive a first ontology from an existing repo. |
| `skills/ontology-setup/references/allowlist-discipline.md` | How to triage violations into fixes vs allowlist entries. |
| `skills/ontology-setup/references/llm-drift-review.md` | Setting up the optional reviewer. |
| `skills/ontology-setup/references/enum-lock-tests.md` | Adapting the enum lock test to a repo's enums. |
| `docs/how-it-works.md` | The extracted explanation of the mechanism. |
| `README.md` | Install instructions and options. |

**Note on the module split:** the spec's layout did not name `templates/scripts/ontology-config.mjs`. It is added here because both installed scripts need config loading, and the spec's own guidance prefers focused files over duplication. A core-only install therefore copies two script files, not one.

---

## Task 1: Project scaffolding and test harness

**Files:**
- Create: `package.json`
- Create: `tests/helpers/temp-repo.mjs`
- Create: `tests/helpers/temp-repo.test.mjs`

- [x] **Step 1: Write `package.json`**

```json
{
  "name": "ontology-kit",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Installs a self-contained domain-ontology discipline into any git repository.",
  "engines": { "node": ">=18" },
  "scripts": {
    "test": "node --test"
  }
}
```

- [x] **Step 2: Write the failing test for the temp-repo helper**

Create `tests/helpers/temp-repo.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { withTempRepo } from "./temp-repo.mjs";

test("withTempRepo creates a real git repository and cleans it up", async () => {
  let seen;
  await withTempRepo(async (repo) => {
    seen = repo.dir;
    assert.ok(existsSync(`${repo.dir}/.git`), "expected an initialised git repository");
    repo.write("docs/note.md", "hello");
    assert.equal(readFileSync(`${repo.dir}/docs/note.md`, "utf8"), "hello");
    repo.git("add", "-A");
    repo.git("commit", "-m", "test fixture");
    assert.match(repo.git("ls-files"), /docs\/note\.md/);
  });
  assert.equal(existsSync(seen), false, "expected the temp repository to be removed");
});

test("withTempRepo removes the directory and rethrows when the callback throws", async () => {
  let seen;
  await assert.rejects(
    withTempRepo(async (repo) => {
      seen = repo.dir;
      throw new Error("boom");
    }),
    /boom/,
    "expected the callback's rejection to propagate",
  );
  assert.equal(existsSync(seen), false, "expected the temp repository to be removed even on failure");
});
```

- [x] **Step 3: Run it to make sure it fails**

Run: `node --test tests/helpers/temp-repo.test.mjs`
Expected: FAIL — `Cannot find module .../tests/helpers/temp-repo.mjs`

- [x] **Step 4: Implement the helper**

Create `tests/helpers/temp-repo.mjs`:

```js
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Create a throwaway git repository, hand it to `body`, and remove it afterwards.
 * @param {(repo: {dir: string, write: (rel: string, text: string) => void, git: (...args: string[]) => string}) => Promise<void>} body
 */
export async function withTempRepo(body) {
  const dir = mkdtempSync(join(tmpdir(), "ontology-kit-"));
  const git = (...args) =>
    execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  const write = (rel, text) => {
    const path = join(dir, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  };
  try {
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Ontology Kit Test");
    // Isolate from the host's global/system git config: downstream tests commit inside this
    // repo, and an inherited gpgsign, hooksPath, or commit.template would break or hang them.
    git("config", "commit.gpgsign", "false");
    git("config", "core.hooksPath", join(dir, ".git-hooks-disabled"));
    git("config", "commit.template", "");
    await body({ dir, write, git });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
```

- [x] **Step 5: Run the test to verify it passes**

Run: `node --test tests/helpers/temp-repo.test.mjs`
Expected: PASS — `# pass 2`

- [x] **Step 6: Commit**

```bash
git add package.json tests/helpers/temp-repo.mjs tests/helpers/temp-repo.test.mjs
git commit -m "chore: project scaffolding and temp-repo test helper"
```

---

## Task 2: Config loading and validation

The one file that varies per repository. Validation is strict — an unknown key or a missing justification is an error, because a silently-ignored typo in this file silently weakens the linter.

**Files:**
- Create: `templates/scripts/ontology-config.mjs`
- Test: `tests/ontology-config.test.mjs`

- [x] **Step 1: Write the failing tests**

Create `tests/ontology-config.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import { validateConfig, loadConfig, CONFIG_FILENAME } from "../templates/scripts/ontology-config.mjs";
import { withTempRepo } from "./helpers/temp-repo.mjs";

const minimal = { ontologyPath: "docs/ontology.md" };

test("a minimal config is filled in with empty defaults", () => {
  const config = validateConfig(minimal, { ontologyExists: () => true });
  assert.deepEqual(config, {
    ontologyPath: "docs/ontology.md",
    sections: { required: [], optional: [] },
    allowlist: [],
    bannedAliases: [],
    ignorePaths: [],
  });
});

test("ontologyPath is required", () => {
  assert.throws(
    () => validateConfig({}, { ontologyExists: () => true }),
    /ontologyPath is required/,
  );
});

test("a missing ontology file is reported against its configured path", () => {
  assert.throws(
    () => validateConfig(minimal, { ontologyExists: () => false }),
    /ontologyPath "docs\/ontology\.md" does not exist/,
  );
});

test("an unknown top-level key is an error, not a silent no-op", () => {
  assert.throws(
    () => validateConfig({ ...minimal, allowList: [] }, { ontologyExists: () => true }),
    /unknown key "allowList"/,
  );
});

test("an allowlist entry without a reason is an error", () => {
  assert.throws(
    () => validateConfig({ ...minimal, allowlist: [{ term: "IClock" }] }, { ontologyExists: () => true }),
    /allowlist entry "IClock" has no reason/,
  );
});

test("an allowlist entry without a term is an error", () => {
  assert.throws(
    () => validateConfig({ ...minimal, allowlist: [{ reason: "because" }] }, { ontologyExists: () => true }),
    /allowlist entry 0 has no term/,
  );
});

test("a banned alias without a phrase is an error", () => {
  assert.throws(
    () => validateConfig({ ...minimal, bannedAliases: [{ nameInstead: ["Thing"] }] }, { ontologyExists: () => true }),
    /bannedAliases entry 0 has no phrase/,
  );
});

test("an allowlist given an object instead of an array is an error, not a TypeError", () => {
  assert.throws(
    () => validateConfig({ ...minimal, allowlist: { IClock: "architecture interface" } }, { ontologyExists: () => true }),
    /allowlist must be an array/,
  );
});

test("an allowlist given a bare string instead of an array is an error, not a TypeError", () => {
  assert.throws(
    () => validateConfig({ ...minimal, allowlist: "IClock" }, { ontologyExists: () => true }),
    /allowlist must be an array/,
  );
});

test("an allowlist of null is rejected, not silently treated as empty", () => {
  assert.throws(
    () => validateConfig({ ...minimal, allowlist: null }, { ontologyExists: () => true }),
    /allowlist must be an array/,
  );
});

test("allowlist entries that are bare strings instead of {term, reason} objects are rejected", () => {
  assert.throws(
    () => validateConfig({ ...minimal, allowlist: ["IClock"] }, { ontologyExists: () => true }),
    /allowlist entry 0 must be an object/,
  );
});

test("a bannedAliases of null is rejected, not silently treated as empty", () => {
  assert.throws(
    () => validateConfig({ ...minimal, bannedAliases: null }, { ontologyExists: () => true }),
    /bannedAliases must be an array/,
  );
});

test("sections of null is rejected, not silently treated as empty", () => {
  assert.throws(
    () => validateConfig({ ...minimal, sections: null }, { ontologyExists: () => true }),
    /sections must be an object/,
  );
});

test("ignorePaths given a string instead of an array is an error", () => {
  assert.throws(
    () => validateConfig({ ...minimal, ignorePaths: "CHANGELOG.md" }, { ontologyExists: () => true }),
    /ignorePaths must be an array of non-empty strings/,
  );
});

test("an empty string inside ignorePaths is rejected", () => {
  assert.throws(
    () => validateConfig({ ...minimal, ignorePaths: ["CHANGELOG.md", "   "] }, { ontologyExists: () => true }),
    /ignorePaths must be an array of non-empty strings/,
  );
});

test("an empty string inside sections.required is rejected", () => {
  assert.throws(
    () => validateConfig({ ...minimal, sections: { required: [""] } }, { ontologyExists: () => true }),
    /sections\.required must be an array of non-empty strings/,
  );
});

test("an absolute ontologyPath is rejected as unusable downstream", () => {
  assert.throws(
    () => validateConfig({ ontologyPath: "/abs/path/docs/ontology.md" }, { ontologyExists: () => true }),
    /ontologyPath must be repository-relative, not absolute/,
  );
});

test("an ontologyPath containing a \"..\" segment is rejected", () => {
  assert.throws(
    () => validateConfig({ ontologyPath: "../../secrets.md" }, { ontologyExists: () => true }),
    /ontologyPath must not contain "\.\." segments/,
  );
});

test("a ./-prefixed ontologyPath is normalised so it matches git ls-files output", () => {
  const config = validateConfig({ ontologyPath: "./docs/ontology.md" }, { ontologyExists: () => true });
  assert.equal(config.ontologyPath, "docs/ontology.md");
});

test("a path that only becomes absolute after normalisation is still rejected", () => {
  // A Windows-authored "\docs\ontology.md" normalises to "/docs/ontology.md". Validating before
  // normalising would let it through, and the linter could then never match it against its own
  // git ls-files output.
  for (const escaping of ["\\etc\\passwd", "\\\\server\\share\\ontology.md", ".//etc/passwd"]) {
    assert.throws(
      () => validateConfig({ ontologyPath: escaping }, { ontologyExists: () => true }),
      /ontologyPath must be repository-relative, not absolute/,
      `expected ${escaping} to be rejected`,
    );
  }
});

test("a padded allowlist term and reason are stored trimmed, so they actually match", () => {
  const config = validateConfig(
    { ...minimal, allowlist: [{ term: "  IClock  ", reason: "  architecture interface  " }] },
    { ontologyExists: () => true },
  );
  assert.deepEqual(config.allowlist, [{ term: "IClock", reason: "architecture interface" }]);
});

test("requireStringArray returns a fresh array, not the caller's reference", () => {
  const ignorePaths = ["CHANGELOG.md"];
  const config = validateConfig({ ...minimal, ignorePaths }, { ontologyExists: () => true });
  config.ignorePaths.push("mutated.md");
  assert.deepEqual(ignorePaths, ["CHANGELOG.md"]);
});

test("a valid full config round-trips", () => {
  const config = validateConfig({
    ontologyPath: "docs/ontology.md",
    sections: { required: ["Entities"], optional: ["Enums"] },
    allowlist: [{ term: "IClock", reason: "architecture interface" }],
    bannedAliases: [{ phrase: "the billing platform", nameInstead: ["VendorPortal"] }],
    ignorePaths: ["CHANGELOG.md"],
  }, { ontologyExists: () => true });
  assert.equal(config.allowlist[0].term, "IClock");
  assert.deepEqual(config.bannedAliases[0].nameInstead, ["VendorPortal"]);
  assert.deepEqual(config.ignorePaths, ["CHANGELOG.md"]);
});

test("loadConfig names the file when it is absent", async () => {
  await withTempRepo(async (repo) => {
    assert.throws(() => loadConfig({ cwd: repo.dir }), new RegExp(`${CONFIG_FILENAME} not found`));
  });
});

test("loadConfig reports invalid JSON with the parser message", async () => {
  await withTempRepo(async (repo) => {
    repo.write(CONFIG_FILENAME, "{ not json");
    assert.throws(() => loadConfig({ cwd: repo.dir }), /is not valid JSON/);
  });
});

test("loadConfig reads a real config from disk", async () => {
  await withTempRepo(async (repo) => {
    repo.write("docs/ontology.md", "# Ontology");
    repo.write(CONFIG_FILENAME, JSON.stringify({ ontologyPath: "docs/ontology.md" }));
    const config = loadConfig({ cwd: repo.dir });
    assert.equal(config.ontologyPath, "docs/ontology.md");
  });
});

test("loadConfig reports a genuinely missing ontology file against the repository, not the process cwd", async () => {
  await withTempRepo(async (repo) => {
    repo.write(CONFIG_FILENAME, JSON.stringify({ ontologyPath: "docs/ontology.md" }));
    assert.throws(
      () => loadConfig({ cwd: repo.dir }),
      /ontologyPath "docs\/ontology\.md" does not exist/,
    );
  });
});

test("loadConfig with only configPath resolves ontologyPath against the config's own directory, not process.cwd()", async () => {
  await withTempRepo(async (repo) => {
    repo.write("docs/ontology.md", "# Ontology");
    repo.write(CONFIG_FILENAME, JSON.stringify({ ontologyPath: "docs/ontology.md" }));
    const configPath = join(repo.dir, CONFIG_FILENAME);
    // Deliberately omit cwd — a caller who only knows the config file's path (e.g. found it by
    // walking up from some unrelated working directory) must still get ontologyPath resolved
    // next to that config, not against wherever this process happens to be running from.
    const config = loadConfig({ configPath });
    assert.equal(config.ontologyPath, "docs/ontology.md");
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/ontology-config.test.mjs`
Expected: FAIL — `Cannot find module .../templates/scripts/ontology-config.mjs`

- [x] **Step 3: Implement the config module**

Create `templates/scripts/ontology-config.mjs`:

```js
// Loads and validates ontology.config.json — the only per-repository file in the ontology kit.
// Both installed scripts read their repository-specific values through here, which is what lets
// check-ontology-terms.mjs and review-ontology-drift.mjs stay byte-identical across repositories.
//
// Validation is deliberately strict. A silently-ignored typo in this file is a silently weakened
// linter, so an unknown key is an error, and every allowlist entry must carry a written reason.
// The same reasoning is why `??` is never used to fall back on a present-but-`null` field: `null`
// is a value the author wrote, not an absent one, and coalescing it into a default would validate
// a config that looks configured while quietly disabling the check it configures.

import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

export const CONFIG_FILENAME = "ontology.config.json";

const KNOWN_KEYS = new Set([
  "$schema",
  "ontologyPath",
  "sections",
  "allowlist",
  "bannedAliases",
  "ignorePaths",
]);

const WINDOWS_DRIVE_RE = /^[A-Za-z]:[\\/]/;

/**
 * @typedef {{ term: string, reason: string }} AllowlistEntry
 * @typedef {{ phrase: string, nameInstead: string[] }} BannedAlias
 * @typedef {{ ontologyPath: string, sections: { required: string[], optional: string[] },
 *             allowlist: AllowlistEntry[], bannedAliases: BannedAlias[], ignorePaths: string[] }} OntologyConfig
 */

function requireStringArray(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`${CONFIG_FILENAME}: ${label} must be an array of non-empty strings`);
  }
  return value.map((item) => item.trim());
}

function requireEntryArray(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`${CONFIG_FILENAME}: ${label} must be an array`);
  }
  return value;
}

/**
 * @param {unknown} raw
 * @param {{ ontologyExists?: (path: string) => boolean }} [deps]
 * @returns {OntologyConfig}
 */
export function validateConfig(raw, deps = {}) {
  const ontologyExists = deps.ontologyExists ?? existsSync;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${CONFIG_FILENAME}: expected a JSON object`);
  }
  const input = /** @type {Record<string, any>} */ (raw);

  for (const key of Object.keys(input)) {
    if (!KNOWN_KEYS.has(key)) {
      throw new Error(
        `${CONFIG_FILENAME}: unknown key "${key}" — expected one of ${[...KNOWN_KEYS].join(", ")}`,
      );
    }
  }

  if (typeof input.ontologyPath !== "string" || !input.ontologyPath.trim()) {
    throw new Error(`${CONFIG_FILENAME}: ontologyPath is required and must be a non-empty string`);
  }
  // Normalise before validating, not after: a Windows-authored "\docs\ontology.md" becomes
  // "/docs/ontology.md", so checking absoluteness first would pass a path that normalisation
  // then turns absolute — and the linter's `file !== ontologyPath` self-exclusion would never
  // match it, flooding the repository with false violations.
  const ontologyPath = input.ontologyPath
    .trim()
    .replace(/\\/g, "/")
    .replace(/^(?:\.\/)+/, "");
  if (isAbsolute(ontologyPath) || ontologyPath.startsWith("/") || WINDOWS_DRIVE_RE.test(ontologyPath)) {
    throw new Error(
      `${CONFIG_FILENAME}: ontologyPath must be repository-relative, not absolute: "${input.ontologyPath}"`,
    );
  }
  if (ontologyPath.split("/").includes("..")) {
    throw new Error(
      `${CONFIG_FILENAME}: ontologyPath must not contain ".." segments: "${input.ontologyPath}"`,
    );
  }
  if (!ontologyExists(ontologyPath)) {
    throw new Error(
      `${CONFIG_FILENAME}: ontologyPath "${ontologyPath}" does not exist — ` +
        `create the ontology file or correct the path`,
    );
  }

  const sections = input.sections === undefined ? {} : input.sections;
  if (sections === null || typeof sections !== "object" || Array.isArray(sections)) {
    throw new Error(`${CONFIG_FILENAME}: sections must be an object`);
  }

  const allowlist = requireEntryArray(input.allowlist, "allowlist").map((entry, index) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`${CONFIG_FILENAME}: allowlist entry ${index} must be an object`);
    }
    if (typeof entry.term !== "string" || !entry.term.trim()) {
      throw new Error(`${CONFIG_FILENAME}: allowlist entry ${index} has no term`);
    }
    const term = entry.term.trim();
    if (typeof entry.reason !== "string" || !entry.reason.trim()) {
      throw new Error(
        `${CONFIG_FILENAME}: allowlist entry "${term}" has no reason — ` +
          `every allowlisted term must say why it is not a domain concept`,
      );
    }
    return { term, reason: entry.reason.trim() };
  });

  const bannedAliases = requireEntryArray(input.bannedAliases, "bannedAliases").map((entry, index) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`${CONFIG_FILENAME}: bannedAliases entry ${index} must be an object`);
    }
    if (typeof entry.phrase !== "string" || !entry.phrase.trim()) {
      throw new Error(`${CONFIG_FILENAME}: bannedAliases entry ${index} has no phrase`);
    }
    const phrase = entry.phrase.trim();
    return {
      phrase,
      nameInstead: requireStringArray(entry.nameInstead, `bannedAliases["${phrase}"].nameInstead`),
    };
  });

  return {
    ontologyPath,
    sections: {
      required: requireStringArray(sections.required, "sections.required"),
      optional: requireStringArray(sections.optional, "sections.optional"),
    },
    allowlist,
    bannedAliases,
    ignorePaths: requireStringArray(input.ignorePaths, "ignorePaths"),
  };
}

/**
 * @param {{ cwd?: string, configPath?: string }} [options]
 * @returns {OntologyConfig}
 */
export function loadConfig(options = {}) {
  const configPath = options.configPath ?? join(options.cwd ?? process.cwd(), CONFIG_FILENAME);
  // The ontology path is repo-relative, so it must resolve against the repository root. `cwd`
  // is that root when given; otherwise fall back to the directory the config itself lives in
  // (not process.cwd()) so that pointing configPath at a config elsewhere on disk still resolves
  // ontologyPath next to it, rather than against whatever directory this process happens to run from.
  const baseDir = options.cwd ?? (options.configPath ? dirname(options.configPath) : process.cwd());
  if (!existsSync(configPath)) {
    throw new Error(
      `${CONFIG_FILENAME} not found at ${configPath} — run the ontology kit installer, ` +
        `or run this script from the repository root`,
    );
  }
  const text = readFileSync(configPath, "utf8").replace(/^\uFEFF/, "");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `${configPath} is not valid JSON: ${error instanceof Error ? error.message : error}`,
    );
  }
  return validateConfig(parsed, {
    ontologyExists: (path) => existsSync(isAbsolute(path) ? path : join(baseDir, path)),
  });
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/ontology-config.test.mjs`
Expected: PASS — `# pass 28`, `# fail 0`

- [x] **Step 5: Commit**

```bash
git add templates/scripts/ontology-config.mjs tests/ontology-config.test.mjs
git commit -m "feat: strict ontology.config.json loading and validation"
```

---

## Task 3: Linter — canonical terms and the unknown-term check

Ported from `../the integration repository/scripts/check-ontology-terms.ts`. The canonical vocabulary is every backticked PascalCase term appearing anywhere in the ontology file; the ontology file itself is exempt from the check because it is the source, not a consumer.

**Files:**
- Create: `templates/scripts/check-ontology-terms.mjs`
- Test: `tests/check-ontology-terms.test.mjs`

- [x] **Step 1: Write the failing tests**

Create `tests/check-ontology-terms.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  backtickedTerms,
  canonicalTerms,
  lintFile,
  globToRegExp,
  parseArgs,
  discoverFiles,
} from "../templates/scripts/check-ontology-terms.mjs";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { withTempRepo } from "./helpers/temp-repo.mjs";

const ontology = `# Ontology

## Entities

| Name | Description |
|------|-------------|
| \`Invoice\` | An invoice. |
| \`Payment\` | A payment. |

## Enums

| Name | Values |
|------|--------|
| \`InvoiceStatus\` | \`Approved\`, \`Paid\` |

Some prose mentioning \`camelCase\` and \`some field\` which are not PascalCase.
`;

const emptyConfig = { allowlist: [], bannedAliases: [] };

test("backtickedTerms finds every backticked span with its index", () => {
  assert.deepEqual(backtickedTerms("aa `One` bb `Two`"), [
    { term: "One", index: 3 },
    { term: "Two", index: 12 },
  ]);
});

test("canonical terms are the backticked PascalCase terms in the ontology", () => {
  const canonical = canonicalTerms(ontology);
  assert.deepEqual([...canonical].sort(), ["Approved", "Invoice", "InvoiceStatus", "Paid", "Payment"]);
});

test("a backticked PascalCase term absent from the ontology is a violation", () => {
  const violations = lintFile({
    file: "docs/spec.md",
    text: "The `Bill` is sent.",
    canonical: canonicalTerms(ontology),
    config: emptyConfig,
    ontologyPath: "docs/ontology.md",
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].file, "docs/spec.md");
  assert.equal(violations[0].line, 1);
  assert.match(violations[0].message, /`Bill` is not defined in docs\/ontology\.md/);
});

test("a canonical term is not a violation", () => {
  const violations = lintFile({
    file: "docs/spec.md",
    text: "The `Invoice` is sent.",
    canonical: canonicalTerms(ontology),
    config: emptyConfig,
    ontologyPath: "docs/ontology.md",
  });
  assert.deepEqual(violations, []);
});

test("non-PascalCase backticked spans are ignored", () => {
  const violations = lintFile({
    file: "docs/spec.md",
    text: "Set `invoiceId` on `git ls-files` and `some phrase`.",
    canonical: canonicalTerms(ontology),
    config: emptyConfig,
    ontologyPath: "docs/ontology.md",
  });
  assert.deepEqual(violations, []);
});

test("an allowlisted term is not a violation", () => {
  const violations = lintFile({
    file: "docs/spec.md",
    text: "The `IClock` abstraction.",
    canonical: canonicalTerms(ontology),
    config: { allowlist: [{ term: "IClock", reason: "architecture interface" }], bannedAliases: [] },
    ontologyPath: "docs/ontology.md",
  });
  assert.deepEqual(violations, []);
});

test("the ontology file itself is exempt from the unknown-term check", () => {
  const violations = lintFile({
    file: "docs/ontology.md",
    text: "The `Bill` is defined here.",
    canonical: canonicalTerms(ontology),
    config: emptyConfig,
    ontologyPath: "docs/ontology.md",
  });
  assert.deepEqual(violations, []);
});

test("violations report the correct one-based line number", () => {
  const violations = lintFile({
    file: "docs/spec.md",
    text: "line one\nline two\nthe `Bill` here",
    canonical: canonicalTerms(ontology),
    config: emptyConfig,
    ontologyPath: "docs/ontology.md",
  });
  assert.equal(violations[0].line, 3);
});

test("canonicalTerms throws when the ontology yields no terms", () => {
  assert.throws(() => canonicalTerms("# Empty\n\nNo backticks at all."), /no canonical terms/);
});

test("an all-caps token like README is not flagged as a domain term", () => {
  const violations = lintFile({
    file: "docs/spec.md",
    text: "See the `README` and the `PATH` and the `API`.",
    canonical: canonicalTerms(ontology),
    config: emptyConfig,
    ontologyPath: "docs/ontology.md",
  });
  assert.deepEqual(violations, []);
});

test("a JS template literal inside a fenced code block is not flagged", () => {
  const violations = lintFile({
    file: "docs/spec.md",
    text: "```js\nconst msg = `Ready`;\n```\n",
    canonical: canonicalTerms(ontology),
    config: emptyConfig,
    ontologyPath: "docs/ontology.md",
  });
  assert.deepEqual(violations, []);
});

test("a nested Markdown example inside a fenced code block is not flagged", () => {
  const violations = lintFile({
    file: "docs/spec.md",
    text: "```md\nThe `LegacyBill` term is deprecated.\n```\n",
    canonical: canonicalTerms(ontology),
    config: emptyConfig,
    ontologyPath: "docs/ontology.md",
  });
  assert.deepEqual(violations, []);
});

test("a tilde fence also excludes its content from the check", () => {
  const violations = lintFile({
    file: "docs/spec.md",
    text: "~~~\n`Bill`\n~~~\n",
    canonical: canonicalTerms(ontology),
    config: emptyConfig,
    ontologyPath: "docs/ontology.md",
  });
  assert.deepEqual(violations, []);
});

test("the same unknown term repeated on one line yields exactly one violation", () => {
  const violations = lintFile({
    file: "docs/spec.md",
    text: "`Bill` and `Bill` and `Bill`",
    canonical: canonicalTerms(ontology),
    config: emptyConfig,
    ontologyPath: "docs/ontology.md",
  });
  assert.equal(violations.length, 1);
});

test("a CRLF file reports the correct line number", () => {
  const violations = lintFile({
    file: "docs/spec.md",
    text: "line one\r\nline two\r\nthe `Bill` here\r\n",
    canonical: canonicalTerms(ontology),
    config: emptyConfig,
    ontologyPath: "docs/ontology.md",
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 3);
});

test("a wrong-capitalisation term gets a hint naming the canonical spelling", () => {
  const localOntology = "# Ontology\n\n| `SentToVendor` | x |\n";
  const violations = lintFile({
    file: "docs/spec.md",
    text: "The `SentToVENDOR` event fired.",
    canonical: canonicalTerms(localOntology),
    config: emptyConfig,
    ontologyPath: "docs/ontology.md",
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /did you mean `SentToVendor`/);
});

const aliasConfig = {
  allowlist: [],
  bannedAliases: [{ phrase: "the billing platform", nameInstead: ["VendorPortal"] }],
};

test("a banned alias in prose is a violation naming the canonical alternative", () => {
  const violations = lintFile({
    file: "docs/spec.md",
    text: "We poll the billing platform for approvals.",
    canonical: canonicalTerms(ontology),
    config: aliasConfig,
    ontologyPath: "docs/ontology.md",
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /"the billing platform"/);
  assert.match(violations[0].message, /VendorPortal/);
});

test("the banned-alias match is case-insensitive", () => {
  const violations = lintFile({
    file: "docs/spec.md",
    text: "The Billing Platform is polled.",
    canonical: canonicalTerms(ontology),
    config: aliasConfig,
    ontologyPath: "docs/ontology.md",
  });
  assert.equal(violations.length, 1);
});

test("a double-quoted banned alias is a meta-mention and is allowed", () => {
  const violations = lintFile({
    file: "docs/spec.md",
    text: 'Do not write "the billing platform" in prose.',
    canonical: canonicalTerms(ontology),
    config: aliasConfig,
    ontologyPath: "docs/ontology.md",
  });
  assert.deepEqual(violations, []);
});

test("a curly-quoted banned alias is also a meta-mention", () => {
  const violations = lintFile({
    file: "docs/spec.md",
    text: "Do not write “the billing platform” in prose.",
    canonical: canonicalTerms(ontology),
    config: aliasConfig,
    ontologyPath: "docs/ontology.md",
  });
  assert.deepEqual(violations, []);
});

test("every occurrence of a banned alias on one line is reported", () => {
  const violations = lintFile({
    file: "docs/spec.md",
    text: "the billing platform talks to the billing platform",
    canonical: canonicalTerms(ontology),
    config: aliasConfig,
    ontologyPath: "docs/ontology.md",
  });
  assert.equal(violations.length, 2);
});

test("the banned-alias check applies to the ontology file too", () => {
  const violations = lintFile({
    file: "docs/ontology.md",
    text: "Do not call it the billing platform.",
    canonical: canonicalTerms(ontology),
    config: aliasConfig,
    ontologyPath: "docs/ontology.md",
  });
  assert.equal(violations.length, 1);
});

test("a banned alias with no nameInstead still produces a usable message", () => {
  const violations = lintFile({
    file: "docs/spec.md",
    text: "the billing platform is polled",
    canonical: canonicalTerms(ontology),
    config: { allowlist: [], bannedAliases: [{ phrase: "the billing platform", nameInstead: [] }] },
    ontologyPath: "docs/ontology.md",
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /name the External System from docs\/ontology\.md instead/);
});

test("a banned alias inside a fenced code block is not flagged", () => {
  const violations = lintFile({
    file: "docs/spec.md",
    text: "```md\nthe billing platform\n```\n",
    canonical: canonicalTerms(ontology),
    config: aliasConfig,
    ontologyPath: "docs/ontology.md",
  });
  assert.deepEqual(violations, []);
});

test("a backticked banned alias is a meta-mention and is allowed", () => {
  const violations = lintFile({
    file: "docs/ontology.md",
    text: "Never write `the billing platform`; name `VendorPortal`.",
    canonical: new Set(["VendorPortal"]),
    config: aliasConfig,
    ontologyPath: "docs/ontology.md",
  });
  assert.deepEqual(violations, []);
});

test("the possessive form of a banned alias is still flagged, not exempted as a quote", () => {
  const violations = lintFile({
    file: "docs/spec.md",
    text: "We call the billing platform's API directly.",
    canonical: canonicalTerms(ontology),
    config: aliasConfig,
    ontologyPath: "docs/ontology.md",
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /"the billing platform"/);
});

test("the plural form of a banned alias is still caught (no word-boundary check)", () => {
  const violations = lintFile({
    file: "docs/spec.md",
    text: "We poll the billing platforms for approvals.",
    canonical: canonicalTerms(ontology),
    config: aliasConfig,
    ontologyPath: "docs/ontology.md",
  });
  assert.equal(violations.length, 1);
});

test("multiple configured aliases are each detected independently on the same line", () => {
  const multiAliasConfig = {
    allowlist: [],
    bannedAliases: [
      { phrase: "the billing platform", nameInstead: ["VendorPortal"] },
      { phrase: "the tax service", nameInstead: ["TaxCore"] },
    ],
  };
  const violations = lintFile({
    file: "docs/spec.md",
    text: "the billing platform talks to the tax service.",
    canonical: canonicalTerms(ontology),
    config: multiAliasConfig,
    ontologyPath: "docs/ontology.md",
  });
  assert.equal(violations.length, 2);
  assert.match(violations[0].message, /"the billing platform"/);
  assert.match(violations[0].message, /VendorPortal/);
  assert.match(violations[1].message, /"the tax service"/);
  assert.match(violations[1].message, /TaxCore/);
});

test("a banned-alias violation reports the correct line number on multi-line input", () => {
  const violations = lintFile({
    file: "docs/spec.md",
    text: "line one\nline two\nwe use the billing platform here",
    canonical: canonicalTerms(ontology),
    config: aliasConfig,
    ontologyPath: "docs/ontology.md",
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 3);
});

test("a line carrying both an unknown term and a banned alias reports both violations", () => {
  const violations = lintFile({
    file: "docs/spec.md",
    text: "The `Bill` is sent by the billing platform.",
    canonical: canonicalTerms(ontology),
    config: aliasConfig,
    ontologyPath: "docs/ontology.md",
  });
  assert.equal(violations.length, 2);
  assert.ok(violations.some((v) => /"the billing platform"/.test(v.message)));
  assert.ok(violations.some((v) => /`Bill` is not defined/.test(v.message)));
});

test("a banned-alias violation carries a 1-based column for the match", () => {
  const violations = lintFile({
    file: "docs/spec.md",
    text: "we use the billing platform here",
    canonical: canonicalTerms(ontology),
    config: aliasConfig,
    ontologyPath: "docs/ontology.md",
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].column, 8);
});

test("an unknown-term violation carries a 1-based column for the match", () => {
  const violations = lintFile({
    file: "docs/spec.md",
    text: "The `Bill` is sent.",
    canonical: canonicalTerms(ontology),
    config: emptyConfig,
    ontologyPath: "docs/ontology.md",
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].column, 5);
});

test("two occurrences of a banned alias on one line get different columns", () => {
  const violations = lintFile({
    file: "docs/spec.md",
    text: "the billing platform talks to the billing platform",
    canonical: canonicalTerms(ontology),
    config: aliasConfig,
    ontologyPath: "docs/ontology.md",
  });
  assert.equal(violations.length, 2);
  assert.equal(violations[0].column, 1);
  assert.equal(violations[1].column, 31);
  assert.notEqual(violations[0].column, violations[1].column);
});

test("globToRegExp matches a literal path", () => {
  assert.equal(globToRegExp("CHANGELOG.md").test("CHANGELOG.md"), true);
  assert.equal(globToRegExp("CHANGELOG.md").test("docs/CHANGELOG.md"), false);
});

test("a single star does not cross a directory separator", () => {
  const pattern = globToRegExp("docs/*.md");
  assert.equal(pattern.test("docs/a.md"), true);
  assert.equal(pattern.test("docs/nested/a.md"), false);
});

test("a double star crosses directory separators", () => {
  const pattern = globToRegExp("vendor/**");
  assert.equal(pattern.test("vendor/a.md"), true);
  assert.equal(pattern.test("vendor/deep/nested/a.md"), true);
  assert.equal(pattern.test("vendors/a.md"), false);
});

test("glob special characters in the pattern are escaped, not interpreted", () => {
  assert.equal(globToRegExp("a+b.md").test("a+b.md"), true);
  assert.equal(globToRegExp("a+b.md").test("aab.md"), false);
});

test("parseArgs collects --also paths", () => {
  assert.deepEqual(parseArgs(["--also", "pr-body.md", "other.md"]), { alsoPaths: ["pr-body.md", "other.md"] });
});

test("parseArgs returns no extra paths when --also is absent", () => {
  assert.deepEqual(parseArgs([]), { alsoPaths: [] });
});

test("parseArgs rejects an unknown flag", () => {
  assert.throws(() => parseArgs(["--verbose"]), /unknown argument "--verbose"/);
});

test("discoverFiles returns tracked markdown, minus ignorePaths, plus --also paths", async () => {
  await withTempRepo(async (repo) => {
    repo.write("docs/ontology.md", "# Ontology\n\n| `Invoice` | x |");
    repo.write("docs/spec.md", "text");
    repo.write("CHANGELOG.md", "text");
    repo.write("notes.txt", "text");
    repo.git("add", "-A");
    repo.git("commit", "-m", "fixture");
    repo.write("scratch/pr-body.md", "untracked");

    const files = discoverFiles({
      cwd: repo.dir,
      ignorePaths: ["CHANGELOG.md"],
      alsoPaths: ["scratch/pr-body.md"],
    });

    assert.deepEqual(files.sort(), ["docs/ontology.md", "docs/spec.md", "scratch/pr-body.md"]);
  });
});

test("discoverFiles does not duplicate an --also path that is already tracked", async () => {
  await withTempRepo(async (repo) => {
    repo.write("docs/ontology.md", "# Ontology\n\n| `Invoice` | x |");
    repo.git("add", "-A");
    repo.git("commit", "-m", "fixture");

    const files = discoverFiles({ cwd: repo.dir, ignorePaths: [], alsoPaths: ["docs/ontology.md"] });
    assert.deepEqual(files, ["docs/ontology.md"]);
  });
});

test("discoverFiles accepts an absolute --also path outside the repository", async () => {
  // The agent protocol documents linting a drafted PR body held in a scratch file, by absolute
  // path. Joining rather than resolving would report that real file as missing.
  await withTempRepo(async (repo) => {
    repo.write("docs/ontology.md", "# Ontology\n\n| `Invoice` | x |");
    repo.git("add", "-A");
    repo.git("commit", "-m", "fixture");

    const outside = join(mkdtempSync(join(tmpdir(), "ontology-kit-outside-")), "pr-body.md");
    writeFileSync(outside, "A drafted body mentioning `Gadget`.\n");
    try {
      const files = discoverFiles({ cwd: repo.dir, ignorePaths: [], alsoPaths: [outside] });
      assert.ok(files.includes(outside), `expected ${outside} among ${files.join(", ")}`);
    } finally {
      rmSync(dirname(outside), { recursive: true, force: true });
    }
  });
});

test("discoverFiles rejects an --also path that is a directory", async () => {
  await withTempRepo(async (repo) => {
    repo.write("docs/ontology.md", "# Ontology\n\n| `Invoice` | x |");
    repo.git("add", "-A");
    repo.git("commit", "-m", "fixture");

    assert.throws(
      () => discoverFiles({ cwd: repo.dir, ignorePaths: [], alsoPaths: ["docs"] }),
      /--also path "docs" is a directory — pass the Markdown file itself/,
    );
  });
});

test("discoverFiles reports an --also path that does not exist", async () => {
  await withTempRepo(async (repo) => {
    repo.write("docs/ontology.md", "# Ontology\n\n| `Invoice` | x |");
    repo.git("add", "-A");
    repo.git("commit", "-m", "fixture");

    assert.throws(
      () => discoverFiles({ cwd: repo.dir, ignorePaths: [], alsoPaths: ["missing.md"] }),
      /--also path "missing\.md" does not exist/,
    );
  });
});

test("discoverFiles normalises an --also path the same way ontologyPath is normalised, so a ./-prefixed --also path matches an already-tracked file instead of double-linting it", async () => {
  await withTempRepo(async (repo) => {
    repo.write("docs/ontology.md", "# Ontology\n\n| `Invoice` | x |");
    repo.git("add", "-A");
    repo.git("commit", "-m", "fixture");

    const files = discoverFiles({ cwd: repo.dir, ignorePaths: [], alsoPaths: ["./docs/ontology.md"] });
    assert.deepEqual(files, ["docs/ontology.md"]);
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/check-ontology-terms.test.mjs`
Expected: FAIL — `Cannot find module .../templates/scripts/check-ontology-terms.mjs`

- [x] **Step 3: Implement the term extraction and unknown-term check**

Create `templates/scripts/check-ontology-terms.mjs`:

```js
// Deterministic ontology term linter — the blocking half of the drift defence.
//
// Enforces, across the repository's Markdown, the exact-name discipline the ontology mandates:
//
//   1. Unknown-term check: a backticked PascalCase identifier that is not defined in the ontology
//      (and not allowlisted) is an error. Catches invented synonyms and misspellings.
//   2. Banned-alias check: prose that paraphrases a named External System instead of naming it is
//      an error, unless the match is quoted — quoting marks a meta-mention, such as the ontology's
//      own "do not say this" instruction.
//
// It cannot catch unbackticked paraphrase drift ("Approved -> Sent -> Paid"). That is the job of
// the optional advisory reviewer in review-ontology-drift.mjs.
//
// Everything repository-specific lives in ontology.config.json. This file is identical in every
// repository that installs the ontology kit; do not edit it locally.
//
// Run: node scripts/check-ontology-terms.mjs [--also <path>...]

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { loadConfig } from "./ontology-config.mjs";

// Requires at least one lowercase letter after the leading capital, so an all-caps token
// (`README`, `PATH`, `API`, `JSON`, `HTTP`, `ID`) does not read as PascalCase. Measured across
// 120 neutral technical Markdown files, 37.5% of distinct backticked-cap matches were all-caps
// tokens, not domain concepts — with the shipped starter config's allowlist empty, that is a wall
// of false positives on an adopter's very first run, which is exactly how a control gets silenced
// before it ever earns trust. The same regex drives both canonical extraction and this check, so
// an all-caps ontology term (`SLA`, `KYC`) simply loses coverage rather than becoming a false
// positive — no inconsistency is introduced. That loss is accepted deliberately: in a linter that
// ships byte-identical to every repository, false positives are more damaging than missed
// detections.
const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*$/;

// A banned-alias match immediately preceded or followed by one of these is a meta-mention (the
// ontology or a spec quoting the forbidden phrase in order to forbid it) rather than paraphrase
// drift, and is exempt. Covers straight double quotes, both curly-quote directions, and backticks
// — inline code is at least as idiomatic as double quotes for writing a forbidden literal in
// Markdown, and it is the style this kit's own templates use throughout.
//
// Deliberately EXCLUDES straight and curly apostrophes ('/'): those occur as ordinary English
// possessives in prose (e.g. "the billing platform's API"), and treating them as quote markers
// would silently exempt exactly the paraphrase drift this check exists to catch.
const QUOTE_CHARS = new Set(['"', "“", "”", "`"]);

// Matches an opening or closing fence line for either fence style, allowing up to three leading
// spaces per CommonMark. Deliberately does not track fence length or info strings — any fence
// marker toggles the "inside a fence" flag.
const FENCE_RE = /^\s{0,3}(```|~~~)/;

/**
 * @param {string} text
 * @returns {{ term: string, index: number }[]}
 */
export function backtickedTerms(text) {
  const out = [];
  for (const match of text.matchAll(/`([^`\n]+)`/g)) {
    out.push({ term: match[1], index: match.index });
  }
  return out;
}

/**
 * The canonical vocabulary: every backticked PascalCase term the ontology defines or names.
 * @param {string} ontologyMarkdown
 * @returns {Set<string>}
 */
export function canonicalTerms(ontologyMarkdown) {
  const canonical = new Set(
    backtickedTerms(ontologyMarkdown)
      .map(({ term }) => term)
      .filter((term) => PASCAL_CASE.test(term)),
  );
  if (canonical.size === 0) {
    throw new Error(
      "no canonical terms found in the ontology — it must name its concepts as backticked " +
        "PascalCase terms (for example `Invoice`)",
    );
  }
  return canonical;
}

/**
 * @typedef {{ file: string, line: number, column: number, message: string }} Violation
 */

/**
 * Banned-alias check for a single line. Quoted matches are meta-mentions, so they are allowed —
 * this is what lets the ontology state its own prohibition without failing on it. Unlike
 * `checkUnknownTermsOnLine`, this is called even when `file === ontologyPath`: the ontology's own
 * narrative prose is exactly where a paraphrase is most likely to slip in, so it gets no exemption.
 *
 * Matching is plain case-insensitive substring matching — there is no word-boundary check.
 * Configured phrases are expected to be multi-word paraphrases ("the billing platform"), for which
 * substring matching is exact. A bare short token (e.g. `crm`) will match inside a larger word
 * (`scrmsystem`); the fix is to configure the multi-word phrase people actually write, not to add a
 * boundary check. A boundary check is deliberately NOT applied: it would stop catching plurals
 * (`the billing platforms` is currently caught by design; a trailing `\b` would lose it), and that
 * loss would be unfixable from the config, unlike the misconfiguration a boundary check would
 * guard against.
 *
 * @param {{ line: string, lineNo: number, file: string,
 *           config: { bannedAliases: {phrase: string, nameInstead: string[]}[] },
 *           ontologyPath: string }} input
 * @returns {Violation[]}
 */
function checkBannedAliasesOnLine({ line, lineNo, file, config, ontologyPath }) {
  /** @type {Violation[]} */
  const violations = [];

  // Deliberately NOT de-duplicated per line (contrast the unknown-term check's `seenOnLine`):
  // the spec requires every occurrence to be reported, because each occurrence is a separate
  // piece of prose someone has to rewrite, whereas a repeated unknown term is one fix. Do not
  // "fix" this into a dedup to match the other check — that would be a regression.
  const lower = line.toLowerCase();
  for (const alias of config.bannedAliases) {
    const phrase = alias.phrase.toLowerCase();
    let from = 0;
    for (;;) {
      const at = lower.indexOf(phrase, from);
      if (at === -1) break;
      from = at + phrase.length;
      // Read both neighbours from `lower`, not `line`: every member of QUOTE_CHARS is
      // case-invariant, so this is equivalent, and it avoids a desync. `line.toLowerCase()` can
      // change string length (e.g. "İ".toLowerCase() is two UTF-16 code units), which would shift
      // every index taken from `lower` relative to `line` and misalign this lookup.
      const before = lower[at - 1] ?? "";
      const after = lower[at + phrase.length] ?? "";
      if (QUOTE_CHARS.has(before) || QUOTE_CHARS.has(after)) continue;
      const suggestion = alias.nameInstead.length
        ? `name ${alias.nameInstead.map((name) => `\`${name}\``).join(" or ")} instead`
        : `name the External System from ${ontologyPath} instead`;
      violations.push({
        file,
        line: lineNo,
        column: at + 1,
        // Echoes the configured phrase's casing (`alias.phrase`), not the text the user actually
        // wrote — this ties the violation back to the entry in ontology.config.json, and slicing
        // the matched text out of `line` instead would reintroduce the same index-desync trap the
        // comment above just fixed.
        message: `"${alias.phrase}" is a paraphrase of an External System named in ${ontologyPath} — ${suggestion}`,
      });
    }
  }
  return violations;
}

/**
 * Unknown-term check for a single line. One violation per (line, term): the same unknown term
 * repeated on one line is one fix to make, not several identical, triple-counted messages.
 *
 * @param {{ line: string, lineNo: number, file: string, canonical: Set<string>,
 *           allowlist: Set<string>, canonicalByLowerCase: Map<string, string>,
 *           ontologyPath: string }} input
 * @returns {Violation[]}
 */
function checkUnknownTermsOnLine({ line, lineNo, file, canonical, allowlist, canonicalByLowerCase, ontologyPath }) {
  /** @type {Violation[]} */
  const violations = [];
  const seenOnLine = new Set();
  for (const { term, index } of backtickedTerms(line)) {
    if (!PASCAL_CASE.test(term) || canonical.has(term) || allowlist.has(term)) continue;
    if (seenOnLine.has(term)) continue;
    seenOnLine.add(term);

    let message =
      `\`${term}\` is not defined in ${ontologyPath} — ` +
      `use the canonical name, add the concept to the ontology first, ` +
      `or (if it is not a domain concept) add it to the allowlist in ontology.config.json ` +
      `with a reason`;

    // Case-insensitive-only hint: the most common real drift is a capitalisation slip
    // (`SentToVENDOR` vs. `SentToVendor`), and naming the canonical spelling turns a lookup into a
    // one-word edit. Deliberately not fuzzy/edit-distance matching — that was considered and
    // rejected as scope creep for a file that ships everywhere.
    const canonicalMatch = canonicalByLowerCase.get(term.toLowerCase());
    if (canonicalMatch) {
      message += ` (did you mean \`${canonicalMatch}\`? — same term, different capitalisation)`;
    }

    violations.push({ file, line: lineNo, column: index + 1, message });
  }
  return violations;
}

/**
 * @param {{ file: string, text: string, canonical: Set<string>,
 *           config: { allowlist: {term: string}[], bannedAliases: {phrase: string, nameInstead: string[]}[] },
 *           ontologyPath: string }} input
 * @returns {Violation[]}
 */
export function lintFile({ file, text, canonical, config, ontologyPath }) {
  const allowlist = new Set(config.allowlist.map((entry) => entry.term));
  const canonicalByLowerCase = new Map();
  for (const term of canonical) {
    canonicalByLowerCase.set(term.toLowerCase(), term);
  }

  /** @type {Violation[]} */
  const violations = [];
  // Tracks whether the line under inspection is inside a fenced code block. Declared here, not
  // inside the loop body below, so a banned-alias check appended to this same forEach can read
  // it too and skip fenced content the same way.
  let inFence = false;

  text.split("\n").forEach((line, index) => {
    const lineNo = index + 1;

    // Fenced code blocks are excluded from both checks: a JS/TS template literal in a documented
    // example (`` `Ready` `` inside ```js ... ```) and a nested Markdown example that itself
    // demonstrates ontology prose (`` `LegacyBill` `` inside ```md ... ```) are both real,
    // legitimate content, not a domain-term or banned-alias violation.
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    violations.push(...checkBannedAliasesOnLine({ line, lineNo, file, config, ontologyPath }));

    if (file === ontologyPath) return;

    violations.push(
      ...checkUnknownTermsOnLine({ line, lineNo, file, canonical, allowlist, canonicalByLowerCase, ontologyPath }),
    );
  });

  return violations;
}

/**
 * Minimal glob support for ignorePaths: `*` within a path segment, `**` across segments.
 * Everything else is matched literally, so a `.` or `+` in a filename cannot become a wildcard.
 * @param {string} glob
 * @returns {RegExp}
 */
export function globToRegExp(glob) {
  let pattern = "";
  for (let index = 0; index < glob.length; index++) {
    const char = glob[index];
    if (char === "*") {
      if (glob[index + 1] === "*") {
        pattern += ".*";
        index++;
      } else {
        pattern += "[^/]*";
      }
    } else if (char === "?") {
      pattern += "[^/]";
    } else {
      pattern += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${pattern}$`);
}

/**
 * @param {string[]} argv
 * @returns {{ alsoPaths: string[] }}
 */
export function parseArgs(argv) {
  const alsoPaths = [];
  let collecting = false;
  for (const arg of argv) {
    if (arg === "--also") {
      collecting = true;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`unknown argument "${arg}" — usage: check-ontology-terms.mjs [--also <path>...]`);
    }
    if (!collecting) {
      throw new Error(`unexpected argument "${arg}" — paths must follow --also`);
    }
    alsoPaths.push(arg);
  }
  return { alsoPaths };
}

/**
 * Normalises a repository-relative path the same way ontology-config.mjs normalises
 * `ontologyPath`: strip a leading `./` and convert backslashes to forward slashes. `--also`
 * paths arrive on the command line exactly as the user typed them (e.g. `./docs/ontology.md`),
 * while `git ls-files` output is already in this normalised form — without this, a normalised
 * and an unnormalised spelling of the same file would be treated as two different files.
 * @param {string} path
 * @returns {string}
 */
function normalisePath(path) {
  return path.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "");
}

/**
 * Tracked Markdown, minus ignorePaths, plus any explicitly supplied --also paths.
 * @param {{ cwd?: string, ignorePaths: string[], alsoPaths: string[] }} options
 * @returns {string[]}
 */
export function discoverFiles({ cwd = process.cwd(), ignorePaths, alsoPaths }) {
  const tracked = execFileSync("git", ["-C", cwd, "ls-files", "*.md"], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  })
    .split("\n")
    .filter(Boolean);

  const ignored = ignorePaths.map(globToRegExp);
  const files = tracked.filter((file) => !ignored.some((pattern) => pattern.test(file)));

  for (const rawPath of alsoPaths) {
    const path = normalisePath(rawPath);
    // resolve, not join: an absolute --also path is the documented case (the agent protocol tells
    // people to lint a drafted PR body held in a scratch file outside the repository), and join
    // would concatenate it onto cwd and then report the real file as missing. A path outside the
    // working tree is deliberately allowed for exactly that reason.
    const absolute = resolve(cwd, path);
    if (!existsSync(absolute)) {
      throw new Error(`--also path "${path}" does not exist`);
    }
    // Reject a directory here rather than letting the caller's readFileSync fail with a bare
    // EISDIR further along, where nothing names the argument that caused it.
    if (statSync(absolute).isDirectory()) {
      throw new Error(`--also path "${path}" is a directory — pass the Markdown file itself`);
    }
    if (!files.includes(path)) files.push(path);
  }
  return files;
}

/**
 * @param {{ cwd?: string, argv?: string[] }} [options]
 * @returns {{ violations: Violation[], filesChecked: number, canonicalCount: number }}
 */
export function run(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const { alsoPaths } = parseArgs(options.argv ?? []);
  const config = loadConfig({ cwd });
  const canonical = canonicalTerms(readFileSync(resolve(cwd, config.ontologyPath), "utf8"));
  const files = discoverFiles({ cwd, ignorePaths: config.ignorePaths, alsoPaths });

  /** @type {Violation[]} */
  const violations = [];
  for (const file of files) {
    violations.push(
      ...lintFile({
        file,
        text: readFileSync(resolve(cwd, file), "utf8"),
        canonical,
        config,
        ontologyPath: config.ontologyPath,
      }),
    );
  }
  return { violations, filesChecked: files.length, canonicalCount: canonical.size };
}

// Exit codes: 0 clean, 1 violations found, 2 the check could not run (config or parse failure).
// A build red for "the config is broken" is a different problem from one red for "the prose is
// wrong", and conflating them wastes the reader's time.
// pathToFileURL, not `new URL(`file://${process.argv[1]}`)`: the latter percent-encodes the path
// (breaking on spaces/`#`) and additionally mishandles Windows paths (backslashes, drive letters).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { violations, filesChecked, canonicalCount } = run({ argv: process.argv.slice(2) });
    if (violations.length > 0) {
      console.error(`ontology term check: ${violations.length} violation(s)\n`);
      for (const violation of violations) {
        console.error(`  ${violation.file}:${violation.line}:${violation.column}  ${violation.message}`);
      }
      process.exit(1);
    }
    console.log(
      `ontology term check: OK — ${filesChecked} files checked against ${canonicalCount} canonical terms`,
    );
  } catch (error) {
    console.error(`ontology term check could not run: ${error instanceof Error ? error.message : error}`);
    process.exit(2);
  }
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/check-ontology-terms.test.mjs`
Expected: PASS — `# pass 16`, `# fail 0`

- [x] **Step 5: Commit**

```bash
git add templates/scripts/check-ontology-terms.mjs tests/check-ontology-terms.test.mjs
git commit -m "feat: linter canonical term extraction and unknown-term check"
```

---

## Task 4: Linter — banned-alias check with quoted meta-mentions

> **Executed and folded into Task 3.** Code review of Tasks 3 and 4 landed several changes that
> cross both tasks — fence tracking that both checks share, per-line dedupe for unknown terms but
> deliberately *not* for aliases, a `column` field on every violation, and backtick added to the
> meta-mention quote characters. Rather than leave two fragments that no longer compose, the
> authoritative contents of `templates/scripts/check-ontology-terms.mjs` and
> `tests/check-ontology-terms.test.mjs` — including everything this task specified — now live in
> **Task 3, Steps 1 and 3**. Read them there. This section is kept for the rationale below, which
> is the part a later reader actually needs.

The second check. It ships always and is inert when `bannedAliases` is empty, which is the case for
a repository with no External Systems. Design decisions worth preserving:

- **A quoted occurrence is exempt**, because quoting marks a meta-mention: the ontology itself must
  be able to write a forbidden phrase in order to forbid it. Straight double quotes, both curly
  directions, and backticks count — an inline code span is at least as idiomatic as a quote for
  writing a literal in Markdown.
- **Apostrophes are deliberately not quote characters.** Treating `'` or `’` as one would silently
  exempt `the billing platform's API`, which is exactly the drift the check exists to catch.
- **Alias occurrences are never de-duplicated per line**, unlike unknown terms. Each occurrence is a
  separate piece of prose to rewrite; a repeated unknown term is one fix. The `column` field is what
  makes the repeated occurrences distinguishable in output.
- **The check applies to the ontology file itself.** The ontology's own narrative prose is exactly
  where a paraphrase slips in, so it gets no exemption — unlike the unknown-term check, for which
  the ontology is the source rather than a consumer.
- **Matching is plain case-insensitive substring matching, with no word-boundary check.** A boundary
  check was considered and rejected: it would stop catching plurals (`the billing platforms` is
  caught today, and a trailing `\b` would lose it), and that loss would be unfixable from config,
  whereas the misconfiguration it guards against — a bare token like `crm` matching inside
  `scrmsystem` — is fixed by writing the multi-word phrase people actually use.
- **Neighbour characters are read from the lower-cased line, not the original.** `"İ".toLowerCase()`
  is two UTF-16 code units, so mixing the two sources desynchronises the indices and produces a
  false positive on a correctly quoted meta-mention.

## Task 5: Linter — file discovery, ignorePaths, and `--also`

> **Executed.** The authoritative contents of `templates/scripts/check-ontology-terms.mjs` and
> `tests/check-ontology-terms.test.mjs` — including this task's `globToRegExp`, `parseArgs`,
> `discoverFiles` and `normalisePath` — are in **Task 3, Steps 1 and 3**. The rationale below is
> what a later reader needs.

Adds three exports to the linter. `discoverFiles` returns the repository's git-tracked Markdown,
minus `ignorePaths` globs, plus any paths passed via `--also`.

- **Why `--also` exists.** The checker only sees git-tracked files, so a bare backticked term
  sitting only in a drafted pull-request description passes silently — then a downstream automation
  copies that description into a tracked file and it fails CI on someone else's branch. `--also`
  lets the drafted body be linted before the PR is opened. It replaces a four-step `git add -N`
  workaround a real repository had documented in its agent instructions.
- **`--also` paths are normalised** the same way the config module normalises `ontologyPath`
  (strip a leading `./`, backslashes to forward slashes). Without this, `--also ./docs/ontology.md`
  would not match the config's `docs/ontology.md`, the ontology would be linted against itself, and
  the user would get a flood of false violations.
- **A directory passed to `--also` is rejected by name**, rather than surfacing later as a bare
  `EISDIR` from `readFileSync` that names nothing.
- **`globToRegExp` escapes regex metacharacters**, so a `.` or `+` in a filename cannot become a
  wildcard. `*` does not cross a directory separator; `**` does.

## Task 6: Linter — CLI entry point and exit codes

Exit 1 on violations, 2 on a configuration or parse failure. The distinction matters: a red build that means "the config is broken" is a different problem from one that means "the prose is wrong."

**Files:**
- Modify: `templates/scripts/check-ontology-terms.mjs`
- Create: `tests/check-ontology-terms.cli.test.mjs`

- [x] **Step 1: Write the failing tests**

Create `tests/check-ontology-terms.cli.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync } from "node:fs";
import { join } from "node:path";

import { withTempRepo } from "./helpers/temp-repo.mjs";

const SCRIPT_SOURCE = fileURLToPath(new URL("../templates/scripts/", import.meta.url));

/** Install the two script files into the temp repo and run the linter, capturing status and output. */
function runLinter(repo, args = []) {
  cpSync(join(SCRIPT_SOURCE, "check-ontology-terms.mjs"), join(repo.dir, "scripts/check-ontology-terms.mjs"));
  cpSync(join(SCRIPT_SOURCE, "ontology-config.mjs"), join(repo.dir, "scripts/ontology-config.mjs"));
  try {
    const stdout = execFileSync("node", ["scripts/check-ontology-terms.mjs", ...args], {
      cwd: repo.dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    return {
      status: error.status,
      stdout: error.stdout?.toString() ?? "",
      stderr: error.stderr?.toString() ?? "",
    };
  }
}

function seed(repo, { spec = "The `Invoice` is sent.", config = {} } = {}) {
  repo.write("docs/ontology.md", "# Ontology\n\n## Entities\n\n| `Invoice` | An invoice. |\n");
  repo.write("docs/spec.md", spec);
  repo.write("ontology.config.json", JSON.stringify({ ontologyPath: "docs/ontology.md", ...config }, null, 2));
  repo.write("scripts/.keep", "");
  repo.git("add", "-A");
  repo.git("commit", "-m", "fixture");
}

test("a clean repository exits 0 and reports what it checked", async () => {
  await withTempRepo(async (repo) => {
    seed(repo);
    const result = runLinter(repo);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /ontology term check: OK/);
    assert.match(result.stdout, /canonical terms/);
  });
});

test("a violation exits 1 and prints file, line and message on stderr", async () => {
  await withTempRepo(async (repo) => {
    seed(repo, { spec: "The `Bill` is sent." });
    const result = runLinter(repo);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /docs\/spec\.md:1:\d+/);
    assert.match(result.stderr, /`Bill` is not defined/);
    assert.match(result.stderr, /1 violation\(s\)/);
  });
});

test("a missing config exits 2, not 1", async () => {
  await withTempRepo(async (repo) => {
    repo.write("docs/ontology.md", "# Ontology\n\n| `Invoice` | x |\n");
    repo.write("scripts/.keep", "");
    repo.git("add", "-A");
    repo.git("commit", "-m", "fixture");
    const result = runLinter(repo);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /ontology\.config\.json not found/);
  });
});

test("an allowlist entry without a reason exits 2", async () => {
  await withTempRepo(async (repo) => {
    seed(repo, { spec: "The `IClock` abstraction.", config: { allowlist: [{ term: "IClock" }] } });
    const result = runLinter(repo);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /has no reason/);
  });
});

test("--also lints an untracked file", async () => {
  await withTempRepo(async (repo) => {
    seed(repo);
    repo.write("scratch/pr-body.md", "This mentions `Bill` in the drafted body.");
    const result = runLinter(repo, ["--also", "scratch/pr-body.md"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /scratch\/pr-body\.md:1:\d+/);
  });
});

test("--help exits 0 and prints usage, without requiring a config to exist", async () => {
  await withTempRepo(async (repo) => {
    // Deliberately no seed(repo) call: --help must not need ontology.config.json to be present.
    cpSync(join(SCRIPT_SOURCE, "check-ontology-terms.mjs"), join(repo.dir, "scripts/check-ontology-terms.mjs"));
    cpSync(join(SCRIPT_SOURCE, "ontology-config.mjs"), join(repo.dir, "scripts/ontology-config.mjs"));
    const stdout = execFileSync("node", ["scripts/check-ontology-terms.mjs", "--help"], {
      cwd: repo.dir,
      encoding: "utf8",
    });
    assert.match(stdout, /usage: node scripts\/check-ontology-terms\.mjs/);
    assert.match(stdout, /--also/);
    assert.match(stdout, /0 clean, 1 violations found, 2 the check could not run/);
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/check-ontology-terms.cli.test.mjs`
Expected: FAIL — the script has no entry point, so it exits 0 and prints nothing.

- [x] **Step 3: Implement the entry point**

Append to `templates/scripts/check-ontology-terms.mjs`:

```js
/**
 * @param {{ cwd?: string, argv?: string[] }} [options]
 * @returns {{ violations: Violation[], filesChecked: number, canonicalCount: number }}
 */
export function run(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const { alsoPaths } = parseArgs(options.argv ?? []);
  const config = loadConfig({ cwd });
  const canonical = canonicalTerms(readFileSync(join(cwd, config.ontologyPath), "utf8"));
  const files = discoverFiles({ cwd, ignorePaths: config.ignorePaths, alsoPaths });

  /** @type {Violation[]} */
  const violations = [];
  for (const file of files) {
    violations.push(
      ...lintFile({
        file,
        text: readFileSync(join(cwd, file), "utf8"),
        canonical,
        config,
        ontologyPath: config.ontologyPath,
      }),
    );
  }
  return { violations, filesChecked: files.length, canonicalCount: canonical.size };
}

const HELP =
  "usage: node scripts/check-ontology-terms.mjs [--also <path>...]\n" +
  "\n" +
  "Checks this repository's tracked Markdown against docs/ontology.md (or wherever\n" +
  "ontology.config.json's ontologyPath points): a backticked PascalCase term not defined there is\n" +
  "an error, and prose paraphrasing a named External System instead of naming it is an error.\n" +
  "\n" +
  "  --also <path>...  Also lint these paths — untracked files, such as a drafted pull-request\n" +
  "                     body saved to a scratch file, that git ls-files would not otherwise see.\n" +
  "                     Accepts one or more paths, absolute or repository-relative.\n" +
  "  --help             Print this message and exit 0.\n" +
  "\n" +
  "Exit codes: 0 clean, 1 violations found, 2 the check could not run (e.g. ontology.config.json\n" +
  "is missing or invalid) — kept distinct from 1 so \"the config is broken\" never looks like\n" +
  "\"the prose is wrong\".\n";

// Exit codes: 0 clean, 1 violations found, 2 the check could not run (config or parse failure).
// A build red for "the config is broken" is a different problem from one red for "the prose is
// wrong", and conflating them wastes the reader's time.
// pathToFileURL, not `new URL(`file://${process.argv[1]}`)`: the latter percent-encodes the path
// (breaking on spaces/`#`) and additionally mishandles Windows paths (backslashes, drive letters).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP);
  } else {
    try {
      const { violations, filesChecked, canonicalCount } = run({ argv });
      if (violations.length > 0) {
        console.error(`ontology term check: ${violations.length} violation(s)\n`);
        for (const violation of violations) {
          console.error(`  ${violation.file}:${violation.line}:${violation.column}  ${violation.message}`);
        }
        process.exit(1);
      }
      console.log(
        `ontology term check: OK — ${filesChecked} files checked against ${canonicalCount} canonical terms`,
      );
    } catch (error) {
      console.error(`ontology term check could not run: ${error instanceof Error ? error.message : error}`);
      process.exit(2);
    }
  }
}
```

Add the config import to the top of the file, beneath the existing `node:` imports:

```js
import { loadConfig } from "./ontology-config.mjs";
```

`--help` is handled before `run()` is ever called — it must work even when `ontology.config.json` is missing or broken, since a reader reaching for `--help` is often trying to recover from exactly that.

- [x] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/check-ontology-terms.cli.test.mjs`
Expected: PASS — `# pass 6`, `# fail 0`

- [x] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS — all suites, `# fail 0`

- [x] **Step 6: Commit**

```bash
git add templates/scripts/check-ontology-terms.mjs tests/check-ontology-terms.cli.test.mjs
git commit -m "feat: linter CLI entry point with distinct exit codes"
```

---

## Task 7: Core templates — ontology, protocol, config, workflow

Content files, not logic. They are verified by a test asserting every template exists, is non-empty, and uses only known placeholders — which is what stops a typo like `{{PROJECTNAME}}` shipping into a target repository as literal text.

**Files:**
- Create: `templates/docs/ontology.md`
- Create: `templates/protocol/ontology-protocol.md`
- Create: `templates/ontology.config.json`
- Create: `templates/github/workflows/ontology-lint.yml`
- Create: `tests/templates.test.mjs`

- [x] **Step 1: Write the failing test**

Create `tests/templates.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATES = fileURLToPath(new URL("../templates/", import.meta.url));
const KNOWN_PLACEHOLDERS = new Set(["PROJECT_NAME", "ONTOLOGY_PATH", "DEFAULT_BRANCH"]);

function everyTemplateFile(dir = TEMPLATES, prefix = "") {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    return statSync(path).isDirectory() ? everyTemplateFile(path, rel) : [{ rel, path }];
  });
}

test("every required core template exists", () => {
  const present = new Set(everyTemplateFile().map(({ rel }) => rel));
  for (const required of [
    "docs/ontology.md",
    "protocol/ontology-protocol.md",
    "ontology.config.json",
    "github/workflows/ontology-lint.yml",
    "scripts/check-ontology-terms.mjs",
    "scripts/ontology-config.mjs",
  ]) {
    assert.ok(present.has(required), `missing template: ${required}`);
  }
});

test("no template is empty", () => {
  for (const { rel, path } of everyTemplateFile()) {
    assert.ok(readFileSync(path, "utf8").trim().length > 0, `empty template: ${rel}`);
  }
});

test("templates use only known placeholders", () => {
  for (const { rel, path } of everyTemplateFile()) {
    for (const match of readFileSync(path, "utf8").matchAll(/\{\{([A-Z_]+)\}\}/g)) {
      assert.ok(KNOWN_PLACEHOLDERS.has(match[1]), `unknown placeholder {{${match[1]}}} in ${rel}`);
    }
  }
});

test("the config template is valid JSON with the required shape", () => {
  const config = JSON.parse(readFileSync(join(TEMPLATES, "ontology.config.json"), "utf8"));
  assert.equal(typeof config.ontologyPath, "string");
  assert.ok(Array.isArray(config.sections.required));
  assert.deepEqual(config.allowlist, []);
});

test("the ontology template offers every section the kit knows about", () => {
  const text = readFileSync(join(TEMPLATES, "docs/ontology.md"), "utf8");
  for (const section of [
    "External Systems", "Subsystems", "Aggregate Roots", "Entities", "Value Objects",
    "Domain Events", "Enums", "Use Cases", "Relationships", "Business Rules & Invariants",
  ]) {
    assert.match(text, new RegExp(`^## ${section.replace("&", "&")}`, "m"), `missing section: ${section}`);
  }
});

test("the protocol template is wrapped in the splice markers", () => {
  const text = readFileSync(join(TEMPLATES, "protocol/ontology-protocol.md"), "utf8");
  assert.equal(text.includes("<!-- ontology-protocol:start -->"), false,
    "markers are added by the installer, not carried in the template body");
  assert.match(text, /## Ontology protocol/);
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `node --test tests/templates.test.mjs`
Expected: FAIL — `ENOENT` on the templates directory listing, or `missing template: docs/ontology.md`

- [x] **Step 3: Write `templates/ontology.config.json`**

```json
{
  "ontologyPath": "{{ONTOLOGY_PATH}}",
  "sections": {
    "required": ["Entities", "Enums", "Relationships", "Business Rules & Invariants"],
    "optional": ["External Systems", "Subsystems", "Aggregate Roots", "Value Objects", "Domain Events", "Use Cases"]
  },
  "allowlist": [],
  "bannedAliases": [],
  "ignorePaths": []
}
```

- [x] **Step 4: Write `templates/docs/ontology.md`**

````markdown
# {{PROJECT_NAME}} — Application Ontology

> **AI instructions:** Read this file in full before starting any task that touches domain
> concepts. Update it after any task that adds, modifies, or removes one. This file must never lag
> behind the code. See the Ontology protocol section in this repository's agent-instruction file.

Every domain concept is named here exactly once, as a backticked PascalCase term. Code, specs,
plans and prose use those names; this file is the source, they are the consumers. A term that
appears in Markdown but not here fails the deterministic check in
`scripts/check-ontology-terms.mjs`.

**Delete the sections that do not apply to this repository**, and remove the matching names from
`sections` in `ontology.config.json`. An empty section is worse than an absent one — the optional
semantic reviewer treats an empty required section as a configuration error.

---

## External Systems

Third-party or otherwise not-ours systems this repository integrates with. Naming them here is
what makes the banned-alias check meaningful: add each paraphrase people reach for to
`bannedAliases` in `ontology.config.json`.

Configure the **multi-word phrase people actually write** ("the billing platform"), not a bare
token. Matching is plain case-insensitive substring matching with no word-boundary check, so a
short token like `crm` would also match inside `scrmsystem`. The boundary check that would prevent
that is deliberately not applied, because it would also stop catching plurals — "the billing
platforms" is caught today, and a word boundary after `platform` would lose it.

| Name | What it is | Description |
|------|-----------|-------------|
| `ExampleSystem` | The vendor platform this integrates with | Source of the `ExampleApproved` event. Replace this row. |

---

## Subsystems

Internal components that are ours to build. Named so that specs can describe the boundaries
*between* them without designing their internals.

| Name | What it is | Responsibility | Boundary |
|------|-----------|----------------|----------|
| `ExampleEngine` | The transformation core | Turns one representation into another. Replace this row. | Receives `ExampleHandoff`. |

---

## Aggregate Roots

| Name | Description | Repository Interface |
|------|-------------|----------------------|
| `ExampleRoot` | The consistency boundary a transaction operates within. Replace this row. | _(TBD — pending persistence decision)_ |

---

## Entities

| Name | Properties | Description |
|------|------------|-------------|
| `ExampleEntity` | `id`, `status` | A thing with identity that persists across changes to its properties. Replace this row. |

---

## Value Objects

| Name | Properties | Description |
|------|------------|-------------|
| `ExampleWindow` | `date`, `startTime` | A thing defined entirely by its values, with no identity of its own. Replace this row. |

---

## Domain Events

| Name | Raising Aggregate | Payload Properties | Description |
|------|-------------------|--------------------|-------------|
| `ExampleApproved` | `ExampleRoot` | `id`, `approvedAt` | Something that happened, named in the past tense. Replace this row. |

---

## Enums

Every value is listed. A code enum whose members drift from this list is exactly what the optional
enum lock test catches.

| Name | Values | Description |
|------|--------|-------------|
| `ExampleStatus` | `Pending`, `Active`, `Closed` | Lifecycle state. Replace this row. |

---

## Use Cases

The named operations the system offers. Include this section where specs refer to operations by
name; omit it where they do not.

| Name | Actor | Description |
|------|-------|-------------|
| `CreateExample` | Operator | Replace this row. |

---

## Relationships

| From | Relationship | To | Cardinality |
|------|--------------|----|-------------|
| `ExampleRoot` | raises | `ExampleApproved` | 1 → 1 |

---

## Business Rules & Invariants

Statements that must always hold. Written as prose bullets, each opening with the bolded concept
it constrains, because the semantic reviewer keeps exactly this shape.

- **`ExampleEntity`** — must not move to `Closed` before an `ExampleApproved` event is received for
  it. Replace this bullet.
````

- [x] **Step 5: Write `templates/protocol/ontology-protocol.md`**

````markdown
## Ontology protocol

The application ontology lives in [`{{ONTOLOGY_PATH}}`]({{ONTOLOGY_PATH}}). It is the canonical
source for all domain terminology. Code, specs and plan documents must match the ontology — not the
other way around.

### Before writing anything that touches domain concepts

1. Read `{{ONTOLOGY_PATH}}` in full.
2. Use the exact names defined there. Do not invent synonyms, abbreviations, or alternative
   spellings.
3. If a concept you need is not in the ontology, define it there first, then write the code.

### Before local validation and commit

1. Stage only the files intended for the proposed commit.
2. Review the staged file list and cached diff with `git diff --cached --name-only` and
   `git diff --cached` before validation.
3. Run `node scripts/check-ontology-terms.mjs` after the intended files are staged and reviewed,
   but before creating the commit.
4. Stage newly created Markdown intended for the commit — the checker discovers Git-tracked
   Markdown with `git ls-files "*.md"` and does not see an untracked file.
5. Staging is not committing: files can still be corrected or unstaged before the commit is made.
6. Do not stage unrelated untracked or working files merely to expose them to validation.
7. CI remains the independent validation of the committed state.

### Checking text that is not a tracked file

A drafted pull-request body is Markdown that no tracked file contains, so the checker cannot see
it — and a bare backticked term sitting only in a PR description passes silently. Save the drafted
body to a scratch file and lint it explicitly:

```bash
node scripts/check-ontology-terms.mjs --also /path/to/drafted-body.md
```

### After completing any task that touches domain objects

1. Update `{{ONTOLOGY_PATH}}` — add, rename, or remove entities, value objects, events, enums,
   relationships, or invariants as needed.
2. Include the ontology change in the same commit as the code change.

### Enforcement

`scripts/check-ontology-terms.mjs` runs on every pull request and every push to the default branch
via `.github/workflows/ontology-lint.yml`. It fails the build if any Markdown file uses a
backticked PascalCase term not defined in the ontology, or — where the ontology names External
Systems — paraphrases one instead of naming it.

If it flags your term, there are exactly three correct responses:

1. Use the canonical name.
2. Add the concept to the ontology first, then use it.
3. Only for a genuinely non-domain term — a framework type, an interface name, a config key — add
   it to `allowlist` in `ontology.config.json` **with a written reason**. An entry without a reason
   is rejected by the checker.

Reaching for option 3 by default is how this control decays. Prefer 1 and 2.
````

- [x] **Step 6: Write `templates/github/workflows/ontology-lint.yml`**

The `push` trigger's branch is genuine per-repository variation — the installer is exactly where
per-repository substitution belongs — so it is a placeholder, not a literal `main`. The value is
quoted (`["{{DEFAULT_BRANCH}}"]`) because an unquoted `{{...}}` inside a YAML flow sequence would
be read as a nested flow mapping, not a placeholder; quoting keeps it a plain string scalar both
before and after substitution.

```yaml
# Deterministic ontology term check. Installed by the ontology kit.
# Needs no secrets and no network access.
#
# This is the blocking half of the drift defence. The optional companion,
# ontology-drift-review.yml, is advisory.

name: Ontology term check

on:
  pull_request:
  push:
    branches: ["{{DEFAULT_BRANCH}}"]

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: node scripts/check-ontology-terms.mjs
```

> **Note added after the whole-system review (2026-09-07):** this workflow was originally written
> with `branches: [main]`, while `templates/protocol/ontology-protocol.md` told the adopter it runs
> "on every push to the default branch" — true only for a repository whose default branch actually
> is `main`. On a `master` or `trunk` repository the `push` half silently never ran. Fixed by making
> the branch a substituted placeholder (`substitute: true` on this entry in Task 8's plan) and
> having the installer detect the target's actual default branch (Task 10), with `--default-branch`
> to override (Task 11). This does not weaken the byte-identity commitment — that commitment is
> about the *scripts*, and this workflow already needed to vary per repository.

- [x] **Step 7: Run the tests to verify they pass**

Run: `node --test tests/templates.test.mjs`
Expected: PASS — `# pass 6`, `# fail 0`

- [x] **Step 8: Commit**

```bash
git add templates/ tests/templates.test.mjs
git commit -m "feat: core templates for ontology, protocol, config and lint workflow"
```

---

## Task 8: Installer — the file plan

Pure function first: given the options, what files does an install write? Keeping this separate from the filesystem is what makes `--dry-run` trivially correct rather than a second code path that can drift from the real one.

**Files:**
- Create: `bin/install-ontology.mjs`
- Test: `tests/install-ontology.test.mjs`

- [x] **Step 1: Write the failing tests**

Create `tests/install-ontology.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildPlan } from "../bin/install-ontology.mjs";

test("a core install writes the scripts, config, ontology and lint workflow", () => {
  const plan = buildPlan({});
  assert.deepEqual(plan.map((entry) => entry.dest).sort(), [
    ".github/workflows/ontology-lint.yml",
    "docs/ontology.md",
    "ontology.config.json",
    "scripts/check-ontology-terms.mjs",
    "scripts/ontology-config.mjs",
  ]);
});

test("every plan entry names an existing template", () => {
  for (const entry of buildPlan({ withDriftReview: true, withEnumTests: "csharp" })) {
    assert.ok(entry.template, `plan entry for ${entry.dest} has no template`);
  }
});

test("a core install does not write the drift reviewer", () => {
  const dests = buildPlan({}).map((entry) => entry.dest);
  assert.equal(dests.includes("scripts/review-ontology-drift.mjs"), false);
});

test("--with-drift-review adds the reviewer, its test, its workflow and its runbook", () => {
  const dests = buildPlan({ withDriftReview: true }).map((entry) => entry.dest);
  for (const expected of [
    "scripts/review-ontology-drift.mjs",
    "scripts/review-ontology-drift.test.mjs",
    ".github/workflows/ontology-drift-review.yml",
    "docs/ontology-drift-review.md",
  ]) {
    assert.ok(dests.includes(expected), `missing ${expected}`);
  }
});

test("--with-enum-tests picks the template for the named language", () => {
  const entry = buildPlan({ withEnumTests: "csharp" }).find((item) => item.dest.includes("OntologyEnum"));
  assert.ok(entry);
  assert.equal(entry.template, "enum-tests/csharp-xunit.cs");
});

test("--with-enum-tests rejects an unsupported language", () => {
  assert.throws(() => buildPlan({ withEnumTests: "cobol" }), /unsupported enum test language "cobol"/);
});

test("a custom ontology path moves both the file and the config value", () => {
  const plan = buildPlan({ ontologyPath: "documentation/domain.md" });
  const dests = plan.map((entry) => entry.dest);
  assert.ok(dests.includes("documentation/domain.md"));
  assert.equal(dests.includes("docs/ontology.md"), false);
});

test("entries requiring substitution are marked, and script copies are not", () => {
  const plan = buildPlan({});
  const config = plan.find((entry) => entry.dest === "ontology.config.json");
  const script = plan.find((entry) => entry.dest === "scripts/check-ontology-terms.mjs");
  assert.equal(config.substitute, true);
  assert.equal(script.substitute, false);
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/install-ontology.test.mjs`
Expected: FAIL — `Cannot find module .../bin/install-ontology.mjs`

- [x] **Step 3: Implement `buildPlan`**

Create `bin/install-ontology.mjs`:

```js
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

const ENUM_TEST_TEMPLATES = {
  csharp: { template: "enum-tests/csharp-xunit.cs", dest: "tests/OntologyEnumTests.cs.example" },
  typescript: { template: "enum-tests/typescript-vitest.ts", dest: "tests/ontology-enums.test.ts.example" },
  python: { template: "enum-tests/python-pytest.py", dest: "tests/test_ontology_enums.py.example" },
};

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
 * test) and must survive a plain `--force` upgrade.
 *
 * @param {{ ontologyPath?: string, withDriftReview?: boolean, withEnumTests?: string }} options
 * @returns {PlanEntry[]}
 */
export function buildPlan(options) {
  const ontologyPath = options.ontologyPath ?? "docs/ontology.md";

  /** @type {PlanEntry[]} */
  const plan = [
    { template: "scripts/ontology-config.mjs", dest: "scripts/ontology-config.mjs", substitute: false, ownedBy: "kit" },
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
```

> **Note added after the whole-system review (2026-09-07):** the original version of this task had
> no `ownedBy` field, and `--force` (Task 10) overwrote every existing file — including a seeded
> `docs/ontology.md` and a populated `ontology.config.json` allowlist, silently reverting them to
> the blank templates. Fixed by adding `ownedBy` to every entry: `"kit"` for the scripts and
> workflows (safe to replace wholesale), `"adopter"` for the config, the ontology document, and the
> enum test (the adopter's content, which `--force` must never touch — see Task 10's
> `install`). The lint workflow also gained `substitute: true` for the `{{DEFAULT_BRANCH}}`
> placeholder (Task 7). Separately, the enum test's `dest` gained a `.example` suffix: installed
> under its real extension it is a non-compiling worked example dropped straight into the SDK's
> compile glob or test-runner collection, breaking the next build; the `.example` suffix keeps it
> out of both until someone adapts and renames it (Task 15).
>
> `tests/install-ontology.test.mjs` gained a "`--force does NOT overwrite adopter-owned files`"
> test alongside the existing plan tests, and its enum-test test now checks for the `.example`
> filename.

- [x] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/install-ontology.test.mjs`
Expected: PASS — `# pass 8`, `# fail 0`

- [x] **Step 5: Commit**

```bash
git add bin/install-ontology.mjs tests/install-ontology.test.mjs
git commit -m "feat: installer file plan as a pure function"
```

---

## Task 9: Installer — protocol splicing and agent-file detection

The protocol goes into whichever file the target repository treats as authoritative for agent instructions. Splicing between markers, rather than appending, is what makes a re-run an upgrade instead of a duplicate.

**Files:**
- Modify: `bin/install-ontology.mjs`
- Modify: `tests/install-ontology.test.mjs`

- [x] **Step 1: Write the failing tests**

Append to `tests/install-ontology.test.mjs`:

```js
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { spliceProtocol, detectAgentFile, START_MARKER, END_MARKER } from "../bin/install-ontology.mjs";
import { withTempRepo } from "./helpers/temp-repo.mjs";

test("splicing into a file with no markers appends a marked block", () => {
  const result = spliceProtocol("# Agents\n\nSome rules.\n", "## Ontology protocol\n\nBody.\n");
  assert.match(result, /^# Agents/);
  assert.ok(result.includes(START_MARKER));
  assert.ok(result.includes(END_MARKER));
  assert.match(result, /## Ontology protocol/);
});

test("splicing twice is idempotent — one marked block, not two", () => {
  const once = spliceProtocol("# Agents\n", "## Ontology protocol\n\nBody.\n");
  const twice = spliceProtocol(once, "## Ontology protocol\n\nBody.\n");
  assert.equal(twice, once);
  assert.equal(twice.split(START_MARKER).length - 1, 1);
});

test("splicing replaces the previous body in place, preserving surrounding text", () => {
  const first = spliceProtocol("# Agents\n\nBefore.\n", "## Ontology protocol\n\nOld body.\n");
  const withTrailer = `${first}\n## Another section\n\nAfter.\n`;
  const second = spliceProtocol(withTrailer, "## Ontology protocol\n\nNew body.\n");
  assert.match(second, /Before\./);
  assert.match(second, /After\./);
  assert.match(second, /New body\./);
  assert.doesNotMatch(second, /Old body\./);
});

test("splicing into an empty file produces just the marked block", () => {
  const result = spliceProtocol("", "## Ontology protocol\n\nBody.\n");
  assert.equal(result.startsWith(START_MARKER), true);
});

test("an unterminated start marker is an error rather than a silent duplicate", () => {
  assert.throws(
    () => spliceProtocol(`# Agents\n${START_MARKER}\nhalf a block\n`, "body"),
    /unterminated ontology-protocol marker/,
  );
});

test("detectAgentFile prefers an existing AGENTS.md", async () => {
  await withTempRepo(async (repo) => {
    repo.write("AGENTS.md", "# Agents\n");
    repo.write("CLAUDE.md", "# Claude\n");
    assert.deepEqual(detectAgentFile(repo.dir), { path: "AGENTS.md", created: false });
  });
});

test("detectAgentFile falls back to CLAUDE.md when AGENTS.md is absent", async () => {
  await withTempRepo(async (repo) => {
    repo.write("CLAUDE.md", "# Claude\n");
    assert.deepEqual(detectAgentFile(repo.dir), { path: "CLAUDE.md", created: false });
  });
});

test("detectAgentFile proposes creating AGENTS.md when neither exists", async () => {
  await withTempRepo(async (repo) => {
    assert.deepEqual(detectAgentFile(repo.dir), { path: "AGENTS.md", created: true });
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/install-ontology.test.mjs`
Expected: FAIL — `does not provide an export named 'spliceProtocol'`

- [x] **Step 3: Implement splicing and detection**

Add to `bin/install-ontology.mjs` (imports at the top of the file, after the header comment):

```js
import { existsSync } from "node:fs";
import { join } from "node:path";
```

Then append:

```js
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
 * this kit's own marked blocks — the case `install` (Task 10) must refuse rather than silently
 * duplicate.
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
```

> **Note added after the whole-system review (2026-09-07):** `hasUnmarkedProtocolSection` did not
> exist in the original version of this task. `spliceProtocol` only ever recognised its own
> `START_MARKER`/`END_MARKER` pair, so installing into an `AGENTS.md` that already had a
> hand-written `## Ontology protocol` heading — no markers — silently produced two contradictory
> protocol sections. `install` (Task 10) now calls `hasUnmarkedProtocolSection` before writing
> anything and refuses if it is true, naming the agent file in the error. Corresponding unit tests
> for the helper itself:
>
> ```js
> test("hasUnmarkedProtocolSection is true for a hand-written heading with no markers", () => {
>   assert.equal(hasUnmarkedProtocolSection("# Agents\n\n## Ontology protocol\n\nHand-written.\n"), true);
> });
>
> test("hasUnmarkedProtocolSection is false once the kit's own markers are present", () => {
>   assert.equal(
>     hasUnmarkedProtocolSection(`# Agents\n\n${START_MARKER}\n## Ontology protocol\n\nBody.\n${END_MARKER}\n`),
>     false,
>   );
> });
>
> test("hasUnmarkedProtocolSection ignores a mid-line mention, matching only a real heading", () => {
>   assert.equal(hasUnmarkedProtocolSection("See the Ontology protocol section above for details.\n"), false);
> });
> ```

- [x] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/install-ontology.test.mjs`
Expected: PASS — `# pass 16`, `# fail 0`

- [x] **Step 5: Commit**

```bash
git add bin/install-ontology.mjs tests/install-ontology.test.mjs
git commit -m "feat: idempotent protocol splicing and agent-file detection"
```

---

## Task 10: Installer — applying the plan to a real repository

**Files:**
- Modify: `bin/install-ontology.mjs`
- Modify: `tests/install-ontology.test.mjs`

- [x] **Step 1: Write the failing tests**

Append to `tests/install-ontology.test.mjs`:

```js
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { install } from "../bin/install-ontology.mjs";

test("installing writes every planned file into the target", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets" });
    for (const expected of [
      "scripts/check-ontology-terms.mjs",
      "scripts/ontology-config.mjs",
      "ontology.config.json",
      "docs/ontology.md",
      ".github/workflows/ontology-lint.yml",
      "AGENTS.md",
    ]) {
      assert.ok(existsSync(join(repo.dir, expected)), `missing ${expected}`);
    }
  });
});

test("placeholders are substituted in the files that carry them", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets" });
    const ontology = readFileSync(join(repo.dir, "docs/ontology.md"), "utf8");
    assert.match(ontology, /^# Widgets — Application Ontology/m);
    assert.doesNotMatch(ontology, /\{\{/);
    const config = JSON.parse(readFileSync(join(repo.dir, "ontology.config.json"), "utf8"));
    assert.equal(config.ontologyPath, "docs/ontology.md");
  });
});

test("the installed scripts are byte-identical to the kit's templates", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets" });
    const templatePath = fileURLToPath(new URL("../templates/scripts/check-ontology-terms.mjs", import.meta.url));
    assert.equal(
      readFileSync(join(repo.dir, "scripts/check-ontology-terms.mjs"), "utf8"),
      readFileSync(templatePath, "utf8"),
    );
  });
});

test("the protocol is spliced into the detected agent file", async () => {
  await withTempRepo(async (repo) => {
    repo.write("AGENTS.md", "# Agents\n\nExisting rules.\n");
    install({ target: repo.dir, projectName: "Widgets" });
    const agents = readFileSync(join(repo.dir, "AGENTS.md"), "utf8");
    assert.match(agents, /Existing rules\./);
    assert.match(agents, /## Ontology protocol/);
    assert.match(agents, /docs\/ontology\.md/);
  });
});

test("a second install is idempotent — no duplicated protocol, no error", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets" });
    const first = readFileSync(join(repo.dir, "AGENTS.md"), "utf8");
    install({ target: repo.dir, projectName: "Widgets", force: true });
    const second = readFileSync(join(repo.dir, "AGENTS.md"), "utf8");
    assert.equal(second, first);
  });
});

test("an existing file is skipped rather than overwritten", async () => {
  await withTempRepo(async (repo) => {
    repo.write("docs/ontology.md", "# Hand-written ontology\n");
    const result = install({ target: repo.dir, projectName: "Widgets" });
    assert.equal(readFileSync(join(repo.dir, "docs/ontology.md"), "utf8"), "# Hand-written ontology\n");
    assert.ok(result.skipped.some((entry) => entry.dest === "docs/ontology.md"));
  });
});

test("--force overwrites an existing kit-owned file", async () => {
  await withTempRepo(async (repo) => {
    repo.write("scripts/check-ontology-terms.mjs", "// hand-modified\n");
    install({ target: repo.dir, projectName: "Widgets", force: true });
    assert.match(readFileSync(join(repo.dir, "scripts/check-ontology-terms.mjs"), "utf8"), /Deterministic ontology term linter/);
  });
});

test("--force does NOT overwrite adopter-owned files — this is the critical upgrade-path fix", async () => {
  // A whole-system review found that --force, run over a seeded ontology and a reasoned
  // allowlist, silently reverted both to the blank templates — the one command documented as the
  // upgrade path was destroying the two files that must never be overwritten. Fixed by tagging
  // every plan entry with `ownedBy` (Task 8) and having `--force` act only on "kit"-owned entries.
  await withTempRepo(async (repo) => {
    repo.write("docs/ontology.md", "# Real seeded ontology\n\n| `Widget` | a widget |\n");
    repo.write(
      "ontology.config.json",
      JSON.stringify({
        ontologyPath: "docs/ontology.md",
        allowlist: [{ term: "IClock", reason: "architecture interface, not a domain concept" }],
      }),
    );
    const result = install({ target: repo.dir, projectName: "Widgets", force: true });

    assert.equal(
      readFileSync(join(repo.dir, "docs/ontology.md"), "utf8"),
      "# Real seeded ontology\n\n| `Widget` | a widget |\n",
    );
    const config = JSON.parse(readFileSync(join(repo.dir, "ontology.config.json"), "utf8"));
    assert.equal(config.allowlist[0].term, "IClock");
    assert.ok(result.skipped.some((entry) => entry.dest === "docs/ontology.md" && entry.ownedBy === "adopter"));
  });
});

test("--reset-content overwrites adopter-owned files back to the shipped templates", async () => {
  await withTempRepo(async (repo) => {
    repo.write("docs/ontology.md", "# Real seeded ontology\n\n| `Widget` | a widget |\n");
    install({ target: repo.dir, projectName: "Widgets", resetContent: true });
    assert.match(readFileSync(join(repo.dir, "docs/ontology.md"), "utf8"), /Application Ontology/);
  });
});

test("installing over an AGENTS.md with a hand-written, unmarked Ontology protocol section is refused", async () => {
  // The kit was extracted from ../the application repository, whose AGENTS.md already carries a hand-written
  // "## Ontology protocol" heading with none of this installer's own markers. Splicing there would
  // silently produce two contradictory protocol sections. Refuse instead, naming the file.
  await withTempRepo(async (repo) => {
    repo.write("AGENTS.md", "# Agents\n\n## Ontology protocol\n\nHand-written, no markers.\n");
    assert.throws(
      () => install({ target: repo.dir, projectName: "Widgets" }),
      /AGENTS\.md already has a hand-written "## Ontology protocol" section/,
    );
    assert.equal(existsSync(join(repo.dir, "ontology.config.json")), false, "must refuse before writing anything");
  });
});

test("--ontology-path is validated and normalised before anything is written", async () => {
  // A whole-system review found `--ontology-path ../outside.md` writing above the repository root
  // and `--ontology-path /etc/onto.md` writing outside it entirely, both reported as success.
  // Fixed by reusing ontology-config.mjs's own `normaliseRepoRelativePath`.
  await withTempRepo(async (repo) => {
    assert.throws(
      () => install({ target: repo.dir, ontologyPath: "../outside.md" }),
      /--ontology-path must not contain "\.\." segments/,
    );
    assert.throws(
      () => install({ target: repo.dir, ontologyPath: "/etc/onto.md" }),
      /--ontology-path must be repository-relative, not absolute/,
    );
    assert.equal(existsSync(join(repo.dir, "ontology.config.json")), false);
  });
});

test("a quote in --ontology-path is JSON-escaped rather than corrupting ontology.config.json", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, ontologyPath: 'docs/on"to.md' });
    const config = JSON.parse(readFileSync(join(repo.dir, "ontology.config.json"), "utf8")); // throws on malformed JSON
    assert.equal(config.ontologyPath, 'docs/on"to.md');
  });
});

test("the lint workflow substitutes the target's actual default branch", async () => {
  await withTempRepo(async (repo) => {
    repo.git("checkout", "-b", "trunk");
    install({ target: repo.dir, projectName: "Widgets" });
    assert.match(
      readFileSync(join(repo.dir, ".github/workflows/ontology-lint.yml"), "utf8"),
      /branches: \["trunk"\]/,
    );
  });
});

test("--with-enum-tests installs the example with an .example suffix, not compilable in place", async () => {
  await withTempRepo(async (repo) => {
    const result = install({ target: repo.dir, projectName: "Widgets", withEnumTests: "csharp" });
    assert.ok(existsSync(join(repo.dir, "tests/OntologyEnumTests.cs.example")));
    assert.equal(existsSync(join(repo.dir, "tests/OntologyEnumTests.cs")), false);
    assert.equal(result.enumTestExample, "tests/OntologyEnumTests.cs.example");
  });
});

test("--dry-run writes nothing but reports the same plan", async () => {
  await withTempRepo(async (repo) => {
    const result = install({ target: repo.dir, projectName: "Widgets", dryRun: true });
    assert.equal(existsSync(join(repo.dir, "docs/ontology.md")), false);
    assert.equal(existsSync(join(repo.dir, "AGENTS.md")), false);
    assert.ok(result.written.includes("docs/ontology.md"));
  });
});

test("installing into a directory that is not a git repository is refused", async () => {
  await withTempRepo(async (repo) => {
    const notARepo = join(repo.dir, "subdir-without-git");
    assert.throws(
      () => install({ target: notARepo, projectName: "Widgets" }),
      /is not a git repository/,
    );
  });
});

test("the project name defaults to the target directory name", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir });
    const ontology = readFileSync(join(repo.dir, "docs/ontology.md"), "utf8");
    assert.match(ontology, new RegExp(`^# ${repo.dir.split("/").pop()} — Application Ontology`, "m"));
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/install-ontology.test.mjs`
Expected: FAIL — `does not provide an export named 'install'`

- [x] **Step 3: Implement `install`**

Extend the import line in `bin/install-ontology.mjs`:

```js
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { normaliseRepoRelativePath } from "../templates/scripts/ontology-config.mjs";
```

Then append:

```js
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
 * (e.g. `docs/on"to.md`) land unescaped and corrupt the JSON.
 * @param {string} text
 * @param {Record<string, string>} values
 * @returns {string}
 */
export function substituteJsonString(text, values) {
  return text.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => {
    if (!(key in values)) throw new Error(`no value supplied for placeholder {{${key}}}`);
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
  // file above the target repository root or outside it entirely, both reported as success.
  // Reuses the same rule ontology.config.json's own ontologyPath must satisfy.
  const ontologyPath = options.ontologyPath
    ? normaliseRepoRelativePath(options.ontologyPath, "--ontology-path")
    : "docs/ontology.md";

  // Also before writing anything: refuse a hand-written, unmarked "## Ontology protocol" section
  // rather than splicing a second, contradictory copy next to it (see Task 9's
  // hasUnmarkedProtocolSection).
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
    DEFAULT_BRANCH: options.defaultBranch ?? detectDefaultBranch(target),
  };

  const plan = buildPlan({ ...options, ontologyPath });
  const written = [];
  /** @type {{ dest: string, ownedBy: "kit" | "adopter" }[]} */
  const skipped = [];
  let enumTestExample = null;

  for (const entry of plan) {
    const destPath = join(target, entry.dest);
    const exists = existsSync(destPath);
    // --force replaces kit-owned content only; --reset-content is the separate, deliberately-named
    // escape hatch that also replaces adopter-owned content. This is what makes plain --force the
    // safe, correct upgrade path (Task 8's ownedBy note explains why).
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
```

> **Note added after the whole-system review (2026-09-07):** this task originally implemented only
> the `force`/`dryRun` overwrite rule and the plain `substitute`-everywhere approach shown above in
> the first draft of this file. Four defects turned up in review, all fixed in the `install` above:
> `--force` silently reverted a seeded ontology and a populated allowlist (fixed via `ownedBy`, Task
> 8); `--ontology-path` was unvalidated, so `../outside.md` and `/etc/onto.md` both wrote and
> reported success (fixed by validating with `normaliseRepoRelativePath` before the loop); a quote
> in `--ontology-path` produced invalid JSON in `ontology.config.json` (fixed with
> `substituteJsonString`); and installing over a hand-written, unmarked `## Ontology protocol`
> heading produced two contradictory copies (fixed by refusing early — see Task 9 for
> `hasUnmarkedProtocolSection`). All four checks happen before the write loop runs, so a refused
> install writes nothing.

- [x] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/install-ontology.test.mjs`
Expected: PASS — `# pass 26`, `# fail 0` originally; more after the review-driven tests above are added.

- [x] **Step 5: Commit**

```bash
git add bin/install-ontology.mjs tests/install-ontology.test.mjs
git commit -m "feat: installer applies the plan idempotently with dry-run and force"
```

---

## Task 11: Installer — command-line interface

**Files:**
- Modify: `bin/install-ontology.mjs`
- Modify: `tests/install-ontology.test.mjs`

- [x] **Step 1: Write the failing tests**

Append to `tests/install-ontology.test.mjs`:

```js
import { execFileSync } from "node:child_process";

import { parseCliArgs } from "../bin/install-ontology.mjs";

const CLI = fileURLToPath(new URL("../bin/install-ontology.mjs", import.meta.url));

test("parseCliArgs reads every supported option", () => {
  assert.deepEqual(
    parseCliArgs([
      "--target", "/tmp/repo",
      "--project-name", "Widgets",
      "--ontology-path", "documentation/domain.md",
      "--default-branch", "trunk",
      "--with-drift-review",
      "--with-enum-tests", "python",
      "--force",
      "--reset-content",
      "--dry-run",
    ]),
    {
      target: "/tmp/repo",
      projectName: "Widgets",
      ontologyPath: "documentation/domain.md",
      defaultBranch: "trunk",
      withDriftReview: true,
      withEnumTests: "python",
      force: true,
      resetContent: true,
      dryRun: true,
    },
  );
});

test("parseCliArgs recognises --help and short-circuits other parsing", () => {
  assert.deepEqual(parseCliArgs(["--help"]), { help: true });
  assert.deepEqual(parseCliArgs(["-h"]), { help: true });
  assert.deepEqual(parseCliArgs(["--with-enum-tests", "--help"]), { help: true });
});

test("parseCliArgs requires --target", () => {
  assert.throws(() => parseCliArgs([]), /--target is required/);
});

test("parseCliArgs rejects an option that takes a value but has none", () => {
  assert.throws(() => parseCliArgs(["--target"]), /--target needs a value/);
});

test("parseCliArgs rejects an unknown option", () => {
  assert.throws(() => parseCliArgs(["--target", "/tmp/x", "--wat"]), /unknown option "--wat"/);
});

test("the CLI installs into a real repository and reports what it wrote", async () => {
  await withTempRepo(async (repo) => {
    const stdout = execFileSync("node", [CLI, "--target", repo.dir, "--project-name", "Widgets"], {
      encoding: "utf8",
    });
    assert.match(stdout, /docs\/ontology\.md/);
    assert.match(stdout, /AGENTS\.md/);
    assert.ok(existsSync(join(repo.dir, "scripts/check-ontology-terms.mjs")));
  });
});

test("the CLI exits non-zero with a readable message on a non-git target", async () => {
  await withTempRepo(async (repo) => {
    const target = join(repo.dir, "nope");
    let status = 0;
    let stderr = "";
    try {
      execFileSync("node", [CLI, "--target", target], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      status = error.status;
      stderr = error.stderr.toString();
    }
    assert.equal(status, 1);
    assert.match(stderr, /is not a git repository/);
  });
});

test("--help exits 0 and prints usage without installing anything", async () => {
  await withTempRepo(async (repo) => {
    const stdout = execFileSync("node", [CLI, "--help"], { encoding: "utf8" });
    assert.match(stdout, /usage: node bin\/install-ontology\.mjs/);
    assert.match(stdout, /--reset-content/);
  });
});

test("--dry-run reports no protocol note claiming it wrote anything", async () => {
  await withTempRepo(async (repo) => {
    const stdout = execFileSync(
      "node",
      [CLI, "--target", repo.dir, "--project-name", "Widgets", "--dry-run"],
      { encoding: "utf8" },
    );
    assert.match(stdout, /Protocol would be spliced into AGENTS\.md\./);
    assert.doesNotMatch(stdout, /Protocol spliced into AGENTS\.md\./);
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/install-ontology.test.mjs`
Expected: FAIL — `does not provide an export named 'parseCliArgs'`

- [x] **Step 3: Implement the CLI**

Extend the `node:url` import added in Task 10 to also bring in `pathToFileURL`:

```js
import { fileURLToPath, pathToFileURL } from "node:url";
```

Then append:

```js
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
      console.log("Next: fill in the ontology, then run `node scripts/check-ontology-terms.mjs`.");
      console.log("The skills/ontology-setup skill can seed the ontology from this repository's own docs and code.");
    }
  } catch (error) {
    console.error(`ontology kit: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
```

> **Note added after the whole-system review (2026-09-07):** the original version of this task had
> no `--reset-content`, `--default-branch`, or `--help`, and the `skipped` loop printed the same
> `= ... (exists — re-run with --force to replace)` line for every skipped file regardless of why it
> was kept. That message became actively wrong once `--force` stopped touching adopter-owned files:
> re-running with `--force` alone would never replace `docs/ontology.md`, so telling the reader it
> would was a lie. Fixed by branching on `ownedBy` and using a distinct `~` marker with accurate
> advice for adopter-owned skips. Also fixed: the closing `Protocol spliced into ...` line printed
> unconditionally even under `--dry-run`, which never performs that write — it is now conditioned on
> `options.dryRun`.

- [x] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/install-ontology.test.mjs`
Expected: PASS — `# pass 32` originally; more after the review-driven tests above are added, `# fail 0`

- [x] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS, `# fail 0`

- [x] **Step 6: Commit**

```bash
git add bin/install-ontology.mjs tests/install-ontology.test.mjs
git commit -m "feat: installer command-line interface"
```

---

## Task 12: Reviewer — projection, diff extraction, batching

Ported from `../the integration repository/scripts/review-ontology-drift.ts` and its test file. The one behavioural change is that the canonical section list comes from `ontology.config.json` instead of a hard-coded constant: a `required` section that is missing, duplicated or empty is an error, an `optional` section is projected when present and ignored when absent (but must not be empty or duplicated if it is there).

This test file ships into the target repository and is run by its blocking preparation job, so it must depend on nothing but the script beside it.

**Files:**
- Create: `templates/scripts/review-ontology-drift.mjs`
- Create: `templates/scripts/review-ontology-drift.test.mjs`

- [x] **Step 1: Write the failing tests**

Create `templates/scripts/review-ontology-drift.test.mjs`:

```js
// Ships with the reviewer. Runs in the adopting repository's blocking preparation job, and in the
// ontology kit's own suite. Depends on nothing but the script beside it — no repository fixtures.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildBatches,
  extractAddedLines,
  projectOntology,
  renderChunk,
} from "./review-ontology-drift.mjs";

const SECTIONS = {
  required: ["Entities", "Enums", "Business Rules & Invariants"],
  optional: ["External Systems"],
};

function ontology({ entities = "| `Invoice` | An invoice. |", extra = "" } = {}) {
  return [
    "# Ontology",
    "orientation prose",
    "",
    "## Entities",
    "linking prose",
    "| Name | Description |",
    "|------|-------------|",
    entities,
    "",
    "## Enums",
    "| `InvoiceStatus` | `Approved`, `Paid` |",
    "",
    "## Business Rules & Invariants",
    "- **`Invoice`** — must be approved before payment.",
    "ordinary explanation",
    extra,
    "",
    "## Not A Canonical Section",
    "| ignored | row |",
  ].join("\n");
}

test("projects every required section and drops orientation prose", () => {
  const projection = projectOntology(ontology(), SECTIONS);
  for (const section of SECTIONS.required) assert.match(projection, new RegExp(`## ${section}`));
  assert.match(projection, /Invoice/);
  assert.doesNotMatch(projection, /orientation prose|linking prose|ordinary explanation/);
  assert.doesNotMatch(projection, /Not A Canonical Section/);
  assert.doesNotMatch(projection, /\|------\|/);
});

test("an absent optional section is not an error", () => {
  const projection = projectOntology(ontology(), SECTIONS);
  assert.doesNotMatch(projection, /External Systems/);
});

test("a present optional section is projected", () => {
  const withExternal = `${ontology()}\n\n## External Systems\n| \`Vendor\` | The vendor. |`;
  assert.match(projectOntology(withExternal, SECTIONS), /## External Systems/);
});

test("a missing required section fails clearly", () => {
  const withoutEnums = ontology().replace("## Enums\n| `InvoiceStatus` | `Approved`, `Paid` |\n\n", "");
  assert.throws(() => projectOntology(withoutEnums, SECTIONS), /missing required ontology section: Enums/);
});

test("a duplicated required section fails clearly", () => {
  const duplicated = `${ontology()}\n\n## Entities\n| \`Other\` | Another. |`;
  assert.throws(() => projectOntology(duplicated, SECTIONS), /duplicate ontology section: Entities/);
});

test("a required section containing only prose fails clearly", () => {
  const empty = ontology({ entities: "" }).replace("| Name | Description |", "just prose");
  assert.throws(() => projectOntology(empty, SECTIONS), /empty ontology section: Entities/);
});

test("a required section containing only a table header fails clearly", () => {
  const headerOnly = ontology({ entities: "" });
  assert.throws(() => projectOntology(headerOnly, SECTIONS), /empty ontology section: Entities/);
});

test("extracts only attributed added lines from a zero-context diff", () => {
  const diff = [
    "diff --git a/x.md b/x.md",
    "--- a/x.md",
    "+++ b/x.md",
    "@@ -3,2 +3,3 @@",
    "-removed",
    "+first addition",
    "+|---|---|",
    "+second addition",
    "@@ -20 +21 @@",
    "+later addition",
  ].join("\n");
  assert.deepEqual(extractAddedLines(diff), [
    { line: 3, text: "first addition" },
    { line: 5, text: "second addition" },
    { line: 21, text: "later addition" },
  ]);
});

test("batches against the complete prompt budget and splits oversized file additions", () => {
  const files = [{
    file: "large.md",
    lines: Array.from({ length: 30 }, (_, index) => ({ line: index + 1, text: "x".repeat(120) })),
  }];
  const batches = buildBatches(files, "# ontology\n| A | B |", 3_600);
  assert.ok(batches.length > 1);
  assert.deepEqual(batches.flat().flatMap((chunk) => chunk.lines), files[0].lines);
  assert.ok(batches.every((batch) => batch.every((chunk) => renderChunk(chunk).length < 3_600)));
});

test("a budget too small to leave room for any diff is an error, not an infinite split", () => {
  assert.throws(() => buildBatches([], "x".repeat(5_000), 5_100), /leave no useful diff budget/);
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `node --test templates/scripts/review-ontology-drift.test.mjs`
Expected: FAIL — `Cannot find module .../templates/scripts/review-ontology-drift.mjs`

- [x] **Step 3: Implement the pure half of the reviewer**

Create `templates/scripts/review-ontology-drift.mjs`:

```js
// Advisory ontology paraphrase-drift review — the second half of the drift defence.
//
// The deterministic linter catches exact-name misuse. This pass reviews only added Markdown prose
// for semantic paraphrases and contradictions, against a compact projection of the ontology. It
// never edits files and never fails on findings; only infrastructure failure turns its job red,
// which is deliberately visually distinct from "reviewed, found nothing."
//
// It talks to any OpenAI-compatible chat-completions endpoint, configured entirely through
// environment variables. The GitHub token is used only for the GitHub REST calls and is never sent
// to the model endpoint — see modelJson versus githubJson.
//
// This file is identical in every repository that installs the ontology kit; do not edit it
// locally. Repository-specific values live in ontology.config.json.

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { loadConfig } from "./ontology-config.mjs";

export const COMMENT_MARKER = "<!-- ontology-drift-review -->";
export const NO_DRIFT_TOKEN = "NO_DRIFT";

// A complete-request character budget, not a diff-only one. Character counts are a planning
// heuristic; a 413 from the endpoint is handled authoritatively by recursive splitting.
export const MAX_REQUEST_CHARS = 24_000;

export const SYSTEM_PROMPT = `You are a domain-terminology reviewer for a repository whose canonical
vocabulary is defined in an ontology document. You will be given a compact projection generated
from that ontology, followed by added Markdown lines identified by file and new-file line number.
Your ONLY job is to find semantic paraphrase drift: prose that refers to a domain concept, enum
value, event, or external system by a non-canonical name, or contradicts the ontology's definitions.

Rules:
- The ontology projection provided first is the sole source of canonical names and definitions.
- Every supplied source line is an addition; there is no removed or unchanged diff context.
- Only report prose that ASSERTS current state using wrong/paraphrased names. Do not report:
  - terms inside double quotes (those are meta-mentions, deliberately non-canonical);
  - struck-through text (~~like this~~) — it is preserved history;
  - text that describes PAST states, mistakes, or examples of drift;
  - ordinary English that is not referring to a domain concept.
- A backticked term that exactly matches the ontology is correct; do not report it.
- Be precise and sparing. A false alarm costs reviewer trust. If unsure, do not report.

Output format:
- If there are no findings, respond with exactly: ${NO_DRIFT_TOKEN}
- Otherwise respond with a markdown bullet list, one bullet per finding:
  - **<file>:<line>** — "<offending prose, quoted briefly>": <what is wrong> — suggest: <canonical phrasing>
- No preamble, no summary, nothing else.`;

/**
 * @typedef {{ line: number, text: string }} AddedLine
 * @typedef {{ file: string, lines: AddedLine[] }} ReviewChunk
 */

const SEPARATOR_ROW = /^\|[-| :]+\|$/;

/**
 * Keep the ontology's canonical catalogues and invariants; discard orientation and workflow prose.
 * @param {string} markdown
 * @param {{ required: string[], optional: string[] }} sections
 * @returns {string}
 */
export function projectOntology(markdown, sections) {
  const kept = new Set([...sections.required, ...sections.optional]);
  const lines = markdown.split(/\r?\n/);
  const headingCounts = new Map();
  const contentCounts = new Map();
  let current;

  for (const [index, line] of lines.entries()) {
    const heading = line.match(/^## (.+)$/);
    if (heading) {
      current = heading[1];
      if (kept.has(current)) headingCounts.set(current, (headingCounts.get(current) ?? 0) + 1);
      continue;
    }
    if (
      current &&
      kept.has(current) &&
      (line.startsWith("- **") ||
        (line.startsWith("|") && !SEPARATOR_ROW.test(line) && !SEPARATOR_ROW.test(lines[index + 1] ?? "")))
    ) {
      contentCounts.set(current, (contentCounts.get(current) ?? 0) + 1);
    }
  }

  for (const section of sections.required) {
    if ((headingCounts.get(section) ?? 0) === 0) {
      throw new Error(`missing required ontology section: ${section}`);
    }
  }
  for (const section of kept) {
    const headings = headingCounts.get(section) ?? 0;
    if (headings === 0) continue;
    if (headings > 1) throw new Error(`duplicate ontology section: ${section}`);
    if ((contentCounts.get(section) ?? 0) === 0) throw new Error(`empty ontology section: ${section}`);
  }

  const output = ["# Canonical ontology projection"];
  let keep = false;
  for (const line of lines) {
    const heading = line.match(/^## (.+)$/);
    if (heading) {
      keep = kept.has(heading[1]);
      if (keep) output.push("", line);
      continue;
    }
    if (!keep || !line.trim() || SEPARATOR_ROW.test(line)) continue;
    // Tables and invariant bullets are the canonical data. Linking prose is omitted.
    if (line.startsWith("|") || line.startsWith("- **")) output.push(line);
  }
  return output.join("\n");
}

/**
 * Parse a zero-context unified diff into compact, attributed added lines.
 * @param {string} diff
 * @returns {AddedLine[]}
 */
export function extractAddedLines(diff) {
  const additions = [];
  let newLine = 0;
  let inHunk = false;
  for (const raw of diff.split(/\r?\n/)) {
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      newLine = Number(hunk[1]);
      inHunk = true;
      continue;
    }
    if (!inHunk || raw.startsWith("+++")) continue;
    if (raw.startsWith("+")) {
      const text = raw.slice(1);
      if (text.trim() && !SEPARATOR_ROW.test(text)) additions.push({ line: newLine, text });
      newLine++;
    } else if (raw.startsWith(" ")) {
      newLine++;
    }
  }
  return additions;
}

/**
 * @param {ReviewChunk} chunk
 * @returns {string}
 */
export function renderChunk(chunk) {
  return `## Added lines: ${chunk.file}\n${chunk.lines.map((line) => `L${line.line}: ${line.text}`).join("\n")}`;
}

/**
 * @param {string} file
 * @param {AddedLine[]} lines
 * @param {number} maxSectionChars
 * @returns {ReviewChunk[]}
 */
function splitLinesToFit(file, lines, maxSectionChars) {
  const chunks = [];
  let current = [];
  for (const line of lines) {
    if (current.length && renderChunk({ file, lines: [...current, line] }).length > maxSectionChars) {
      chunks.push({ file, lines: current });
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length) chunks.push({ file, lines: current });
  return chunks;
}

/**
 * @param {{ file: string, lines: AddedLine[] }[]} files
 * @param {string} ontologyProjection
 * @param {number} [maxRequestChars]
 * @returns {ReviewChunk[][]}
 */
export function buildBatches(files, ontologyProjection, maxRequestChars = MAX_REQUEST_CHARS) {
  const staticChars = SYSTEM_PROMPT.length + ontologyProjection.length + 16;
  const available = maxRequestChars - staticChars;
  if (available < 500) {
    throw new Error("ontology projection and system prompt leave no useful diff budget");
  }

  const chunks = files.flatMap(({ file, lines }) => splitLinesToFit(file, lines, available));
  const batches = [];
  let current = [];
  for (const chunk of chunks) {
    const candidate = [...current, chunk];
    const size = staticChars + candidate.reduce((sum, item) => sum + renderChunk(item).length + 5, 0);
    if (current.length && size > maxRequestChars) {
      batches.push(current);
      current = [chunk];
    } else {
      current = candidate;
    }
  }
  if (current.length) batches.push(current);
  return batches;
}

/**
 * @param {string} ontologyProjection
 * @param {ReviewChunk[]} batch
 * @returns {string}
 */
export function userPrompt(ontologyProjection, batch) {
  return [ontologyProjection, ...batch.map(renderChunk)].join("\n\n---\n\n");
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `node --test templates/scripts/review-ontology-drift.test.mjs`
Expected: PASS — `# pass 10`, `# fail 0`

- [x] **Step 5: Commit**

```bash
git add templates/scripts/review-ontology-drift.mjs templates/scripts/review-ontology-drift.test.mjs
git commit -m "feat: reviewer projection, diff extraction and batching"
```

---

## Task 13: Reviewer — model client, resilience, and PR comment

One correction to the source while porting: `modelJson` there throws a plain `Error`, but `isTokenLimitError` only recognises the typed error thrown by the GitHub helper. The recursive-split recovery is therefore unreachable for a 413 from the model endpoint. Here `modelJson` throws the typed `HttpError`, so the splitting actually engages.

**Files:**
- Modify: `templates/scripts/review-ontology-drift.mjs`
- Modify: `templates/scripts/review-ontology-drift.test.mjs`

- [x] **Step 1: Write the failing tests**

Append to `templates/scripts/review-ontology-drift.test.mjs`:

```js
import {
  HttpError,
  modelJson,
  requireEnv,
  reviewBatch,
  reviewResilient,
} from "./review-ontology-drift.mjs";

test("recursively splits a token-limited request without losing lines", async () => {
  const batch = [{
    file: "a.md",
    lines: Array.from({ length: 4 }, (_, index) => ({ line: index + 1, text: `line ${index + 1}` })),
  }];
  const reviewed = [];
  const answers = await reviewResilient(batch, async (candidate) => {
    const lines = candidate.flatMap((chunk) => chunk.lines.map((line) => line.line));
    if (lines.length > 1) throw new HttpError(413, "tokens_limit_reached", "too large");
    reviewed.push(lines);
    return "NO_DRIFT";
  });
  assert.deepEqual(reviewed, [[1], [2], [3], [4]]);
  assert.deepEqual(answers, ["NO_DRIFT", "NO_DRIFT", "NO_DRIFT", "NO_DRIFT"]);
});

test("a 413 on a single line is a hard error, not an infinite split", async () => {
  const batch = [{ file: "a.md", lines: [{ line: 1, text: "text" }] }];
  await assert.rejects(
    reviewResilient(batch, async () => {
      throw new HttpError(413, "tokens_limit_reached", "too large");
    }),
    /token limit persists for one added line in a\.md/,
  );
});

test("a non-413 error is not retried", async () => {
  const batch = [{ file: "a.md", lines: [{ line: 1, text: "text" }] }];
  let attempts = 0;
  await assert.rejects(
    reviewResilient(batch, async () => {
      attempts++;
      throw new HttpError(500, "failure", "server error");
    }),
    /server error/,
  );
  assert.equal(attempts, 1);
});

test("requireEnv names the missing variable", () => {
  delete process.env.ONTOLOGY_LLM_BASE_URL;
  assert.throws(() => requireEnv("ONTOLOGY_LLM_BASE_URL"), /ONTOLOGY_LLM_BASE_URL is required/);
});

test("modelJson authenticates with ONTOLOGY_LLM_API_KEY, never GITHUB_TOKEN", async () => {
  process.env.ONTOLOGY_LLM_API_KEY = "model-key";
  process.env.GITHUB_TOKEN = "github-token";
  try {
    let seenAuth;
    const fakeFetch = async (_url, init) => {
      seenAuth = init.headers.Authorization;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    await modelJson("http://endpoint/chat/completions", { method: "POST" }, fakeFetch);
    assert.equal(seenAuth, "Bearer model-key");
  } finally {
    delete process.env.ONTOLOGY_LLM_API_KEY;
    delete process.env.GITHUB_TOKEN;
  }
});

test("modelJson throws a typed HttpError carrying status and body", async () => {
  const fakeFetch = async () => new Response("tokens_limit_reached", { status: 413 });
  await assert.rejects(
    modelJson("http://endpoint/chat/completions", { method: "POST" }, fakeFetch),
    (error) => error instanceof HttpError && error.status === 413,
  );
});

test("modelJson aborts a hanging request instead of waiting indefinitely", async () => {
  const hangingFetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")));
    });
  await assert.rejects(
    modelJson("http://endpoint/chat/completions", { method: "POST" }, hangingFetch, 10),
    /aborted/i,
  );
});

test("reviewBatch posts the configured model to <baseUrl>/chat/completions", async () => {
  let seenUrl;
  let seenBody;
  const fakeFetch = async (url, init) => {
    seenUrl = url;
    seenBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: "NO_DRIFT" } }] }), { status: 200 });
  };
  const batch = [{ file: "a.md", lines: [{ line: 1, text: "text" }] }];
  const answer = await reviewBatch("http://endpoint/v1", "some-model", "# ontology", batch, fakeFetch);
  assert.equal(seenUrl, "http://endpoint/v1/chat/completions");
  assert.equal(seenBody.model, "some-model");
  assert.equal(seenBody.max_tokens, 8192);
  assert.equal(answer, "NO_DRIFT");
});

test("reviewBatch sends no sampling parameters, so the endpoint's own defaults win", async () => {
  // Regression guard. Sampling belongs where the model is configured, not in CI: a value sent
  // from here silently overrides the endpoint's tuned defaults for that model.
  let seenBody;
  const fakeFetch = async (_url, init) => {
    seenBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: "NO_DRIFT" } }] }), { status: 200 });
  };
  await reviewBatch("http://endpoint/v1", "some-model", "# ontology",
    [{ file: "a.md", lines: [{ line: 1, text: "text" }] }], fakeFetch);
  for (const key of ["temperature", "top_p", "top_k", "presence_penalty", "frequency_penalty"]) {
    assert.equal(key in seenBody, false, `reviewBatch must not send ${key}`);
  }
});

test("reviewBatch rejects an empty completion rather than reporting no drift", async () => {
  const fakeFetch = async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: "  " } }] }), { status: 200 });
  await assert.rejects(
    reviewBatch("http://endpoint/v1", "some-model", "# ontology",
      [{ file: "a.md", lines: [{ line: 1, text: "text" }] }], fakeFetch),
    /empty response from model/,
  );
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `node --test templates/scripts/review-ontology-drift.test.mjs`
Expected: FAIL — `does not provide an export named 'HttpError'`

- [x] **Step 3: Implement the client and main flow**

Append to `templates/scripts/review-ontology-drift.mjs`:

```js
export class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} responseBody
   * @param {string} message
   */
  constructor(status, responseBody, message) {
    super(message);
    this.status = status;
    this.responseBody = responseBody;
  }
}

function isTokenLimitError(error) {
  return (
    error instanceof HttpError &&
    (error.status === 413 || error.responseBody.includes("context_length_exceeded"))
  );
}

/**
 * @param {string} name
 * @returns {string}
 */
export function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

/**
 * Talks only to the model endpoint, authenticated with ONTOLOGY_LLM_API_KEY. Never pass a GitHub
 * token here — githubJson below is the sole GitHub-authenticated path.
 *
 * The timeout is sized to match reviewBatch's max_tokens: a reasoning model spends part of its
 * budget before emitting any content, so raise the two together or not at all.
 * @param {string} url
 * @param {RequestInit} [init]
 * @param {typeof fetch} [fetchImpl]
 * @param {number} [timeoutMs]
 */
export async function modelJson(url, init, fetchImpl = fetch, timeoutMs = 300_000) {
  const apiKey = process.env.ONTOLOGY_LLM_API_KEY;
  const response = await fetchImpl(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new HttpError(response.status, body, `model request failed: ${response.status}: ${body}`);
  }
  return response.json();
}

async function githubJson(token, url, init) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new HttpError(response.status, body, `${init?.method ?? "GET"} ${url} -> ${response.status}: ${body}`);
  }
  return response.json();
}

/**
 * Deliberately sends no sampling parameters — those belong where the model is configured.
 * max_tokens covers any reasoning tokens as well as the final content, so it is the binding
 * constraint; raise it and modelJson's timeout together.
 * @param {string} baseUrl
 * @param {string} model
 * @param {string} ontologyProjection
 * @param {ReviewChunk[]} batch
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<string>}
 */
export async function reviewBatch(baseUrl, model, ontologyProjection, batch, fetchImpl = fetch) {
  const completion = await modelJson(
    `${baseUrl}/chat/completions`,
    {
      method: "POST",
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt(ontologyProjection, batch) },
        ],
      }),
    },
    fetchImpl,
  );
  const answer = (completion.choices?.[0]?.message?.content ?? "").trim();
  if (!answer) throw new Error("empty response from model");
  return answer;
}

/**
 * @param {ReviewChunk[]} batch
 * @param {(candidate: ReviewChunk[]) => Promise<string>} review
 * @returns {Promise<string[]>}
 */
export async function reviewResilient(batch, review) {
  try {
    return [await review(batch)];
  } catch (error) {
    if (!isTokenLimitError(error)) throw error;
    if (batch.length > 1) {
      const middle = Math.ceil(batch.length / 2);
      return [
        ...(await reviewResilient(batch.slice(0, middle), review)),
        ...(await reviewResilient(batch.slice(middle), review)),
      ];
    }
    const [chunk] = batch;
    if (chunk.lines.length < 2) {
      throw new Error(
        `token limit persists for one added line in ${chunk.file}; the ontology projection is too large`,
      );
    }
    const middle = Math.ceil(chunk.lines.length / 2);
    return [
      ...(await reviewResilient([{ ...chunk, lines: chunk.lines.slice(0, middle) }], review)),
      ...(await reviewResilient([{ ...chunk, lines: chunk.lines.slice(middle) }], review)),
    ];
  }
}

async function main() {
  const config = loadConfig({});
  const model = process.env.ONTOLOGY_MODEL || "ontology-review";
  const baseRef = process.env.BASE_REF || "origin/main";
  const changedFiles = process.argv.slice(2).filter((file) => file !== config.ontologyPath);
  if (!changedFiles.length) {
    console.log("no changed markdown files to review — nothing to do");
    return;
  }

  const projection = projectOntology(readFileSync(config.ontologyPath, "utf8"), config.sections);
  const files = changedFiles.flatMap((file) => {
    const diff = execFileSync("git", ["diff", "--unified=0", `${baseRef}...HEAD`, "--", file], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    const lines = extractAddedLines(diff);
    return lines.length ? [{ file, lines }] : [];
  });
  if (!files.length) {
    console.log(`no added Markdown prose against ${baseRef} — nothing to do`);
    return;
  }

  const batches = buildBatches(files, projection);
  if (process.env.DRY_RUN) {
    console.log(`DRY_RUN — model: ${model}, base: ${baseRef}, ${files.length} file(s) in ${batches.length} batch(es)`);
    batches.forEach((batch, index) => {
      console.log(
        `  batch ${index + 1}: ${batch.map((chunk) => chunk.file).join(", ")} ` +
          `(~${SYSTEM_PROMPT.length + userPrompt(projection, batch).length} complete-request chars)`,
      );
    });
    return;
  }

  const token = requireEnv("GITHUB_TOKEN");
  const repo = requireEnv("GITHUB_REPOSITORY");
  const prNumber = requireEnv("PR_NUMBER");
  const baseUrl = requireEnv("ONTOLOGY_LLM_BASE_URL");

  const findings = [];
  for (const [index, batch] of batches.entries()) {
    const answers = await reviewResilient(batch, (candidate) =>
      reviewBatch(baseUrl, model, projection, candidate));
    console.log(`batch ${index + 1}/${batches.length}: ${answers.length} request(s) after token-limit splitting`);
    for (const answer of answers) {
      if (!answer.startsWith(NO_DRIFT_TOKEN)) findings.push(answer);
    }
  }

  const noDrift = findings.length === 0;
  const answer = findings.join("\n");
  console.log(noDrift ? "no drift found" : `findings:\n${answer}`);

  const api = `https://api.github.com/repos/${repo}`;
  const comments = await githubJson(token, `${api}/issues/${prNumber}/comments?per_page=100`);
  const existing = comments.find(
    (comment) => typeof comment.body === "string" && comment.body.includes(COMMENT_MARKER),
  );
  const header = `${COMMENT_MARKER}\n### Ontology drift review (AI-assisted, advisory)\n\n`;
  const footer =
    `\n\n---\n*Model: \`${model}\`. Advisory only — human review is the gate. ` +
    `The deterministic term check is a separate, blocking status.*`;
  const body = noDrift
    ? `${header}No paraphrase drift found in the changed markdown files of this revision.${footer}`
    : header + answer + footer;

  if (existing) {
    await githubJson(token, `${api}/issues/comments/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    });
    console.log(`updated comment ${existing.id}`);
  } else if (!noDrift) {
    const created = await githubJson(token, `${api}/issues/${prNumber}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
    console.log(`created comment ${created.id}`);
  } else {
    console.log("no findings and no prior comment — staying silent");
  }
}

// pathToFileURL, not `new URL(`file://${process.argv[1]}`)`: the latter percent-encodes the path
// (breaking on spaces/`#`) and additionally mishandles Windows paths (backslashes, drive letters).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `node --test templates/scripts/review-ontology-drift.test.mjs`
Expected: PASS — `# pass 20`, `# fail 0`

- [x] **Step 5: Commit**

```bash
git add templates/scripts/review-ontology-drift.mjs templates/scripts/review-ontology-drift.test.mjs
git commit -m "feat: reviewer model client, token-limit resilience and PR comment upsert"
```

---

## Task 14: Reviewer — workflow and runbook

Two jobs, as in the source: a blocking preparation job that runs the shipped tests without touching a model, and an advisory review job that does. Keeping them separate is what stops an endpoint outage masking the deterministic status, or the reverse. All personal infrastructure is gone — no Tailscale step, no health check against a named host, no model-alias guard.

**Files:**
- Create: `templates/github/workflows/ontology-drift-review.yml`
- Create: `templates/docs/ontology-drift-review.md`
- Modify: `tests/templates.test.mjs`

- [x] **Step 1: Write the failing test**

Append to `tests/templates.test.mjs`:

```js
test("the drift-review workflow keeps preparation and review as separate jobs", () => {
  const yaml = readFileSync(join(TEMPLATES, "github/workflows/ontology-drift-review.yml"), "utf8");
  assert.match(yaml, /^ {2}deterministic-preparation:/m);
  assert.match(yaml, /^ {2}semantic-review:/m);
  assert.match(yaml, /node --test scripts\/review-ontology-drift\.test\.mjs/);
});

test("the drift-review workflow carries no personal infrastructure", () => {
  const yaml = readFileSync(join(TEMPLATES, "github/workflows/ontology-drift-review.yml"), "utf8");
  for (const forbidden of ["tailscale", "ts.net", "litellm", "qwq"]) {
    assert.equal(yaml.toLowerCase().includes(forbidden), false, `workflow mentions ${forbidden}`);
  }
});

test("the semantic review job is restricted to same-repository pull requests", () => {
  const yaml = readFileSync(join(TEMPLATES, "github/workflows/ontology-drift-review.yml"), "utf8");
  assert.match(yaml, /head\.repo\.full_name == github\.repository/);
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `node --test tests/templates.test.mjs`
Expected: FAIL — `ENOENT ... github/workflows/ontology-drift-review.yml`

- [x] **Step 3: Write `templates/github/workflows/ontology-drift-review.yml`**

```yaml
# Ontology drift review. Installed by the ontology kit with --with-drift-review.
#
# Two independent jobs, so an endpoint outage can never mask the deterministic status, or the
# reverse.
#
# deterministic-preparation: runs unguarded on any pull request and validates the review-preparation
# logic only. It invokes no model. This job is blocking.
#
# semantic-review: same-repository pull requests only. Reviews added Markdown prose against a
# projection of the ontology and posts or updates one advisory comment. A finding never fails the
# build; only an infrastructure or configuration failure turns this job red, which is intentionally
# visually distinct from "reviewed, found nothing."
#
# Required repository configuration:
#   vars.ONTOLOGY_LLM_BASE_URL  — an OpenAI-compatible base URL, e.g. https://host/v1
#   vars.ONTOLOGY_MODEL         — the model name to request
#   secrets.ONTOLOGY_LLM_API_KEY — bearer token for that endpoint
#
# If your endpoint is not reachable from a hosted runner, either use a self-hosted runner or add
# your own network step immediately before "Review drift and upsert PR comment".

name: Ontology drift review

on:
  pull_request:
    paths:
      - "**/*.md"
      - "scripts/review-ontology-drift.mjs"
      - "scripts/review-ontology-drift.test.mjs"
      - ".github/workflows/ontology-drift-review.yml"

permissions:
  contents: read

concurrency:
  group: ontology-drift-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  deterministic-preparation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Test deterministic ontology-review preparation
        run: node --test scripts/review-ontology-drift.test.mjs

  semantic-review:
    runs-on: ubuntu-latest
    if: github.event.pull_request.head.repo.full_name == github.repository
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Collect changed markdown files
        id: changed
        run: |
          files=$(git diff --name-only "origin/${{ github.base_ref }}...HEAD" -- '*.md' | tr '\n' ' ')
          echo "files=$files" >> "$GITHUB_OUTPUT"
          echo "changed markdown files: ${files:-none}"

      - uses: actions/setup-node@v4
        if: steps.changed.outputs.files != ''
        with:
          node-version: 20

      - name: Require the endpoint configuration
        if: steps.changed.outputs.files != ''
        env:
          ONTOLOGY_LLM_BASE_URL: ${{ vars.ONTOLOGY_LLM_BASE_URL }}
          ONTOLOGY_MODEL: ${{ vars.ONTOLOGY_MODEL }}
        run: |
          missing=0
          for name in ONTOLOGY_LLM_BASE_URL ONTOLOGY_MODEL; do
            if [ -z "${!name}" ]; then
              echo "::error::repository variable $name is not set — see docs/ontology-drift-review.md"
              missing=1
            fi
          done
          exit $missing

      # If your endpoint is not reachable from a hosted runner, add your network step here.

      - name: Review drift and upsert PR comment
        if: steps.changed.outputs.files != ''
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          PR_NUMBER: ${{ github.event.pull_request.number }}
          BASE_REF: origin/${{ github.base_ref }}
          ONTOLOGY_LLM_BASE_URL: ${{ vars.ONTOLOGY_LLM_BASE_URL }}
          ONTOLOGY_MODEL: ${{ vars.ONTOLOGY_MODEL }}
          ONTOLOGY_LLM_API_KEY: ${{ secrets.ONTOLOGY_LLM_API_KEY }}
        run: node scripts/review-ontology-drift.mjs ${{ steps.changed.outputs.files }}
```

- [x] **Step 4: Write `templates/docs/ontology-drift-review.md`**

````markdown
# Ontology drift review — setup and operation

The deterministic check in `scripts/check-ontology-terms.mjs` catches exact-name misuse: a
backticked term that is not in `{{ONTOLOGY_PATH}}`. It cannot catch prose that paraphrases a
concept without backticks — "the invoice moves from approved to sent" when the ontology says
"Approved" then "SentToVendor". This advisory reviewer is the second half.

> Note for the implementer: the examples in this runbook are deliberately quoted rather than
> backticked. This file is installed into the target repository and then linted by the very check
> it describes, so a backticked PascalCase example term would fail that repository's build. The
> acceptance test in Task 18 locks this in.

## What it does

For each pull request touching Markdown:

1. Builds a compact projection of `{{ONTOLOGY_PATH}}` — its canonical tables and invariant bullets,
   with orientation prose stripped out.
2. Extracts only the *added* lines from the diff, attributed by file and new-file line number.
3. Batches them under a complete-request character budget, splitting recursively if the endpoint
   rejects a request as too large.
4. Asks the model for paraphrase drift, and posts or updates a single pull request comment.

## What it deliberately does not do

- It never edits files.
- A finding never fails the build. Human review is the gate.
- It never sends the GitHub token to the model endpoint.

Only an infrastructure or configuration failure turns the `semantic-review` job red. That is on
purpose: "the reviewer could not run" must look different from "the reviewer ran and found
nothing."

## Configuration

| Setting | Where | Example |
|---|---|---|
| `ONTOLOGY_LLM_BASE_URL` | repository variable | `https://api.example.com/v1` |
| `ONTOLOGY_MODEL` | repository variable | `qwen3-27b` |
| `ONTOLOGY_LLM_API_KEY` | repository secret | the endpoint's bearer token |

Any OpenAI-compatible chat-completions endpoint works. If yours is not reachable from a GitHub
hosted runner — a self-hosted model on a private network, say — either run the job on a self-hosted
runner, or add your own network step at the marked point in
`.github/workflows/ontology-drift-review.yml`.

## Running it locally

```bash
BASE_REF=origin/main DRY_RUN=1 node scripts/review-ontology-drift.mjs docs/spec.md
```

`DRY_RUN` prints the batching plan and the approximate request size without calling the model or
GitHub. Drop it, and supply `GITHUB_TOKEN`, `GITHUB_REPOSITORY` and `PR_NUMBER`, to do a real run.

## Tuning

`MAX_REQUEST_CHARS` in `scripts/review-ontology-drift.mjs` is a planning heuristic, not a hard
limit — an oversized request is handled authoritatively by recursive splitting. Raising it raises
the cost of recovering from a single timeout, so change it with measurements rather than as a side
effect of changing models.

`max_tokens` in `reviewBatch` covers any reasoning tokens as well as the visible answer, so it is
the binding constraint on a reasoning model. Raise it and `modelJson`'s timeout together, or
neither.

The script sends no sampling parameters. Configure temperature and related values where the model
is served; a value sent from CI silently overrides them.
````

- [x] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/templates.test.mjs`
Expected: PASS — `# pass 9`, `# fail 0`

- [x] **Step 6: Commit**

```bash
git add templates/github/workflows/ontology-drift-review.yml templates/docs/ontology-drift-review.md tests/templates.test.mjs
git commit -m "feat: drift-review workflow and runbook, free of personal infrastructure"
```

---

## Task 15: Enum lock test templates

Adapted from `../the application repository/tests/the application repository.Domain.Tests/OntologyEnumTests.cs`. These are worked examples the skill adapts to the target's real enums, not generated code — which is why they carry example enum names and a header saying so.

**Files:**
- Create: `templates/enum-tests/csharp-xunit.cs`
- Create: `templates/enum-tests/typescript-vitest.ts`
- Create: `templates/enum-tests/python-pytest.py`
- Modify: `tests/templates.test.mjs`

- [x] **Step 1: Write the failing test**

Append to `tests/templates.test.mjs`:

```js
test("every enum test template exists and says it must be adapted", () => {
  for (const name of ["csharp-xunit.cs", "typescript-vitest.ts", "python-pytest.py"]) {
    const text = readFileSync(join(TEMPLATES, "enum-tests", name), "utf8");
    assert.match(text, /ADAPT THIS/, `${name} does not tell the reader to adapt it`);
    assert.match(text, /{{ONTOLOGY_PATH}}/, `${name} does not reference the ontology path`);
  }
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `node --test tests/templates.test.mjs`
Expected: FAIL — `ENOENT ... enum-tests/csharp-xunit.cs`

- [x] **Step 3: Write `templates/enum-tests/csharp-xunit.cs`**

```csharp
// ADAPT THIS. Installed by the ontology kit as a worked example, not as working code.
//
// Locks every enum to the member list {{ONTOLOGY_PATH}} declares, in order. Changing an enum
// without changing the ontology fails here, which is the point: the Markdown linter reads only
// Markdown, so this is the only check that sees drift in code.
//
// To adapt: replace the example enums below with this project's real ones, one fact per test, and
// keep the member lists in the same order the ontology's Enums table gives them.

namespace YourProject.Domain.Tests;

public class OntologyEnumTests
{
    [Fact]
    public void ExampleStatusMatchesTheOntology()
    {
        Assert.Equal(new[] { "Pending", "Active", "Closed" }, Enum.GetNames<ExampleStatus>());
    }

    [Fact]
    public void NoEnumMemberUsesTheDefaultZeroValue()
    {
        // A zero member is indistinguishable from an unset integer column, so a row that was never
        // written reads as a real state. Add every ontology enum to this list.
        Assert.DoesNotContain(0, Enum.GetValues<ExampleStatus>().Cast<int>());
    }
}
```

- [x] **Step 4: Write `templates/enum-tests/typescript-vitest.ts`**

```typescript
// ADAPT THIS. Installed by the ontology kit as a worked example, not as working code.
//
// Locks every union or enum to the member list {{ONTOLOGY_PATH}} declares, in order. Changing one
// without changing the ontology fails here — the Markdown linter reads only Markdown, so this is
// the only check that sees drift in code.
//
// To adapt: replace the example below with this project's real enums, one fact per test, keeping
// the ontology's ordering.

import { describe, expect, it } from "vitest";

import { EXAMPLE_STATUSES } from "../src/domain/example-status.js";

describe("ontology enums", () => {
  it("ExampleStatus matches the ontology", () => {
    expect([...EXAMPLE_STATUSES]).toEqual(["Pending", "Active", "Closed"]);
  });
});
```

- [x] **Step 5: Write `templates/enum-tests/python-pytest.py`**

```python
# ADAPT THIS. Installed by the ontology kit as a worked example, not as working code.
#
# Locks every enum to the member list {{ONTOLOGY_PATH}} declares, in order. Changing an enum
# without changing the ontology fails here — the Markdown linter reads only Markdown, so this is
# the only check that sees drift in code.
#
# To adapt: replace the example below with this project's real enums, one fact per test, keeping
# the ontology's ordering.

from yourproject.domain import ExampleStatus


def test_example_status_matches_the_ontology() -> None:
    assert [member.name for member in ExampleStatus] == ["Pending", "Active", "Closed"]
```

- [x] **Step 6: Run the tests to verify they pass**

Run: `node --test tests/templates.test.mjs`
Expected: PASS — `# pass 10`, `# fail 0`

- [x] **Step 7: Commit**

```bash
git add templates/enum-tests tests/templates.test.mjs
git commit -m "feat: enum lock test templates for C#, TypeScript and Python"
```

> **Note added after the whole-system review (2026-09-07):** the template *content* here is
> unchanged — the fix was to the installer, not to these files. A whole-system review found that
> installing with `--with-enum-tests csharp` landed `tests/OntologyEnumTests.cs` — this exact
> template, unmodified — directly inside an SDK's default compile glob, referencing an undefined
> `ExampleStatus` with no `using Xunit;`, and the next `dotnet build` failed with no warning that it
> was a worked example rather than working code (same failure mode for the Vitest and pytest
> variants, via test-runner collection rather than a compile glob). The template's own `ADAPT THIS`
> header was the only place saying so, and nothing forces a reader to open the file before running
> a build. Fixed in the installer (Task 8's `ENUM_TEST_TEMPLATES`, Task 10's `install`): the
> installed filename now carries an `.example` suffix (`tests/OntologyEnumTests.cs.example`), which
> keeps it out of both the compile glob and test-runner collection until it is adapted, and the
> installer's closing output names the exact file and repeats the instruction to adapt and rename
> it. See also Task 16's update to `references/enum-lock-tests.md`.

---

## Task 16: The ontology-setup skill

The installer copies files. The skill does the part that needs judgement — deciding which sections apply, writing the target's actual ontology, and triaging the first lint run. Allowlist entries are **proposed for approval, never auto-applied**: an agent that silently allowlists its way to a green build has defeated the control.

**Files:**
- Create: `skills/ontology-setup/SKILL.md`
- Create: `skills/ontology-setup/references/seeding-an-ontology.md`
- Create: `skills/ontology-setup/references/allowlist-discipline.md`
- Create: `skills/ontology-setup/references/llm-drift-review.md`
- Create: `skills/ontology-setup/references/enum-lock-tests.md`
- Create: `tests/skill.test.mjs`

- [x] **Step 1: Write the failing test**

Create `tests/skill.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SKILL = fileURLToPath(new URL("../skills/ontology-setup/", import.meta.url));

test("the skill has valid frontmatter with a name and description", () => {
  const text = readFileSync(`${SKILL}SKILL.md`, "utf8");
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(frontmatter, "SKILL.md has no frontmatter block");
  assert.match(frontmatter[1], /^name: ontology-setup$/m);
  assert.match(frontmatter[1], /^description: .+/m);
});

test("every reference the skill links to exists", () => {
  const text = readFileSync(`${SKILL}SKILL.md`, "utf8");
  const links = [...text.matchAll(/references\/([a-z-]+\.md)/g)].map((match) => match[1]);
  assert.ok(links.length >= 4, "expected the skill to link its reference files");
  for (const link of new Set(links)) {
    assert.ok(existsSync(`${SKILL}references/${link}`), `missing reference: ${link}`);
  }
});

test("the skill forbids auto-applying allowlist entries", () => {
  const text = readFileSync(`${SKILL}SKILL.md`, "utf8");
  assert.match(text, /never auto-apply/i);
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `node --test tests/skill.test.mjs`
Expected: FAIL — `ENOENT ... skills/ontology-setup/SKILL.md`

- [x] **Step 3: Write `skills/ontology-setup/SKILL.md`**

````markdown
---
name: ontology-setup
description: Use when adding the ontology discipline to a repository - installs the canonical vocabulary file, agent protocol, and deterministic CI linter, then seeds the repository's real ontology from its existing docs and code and triages the first lint run.
---

# Installing the ontology discipline into a repository

An ontology is a repository's canonical domain vocabulary: every concept named exactly once, so
code, specs, plans and prose all use the same word for the same thing. The kit installs the
mechanism. Your job is the judgement the mechanism cannot supply — what this repository's concepts
actually are, and which of the first run's violations are real drift.

**Announce at start:** "Using ontology-setup to install and seed the ontology discipline."

## Before you start

Confirm two things with the user, because both are hard to reverse quietly:

1. **Which repository.** The installer writes into a target directory and splices a section into
   that repository's agent-instruction file.
2. **Which optional pieces.** The semantic drift reviewer needs an OpenAI-compatible model endpoint
   the repository can reach; the enum lock tests need a test project to live in. Default to
   neither unless the user asks.

## Step 1 — Install the mechanism

```bash
node <kit>/bin/install-ontology.mjs --target <repo> --dry-run
```

Show the plan, then run it for real without `--dry-run`. Add `--with-drift-review` or
`--with-enum-tests <language>` only if the user asked for them.

Existing files are skipped rather than overwritten. If the target already has a `docs/ontology.md`,
that is a signal to read it and extend it, not to replace it.

## Step 2 — Decide which sections apply

The installed ontology template offers every section the kit knows about. Most repositories need
four or five. Read the repository first — its specs, plans, design documents, domain code — then
propose a section set and say why each one earns its place.

- **External Systems** only if this repository integrates with systems it does not own. If you keep
  it, add the paraphrases people actually reach for to `bannedAliases` in `ontology.config.json`.
- **Subsystems** only if specs need to describe boundaries between internal components.
- **Aggregate Roots**, **Domain Events**, **Value Objects** only if the repository genuinely models
  in those terms. Adding them to a repository that does not is how an ontology becomes decoration.
- **Use Cases** only if specs refer to operations by name.
- **Entities**, **Enums**, **Relationships** and **Business Rules & Invariants** are the working
  minimum.

Delete the sections you drop from the ontology file *and* from `sections` in
`ontology.config.json`. An empty section left in place is a configuration error for the reviewer.

## Step 3 — Seed the real ontology

This is the substantial part. Read `references/seeding-an-ontology.md` before starting.

Draft the ontology from what the repository already contains, present it for review, and iterate.
Do not invent concepts to fill the template's example rows — delete rows you cannot justify from
the repository's own material.

## Step 4 — Run the checker and triage

```bash
node scripts/check-ontology-terms.mjs
```

The first run on an established repository will produce many violations. Read
`references/allowlist-discipline.md` and sort every one into exactly two piles:

- **Real drift** — prose using a wrong or invented name for a concept that exists. Fix the prose,
  or add the missing concept to the ontology.
- **Not a domain concept** — a framework type, an interface name, a config key, another project's
  name. These become allowlist entries with a written reason.

**Never auto-apply allowlist entries.** Present the proposed entries with their reasons and get
approval. An agent that allowlists its way to a green build has removed the control while leaving
its appearance, which is worse than not installing it.

Repeat until the run is clean.

## Step 5 — Optional pieces

- Semantic drift reviewer: `references/llm-drift-review.md`
- Enum lock tests: `references/enum-lock-tests.md`

## Step 6 — Commit

One commit containing the installed files, the seeded ontology, the config, and the spliced
protocol section. Say in the message which optional pieces were installed and which were not.

## What good looks like

- Every section in the ontology has real rows drawn from this repository.
- `node scripts/check-ontology-terms.mjs` exits 0.
- Every allowlist entry has a reason a reviewer would accept.
- The protocol section appears once in the agent-instruction file, between its markers.
````

- [x] **Step 4: Write `skills/ontology-setup/references/seeding-an-ontology.md`**

````markdown
# Seeding an ontology from an existing repository

The ontology catalogues vocabulary the repository already uses. It does not introduce new domain
decisions. If you find yourself deciding what a concept *should* be called rather than recording
what it *is* called, stop and raise it with the user — that is a design decision wearing a
documentation costume.

## Where to look, in order

1. **Domain code** — entity classes, enums, value types, aggregate definitions. The most reliable
   source, because it is executable.
2. **Specs and design documents** — the names the repository uses when it explains itself.
3. **Database schema or migrations** — table and column names, and enum columns in particular.
4. **API contracts** — but be careful: an external system's DTO names are *its* vocabulary, not
   this repository's. They belong in the allowlist, not the ontology.
5. **Issue titles and commit messages** — weakest source; useful only for spotting a concept the
   documents never named.

## Writing the rows

- One concept, one row, one name. If two names exist for one thing, pick one and note the other as
  a banned alias or fix the code.
- Descriptions say what the concept *is*, not what it does mechanically. "A candidate-facing
  four-hour window proposed by one manager" is useful; "the SlotProposal entity" is not.
- List every enum value. A partial list is worse than none, because the enum lock test will encode
  the partial list as truth.
- Invariants are prose bullets opening with the bolded concept they constrain. They are the part a
  reader remembers, so write them as rules, not as observations.
- Where a fact is genuinely undecided, say so in the row and name what would decide it. Do not
  invent a placeholder value.

## Where existing repositories disagree

Two worked examples, both real:

- `the integration repository` is an integration, so its ontology leads with External Systems and names the
  paraphrases prose must not use. Its Subsystems section exists to let specs describe boundaries
  between components without designing their internals.
- `the application repository` is a single application with no external systems. It has no External Systems or
  Domain Events section at all, and adds Use Cases, because its specs refer to operations by name.

Neither is the template for the other. Read the repository in front of you.

## Before you present it

- Does every row come from something in the repository, or did you invent it?
- Does the enum section list every value of every enum?
- Would a new contributor reading only this file use the right word for each concept?
````

- [x] **Step 5: Write `skills/ontology-setup/references/allowlist-discipline.md`**

````markdown
# Allowlist discipline

The allowlist is the pressure valve on the deterministic check. It is also the single most likely
way for this control to decay into decoration, so treat every entry as a small admission of defeat
that has to be justified.

## The three responses to a flagged term

In order of preference:

1. **Use the canonical name.** The prose is wrong. Fix the prose.
2. **Add the concept to the ontology.** The prose is right and the ontology is incomplete. This is
   a real finding — the check just did its job.
3. **Allowlist it.** The term is not a domain concept at all.

Reaching for 3 first is the failure mode. If more than roughly a fifth of a first run ends in the
allowlist, the ontology is probably too thin — go back to seeding.

## What legitimately belongs in the allowlist

- Framework and language types named in prose: `DateOnly`, `Guid`, `DateTimeOffset`.
- Architecture type and interface names that are not domain concepts: `IClock`, `IEmailSender`.
- Configuration keys and provider identifiers: `TenantId`, `Smtp`.
- Another system's DTO names, where prose has to quote the external contract.
- Other repositories' or products' names.
- Process vocabulary the repository's own governance uses: status values like `Accepted`,
  `Proposed`, `Rejected`.

## What does not

- Anything that names a thing in this repository's domain. If prose needs it, the ontology needs
  it.
- A misspelling of a canonical term. Fix the spelling.
- A synonym someone prefers. Pick one name; that is the whole point.

## Writing the reason

The reason is read by whoever wonders, a year later, why this term was exempted. Make it answer
that question:

- Good: `"BCL type: calendar date with no time component, used for SlotWindow.date"`
- Good: `"ADR status value from the governance lifecycle, not a domain concept"`
- Useless: `"not a domain concept"` — that is the category, not the reason.
- Useless: `"needed for the build to pass"`

The checker rejects an entry with no reason at all. It cannot reject a bad one; you have to.
````

- [x] **Step 6: Write `skills/ontology-setup/references/llm-drift-review.md`**

````markdown
# Installing the semantic drift reviewer

Optional, and off by default. Install it only when the repository has an OpenAI-compatible model
endpoint it can reach from CI, and someone who will read the comments it posts.

## What it adds over the deterministic check

The deterministic check reads backticked terms. It cannot see "the invoice moves from approved to
sent" when the ontology says `Approved` → `SentToVendor`, because none of that is backticked. The
reviewer reads added prose against a projection of the ontology and flags exactly that class of
drift.

## Install

```bash
node <kit>/bin/install-ontology.mjs --target <repo> --with-drift-review
```

This adds the reviewer, its tests, its workflow and `docs/ontology-drift-review.md`.

## Configure

Three settings on the repository, described in the installed runbook: `ONTOLOGY_LLM_BASE_URL` and
`ONTOLOGY_MODEL` as variables, `ONTOLOGY_LLM_API_KEY` as a secret. The workflow fails visibly if a
variable is unset, rather than running and silently reviewing nothing.

## Two properties worth preserving

- **A finding never fails the build.** If someone asks to make it blocking, push back: a model that
  can be wrong must not hold a merge, and the moment it does, people learn to work around it.
- **The two jobs stay separate.** The preparation job invokes no model and is blocking; the review
  job may be red only for infrastructure reasons. Merging them means an endpoint outage looks like
  a clean review, or a review failure looks like an outage.

## Verify before you call it done

```bash
BASE_REF=origin/main DRY_RUN=1 node scripts/review-ontology-drift.mjs docs/some-changed-file.md
```

That prints the batching plan without calling the model. If the projection throws, the ontology's
sections do not match `sections` in `ontology.config.json` — fix that before wiring CI.
````

- [x] **Step 7: Write `skills/ontology-setup/references/enum-lock-tests.md`**

````markdown
# Enum lock tests

The Markdown linter reads Markdown. It cannot see an enum in code gaining a member, losing one, or
reordering. The enum lock test closes that gap, and it is the only installed piece that does.

## Install

```bash
node <kit>/bin/install-ontology.mjs --target <repo> --with-enum-tests csharp
```

Languages: `csharp` (xUnit), `typescript` (Vitest), `python` (pytest). The installed file carries a
`.example` suffix (e.g. `tests/OntologyEnumTests.cs.example`) precisely so it cannot be picked up by
a build or test runner before it is adapted — the file names example enums and has no working
imports, so left in place under its real extension it breaks the next build or test run. The
installer's closing output names the exact file it wrote and repeats this.

## Adapt it

1. Find every enum the ontology's Enums section declares.
2. Write one test per enum asserting the member names, **in the ontology's order**. Order matters:
   a reordering is a real change, and in a database-backed enum it can be a data corruption.
3. Keep one test per enum rather than one loop over all of them. A failure should name the enum
   that broke without the reader decoding a loop index.
4. Where the language persists enums as integers, keep the "no member uses the default zero value"
   test and extend it to every enum. A zero member is indistinguishable from an unset column, so a
   row that was never written reads as a real state.
5. Rename the file, dropping the `.example` suffix (`tests/OntologyEnumTests.cs.example` →
   `tests/OntologyEnumTests.cs`), so your build or test runner actually picks it up. Skipping this
   step is the most common way this test silently never runs.

## What to do when it fails

The test failing means code and ontology disagree. Decide which is right — usually the code, since
it is executable — and change the other in the same commit. Do not update the test alone; that is
just deleting the check.
````

> **Note added after the whole-system review (2026-09-07):** this reference originally described
> the installed file as a bare `.cs`/`.ts`/`.py` file. It now carries an `.example` suffix (Task 8,
> Task 10, Task 15's note) precisely so a reader who has not yet read this file cannot accidentally
> break their build or test run by installing it. Step 5 above (rename after adapting) is new.

- [x] **Step 8: Run the tests to verify they pass**

Run: `node --test tests/skill.test.mjs`
Expected: PASS — `# pass 3`, `# fail 0`

- [x] **Step 9: Commit**

```bash
git add skills tests/skill.test.mjs
git commit -m "feat: ontology-setup skill with seeding and triage references"
```

---

## Task 17: Kit documentation

**Files:**
- Create: `docs/how-it-works.md`
- Create: `README.md`
- Modify: `tests/templates.test.mjs`

- [x] **Step 1: Write the failing test**

Append to `tests/templates.test.mjs`:

```js
test("the README documents every installer option", () => {
  const readme = readFileSync(fileURLToPath(new URL("../README.md", import.meta.url)), "utf8");
  for (const option of [
    "--target", "--dry-run", "--force", "--ontology-path",
    "--with-drift-review", "--with-enum-tests",
  ]) {
    assert.ok(readme.includes(option), `README does not document ${option}`);
  }
});

test("how-it-works states what the mechanism does not catch", () => {
  const doc = readFileSync(fileURLToPath(new URL("../docs/how-it-works.md", import.meta.url)), "utf8");
  assert.match(doc, /What it does not catch/);
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `node --test tests/templates.test.mjs`
Expected: FAIL — `ENOENT ... README.md`

- [x] **Step 3: Write `docs/how-it-works.md`**

````markdown
# How the ontology discipline works

Extracted from two repositories that run it: the integration repository, where it originated, and the application repository,
where it was ported by hand. This describes the mechanism, not either repository's domain.

## The problem it solves

A codebase accumulates several names for the same thing. One document says "the billing platform",
another names the vendor; one spec says an invoice is "sent", another says "dispatched", the enum
says something else again. Each individual drift is small. Together they make the documents
unreliable, and an AI agent reading them will faithfully reproduce whichever variant it saw last.

The problem is worse with AI in the loop, not better: an agent generates plausible synonyms
effortlessly, and does so consistently enough that the result reads as deliberate.

## The mechanism

**One canonical file.** `docs/ontology.md` names every domain concept exactly once, as a backticked
PascalCase term, in Markdown tables under named sections. It is the source; code, specs, plans and
prose are consumers.

**A protocol binding agents to it.** A section in the repository's agent-instruction file requires
reading the ontology before writing anything domain-touching, using its exact names, adding missing
concepts there first, and updating it in the same commit as the code change. The protocol is the
part that makes the file stay current; without it the ontology becomes archaeology within a month.

**A deterministic check.** `scripts/check-ontology-terms.mjs` derives the canonical vocabulary from
the ontology itself, then scans the repository's Markdown for two things: a backticked PascalCase
term that is not canonical and not allowlisted, and — where the ontology names external systems —
prose that paraphrases one instead of naming it. It runs in CI on every pull request. Quoted
occurrences are exempt, so a document can quote a forbidden phrase in order to forbid it. The
script exits 0 clean, 1 on violations, and 2 if it could not run at all (a broken config, for
instance) — a build red for "the config is broken" is deliberately distinguishable from one red for
"the prose is wrong."

**An escape hatch with a price.** Not every capitalised term is a domain concept; framework types
and interface names are not. The allowlist admits them, and requires a written reason for each. The
reason is the price: it makes a lazy exemption visible to a reviewer.

## The two halves

The deterministic check reads backticked terms. That bounds what it can catch, precisely and
usefully:

| | Caught by the linter | Caught by the reviewer |
|---|---|---|
| `Bill` where the ontology says `Invoice` | yes | yes |
| "the billing platform" instead of the named system | yes, if configured | yes |
| "the invoice moves from approved to sent" | no | yes |
| An enum in code gaining a member | no | no |

The third row is why the optional semantic reviewer exists: unbackticked paraphrase is invisible to
a term scanner. The fourth is why the optional enum lock tests exist: no Markdown check can see
code.

The reviewer is advisory by design. A model that can be wrong must not hold a merge — the moment it
does, people learn to route around it, and the deterministic check loses credibility alongside it.
Its findings appear as one pull request comment, updated in place; only an infrastructure failure
turns its job red, which is deliberately distinguishable from "reviewed, found nothing."

## What it does not catch

- Drift in code, unless the enum lock tests are installed — and then only in enums.
- Unbackticked paraphrase, unless the semantic reviewer is installed.
- An ontology that is simply wrong. The check enforces consistency with the ontology, not the
  ontology's correctness. That remains a human judgement.
- Anything outside tracked Markdown — a pull request description, for instance, which is why the
  checker takes explicit paths with `--also`.
- An all-caps term such as `README` or `API` is never checked as a domain concept, backticked or
  not — the same regex that recognises a canonical term also gates what the check looks for, so an
  all-caps ontology term loses coverage rather than becoming a false positive. That trade is
  deliberate: a first run on an established repository is already noisy, and a wall of false
  positives on acronyms is exactly how a new control gets silenced before it earns trust.

## Why each repository is independent

Installing the kit copies files. It creates no dependency: no shared vocabulary, no registry, no
package resolved at runtime. Two repositories that both installed it have no relationship to each
other. Everything that varies lives in one file, `ontology.config.json`, inside each repository and
describing only that repository — which is also what lets the installed scripts stay identical, so
a later fix reaches a repository as a file copy rather than a hand merge.
````

- [x] **Step 4: Write `README.md`**

````markdown
# Ontology Kit

Installs a self-contained domain-ontology discipline into any git repository: a canonical
vocabulary file, an agent protocol, and a deterministic CI check that fails the build when prose
drifts from it. Optionally, an advisory model-assisted reviewer and enum lock tests.

See [docs/how-it-works.md](docs/how-it-works.md) for what the mechanism is and what it does and
does not catch.

## Install into a repository

```bash
node bin/install-ontology.mjs --target /path/to/repo --dry-run
node bin/install-ontology.mjs --target /path/to/repo
```

| Option | Effect |
|---|---|
| `--target <repo>` | **Required.** The repository to install into. Must already be a git repository. |
| `--project-name <name>` | Name used in the ontology's title. Defaults to the target directory's name. |
| `--ontology-path <path>` | Where the ontology file goes. Defaults to `docs/ontology.md`. Must be repository-relative, with no `..` segment. |
| `--default-branch <name>` | Branch the lint workflow's `push` trigger fires on. Defaults to the target's current branch (detected via `git`), falling back to `main` if that can't be detected. |
| `--with-drift-review` | Also install the advisory semantic reviewer, its tests, workflow and runbook. |
| `--with-enum-tests <lang>` | Also install a worked-example enum lock test: `csharp`, `typescript`, or `python`. Installed with a `.example` suffix — see [Then seed it](#then-seed-it). |
| `--dry-run` | Print the file plan and exit without writing. |
| `--force` | Overwrite existing **kit-owned** files — the scripts and CI workflows. Never touches adopter-owned files (`ontology.config.json`, the ontology document, the enum test); this is the correct way to upgrade an installed repository. |
| `--reset-content` | Also overwrite adopter-owned files, discarding their content back to the shipped templates. Destructive — only for someone who genuinely wants to start over. |
| `--help` | Print usage and exit 0. |

A core install writes:

```
scripts/ontology-config.mjs
scripts/check-ontology-terms.mjs
ontology.config.json
docs/ontology.md
.github/workflows/ontology-lint.yml
```

and splices an "Ontology protocol" section into the repository's `AGENTS.md` (or `CLAUDE.md`, or a
new `AGENTS.md`) between HTML comment markers. Re-running updates that section in place, so an
upgrade is one command. If the agent file already has a hand-written "## Ontology protocol"
section with no markers, the installer refuses rather than adding a second, contradictory copy —
remove or mark the existing section first.

## Then seed it

The installer writes the mechanism, not the content. Filling in the ontology means reading the
repository and cataloguing what it already calls things. The `ontology-setup` skill in
[skills/ontology-setup](skills/ontology-setup/SKILL.md) does that, and triages the first check run.

Without the skill, the manual path is: edit `docs/ontology.md`, delete the sections and example
rows that do not apply, update `sections` in `ontology.config.json` to match, then run
`node scripts/check-ontology-terms.mjs` and work through what it reports.

## Upgrading an installed repository

Re-run the installer with `--force`. The scripts and CI workflows are identical in every
repository, so `--force` replaces them wholesale — a script fix becomes a one-command upgrade.
`--force` never touches `ontology.config.json`, `docs/ontology.md` (or wherever `--ontology-path`
points), or the enum test: those are yours, and an upgrade must not silently revert your seeded
ontology or your reasoned allowlist.

If you genuinely want the adopter-owned templates back — starting over, say — pass
`--reset-content` as well. It is destructive: it discards your ontology content and your allowlist
back to the blank shipped templates, so use it deliberately, not as a matter of routine.

## Independence

Installing copies files and creates no dependency on this repository. There is no shared
vocabulary, registry, server, or runtime link. Two repositories that install this have no
relationship to each other.

## Developing the kit

```bash
npm test
```

`node --test` over `tests/` and the shipped reviewer tests in `templates/scripts/`. No
dependencies.
````

- [x] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/templates.test.mjs`
Expected: PASS — `# pass 12`, `# fail 0`

- [x] **Step 6: Commit**

```bash
git add README.md docs/how-it-works.md tests/templates.test.mjs
git commit -m "docs: kit README and how-it-works explanation"
```

> **Note added after the whole-system review (2026-09-07):** README.md's options table and
> "Upgrading an installed repository" section, reproduced above, are the *post-review* text —
> `--reset-content`, `--default-branch`, and `--help` did not exist at the time this task was first
> written, and the original upgrade guidance ("`--force` overwrites those too — so copy the scripts
> only, or restore those two files afterwards") described the very defect the review found: plain
> `--force` silently reverting a seeded `docs/ontology.md` and `ontology.config.json`. The guidance
> now reflects `--force`'s corrected, safe behaviour (Task 8's `ownedBy`, Task 10's `install`) —
> copying scripts manually or restoring files afterwards is no longer necessary, so that advice was
> removed rather than left stale beside the fix.

---

## Task 18: End-to-end acceptance

The test that would have caught the subtlest bug in this design: the kit installs Markdown into a target repository, and that Markdown is then linted by the very check the kit installed. A backticked PascalCase example term anywhere in an installed document fails the adopting repository's build on day one.

**Files:**
- Create: `tests/acceptance.test.mjs`

- [x] **Step 1: Write the failing test**

Create `tests/acceptance.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { install } from "../bin/install-ontology.mjs";
import { withTempRepo } from "./helpers/temp-repo.mjs";

function run(dir, command, args) {
  try {
    return { status: 0, stdout: execFileSync(command, args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }), stderr: "" };
  } catch (error) {
    return { status: error.status, stdout: error.stdout?.toString() ?? "", stderr: error.stderr?.toString() ?? "" };
  }
}

test("a full install passes its own check with the templates untouched", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withDriftReview: true });
    repo.git("add", "-A");
    repo.git("commit", "-m", "install ontology kit");

    const result = run(repo.dir, "node", ["scripts/check-ontology-terms.mjs"]);
    assert.equal(result.status, 0, `installed templates violate their own check:\n${result.stderr}`);
  });
});

test("the shipped reviewer tests pass inside the target repository", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withDriftReview: true });
    const result = run(repo.dir, "node", ["--test", "scripts/review-ontology-drift.test.mjs"]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
});

test("a real ontology and matching prose pass; an invented term fails", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets" });

    // Replace the template with a small real ontology, and narrow the configured sections to match.
    writeFileSync(join(repo.dir, "docs/ontology.md"), [
      "# Widgets — Application Ontology",
      "",
      "## Entities",
      "",
      "| Name | Properties | Description |",
      "|------|------------|-------------|",
      "| `Widget` | `id`, `status` | A widget. |",
      "",
      "## Enums",
      "",
      "| Name | Values | Description |",
      "|------|--------|-------------|",
      "| `WidgetStatus` | `Pending`, `Shipped` | Lifecycle state of a `Widget`. |",
      "",
      "## Relationships",
      "",
      "| From | Relationship | To | Cardinality |",
      "|------|--------------|----|-------------|",
      "| `Widget` | has | `WidgetStatus` | 1 → 1 |",
      "",
      "## Business Rules & Invariants",
      "",
      "- **`Widget`** — must not be `Shipped` while still `Pending`.",
      "",
    ].join("\n"));

    const config = JSON.parse(readFileSync(join(repo.dir, "ontology.config.json"), "utf8"));
    config.sections.optional = [];
    writeFileSync(join(repo.dir, "ontology.config.json"), JSON.stringify(config, null, 2));

    repo.write("docs/spec.md", "A `Widget` becomes `Shipped` once dispatched.\n");
    repo.git("add", "-A");
    repo.git("commit", "-m", "seed ontology");

    const clean = run(repo.dir, "node", ["scripts/check-ontology-terms.mjs"]);
    assert.equal(clean.status, 0, clean.stderr);

    repo.write("docs/spec.md", "A `Gadget` becomes `Shipped` once dispatched.\n");
    repo.git("add", "-A");
    const dirty = run(repo.dir, "node", ["scripts/check-ontology-terms.mjs"]);
    assert.equal(dirty.status, 1);
    assert.match(dirty.stderr, /`Gadget` is not defined in docs\/ontology\.md/);
  });
});

test("an allowlist entry with a reason clears the violation", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets" });
    repo.write("docs/spec.md", "The `IClock` abstraction is injected.\n");

    const config = JSON.parse(readFileSync(join(repo.dir, "ontology.config.json"), "utf8"));
    config.allowlist = [{ term: "IClock", reason: "architecture interface name, not a domain concept" }];
    writeFileSync(join(repo.dir, "ontology.config.json"), JSON.stringify(config, null, 2));

    repo.git("add", "-A");
    repo.git("commit", "-m", "seed");

    const result = run(repo.dir, "node", ["scripts/check-ontology-terms.mjs"]);
    assert.equal(result.status, 0, result.stderr);
  });
});

test("the reviewer's projection accepts the installed ontology template", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withDriftReview: true });
    repo.write("check-projection.mjs", [
      'import { readFileSync } from "node:fs";',
      'import { loadConfig } from "./scripts/ontology-config.mjs";',
      'import { projectOntology } from "./scripts/review-ontology-drift.mjs";',
      "",
      "const config = loadConfig({});",
      'projectOntology(readFileSync(config.ontologyPath, "utf8"), config.sections);',
      'console.log("projection ok");',
      "",
    ].join("\n"));

    const result = run(repo.dir, "node", ["check-projection.mjs"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /projection ok/);
  });
});
```

- [x] **Step 2: Run it and fix what it finds**

Run: `node --test tests/acceptance.test.mjs`

Expected: the first test **fails** if any installed Markdown carries a backticked PascalCase term the ontology template does not define. Only three installed files are Markdown and lintable, so check them in this order:

1. `docs/ontology-drift-review.md` — the likeliest offender. Its examples must be quoted, not backticked; a backticked `Approved` there is a violation in every adopting repository.
2. The spliced protocol section in `AGENTS.md` — check that no backticked span in it is PascalCase (`ontology.config.json`, `git ls-files "*.md"` and `scripts/check-ontology-terms.mjs` are all safe; a term like `PascalCase` written in backticks would not be).
3. `docs/ontology.md` itself is exempt from the unknown-term check, so its example rows are safe — but every backticked PascalCase term in it becomes canonical vocabulary for the whole repository, so keep the example rows few and obviously placeholder.

Fix by rewording the offending template — quote the example rather than backticking it — **not** by adding allowlist entries to the shipped config. The shipped config's allowlist must stay empty, or every adopting repository inherits exemptions it never asked for.

- [x] **Step 3: Run it again to verify it passes**

Run: `node --test tests/acceptance.test.mjs`
Expected: PASS — `# pass 5`, `# fail 0`

- [x] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS — `# fail 0` across every suite.

- [x] **Step 5: Commit**

```bash
git add tests/acceptance.test.mjs
git commit -m "test: end-to-end acceptance for install, lint and projection"
```

---

## Done when

- `npm test` passes with no failures.
- `node bin/install-ontology.mjs --target <fresh repo>` produces a repository whose
  `node scripts/check-ontology-terms.mjs` exits 0 with no allowlist entries.
- Re-running the installer changes nothing but the files it is asked to overwrite, and the protocol
  section appears exactly once.
- `README.md` and `docs/how-it-works.md` describe the mechanism without referring to either source
  repository's domain.
