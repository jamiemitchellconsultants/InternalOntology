import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import {
  validateConfig,
  loadConfig,
  CONFIG_FILENAME,
  normaliseRepoRelativePath,
} from "../templates/scripts/ontology-config.mjs";
import { withTempRepo } from "./helpers/temp-repo.mjs";

const minimal = { ontologyPath: "docs/ontology.md" };

test("normaliseRepoRelativePath accepts and normalises a repo-relative path", () => {
  assert.equal(normaliseRepoRelativePath("docs/ontology.md", "--ontology-path"), "docs/ontology.md");
  assert.equal(normaliseRepoRelativePath("./docs/ontology.md", "--ontology-path"), "docs/ontology.md");
});

test("normaliseRepoRelativePath rejects an absolute path, echoing the given label", () => {
  assert.throws(
    () => normaliseRepoRelativePath("/etc/onto.md", "--ontology-path"),
    /--ontology-path must be repository-relative, not absolute: "\/etc\/onto\.md"/,
  );
});

test("normaliseRepoRelativePath rejects a path containing a \"..\" segment", () => {
  assert.throws(
    () => normaliseRepoRelativePath("../outside.md", "--ontology-path"),
    /--ontology-path must not contain "\.\." segments: "\.\.\/outside\.md"/,
  );
});

test("a minimal config is filled in with empty defaults", () => {
  const config = validateConfig(minimal, { ontologyExists: () => true });
  assert.deepEqual(config, {
    ontologyPath: "docs/ontology.md",
    namespaceUri: "https://ontology.example/ontology#",
    sections: { required: [], optional: [] },
    allowlist: [],
    bannedAliases: [],
    ignorePaths: [],
  });
});

test("namespaceUri defaults to a generic placeholder when omitted", () => {
  const config = validateConfig(minimal, { ontologyExists: () => true });
  assert.equal(config.namespaceUri, "https://ontology.example/ontology#");
});

test("a supplied namespaceUri is trimmed and kept", () => {
  const config = validateConfig(
    { ...minimal, namespaceUri: "  https://ontology.example/widgets#  " },
    { ontologyExists: () => true },
  );
  assert.equal(config.namespaceUri, "https://ontology.example/widgets#");
});

test("an empty-string namespaceUri is rejected, not silently defaulted", () => {
  assert.throws(
    () => validateConfig({ ...minimal, namespaceUri: "   " }, { ontologyExists: () => true }),
    /namespaceUri must be a non-empty string/,
  );
});

test("a non-string namespaceUri is rejected", () => {
  assert.throws(
    () => validateConfig({ ...minimal, namespaceUri: 42 }, { ontologyExists: () => true }),
    /namespaceUri must be a non-empty string/,
  );
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

test("an unknown key inside sections is rejected, not silently treated as absent", () => {
  // Regression guard: {"require": [...], "optionl": []} (typos for "required"/"optional") used to
  // validate cleanly into {required: [], optional: []}, which silently disables the drift reviewer
  // — exactly the failure mode this module exists to prevent.
  assert.throws(
    () =>
      validateConfig(
        { ...minimal, sections: { require: ["Entities"], optionl: [] } },
        { ontologyExists: () => true },
      ),
    /unknown key "sections\.require"/,
  );
});

test("sections.optional alone, with sections.required omitted, is still valid", () => {
  const config = validateConfig(
    { ...minimal, sections: { optional: ["External Systems"] } },
    { ontologyExists: () => true },
  );
  assert.deepEqual(config.sections, { required: [], optional: ["External Systems"] });
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
