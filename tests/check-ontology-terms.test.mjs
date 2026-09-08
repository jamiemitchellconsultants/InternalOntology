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

test("a nested fence of a different length does not close the outer fence", () => {
  // Regression guard: a four-backtick block wrapping a three-backtick example. The inner ``` lines
  // are shorter than the fence that opened the block, so per CommonMark they cannot close it — the
  // `Nonesuch` between them stays inside the outer fence and must not be flagged.
  const violations = lintFile({
    file: "docs/spec.md",
    text: "````\n```\n`Nonesuch`\n```\n````\n",
    canonical: canonicalTerms(ontology),
    config: emptyConfig,
    ontologyPath: "docs/ontology.md",
  });
  assert.deepEqual(violations, []);
});

test("a nested fence of a different character does not close the outer fence", () => {
  // A backtick-fenced block wrapping a tilde-fenced example. Only a backtick run can close a
  // backtick fence, so the inner ~~~ lines are just content.
  const violations = lintFile({
    file: "docs/spec.md",
    text: "```\n~~~\n`Nonesuch`\n~~~\n```\n",
    canonical: canonicalTerms(ontology),
    config: emptyConfig,
    ontologyPath: "docs/ontology.md",
  });
  assert.deepEqual(violations, []);
});

test("a tilde fence containing backticked content is not flagged", () => {
  const violations = lintFile({
    file: "docs/spec.md",
    text: "~~~\nSee `Nonesuch` for the deprecated name.\n~~~\n",
    canonical: canonicalTerms(ontology),
    config: emptyConfig,
    ontologyPath: "docs/ontology.md",
  });
  assert.deepEqual(violations, []);
});

test("an info string on the opening fence does not prevent the fence from being recognised", () => {
  // The opening fence carries an info string ("js some info string"); the fence must still open,
  // hide the term inside it, and close cleanly at the bare ``` so linting resumes correctly after.
  const violations = lintFile({
    file: "docs/spec.md",
    text: "```js some info string\n`Nonesuch`\n```\nThe `Nonesuch` term appears after the fence too.\n",
    canonical: canonicalTerms(ontology),
    config: emptyConfig,
    ontologyPath: "docs/ontology.md",
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 4);
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
