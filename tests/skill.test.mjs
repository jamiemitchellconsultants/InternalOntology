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
