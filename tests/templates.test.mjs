import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const TEMPLATES = fileURLToPath(new URL("../templates/", import.meta.url));
const KNOWN_PLACEHOLDERS = new Set(["PROJECT_NAME", "ONTOLOGY_PATH", "ONTOLOGY_TTL_PATH", "NAMESPACE_URI", "DEFAULT_BRANCH"]);

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

test("the semantic trigger carries no secret, checkout, path filter, or artifact", () => {
  const yaml = readFileSync(join(TEMPLATES, "github/workflows/ontology-semantic-request.yml"), "utf8");
  assert.match(yaml, /pull_request:/);
  for (const forbidden of ["secrets.", "actions/checkout", "paths:", "upload-artifact", "pull_request_target"]) {
    assert.equal(yaml.includes(forbidden), false, `trigger includes ${forbidden}`);
  }
});

test("trusted follow-up has secretless identification and finalizer around a protected worker", () => {
  const yaml = readFileSync(join(TEMPLATES, "github/workflows/ontology-semantic-review.yml"), "utf8");
  assert.match(yaml, /workflow_run:/);
  assert.match(yaml, /^  identify:/m);
  assert.match(yaml, /^  review:/m);
  assert.match(yaml, /^  finalize:/m);
  assert.match(yaml, /deployment: false/);
  assert.match(yaml, /ONTOLOGY_SEMANTIC_LLM_API_KEY: \$\{\{ secrets\.ONTOLOGY_SEMANTIC_LLM_API_KEY \}\}/);
  assert.match(yaml, /ontology-semantic-\$\{\{ matrix\.number \}\}/);
  assert.equal((yaml.match(/pull-requests: write/g) ?? []).length, 3);
  const identify = yaml.split("  identify:")[1].split("  review:")[0];
  const finalizer = yaml.split("  finalize:")[1];
  assert.equal(identify.includes("ONTOLOGY_SEMANTIC_LLM_API_KEY"), false);
  assert.equal(finalizer.includes("ONTOLOGY_SEMANTIC_LLM_API_KEY"), false);
  assert.match(yaml, /persist-credentials: false/g);
  assert.doesNotMatch(yaml, /github\.event\.pull_request\.head\.sha.*run:/);
  assert.doesNotMatch(yaml, /ref:.*pull_request/);
});

test("dismissal workflow has no model secret and shares per-PR concurrency", () => {
  const yaml = readFileSync(join(TEMPLATES, "github/workflows/ontology-semantic-dismiss.yml"), "utf8");
  assert.match(yaml, /issue_comment:/);
  assert.match(yaml, /ontology-semantic-\$\{\{ github\.event\.issue\.number \}\}/);
  assert.equal(yaml.includes("ONTOLOGY_SEMANTIC_LLM_API_KEY"), false);
});

test("every enum test template exists and says it must be adapted", () => {
  for (const name of ["csharp-xunit.cs", "typescript-vitest.ts", "python-pytest.py"]) {
    const text = readFileSync(join(TEMPLATES, "enum-tests", name), "utf8");
    assert.match(text, /ADAPT THIS/, `${name} does not tell the reader to adapt it`);
    assert.match(text, /{{ONTOLOGY_PATH}}/, `${name} does not reference the ontology path`);
  }
});

test("the README documents every installer option", () => {
  const readme = readFileSync(fileURLToPath(new URL("../README.md", import.meta.url)), "utf8");
  for (const option of [
    "--target", "--dry-run", "--force", "--ontology-path",
    "--with-drift-review", "--with-semantic-review", "--with-enum-tests",
  ]) {
    assert.ok(readme.includes(option), `README does not document ${option}`);
  }
});

test("semantic runbook names the protected environment, status, dismissal and fork path", () => {
  const text = readFileSync(join(TEMPLATES, "docs/ontology-semantic-review.md"), "utf8");
  for (const phrase of ["ontology-semantic-review", "ONTOLOGY_SEMANTIC_LLM_API_KEY",
    "ontology/semantic-match", "/ontology-dismiss", "fork", "default branch", "--with-semantic-review"]) {
    assert.ok(text.includes(phrase), `runbook omits ${phrase}`);
  }
});

test("how-it-works states what the mechanism does not catch", () => {
  const doc = readFileSync(fileURLToPath(new URL("../docs/how-it-works.md", import.meta.url)), "utf8");
  assert.match(doc, /What it does not catch/);
});
