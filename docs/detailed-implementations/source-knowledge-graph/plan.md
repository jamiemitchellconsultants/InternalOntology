# Source knowledge graph — detailed implementation plan

Execute this after the [task plan](../../superpowers/plans/source-knowledge-graph/plan.md) has
merged. Read the [vision](../../features/source-knowledge-graph/01-vision.md),
[behaviours](../../features/source-knowledge-graph/02-behaviours.md),
[architecture](../../features/source-knowledge-graph/03-architecture.md) and ADRs 0005–0008 before
starting. Work on `feature/source-knowledge-graph/dev-build`. Each numbered task is a separate
test-first commit and push. Run its focused test, `node scripts/check-ontology-terms.mjs` and
`npm test` before every commit; stage only that task's intended files and review the cached diff.
The installed files must remain byte-identical across adopting repositories.
Tasks 1–10 are already pushed through `c1a3983`. This amendment defines Task 11 as one additive
repair commit after that head; do not amend, squash or reorder those commits. Begin Task 11 only
after the amendment pull request has been reviewed and merged and pushback has been cleared.

The code fragments below are contracts and complete minimal tests, not implementation bodies. Keep
test names and assertions; where a fixture exposes a further boundary named in the task plan, add a
case. `node --test` discovers `*.test.mjs` under `templates/scripts/` as well as `tests/`. Shipped
tests and their helper import only from `templates/scripts/`, because adopters have no `tests/`.

The tree, finding, resource and spec shapes named below are plain JavaScript objects, not ontology
terms. Their type names appear only in code fences so the term checker does not read them as
domain concepts; do not backtick them in prose.

## Conventions shared by every task

**Exit codes.** Both commands exit 0 (clean), 1 (findings) or 2 (cannot run: broken or disabled
config, missing ontology Turtle, unknown revision, unmerged index).

**Finding shape.**

```js
// { file, subject, rule, message }  e.g.
// { file: "docs/source-knowledge-graph/assertions/widgets.ttl", subject: ":assertion-a1",
//   rule: "evidence-blob-mismatch", message: "src/Invoice.cs is blob 1f3… but evidence cites 000…" }
```

Findings are sorted by `file`, then line, then `rule`, then `message`. Printed form, one per line
on standard error: `<file>: <subject>: <rule>: <message>` (the subject part is omitted when empty).
`--json` prints `{ revision, ok, findings }` on standard output instead and sets the same code.

**Rule names** (tests assert them; do not rename): `turtle-syntax`, `turtle-noncanonical`,
`namespace-mismatch`, `schema-missing`, `schema-version`, `graph-resource-count`, `duplicate-iri`,
`missing-predicate`, `bad-value`, `dangling-reference`, `unknown-kind`, `unknown-relationship`,
`missing-basis`, `missing-evidence`, `evidence-path-missing`, `evidence-out-of-coverage`,
`evidence-role-mismatch`, `evidence-blob-mismatch`, `evidence-range`, `denotes-missing`,
`coverage-malformed`, `coverage-conflict`, `coverage-unreferenced`, `coverage-transition`, `root-not-excluded`,
`refresh-missing`, `refresh-stale`, `refresh-malformed`, `refresh-unreferenced`, `graph-disabled`.

**Resource classes, predicates and value kinds** (the single table the checker validates; `iri*`
means zero or more, `iri+` one or more, `iri` exactly one):

| Class | Predicate: value kind |
| --- | --- |
| `kit:SourceKnowledgeGraph` | `kit:schemaVersion`: integer; `kit:coverage`: iri*; `kit:refreshRecord`: iri*; `kit:declaresKind`: iri*; `kit:declaresRelationship`: iri* |
| `kit:GraphNode` | `kit:kind`: iri; `rdfs:label`: string; `kit:denotes`: iri (required when kind is `kit:concept`) |
| `kit:GraphAssertion` | `kit:subject`: iri; `kit:relationship`: iri; `kit:object`: iri; `kit:basis`: iri; `kit:evidence`: iri+ |
| `kit:GraphEvidence` | `kit:path`: string; `kit:startLine`: integer ≥ 1; `kit:endLine`: integer ≥ `kit:startLine`; `kit:blobId`: string (40 or 64 lowercase hex); `kit:role`: iri |
| `kit:GraphCoverage` | `kit:pathSelector`: string; `kit:status`: iri; `kit:priority`: integer; `kit:reason`: string (required unless status is `kit:covered`) |
| `kit:GraphRefreshRecord` | `kit:path`: string; exactly one of `kit:blobId`: string or `kit:deleted`: integer `1`; `kit:reviewOutcome`: iri |
| `kit:GraphKindDefinition`, `kit:GraphRelationshipDefinition` | `rdfs:comment`: non-empty string; IRI must use the `:` prefix |

An unknown predicate on a known class is a `bad-value` finding naming it. Unknown classes are
`bad-value` too.

---

## Task 1 — configuration

**Files:** `templates/scripts/ontology-config.mjs`, `tests/ontology-config.test.mjs`.

**Interface:** `validateConfig(raw, deps)` adds `sourceGraph: { enabled: boolean, root: string,
evidence: { implementation?: string[], test?: string[], "selected-document"?: string[], ontology?:
string[], deployment?: string[] } }`. Absence yields `{ enabled: false, root:
"docs/source-knowledge-graph", evidence: {} }`. `root` and every selector go through
`normaliseRepoRelativePath`. When `enabled` is true, `ontologyPath` must end in `.md` (the Turtle
source is derived by replacing that suffix). `null`, unknown keys at either level, non-array
selectors and empty strings are errors. Add `"sourceGraph"` to `KNOWN_KEYS` and to the typedef. Do
not change `templates/ontology.config.json`; the installer adds the section (Task 9).

The existing full-config `deepEqual` test (the one asserting every field of a loaded config) must
gain the default `sourceGraph` value. Append these complete cases to
`tests/ontology-config.test.mjs`:

```js
const graphOn = (extra = {}) => ({
  ...minimal,
  sourceGraph: { enabled: true, root: "docs/source-knowledge-graph", evidence: {}, ...extra },
});
const ok = { ontologyExists: () => true };

test("source graph is disabled with defaults when the section is absent", () => {
  assert.deepEqual(validateConfig(minimal, ok).sourceGraph,
    { enabled: false, root: "docs/source-knowledge-graph", evidence: {} });
});

test("an enabled source graph keeps its root and per-role selectors", () => {
  const value = validateConfig(graphOn({
    root: "./graph", evidence: { deployment: ["**/*.tf"], test: ["tests/**"] },
  }), ok);
  assert.deepEqual(value.sourceGraph,
    { enabled: true, root: "graph", evidence: { deployment: ["**/*.tf"], test: ["tests/**"] } });
});

test("source graph rejects null, unknown keys, bad roots and bad selectors", () => {
  const bad = [
    [null, /sourceGraph/],
    [{ enabled: true, extra: 1 }, /sourceGraph\.extra/],
    [{ enabled: true, evidence: { docker: ["x"] } }, /sourceGraph\.evidence\.docker/],
    [{ enabled: true, root: "/abs" }, /repository-relative/],
    [{ enabled: true, root: "../up" }, /\.\./],
    [{ enabled: true, evidence: { test: "tests/**" } }, /array/],
    [{ enabled: true, evidence: { test: [""] } }, /non-empty/],
    [{ enabled: "yes" }, /enabled/],
  ];
  for (const [sourceGraph, pattern] of bad) {
    assert.throws(() => validateConfig({ ...minimal, sourceGraph }, ok), pattern);
  }
});

test("an enabled source graph needs a Markdown ontology path to derive the Turtle source", () => {
  assert.throws(
    () => validateConfig({ ontologyPath: "docs/ontology.txt", sourceGraph: { enabled: true } }, ok),
    /\.md/,
  );
});
```

Test failure first with `node --test tests/ontology-config.test.mjs`, implement, rerun, run global
checks, commit `feat: validate source graph settings`, and push.

## Task 2 — canonical Turtle subset

**Files:** new `templates/scripts/source-graph-turtle.mjs` and `source-graph-turtle.test.mjs`.

**Interfaces:**

```js
export class GraphTurtleError extends Error { file; line; rule }          // message "file:line: rule"
export const GRAPH_PREFIXES; // kit -> https://ontology-kit.dev/schema#, rdfs -> http://www.w3.org/2000/01/rdf-schema#
export function parseGraphTurtle(text, file = "<graph>")
// -> { namespace, blocks: [{ subject, type, line, pairs: [{ predicate, object, objectType, line }] }] }
//    objectType: "iri" | "string" | "integer"; the first `a` pair is `type`, not in `pairs`.
export function formatGraphTurtle({ namespace, blocks })  // sorts subjects, predicates and objects
export function canonicalProblems(text)                   // -> [{ line, rule }], [] when canonical
```

Canonical text is three prefix lines in this order (`:` = the namespace, then `kit:`, then
`rdfs:`), then for each block a blank line and the block, with exactly one trailing newline. A
block is `<subject> a <class> ;` followed by four-space-indented `<predicate> <object> ;` lines,
the last ending ` .`. Subjects sort by code unit; predicates sort by code unit after `a`; several
objects of one predicate sort by their written token. Names after a prefix match
`[A-Za-z0-9_][A-Za-z0-9_-]*` (no dots). Strings escape only `\\`, `\"` and `\n`; any other
backslash escape, raw tab or other control character is `turtle-syntax`. Integers are `0|[1-9][0-9]*`.
Line endings must be LF. The parser finds blocks by their unindented subject lines and ignores
blank lines, so spacing departures are caught by `canonicalProblems`, not by a parse error.

Complete tests:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGraphTurtle, formatGraphTurtle, canonicalProblems, GraphTurtleError } from "./source-graph-turtle.mjs";

const NS = "https://ontology.example/widgets#";
const head = `@prefix : <${NS}> .\n@prefix kit: <https://ontology-kit.dev/schema#> .\n` +
  `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n`;
const canonical = `${head}\n:node-a a kit:GraphNode ;\n    kit:kind kit:concept ;\n` +
  `    rdfs:label "Say \\"hi\\"\\nthere" .\n\n:node-b a kit:GraphNode ;\n    kit:kind kit:test ;\n` +
  `    rdfs:label "B" .\n`;

test("a canonical document parses, formats back byte for byte and has no problems", () => {
  const parsed = parseGraphTurtle(canonical, "g.ttl");
  assert.equal(parsed.namespace, NS);
  assert.equal(parsed.blocks[0].pairs.find((p) => p.predicate === "rdfs:label").object, 'Say "hi"\nthere');
  assert.equal(formatGraphTurtle(parsed), canonical);
  assert.deepEqual(canonicalProblems(canonical), []);
});

test("integers and iris keep their types", () => {
  const text = `${head}\n:evidence-a a kit:GraphEvidence ;\n    kit:endLine 12 ;\n    kit:role kit:role-test .\n`;
  const [block] = parseGraphTurtle(text).blocks;
  assert.deepEqual(block.pairs.map((p) => [p.predicate, p.objectType]),
    [["kit:endLine", "integer"], ["kit:role", "iri"]]);
});

test("each construct outside the subset is rejected with its line number", () => {
  const body = (line) => `${head}\n:n a kit:GraphNode ;\n    ${line}\n    rdfs:label "x" .\n`;
  const cases = [
    ["kit:kind [ a kit:concept ] ;", "blank node"],
    ["kit:kind kit:concept , kit:test ;", "multi-object"],
    ["kit:kind ( kit:concept ) ;", "collection"],
    ["kit:kind << :a :b :c >> ;", "RDF-star"],
    ['rdfs:comment """long""" ;', "multiline"],
    ["kit:kind other:thing ;", "unknown prefix"],
    ['rdfs:comment "bad\\t" ;', "escape"],
  ];
  for (const [line, label] of cases) {
    assert.throws(() => parseGraphTurtle(body(line), "g.ttl"),
      (error) => error instanceof GraphTurtleError && error.line === 6, label);
  }
  assert.throws(() => parseGraphTurtle(`@base <x> .\n${head}`, "g.ttl"), GraphTurtleError);
});

test("order, spacing and line-ending departures are reported as noncanonical", () => {
  const swapped = canonical.replace(":node-a", ":zz").replace(":node-b", ":node-a").replace(":zz", ":node-b");
  assert.equal(canonicalProblems(swapped).length, 1);
  const predicatesSwapped = `${head}\n:node-b a kit:GraphNode ;\n    rdfs:label "B" ;\n    kit:kind kit:test .\n`;
  assert.equal(canonicalProblems(predicatesSwapped).length, 1);
  assert.equal(canonicalProblems(canonical.replace("\n\n:node-b", "\n:node-b")).length, 1);
  assert.equal(canonicalProblems(canonical + "\n").length, 1);
  assert.equal(canonicalProblems(canonical.replace(/\n/g, "\r\n"))[0].rule, "line endings must be LF");
});

test("the formatter sorts what the caller hands it", () => {
  const out = formatGraphTurtle({ namespace: NS, blocks: [
    { subject: ":z", type: "kit:GraphNode", line: 0, pairs: [
      { predicate: "rdfs:label", object: "Z", objectType: "string" },
      { predicate: "kit:kind", object: "kit:test", objectType: "iri" }] },
    { subject: ":a", type: "kit:GraphNode", line: 0, pairs: [
      { predicate: "kit:kind", object: "kit:test", objectType: "iri" },
      { predicate: "rdfs:label", object: "A", objectType: "string" }] },
  ] });
  assert.ok(out.indexOf(":a a") < out.indexOf(":z a"));
  assert.ok(out.indexOf("kit:kind") < out.indexOf("rdfs:label"));
  assert.deepEqual(canonicalProblems(out), []);
});
```

Test failure first with `node --test templates/scripts/source-graph-turtle.test.mjs`, implement,
rerun, run global checks, commit `feat: parse the canonical graph turtle subset`, and push.

## Task 3 — Git tree sources and the scratch-repository helper

**Files:** new `templates/scripts/source-graph-git.mjs`, `source-graph-git.test.mjs`,
`source-graph-test-helpers.mjs`.

**Interfaces:**

```js
export class GitSourceError extends Error {}
export function treeFromRevision(cwd, rev)  // rev is a commit-ish; must not start with "-"
export function treeFromIndex(cwd)          // git write-tree; unmerged entries throw
// Tree: { kind: "commit" | "candidate", id, paths(): string[], has(p), blobId(p), read(p): Buffer, text(p): string }
export function changedPaths(baseTree, headTree)  // [{ path, change: "added" | "modified" | "deleted" }] sorted by path
export function lineCount(buffer)                 // number of lines; empty buffer is 0; a final unterminated line counts
```

Implementation notes. Resolve with `git rev-parse --verify --quiet <rev>^{commit}` and read
`<commit>^{tree}`. List with `git ls-tree -r -z --full-tree <tree>`; each record is
`<mode> <type> <sha>\t<path>` separated by NUL; skip `commit` entries (submodules). Read with
`git cat-file blob <sha>`, `encoding: "buffer"`, `maxBuffer` 512 MiB, cached by sha. Every call is
`execFileSync("git", [...args], { cwd })`; never build a command string. For a candidate tree
`id` is the tree ID, for a revision it is the commit SHA. Renames are not detected: a move is one
deletion and one addition.

Use `-z` for commands that list paths, such as `git ls-tree`, so filenames are parsed as data.
Do not add `-z` to `git rev-parse`, `git write-tree`, or `git cat-file`; their output is an object
ID or blob content, and they use the arguments specified above.

The helper, written now and extended in Task 5:

```js
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export async function withScratchRepo(body) {
  const dir = mkdtempSync(join(tmpdir(), "source-graph-"));
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  const write = (rel, text) => {
    const path = join(dir, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  };
  const remove = (rel) => rmSync(join(dir, rel), { force: true });
  const commit = (message) => { git("add", "-A"); git("commit", "-q", "-m", message); return git("rev-parse", "HEAD").trim(); };
  try {
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Graph Test");
    git("config", "commit.gpgsign", "false");
    git("config", "core.hooksPath", join(dir, ".no-hooks"));
    await body({ dir, git, write, remove, commit });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function blobId(dir, rel) {
  return execFileSync("git", ["-C", dir, "hash-object", "--", rel], { encoding: "utf8" }).trim();
}
```

Complete tests:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { treeFromRevision, treeFromIndex, changedPaths, lineCount, GitSourceError } from "./source-graph-git.mjs";
import { withScratchRepo, blobId } from "./source-graph-test-helpers.mjs";

test("a revision tree reads committed content, not a dirty working file", async () => {
  await withScratchRepo(async (repo) => {
    repo.write("a.txt", "one\ntwo\n");
    const sha = repo.commit("first");
    repo.write("a.txt", "changed in the working tree\n");
    const tree = treeFromRevision(repo.dir, "HEAD");
    assert.equal(tree.kind, "commit");
    assert.equal(tree.id, sha);
    assert.equal(tree.text("a.txt"), "one\ntwo\n");
    assert.equal(tree.blobId("a.txt"), repo.git("rev-parse", "HEAD:a.txt").trim());
  });
});

test("the index tree includes a staged file and names a candidate tree", async () => {
  await withScratchRepo(async (repo) => {
    repo.write("a.txt", "x\n");
    repo.commit("first");
    repo.write("b.txt", "staged\n");
    repo.git("add", "b.txt");
    repo.write("c.txt", "untracked\n");
    const tree = treeFromIndex(repo.dir);
    assert.equal(tree.kind, "candidate");
    assert.match(tree.id, /^[0-9a-f]{40,64}$/);
    assert.deepEqual(tree.paths(), ["a.txt", "b.txt"]);
    assert.equal(tree.blobId("b.txt"), blobId(repo.dir, "b.txt"));
  });
});

test("an unknown revision, a leading dash and an unmerged index are setup errors", async () => {
  await withScratchRepo(async (repo) => {
    repo.write("a.txt", "x\n");
    repo.commit("first");
    assert.throws(() => treeFromRevision(repo.dir, "no-such-rev"), GitSourceError);
    assert.throws(() => treeFromRevision(repo.dir, "--help"), GitSourceError);
    repo.git("checkout", "-q", "-b", "other");
    repo.write("a.txt", "other\n");
    repo.commit("other");
    repo.git("checkout", "-q", "main");
    repo.write("a.txt", "main\n");
    repo.commit("main");
    try { repo.git("merge", "other"); } catch { /* conflict is the point */ }
    assert.throws(() => treeFromIndex(repo.dir), GitSourceError);
  });
});

test("awkward file names reach git as data and come back intact", async () => {
  await withScratchRepo(async (repo) => {
    const names = ["with space.txt", 'quote".txt', "new\nline.txt", "semi;colon $(touch pwned).txt"];
    for (const name of names) repo.write(name, "x\n");
    repo.commit("names");
    const tree = treeFromRevision(repo.dir, "HEAD");
    assert.deepEqual(tree.paths(), [...names].sort());
    assert.equal(tree.has("pwned"), false);
  });
});

test("changed paths report added, modified, deleted and a move as delete plus add", async () => {
  await withScratchRepo(async (repo) => {
    repo.write("keep.txt", "k\n");
    repo.write("edit.txt", "1\n");
    repo.write("gone.txt", "g\n");
    repo.write("old-name.txt", "same content\n");
    repo.commit("base");
    repo.write("edit.txt", "2\n");
    repo.remove("gone.txt");
    repo.remove("old-name.txt");
    repo.write("new-name.txt", "same content\n");
    repo.write("added.txt", "a\n");
    repo.commit("head");
    const base = treeFromRevision(repo.dir, "HEAD~1");
    const head = treeFromRevision(repo.dir, "HEAD");
    assert.deepEqual(changedPaths(base, head), [
      { path: "added.txt", change: "added" },
      { path: "edit.txt", change: "modified" },
      { path: "gone.txt", change: "deleted" },
      { path: "new-name.txt", change: "added" },
      { path: "old-name.txt", change: "deleted" },
    ]);
  });
});

test("line counting treats an unterminated last line as a line and an empty file as none", () => {
  assert.equal(lineCount(Buffer.from("")), 0);
  assert.equal(lineCount(Buffer.from("a\nb\n")), 2);
  assert.equal(lineCount(Buffer.from("a\nb")), 2);
});
```

Add a submodule case if `git submodule add` of a local path works in the scratch repository
(`-c protocol.file.allow=always`); otherwise assert on a hand-built tree entry with
`git update-index --add --cacheinfo 160000,<sha>,sub`. Test failure first, implement, rerun, run
global checks, commit `feat: read graph input from git trees`, and push.

## Task 4 — model, vocabulary and coverage

**Files:** new `templates/scripts/source-graph-model.mjs`, `source-graph-model.test.mjs`,
`templates/source-graph/graph-schema.ttl` (generated, see below), and `tests/source-graph-templates.test.mjs`
(kit-only checks of the template files; Task 8 appends to it).

**Interfaces:**

```js
export const CORE = {
  schemaVersion: 1,
  kinds: ["kit:concept", "kit:source-file", "kit:source-symbol", "kit:test", "kit:dependency",
          "kit:document", "kit:deployment-resource", "kit:system", "kit:component"],
  relationships: ["kit:contains", "kit:implements", "kit:tested-by", "kit:depends-on",
                  "kit:documented-by", "kit:calls", "kit:communicates-with", "kit:deployed-by"],
  roles: ["kit:role-implementation", "kit:role-test", "kit:role-selected-document",
          "kit:role-ontology", "kit:role-deployment"],
  bases: ["kit:direct", "kit:inferred"],
  statuses: ["kit:covered", "kit:unknown", "kit:excluded"],
  outcomes: ["kit:graph-updated", "kit:no-fact-change"],
};
export const ROLE_KEYS = { "kit:role-implementation": "implementation", "kit:role-test": "test",
  "kit:role-selected-document": "selected-document", "kit:role-ontology": "ontology",
  "kit:role-deployment": "deployment" };
export const CORE_DEFINITIONS;          // iri -> one-line meaning; kinds and relationships verbatim from the architecture tables
export function renderSchema()          // the Kit-owned graph-schema.ttl text, generated from CORE and CORE_DEFINITIONS
export function matchSelector(selector, path)
export function refreshIdFor(path)      // ":refresh-" + first 12 hex of sha1(path)
export function loadGraph(tree, config) // see below
export function resolveCoverage(graph, path)
```

`renderSchema()` returns prefixes `kit:` and `rdfs:` only, then `kit:GraphVocabulary a rdfs:Class
;` carrying `kit:schemaVersion 1 ;` and an `rdfs:comment`, then one block per core IRI
(`kit:concept a kit:GraphKind ;` … with `rdfs:comment`), grouped by kind, relationship, role, basis,
status, outcome. A kit test asserts `templates/source-graph/graph-schema.ttl` equals it, so write
that file by running `node -e` over the module once and committing the result.

`matchSelector`: `*` matches within one segment, `**` matches any number of segments including
none (`src/**` matches `src/a.cs` and `src/x/y/a.cs`; `**/*.tf` matches `main.tf` and `infra/a/main.tf`),
`?` one character within a segment, every other character is literal, and the whole path must
match. Selectors and paths are repository-relative with `/`.

`loadGraph(tree, config)` reads every path under `config.sourceGraph.root` ending `.ttl` except
`<root>/graph-schema.ttl`, parses each with `parseGraphTurtle`, and returns:

```js
// { root, namespaces: Map<file, string>, files: string[], resources: Map<iri, Resource>, duplicates: [{ iri, files }],
//   problems: [{ file, line, rule, message }],     // turtle-syntax and turtle-noncanonical, one per file
//   byType(type): Resource[] }
// Resource: { iri, type, file, line, values(predicate): pair[], first(predicate): pair | undefined }
```

A file that fails to parse contributes a problem and no resources; the other files still load. Each
file's namespace is recorded and compared with the config in Task 5.

`resolveCoverage` considers coverage resources with a string selector, integer priority and known
status. It returns the highest-priority match; if several share that priority with different
status it returns the first by IRI and sets `conflict: true`; no match is `{ status: "kit:unknown",
coverage: null }`.

Complete tests:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { CORE, matchSelector, refreshIdFor, renderSchema, loadGraph, resolveCoverage } from "./source-graph-model.mjs";
import { treeFromRevision } from "./source-graph-git.mjs";
import { withScratchRepo, NS, ttl, block, S } from "./source-graph-test-helpers.mjs";

test("selectors anchor and distinguish * from **", () => {
  const cases = [
    ["src/**", "src/a.cs", true], ["src/**", "src/x/y/a.cs", true], ["src/**", "src", false],
    ["src/*", "src/x/a.cs", false], ["**/*.tf", "main.tf", true], ["**/*.tf", "infra/a/main.tf", true],
    ["**/*.tf", "main.tfx", false], ["a?c", "abc", true], ["a?c", "a/c", false],
    ["docs/a.b", "docs/aXb", false], ["**", ".hidden/file", true], ["x+y(1).txt", "x+y(1).txt", true],
  ];
  for (const [selector, path, expected] of cases) {
    assert.equal(matchSelector(selector, path), expected, `${selector} vs ${path}`);
  }
});

test("a refresh id is stable and hyphenated", () => {
  assert.equal(refreshIdFor("src/a.cs"), refreshIdFor("src/a.cs"));
  assert.match(refreshIdFor("src/a.cs"), /^:refresh-[0-9a-f]{12}$/);
  assert.notEqual(refreshIdFor("src/a.cs"), refreshIdFor("src/b.cs"));
});

test("the generated schema names every core iri and its version", () => {
  const schema = renderSchema();
  for (const iri of Object.values(CORE).flat().filter((v) => typeof v === "string")) {
    assert.match(schema, new RegExp(`^${iri} a `, "m"), iri);
  }
  assert.match(schema, /^\s*kit:schemaVersion 1 ;$/m);
});

const config = { sourceGraph: { enabled: true, root: "g", evidence: {} } };
const cov = (id, selector, status, priority, reason) => block(`:coverage-${id}`, "kit:GraphCoverage", [
  ["kit:pathSelector", S(selector)], ["kit:priority", priority], ["kit:status", status],
  ...(reason ? [["kit:reason", S(reason)]] : []),
]);

test("loading reads nested shards, skips the schema and survives one broken file", async () => {
  await withScratchRepo(async (repo) => {
    repo.write("g/graph-schema.ttl", renderSchema());
    repo.write("g/manifest.ttl", ttl([cov("a", "src/**", "kit:covered", 10)]));
    repo.write("g/assertions/deep/x.ttl", ttl([cov("b", "docs/**", "kit:covered", 5)]));
    repo.write("g/broken.ttl", "not turtle at all\n");
    repo.commit("graph");
    const graph = loadGraph(treeFromRevision(repo.dir, "HEAD"), config);
    assert.deepEqual([...graph.resources.keys()].sort(), [":coverage-a", ":coverage-b"]);
    assert.equal(graph.problems.length, 1);
    assert.equal(graph.problems[0].file, "g/broken.ttl");
    assert.equal(graph.namespaces.get("g/manifest.ttl"), NS);
  });
});

test("duplicate iris across files are reported once with both files", async () => {
  await withScratchRepo(async (repo) => {
    repo.write("g/a.ttl", ttl([cov("a", "src/**", "kit:covered", 10)]));
    repo.write("g/b.ttl", ttl([cov("a", "docs/**", "kit:covered", 10)]));
    repo.commit("graph");
    const graph = loadGraph(treeFromRevision(repo.dir, "HEAD"), config);
    assert.deepEqual(graph.duplicates, [{ iri: ":coverage-a", files: ["g/a.ttl", "g/b.ttl"] }]);
  });
});

test("the highest priority wins, equal priority with different status conflicts, unmatched is unknown", async () => {
  await withScratchRepo(async (repo) => {
    repo.write("g/c.ttl", ttl([
      cov("broad", "src/**", "kit:covered", 10),
      cov("hole", "src/generated/**", "kit:excluded", 20, "generated"),
      cov("x", "docs/**", "kit:covered", 5),
      cov("y", "docs/**", "kit:unknown", 5, "not yet"),
    ]));
    repo.commit("graph");
    const graph = loadGraph(treeFromRevision(repo.dir, "HEAD"), config);
    assert.equal(resolveCoverage(graph, "src/a.cs").status, "kit:covered");
    assert.equal(resolveCoverage(graph, "src/generated/a.cs").status, "kit:excluded");
    assert.equal(resolveCoverage(graph, "docs/a.md").conflict, true);
    assert.deepEqual(resolveCoverage(graph, "README.md"), { status: "kit:unknown", coverage: null });
  });
});
```

The helper exports used here (`NS`, `ttl`, `block`, `S`) are added to
`source-graph-test-helpers.mjs` in this task:

```js
import { formatGraphTurtle } from "./source-graph-turtle.mjs";
export const NS = "https://ontology.example/widgets#";
export const S = (text) => ({ literal: text });                   // string value marker
export function block(subject, type, pairs) {                      // pairs: [predicate, value]
  return { subject, type, line: 0, pairs: pairs.map(([predicate, value]) =>
    typeof value === "number" ? { predicate, object: String(value), objectType: "integer" }
    : value?.literal !== undefined ? { predicate, object: value.literal, objectType: "string" }
    : { predicate, object: value, objectType: "iri" }) };
}
export const ttl = (blocks, namespace = NS) => formatGraphTurtle({ namespace, blocks });
```

The kit-only test goes in the new `tests/source-graph-templates.test.mjs`, because adopting
repositories have no `templates/` directory:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderSchema } from "../templates/scripts/source-graph-model.mjs";

const template = (rel) => readFileSync(fileURLToPath(new URL(`../templates/${rel}`, import.meta.url)), "utf8");

test("the shipped schema file equals the generated one", () => {
  assert.equal(template("source-graph/graph-schema.ttl"), renderSchema());
});
```

Test failure first with `node --test templates/scripts/source-graph-model.test.mjs
tests/source-graph-templates.test.mjs`, implement, rerun, run global checks, commit `feat: model the source graph and its coverage`, and push.

## Task 5 — structural and evidence checks

**Files:** new `templates/scripts/check-source-graph.mjs` (library part) and
`check-source-graph.test.mjs`; extend `source-graph-test-helpers.mjs` with the widgets fixture.

**Interfaces:**

```js
export class CheckSetupError extends Error {}   // exit 2
export function loadCheckConfig(tree)           // validateConfig over the tree's ontology.config.json; ontologyExists = tree.has
export function checkTree({ tree, config })     // -> Finding[]  (Task 6 adds checkRevision / checkPullRequest)
```

`loadCheckConfig` throws the setup error (exit 2) when the config is missing or invalid, when
`sourceGraph.enabled` is false (`graph-disabled` message: enable it in `ontology.config.json`), or
when the tree has no ontology Turtle at `ontologyPath` with `.md` replaced by `.ttl` (message tells
the author to run `node scripts/build-ontology.mjs`). `checkTree` parses that Turtle with
`parseTurtle` from `owl-ontology.mjs` and collects its subjects as the concept IRIs; an unreadable
Turtle file is also a setup error.

Rules, each a small function over `loadGraph`'s result so one failure never hides the rest:

1. Parser problems and duplicate IRIs become `turtle-syntax`, `turtle-noncanonical`, `duplicate-iri`.
2. Every graph file's namespace must equal `config.namespaceUri` (`namespace-mismatch`, naming the file).
3. `<root>/graph-schema.ttl` must exist (`schema-missing`) and contain a line matching
   `^\s*kit:schemaVersion (\d+) [;.]$`; exactly one `kit:SourceKnowledgeGraph` resource must exist
   (`graph-resource-count`) and its `kit:schemaVersion` must equal both the schema file and
   `CORE.schemaVersion` (`schema-version`).
4. Every resource is checked against the class table above (`missing-predicate`, `bad-value`);
   an assertion lacking `kit:basis` is `missing-basis` and lacking evidence is `missing-evidence`.
   Shape violations on coverage resources report as `coverage-malformed` and on refresh records as
   `refresh-malformed` (Task 6) instead of the generic rules.
5. References resolve: assertion subject and object to nodes, `kit:evidence` to evidence, manifest
   `kit:coverage`, `kit:refreshRecord`, `kit:declaresKind`, `kit:declaresRelationship` to resources
   of the right class (`dangling-reference`). Every coverage resource must be referenced by the
   graph resource (`coverage-unreferenced`); refresh records are checked in Task 6.
6. A node kind must be in `CORE.kinds` or a declared local kind; an assertion relationship likewise
   (`unknown-kind`, `unknown-relationship`). A local definition must use the `:` prefix and have
   a non-empty `rdfs:comment`; a missing definition is reported under the same rules.
7. Evidence: `kit:role` must be in `CORE.roles` (`bad-value`); `kit:path` must be non-empty,
   repository-relative and already normalized (`evidence-path-missing`, naming the evidence
   resource); the path must exist in the tree (`evidence-path-missing`); `resolveCoverage` must give
   `kit:covered` (`evidence-out-of-coverage`);
   the path must match a selector for the role in `config.sourceGraph.evidence` — a role with no
   entry matches nothing (`evidence-role-mismatch`); `kit:blobId` must equal the tree's blob for
   that path (`evidence-blob-mismatch`, message includes the expected ID); and
   `1 ≤ startLine ≤ endLine ≤ lineCount(blob)` (`evidence-range`). Validate the lower bound and
   ordering even when the path is absent, so an empty path with line zero reports both defects.
   Task 11 supplies these regressions and the repair; Task 5's commit is already pushed.
8. A node of kind `kit:concept` needs `kit:denotes` whose IRI is a subject in the ontology Turtle
   (`denotes-missing`).
9. Coverage: selector is a non-empty repository-relative string without `..`, priority is an
   integer, status is in `CORE.statuses`, a non-covered status has a reason (`coverage-malformed`);
   `resolveCoverage` over every tracked path must not report a conflict (`coverage-conflict`);
   every tracked path under the root must resolve as `kit:excluded`, and so must the probe path
   `<root>/probe` (`root-not-excluded`).

Extend the helper with the widgets fixture. `widgets(repo, language = "csharp")` writes source files,
computes blob IDs with `git hash-object`, builds a spec object, and `writeGraph(repo, spec)` renders it:

```js
export const LANGUAGES = {
  csharp:     { impl: "src/Invoice.cs",   test: "tests/InvoiceTests.cs",  dep: "Widgets.csproj",   code: (n) => `// line ${n}\n` },
  typescript: { impl: "src/invoice.ts",   test: "tests/invoice.test.ts",  dep: "package.json",     code: (n) => `// line ${n}\n` },
  java:       { impl: "src/Invoice.java", test: "tests/InvoiceTest.java", dep: "pom.xml",          code: (n) => `// line ${n}\n` },
  python:     { impl: "src/invoice.py",   test: "tests/test_invoice.py",  dep: "requirements.txt", code: (n) => `# line ${n}\n` },
};
export const ROOT = "docs/source-knowledge-graph";

export function widgets(repo, language = "csharp") {
  const l = LANGUAGES[language];
  const body = (count) => Array.from({ length: count }, (_, i) => l.code(i + 1)).join("");
  repo.write(l.impl, body(6));
  repo.write(l.test, body(4));
  repo.write(l.dep, body(2));
  repo.write("docs/design.md", "# Design\n\nInvoices post to the ledger.\n");
  repo.write("docs/ontology.md", "# Widgets — Application Ontology\n");
  repo.write("docs/ontology.ttl",
    `@prefix : <${NS}> .\n@prefix kit: <https://ontology-kit.dev/schema#> .\n` +
    `@prefix owl: <http://www.w3.org/2002/07/owl#> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n\n:Invoice a owl:Class .\n`);
  repo.write("infra/main.tf", 'resource "aws_s3_bucket" "b" {}\n\n');
  repo.write("docker-compose.yml", "services: {}\n");
  repo.write("README.md", "# Widgets\n");
  const config = {
    ontologyPath: "docs/ontology.md", namespaceUri: NS,
    sourceGraph: { enabled: true, root: ROOT, evidence: {
      implementation: ["src/**", l.dep], test: ["tests/**"], "selected-document": ["docs/design.md"],
      ontology: ["docs/ontology.ttl"], deployment: ["**/*.tf"] } },
  };
  repo.write("ontology.config.json", JSON.stringify(config, null, 2) + "\n");
  const covered = [l.impl, l.test, l.dep, "docs/design.md", "docs/ontology.ttl", "infra/main.tf"];
  const ev = (id, path, start, end, role) => block(`:evidence-${id}`, "kit:GraphEvidence", [
    ["kit:blobId", S(blobId(repo.dir, path))], ["kit:endLine", end], ["kit:path", S(path)],
    ["kit:role", role], ["kit:startLine", start]]);
  const as = (id, subject, relationship, object, basis, evidence) => block(`:assertion-${id}`, "kit:GraphAssertion", [
    ["kit:basis", basis], ["kit:evidence", `:evidence-${evidence}`], ["kit:object", object],
    ["kit:relationship", relationship], ["kit:subject", subject]]);
  const node = (id, kind, label, extra = []) => block(`:node-${id}`, "kit:GraphNode",
    [["kit:kind", kind], ["rdfs:label", S(label)], ...extra]);
  const spec = { language, paths: l, config, covered, version: 1, omitFromManifest: [], declaredKinds: [],
    coverage: [
      block(":coverage-graph-root", "kit:GraphCoverage", [["kit:pathSelector", S(`${ROOT}/**`)],
        ["kit:priority", 1000], ["kit:reason", S("graph files are not reviewed as covered source")], ["kit:status", "kit:excluded"]]),
      ...["src/**", "tests/**", l.dep, "docs/design.md", "docs/ontology.ttl", "infra/**"].map((selector, i) =>
        block(`:coverage-c${i}`, "kit:GraphCoverage", [["kit:pathSelector", S(selector)], ["kit:priority", 10], ["kit:status", "kit:covered"]])),
      block(":coverage-compose", "kit:GraphCoverage", [["kit:pathSelector", S("docker-compose.yml")],
        ["kit:priority", 10], ["kit:reason", S("not an accepted deployment source")], ["kit:status", "kit:unknown"]]),
    ],
    nodes: [
      node("invoice", "kit:concept", "Invoice", [["kit:denotes", ":Invoice"]]),
      node("impl", "kit:source-file", l.impl), node("test", "kit:test", l.test),
      node("money", "kit:dependency", "money"), node("design", "kit:document", "design"),
      node("ledger", "kit:component", "Ledger"), node("main-tf", "kit:deployment-resource", "bucket"),
    ],
    evidence: [
      ev("e1", l.impl, 1, 3, "kit:role-implementation"), ev("e2", l.test, 1, 2, "kit:role-test"),
      ev("e3", l.dep, 1, 1, "kit:role-implementation"), ev("e4", "docs/design.md", 1, 3, "kit:role-selected-document"),
      ev("e5", l.impl, 2, 2, "kit:role-implementation"), ev("e6", "infra/main.tf", 1, 1, "kit:role-deployment"),
    ],
    assertions: [
      as("a1", ":node-impl", "kit:implements", ":node-invoice", "kit:direct", "e1"),
      as("a2", ":node-invoice", "kit:tested-by", ":node-test", "kit:direct", "e2"),
      as("a3", ":node-impl", "kit:depends-on", ":node-money", "kit:direct", "e3"),
      as("a4", ":node-invoice", "kit:documented-by", ":node-design", "kit:direct", "e4"),
      as("a5", ":node-impl", "kit:communicates-with", ":node-ledger", "kit:inferred", "e5"),
      as("a6", ":node-ledger", "kit:deployed-by", ":node-main-tf", "kit:direct", "e6"),
    ],
    records: covered.map((path) => refreshRecord(repo, path)),
  };
  writeGraph(repo, spec);
  return spec;
}

export function refreshRecord(repo, path, outcome = "kit:no-fact-change") {
  return block(refreshIdFor(path), "kit:GraphRefreshRecord",
    [["kit:blobId", S(blobId(repo.dir, path))], ["kit:path", S(path)], ["kit:reviewOutcome", outcome]]);
}

export function writeGraph(repo, spec) {
  const iris = (blocks) => blocks.map((b) => b.subject).filter((s) => !spec.omitFromManifest.includes(s));
  const graph = block(":graph", "kit:SourceKnowledgeGraph", [
    ["kit:schemaVersion", spec.version],
    ...spec.declaredKinds.map((k) => ["kit:declaresKind", k]),
    ...iris(spec.coverage).map((s) => ["kit:coverage", s]),
    ...iris(spec.records).map((s) => ["kit:refreshRecord", s]),
  ]);
  repo.write(`${ROOT}/graph-schema.ttl`, renderSchema());
  repo.write(`${ROOT}/manifest.ttl`, ttl([graph, ...spec.coverage, ...spec.records]));
  repo.write(`${ROOT}/nodes.ttl`, ttl(spec.nodes));
  repo.write(`${ROOT}/assertions/widgets.ttl`, ttl([...spec.assertions, ...spec.evidence]));
}

export const find = (blocks, subject) => blocks.find((b) => b.subject === subject);
export const setPair = (b, predicate, value) => { b.pairs = b.pairs.filter((p) => p.predicate !== predicate)
  .concat(block("", "", [[predicate, value]]).pairs); };
export const dropPair = (b, predicate) => { b.pairs = b.pairs.filter((p) => p.predicate !== predicate); };
```

(`helpers` import `blobId`, `refreshIdFor`, `renderSchema` and the formatter; they live in the same
`templates/scripts/` directory.) The fixture is one complete graph; `spec.version`,
`omitFromManifest`, and direct edits to the arrays let tests break exactly one rule. The widgets
graph is the same in all four languages apart from the file names, which is what Task 10 relies on.

Complete tests — one mutation per rule, then the passing baselines:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTree, loadCheckConfig, CheckSetupError } from "./check-source-graph.mjs";
import { treeFromRevision } from "./source-graph-git.mjs";
import { withScratchRepo, widgets, writeGraph, find, setPair, dropPair, block, S, ttl, blobId, ROOT } from "./source-graph-test-helpers.mjs";

async function run(mutate, language = "csharp") {
  let findings;
  await withScratchRepo(async (repo) => {
    const spec = widgets(repo, language);
    await mutate?.(spec, repo);
    writeGraph(repo, spec);
    repo.commit("graph");
    const tree = treeFromRevision(repo.dir, "HEAD");
    findings = checkTree({ tree, config: loadCheckConfig(tree) });
  });
  return findings;
}

test("a complete widgets graph is clean in every language", async () => {
  for (const language of ["csharp", "typescript", "java", "python"]) {
    assert.deepEqual(await run(null, language), [], language);
  }
});

test("partial coverage is valid: unknown areas stay unknown and nothing else is required", async () => {
  const findings = await run((spec) => {
    spec.coverage = spec.coverage.filter((c) => ["coverage-graph-root", "coverage-c0"].includes(c.subject.slice(1)));
    spec.records = spec.records.filter((r) => r.pairs.some((p) => p.object.startsWith("src/")));
    spec.assertions = []; spec.evidence = []; spec.nodes = [];
  });
  assert.deepEqual(findings, []);
});

const mutations = [
  ["duplicate-iri", (s) => s.assertions.push(structuredClone(find(s.assertions, ":assertion-a1")))],
  ["dangling-reference", (s) => setPair(find(s.assertions, ":assertion-a1"), "kit:subject", ":node-missing")],
  ["dangling-reference", (s) => setPair(find(s.assertions, ":assertion-a1"), "kit:evidence", ":evidence-missing")],
  ["missing-evidence", (s) => dropPair(find(s.assertions, ":assertion-a1"), "kit:evidence")],
  ["missing-basis", (s) => dropPair(find(s.assertions, ":assertion-a1"), "kit:basis")],
  ["bad-value", (s) => setPair(find(s.assertions, ":assertion-a1"), "kit:basis", "kit:guess")],
  ["bad-value", (s) => setPair(find(s.evidence, ":evidence-e1"), "kit:startLine", S("one"))],
  ["evidence-path-missing", (s) => setPair(find(s.evidence, ":evidence-e1"), "kit:path", S("src/Gone.cs"))],
  ["evidence-blob-mismatch", (s) => setPair(find(s.evidence, ":evidence-e1"), "kit:blobId", S("0".repeat(40)))],
  ["evidence-range", (s) => setPair(find(s.evidence, ":evidence-e1"), "kit:endLine", 999)],
  ["evidence-range", (s) => { setPair(find(s.evidence, ":evidence-e1"), "kit:startLine", 5);
    setPair(find(s.evidence, ":evidence-e1"), "kit:endLine", 2); }],
  ["evidence-out-of-coverage", (s) => setPair(find(s.evidence, ":evidence-e1"), "kit:path", S("README.md"))],
  ["unknown-kind", (s) => setPair(find(s.nodes, ":node-impl"), "kit:kind", "kit:gadget")],
  ["unknown-kind", (s) => setPair(find(s.nodes, ":node-impl"), "kit:kind", ":kind-widget")],
  ["unknown-relationship", (s) => setPair(find(s.assertions, ":assertion-a1"), "kit:relationship", "kit:owns")],
  ["denotes-missing", (s) => setPair(find(s.nodes, ":node-invoice"), "kit:denotes", ":Missing")],
  ["missing-predicate", (s) => dropPair(find(s.nodes, ":node-invoice"), "kit:denotes")],
  ["coverage-malformed", (s) => dropPair(find(s.coverage, ":coverage-compose"), "kit:reason")],
  ["coverage-malformed", (s) => setPair(find(s.coverage, ":coverage-c0"), "kit:priority", S("high"))],
  ["coverage-conflict", (s) => s.coverage.push(block(":coverage-dup", "kit:GraphCoverage", [
    ["kit:pathSelector", S("src/**")], ["kit:priority", 10], ["kit:reason", S("later")], ["kit:status", "kit:unknown"]]))],
  ["root-not-excluded", (s) => { s.coverage = s.coverage.filter((c) => c.subject !== ":coverage-graph-root"); }],
  ["schema-version", (s) => { s.version = 2; }],
  ["coverage-unreferenced", (s) => { s.omitFromManifest = [":coverage-c0"]; }],
];

for (const [rule, mutate] of mutations) {
  test(`the checker reports ${rule}`, async () => {
    const findings = await run(mutate);
    const hit = findings.find((finding) => finding.rule === rule);
    assert.ok(hit, `expected ${rule}, got ${JSON.stringify(findings)}`);
    assert.ok(hit.file.length > 0 && hit.message.length > 0);
  });
}

test("a declared local kind with a definition is accepted", async () => {
  const findings = await run((s) => {
    setPair(find(s.nodes, ":node-impl"), "kit:kind", ":kind-widget");
    s.nodes.push(block(":kind-widget", "kit:GraphKindDefinition", [["rdfs:comment", S("A widget-specific thing.")]]));
    s.declaredKinds = [":kind-widget"];
  });
  assert.deepEqual(findings, []);
});

test("B14: only Terraform counts as deployment evidence in the pilot", async () => {
  const findings = await run((s, repo) => {
    setPair(find(s.coverage, ":coverage-compose"), "kit:status", "kit:covered");
    dropPair(find(s.coverage, ":coverage-compose"), "kit:reason");
    setPair(find(s.evidence, ":evidence-e6"), "kit:path", S("docker-compose.yml"));
    setPair(find(s.evidence, ":evidence-e6"), "kit:blobId", S(blobId(repo.dir, "docker-compose.yml")));
  });
  assert.ok(findings.some((f) => f.rule === "evidence-role-mismatch" && /docker-compose/.test(f.message)));
  assert.equal(findings.some((f) => f.rule === "evidence-out-of-coverage"), false);
});

test("syntax, noncanonical order, a wrong namespace and two graph resources are reported", async () => {
  const cases = [
    ["turtle-syntax", (s, r) => { s.after = () => r.write(`${ROOT}/nodes.ttl`, "@prefix : <x> .\n[ ] a :b .\n"); }],
    ["turtle-noncanonical", (s, r) => { s.after = () => r.write(`${ROOT}/nodes.ttl`,
      ttl(s.nodes).replace(":node-design", ":aaa").replace(":node-impl", ":node-design").replace(":aaa", ":node-impl")); }],
    ["namespace-mismatch", (s, r) => { s.after = () => r.write(`${ROOT}/nodes.ttl`, ttl(s.nodes, "https://other.example/x#")); }],
    ["graph-resource-count", (s, r) => { s.nodes.push(block(":graph-two", "kit:SourceKnowledgeGraph", [["kit:schemaVersion", 1]])); }],
  ];
  for (const [rule, mutate] of cases) {
    let findings;
    await withScratchRepo(async (repo) => {
      const spec = widgets(repo);
      mutate(spec, repo);
      writeGraph(repo, spec);
      spec.after?.();
      repo.commit("graph");
      const tree = treeFromRevision(repo.dir, "HEAD");
      findings = checkTree({ tree, config: loadCheckConfig(tree) });
    });
    assert.ok(findings.some((f) => f.rule === rule), `${rule}: ${JSON.stringify(findings)}`);
  }
});

test("a missing ontology Turtle, a disabled graph and a missing schema are setup errors or findings", async () => {
  await withScratchRepo(async (repo) => {
    widgets(repo);
    repo.remove("docs/ontology.ttl");
    repo.commit("no ttl");
    assert.throws(() => loadCheckConfig(treeFromRevision(repo.dir, "HEAD")), (e) => e instanceof CheckSetupError && /build-ontology/.test(e.message));
  });
  await withScratchRepo(async (repo) => {
    widgets(repo);
    repo.write("ontology.config.json", JSON.stringify({ ontologyPath: "docs/ontology.md" }));
    repo.commit("disabled");
    assert.throws(() => loadCheckConfig(treeFromRevision(repo.dir, "HEAD")), CheckSetupError);
  });
});
```

Test failure first with `node --test templates/scripts/check-source-graph.test.mjs`, implement,
rerun, run global checks, commit `feat: check graph structure and evidence`, and push.

## Task 6 — freshness, refresh records and the command

**Files:** extend `check-source-graph.mjs` and `check-source-graph.test.mjs`.

**Interfaces:**

```js
export function checkRevision(tree)                  // loadCheckConfig + checkTree + currency rule
export function checkPullRequest({ baseTree, headTree })  // checkRevision's rules + union rule + bypass guard
export function main(argv, { cwd, stdout, stderr })   // returns the exit code; the file's own entry point calls process.exit
```

CLI: `--rev <rev>` (default `HEAD`); `--base <rev> --head <rev>` (CI; `--head` defaults to
`HEAD`); `--staged [--base <rev>]` (`--base` defaults to `HEAD`); `--json`; `--help`. `--staged`
with `--rev`, or `--head` without `--base`, is a usage error (exit 2). Success prints
`source graph ok: <kind> <id>` then a second line `structurally valid; whether each claim is
true is for maintainers to review`, where kind is `revision` or `candidate tree`. The checked ID
is always printed, also on failure.

Refresh-record rules (all against the tree being checked, `head` in a PR):

- Records are the `kit:GraphRefreshRecord` resources. Exactly one of `kit:blobId` and `kit:deleted
  1` is present, the outcome is in `CORE.outcomes`, and the IRI equals `refreshIdFor(path)`;
  otherwise `refresh-malformed`. A record not referenced by the graph resource is
  `refresh-unreferenced`. Two records for one path is `duplicate-iri`-style `refresh-malformed`.
- Currency, for every tracked path that `resolveCoverage` reports `kit:covered` and that is not
  under the root: a record must exist and its `kit:blobId` must equal the tree's blob. A missing
  record is `refresh-missing`; a differing blob is `refresh-stale`. Both messages name the path
  and state the expected `kit:blobId`.
- A record with `kit:blobId` whose path is absent from the tree is `refresh-malformed`; a record
  with `kit:deleted 1` whose path exists is `refresh-malformed`. A record for a path that exists
  but is no longer covered is ignored.
- Union rule (PR mode only). Let `changed = changedPaths(baseTree, headTree)` minus paths under
  the root. For each changed path covered in the base graph's coverage or the head's, require: if
  it exists in head, a record with the current blob that differs from the base's record for that
  path (`refresh-stale` when the record equals the base's or is absent from head: `refresh-missing`);
  if it is absent in head, a `kit:deleted 1` record. Each path newly covered in head and not
  covered in base needs a current record even when unchanged. Base coverage comes from
  `loadGraph(baseTree, baseConfig)`; if the base has no graph, base coverage is empty.
- Coverage transition (PR mode only). For every base `kit:GraphCoverage` resource with
  `kit:status kit:covered`, take its literal `kit:pathSelector` string. The proposed graph must
  declare that same selector, regardless of coverage resource IRI, either as covered or as
  unknown/excluded with a non-empty reason. If no proposed declaration has that selector, emit
  `coverage-transition` on the manifest with the removed selector in the message. Treat a changed
  selector string as removal plus addition; a narrower covered selector requires a retained
  reasoned unknown/excluded declaration for the old selector, with a higher-priority covered
  declaration for the narrowed part if desired. Compare declarations without enumerating tracked
  paths, so a removal with no changed source files cannot escape. Existing `coverage-malformed`
  checks reject gap declarations with blank reasons. Do not attempt to prove glob equivalence;
  preserving the literal old selector is the stable reviewable transition. The union rule above
  still requires records for changed paths covered in either revision. This implements ADR 0006's
  explicit removed-scope rule. Task 11 supplies the regressions and repair; Task 6 is already pushed.
- Bypass guard (PR mode only). If the base config has `sourceGraph.enabled` and the head config
  does not, or the root differs, return a single `graph-disabled` finding naming
  `ontology.config.json` (`loadCheckConfig` would otherwise exit 2 for a disabled head, so the PR
  path reads the head config itself and reports the finding).
- Findings under the root are never reported for being changed; the root is excluded by rule 9.

Complete tests. `pr(base, head)` builds the base on `main`, branches, applies `head`, commits, and
calls `checkPullRequest` over `main` and `HEAD`. `refresh(repo, spec)` replaces every record and
every evidence blob with fresh IDs, which is what an agent does after reviewing:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPullRequest, checkRevision, main } from "./check-source-graph.mjs";
import { treeFromRevision } from "./source-graph-git.mjs";
import { refreshIdFor } from "./source-graph-model.mjs";
import { withScratchRepo, widgets, writeGraph, refreshRecord, blobId, find, setPair, block, S } from "./source-graph-test-helpers.mjs";

function refresh(repo, spec, outcome = "kit:no-fact-change") {
  spec.records = spec.covered.map((p) => refreshRecord(repo, p, outcome));
  for (const e of spec.evidence) {
    const path = e.pairs.find((p) => p.predicate === "kit:path").object;
    setPair(e, "kit:blobId", S(blobId(repo.dir, path)));
  }
}

async function pr(change) {
  let findings;
  await withScratchRepo(async (repo) => {
    const spec = widgets(repo);
    repo.commit("base");
    repo.git("checkout", "-q", "-b", "feature");
    await change(repo, spec);
    writeGraph(repo, spec);
    repo.commit("change");
    findings = checkPullRequest({ baseTree: treeFromRevision(repo.dir, "main"), headTree: treeFromRevision(repo.dir, "HEAD") });
  });
  return findings;
}

test("B9: a changed covered file with no graph review names the file", async () => {
  const findings = await pr((repo, spec) => repo.write(spec.paths.impl, "changed\n"));
  const hit = findings.find((f) => f.rule === "refresh-stale");
  assert.ok(hit && hit.message.includes("src/Invoice.cs"), JSON.stringify(findings));
});

test("B8: a refreshed record, even with no fact change, passes", async () => {
  assert.deepEqual(await pr((repo, spec) => { repo.write(spec.paths.impl, "changed\nagain\nthird\nfourth\n");
    refresh(repo, spec); }), []);
});

test("B9: a new file inside covered scope needs a record; an out-of-scope change does not", async () => {
  const added = await pr((repo) => repo.write("src/Extra.cs", "x\n"));
  assert.ok(added.some((f) => f.rule === "refresh-missing" && f.message.includes("src/Extra.cs")));
  assert.deepEqual(await pr((repo) => repo.write("README.md", "# changed\n")), []);
});

test("narrowing coverage in the same PR does not erase that PR's review obligation", async () => {
  const findings = await pr((repo, spec) => {
    repo.write(spec.paths.impl, "changed\n");
    const c = find(spec.coverage, ":coverage-c0");
    setPair(c, "kit:status", "kit:excluded");
    setPair(c, "kit:reason", S("narrowed"));
  });
  assert.ok(findings.some((f) => /^refresh-/.test(f.rule) && f.message.includes("src/Invoice.cs")), JSON.stringify(findings));
});

test("a deleted covered file needs a deletion record", async () => {
  const drop = (repo, spec) => {
    repo.remove("docs/design.md");
    spec.assertions = spec.assertions.filter((a) => a.subject !== ":assertion-a4");
    spec.evidence = spec.evidence.filter((e) => e.subject !== ":evidence-e4");
    spec.covered = spec.covered.filter((p) => p !== "docs/design.md");
    spec.records = spec.records.filter((r) => !r.pairs.some((p) => p.object === "docs/design.md"));
  };
  const missing = await pr(drop);
  assert.ok(missing.some((f) => f.rule === "refresh-missing" && f.message.includes("docs/design.md")));
  const recorded = await pr((repo, spec) => {
    drop(repo, spec);
    spec.records.push(block(refreshIdFor("docs/design.md"), "kit:GraphRefreshRecord",
      [["kit:deleted", 1], ["kit:path", S("docs/design.md")], ["kit:reviewOutcome", "kit:graph-updated"]]));
  });
  assert.deepEqual(recorded, []);
});

test("a stale blob, both or neither of blobId and deleted, and a wrong id are malformed or stale", async () => {
  const stale = await pr((repo, spec) => setPair(spec.records[0], "kit:blobId", S("0".repeat(40))));
  assert.ok(stale.some((f) => f.rule === "refresh-stale"));
  const both = await pr((repo, spec) => setPair(spec.records[0], "kit:deleted", 1));
  assert.ok(both.some((f) => f.rule === "refresh-malformed"));
});

test("a record for an existing file left out of the manifest is unreferenced", async () => {
  const findings = await pr((repo, spec) => { spec.omitFromManifest = [spec.records[0].subject]; });
  assert.ok(findings.some((f) => f.rule === "refresh-unreferenced"));
});

test("a file newly brought into coverage needs a current record even when unchanged", async () => {
  const findings = await pr((repo, spec) => spec.coverage.push(block(":coverage-readme", "kit:GraphCoverage",
    [["kit:pathSelector", S("README.md")], ["kit:priority", 10], ["kit:status", "kit:covered"]])));
  assert.ok(findings.some((f) => f.rule === "refresh-missing" && f.message.includes("README.md")));
});

test("a PR cannot disable or relocate the graph check it was merged under", async () => {
  const disabled = await pr((repo) => {
    const c = JSON.parse(repo.git("show", "HEAD:ontology.config.json"));
    c.sourceGraph.enabled = false;
    repo.write("ontology.config.json", JSON.stringify(c));
  });
  assert.deepEqual(disabled.map((f) => f.rule), ["graph-disabled"]);
  const moved = await pr((repo) => {
    const c = JSON.parse(repo.git("show", "HEAD:ontology.config.json"));
    c.sourceGraph.root = "elsewhere";
    repo.write("ontology.config.json", JSON.stringify(c));
  });
  assert.deepEqual(moved.map((f) => f.rule), ["graph-disabled"]);
});

test("a single revision gets the currency rule: a stale record on the default branch is reported", async () => {
  await withScratchRepo(async (repo) => {
    const spec = widgets(repo);
    repo.write(spec.paths.impl, "drifted\n");
    repo.commit("drift");
    assert.ok(checkRevision(treeFromRevision(repo.dir, "HEAD")).some((f) => f.rule === "refresh-stale"));
  });
});

function cli(repo, argv) {
  let out = ""; let err = "";
  const code = main(argv, { cwd: repo.dir, stdout: { write: (t) => { out += t; } }, stderr: { write: (t) => { err += t; } } });
  return { code, out, err };
}

test("the command exits 0 clean, 1 on findings, 2 when it cannot run", async () => {
  await withScratchRepo(async (repo) => {
    const spec = widgets(repo);
    repo.commit("graph");
    const clean = cli(repo, ["--rev", "HEAD"]);
    assert.equal(clean.code, 0);
    assert.match(clean.out, /source graph ok: revision [0-9a-f]{40}/);
    assert.match(clean.out, /for maintainers to review/);
    repo.write(spec.paths.impl, "staged change\n");
    repo.git("add", spec.paths.impl);
    const staged = cli(repo, ["--staged"]);
    assert.equal(staged.code, 1);
    assert.match(staged.out + staged.err, /candidate tree [0-9a-f]{40,64}/);
    assert.match(staged.err, /src\/Invoice\.cs/);
    assert.equal(cli(repo, ["--rev", "no-such-rev"]).code, 2);
    assert.equal(cli(repo, ["--staged", "--rev", "HEAD"]).code, 2);
    assert.equal(JSON.parse(cli(repo, ["--rev", "HEAD", "--json"]).out).ok, true);
  });
});

test("B11: the scripts never reach for a model, a secret or the network", async () => {
  const { readFileSync, existsSync } = await import("node:fs");
  for (const name of ["check-source-graph", "query-source-graph", "source-graph-git", "source-graph-model", "source-graph-turtle"]) {
    const url = new URL(`./${name}.mjs`, import.meta.url);
    if (!existsSync(url)) continue;
    const text = readFileSync(url, "utf8");
    assert.doesNotMatch(text, /node:(http|https|net|dns|tls)|\bfetch\s*\(|process\.env\.[A-Z_]*(KEY|TOKEN|SECRET)/i, name);
  }
});
```

The static test skips a script that does not exist yet; Task 7 creates `query-source-graph.mjs`
and the same test then covers it.

Test failure first with `node --test templates/scripts/check-source-graph.test.mjs`, implement,
rerun, run global checks, commit `feat: block unreviewed covered changes`, and push.

## Task 7 — graph reader

**Files:** new `templates/scripts/query-source-graph.mjs` and `query-source-graph.test.mjs`.

**Interfaces:**

```js
export function openGraph(cwd, rev)                      // -> { tree, config, graph }; reads config and graph from that tree
export function search(graph, terms)                     // case-insensitive over node iri and label; -> { matches: [{ node, assertions }] }
export function neighbors(graph, id)                     // -> { node, edges }  edges touching the node in either direction
export function findPaths(graph, from, to, { maxDepth = 4 } = {})  // -> { paths, maxDepth }; directed, simple paths, at most 20; maxDepth is capped at 6 and reported
export function coverageReport(graph, paths = [])        // -> { inventory, files }
export function annotate(result, { graphTree, workingTree })  // returns a copy with graphRevision, workingRevision, stale and each evidence status; walks `edges`, `matches[].assertions` and `paths[][]`
export function main(argv, { cwd, stdout, stderr })      // returns the exit code
```

An assertion view is `{ iri, relationship, basis, tentative, subject: { iri, label, kind,
denotes }, object: {…}, evidence: [{ iri, path, startLine, endLine, role, blobId, status }] }`.
`tentative` is true exactly when basis is `kit:inferred`. `status` is `current` when the working
revision's blob at that path equals the cited blob, `changed` when it differs, `missing` when the
path is absent there; `stale` is true when the graph commit differs from the working commit or any
evidence is not `current`. Ids are accepted with or without the leading `:`.

CLI: `search <term…>`, `node <id>`, `neighbors <id>`, `path <from> <to> [--max-depth n]`,
`coverage [path…]`, with `--rev <rev>` (default `HEAD`), `--working-rev <rev>` (default `HEAD`),
`--json`. Text output is one block per assertion: its iri, `basis: direct` or `basis: inferred
(tentative)`, subject, relationship, object, then each evidence as `path:start-end role blob status`;
paths print each edge separately under a `step n` heading and never a combined edge. Every output
starts with `graph revision <id>` and `working revision <id>`, and `STALE` is printed when stale.
`--json` prints the annotated result plus `coverage: { inventory, files }` for every command.
An empty result prints the applicable file coverage; when none can be associated it prints the
coverage inventory and `topic coverage cannot be determined`; it never says no relationship exists.

Complete tests (built on the widgets fixture, so each concept maps to the Task 5 assertions):

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { openGraph, search, neighbors, findPaths, coverageReport, annotate, main } from "./query-source-graph.mjs";
import { treeFromRevision } from "./source-graph-git.mjs";
import { withScratchRepo, widgets } from "./source-graph-test-helpers.mjs";

// The graph is parsed into memory before the scratch repository is removed, so tests that only
// query the graph can use it afterwards. Tests that run git or the command stay inside the callback.
async function open(language = "csharp") {
  let opened;
  await withScratchRepo(async (repo) => { widgets(repo, language); repo.commit("graph"); opened = openGraph(repo.dir, "HEAD"); });
  return opened;
}

test("B1: a concept finds its implementation, test, dependency and document with evidence and basis", async () => {
  const { graph } = await open();
  const match = search(graph, ["invoice"]).matches.find((m) => m.node.iri === ":node-invoice");
  assert.ok(match);
  const relationships = match.assertions.map((a) => a.relationship).sort();
  assert.deepEqual(relationships, ["kit:documented-by", "kit:implements", "kit:tested-by"]);
  for (const a of match.assertions) { assert.ok(a.evidence.length > 0 && a.evidence[0].path && a.basis); }
  const impl = neighbors(graph, "node-impl").edges.map((e) => e.relationship).sort();
  assert.ok(impl.includes("kit:depends-on"));
});

test("B2: an indirect relationship is shown as its recorded steps, never as a direct edge", async () => {
  const { graph } = await open();
  const { paths } = findPaths(graph, ":node-impl", ":node-design");
  assert.equal(paths.length, 1);
  assert.deepEqual(paths[0].map((e) => e.relationship), ["kit:implements", "kit:documented-by"]);
  assert.ok(paths[0].every((e) => e.evidence.length > 0));
  assert.equal(neighbors(graph, ":node-impl").edges.some((e) => e.object.iri === ":node-design"), false);
});

test("paths respect direction, the depth limit, the ceiling and cycles", async () => {
  const { graph } = await open();
  assert.equal(findPaths(graph, ":node-design", ":node-impl").paths.length, 0);
  assert.equal(findPaths(graph, ":node-impl", ":node-design", { maxDepth: 1 }).paths.length, 0);
  assert.equal(findPaths(graph, ":node-impl", ":node-design", { maxDepth: 99 }).maxDepth, 6);
});

test("B3: no match reports the absence, applicable coverage and the limit of that answer", async () => {
  await withScratchRepo(async (repo) => {
    widgets(repo);
    repo.commit("graph");
    assert.deepEqual(search(openGraph(repo.dir, "HEAD").graph, ["payroll"]).matches, []);
    let out = "";
    const code = main(["search", "payroll"], { cwd: repo.dir, stdout: { write: (t) => { out += t; } }, stderr: { write() {} } });
    assert.equal(code, 0);
    assert.match(out, /topic coverage cannot be determined/);
    assert.match(out, /kit:covered/);
    assert.doesNotMatch(out, /no relationship exists/i);
  });
});

test("B4 and B7: an inferred assertion is labelled tentative and keeps its observations", async () => {
  const { graph } = await open();
  const inferred = neighbors(graph, ":node-ledger").edges.find((e) => e.relationship === "kit:communicates-with");
  assert.equal(inferred.basis, "kit:inferred");
  assert.equal(inferred.tentative, true);
  assert.ok(inferred.evidence[0].path.startsWith("src/"));
  assert.equal(neighbors(graph, ":node-ledger").edges.find((e) => e.relationship === "kit:deployed-by").tentative, false);
});

test("B5: later source or a different commit marks the result stale and names changed evidence", async () => {
  await withScratchRepo(async (repo) => {
    const spec = widgets(repo);
    const pinned = repo.commit("graph");
    const { graph, tree } = openGraph(repo.dir, "HEAD");
    const result = neighbors(graph, ":node-impl");
    assert.equal(annotate(result, { graphTree: tree, workingTree: tree }).stale, false);
    repo.write(spec.paths.impl, "later edit\n");
    const later = repo.commit("later");
    const marked = annotate(neighbors(graph, ":node-impl"), { graphTree: tree, workingTree: treeFromRevision(repo.dir, later) });
    assert.equal(marked.stale, true);
    assert.equal(marked.graphRevision, pinned);
    assert.ok(marked.edges.flatMap((e) => e.evidence).some((e) => e.status === "changed"));
  });
});

test("B12: partial coverage is reported with its gaps and still usable", async () => {
  const { graph } = await open();
  const report = coverageReport(graph, ["src/Invoice.cs", "docker-compose.yml", "README.md"]);
  const status = Object.fromEntries(report.files.map((f) => [f.path, f.status]));
  assert.deepEqual(status, { "src/Invoice.cs": "kit:covered", "docker-compose.yml": "kit:unknown", "README.md": "kit:unknown" });
  assert.ok(report.files.find((f) => f.path === "docker-compose.yml").reason);
});

test("B15: a consumer reads a pinned commit as JSON with assertions and coverage", async () => {
  await withScratchRepo(async (repo) => {
    widgets(repo);
    const sha = repo.commit("graph");
    repo.write("README.md", "# moved on\n");
    repo.commit("later");
    let out = "";
    const code = main(["search", "invoice", "--rev", sha, "--json"], { cwd: repo.dir, stdout: { write: (t) => { out += t; } }, stderr: { write() {} } });
    const json = JSON.parse(out);
    assert.equal(code, 0);
    assert.equal(json.graphRevision, sha);
    assert.ok(json.matches[0].assertions.length > 0);
    assert.ok(json.coverage.inventory.length > 0);
  });
});

test("B13: the same questions give the same answers whatever the source language", async () => {
  const shape = async (language) => {
    const { graph } = await open(language);
    const normalise = (e) => ({ relationship: e.relationship, basis: e.basis, subject: e.subject.iri, object: e.object.iri,
      evidence: e.evidence.map((v) => v.role) });
    return JSON.stringify(neighbors(graph, ":node-impl").edges.map(normalise).sort((a, b) => a.relationship.localeCompare(b.relationship)));
  };
  const baseline = await shape("csharp");
  for (const language of ["typescript", "java", "python"]) assert.equal(await shape(language), baseline, language);
});
```

Test failure first with `node --test templates/scripts/query-source-graph.test.mjs`, implement,
rerun, run global checks, commit `feat: read the source graph with evidence and gaps`, and push.

## Task 8 — protocol, starter graph and runbook

**Files:** new `templates/protocol/source-graph-protocol.md`, `templates/source-graph/manifest.ttl`,
`templates/source-graph/nodes.ttl`, `templates/docs/source-knowledge-graph.md`; extend
`tests/templates.test.mjs` (add `GRAPH_ROOT` to `KNOWN_PLACEHOLDERS`).

**Interfaces and content.** The protocol is a body that the installer wraps in
`<!-- source-graph-protocol:start -->` / `<!-- source-graph-protocol:end -->`. It starts with a
`## Source graph protocol` heading and contains, in this order:

1. *Before a task:* read the ontology, then run `node scripts/query-source-graph.mjs search <term>`
   (and `neighbors`/`path` as needed); the graph lives under `{{GRAPH_ROOT}}`.
2. *Citing:* every relationship you state names the assertion, whether it is direct or inferred,
   and the source path, lines and revision from the reader's output. A graph-only citation is not
   grounded. Call an inferred relationship tentative and say it is an inference.
3. *Gaps and staleness:* when the reader finds nothing, say so and report the coverage it printed;
   never say a relationship does not exist. When the reader prints `STALE`, check the current
   source before presenting the relationship as current, or say it is unverified.
4. *Conflicts:* when a graph assertion or selected document names something differently from the
   ontology, name the conflict and use the ontology term; do not rewrite the evidence.
5. *Before a pull request:* for each changed file inside declared coverage, update the affected
   assertions and evidence or record that review found no fact change, then replace that file's
   refresh record (`git rev-parse :<path>` gives its blob ID); update evidence blob IDs and line
   ranges for any file you changed; never publish a relationship you cannot support with source
   observations. New files in covered scope and deletions need records too.
6. *Checking:* run `node scripts/check-source-graph.mjs --staged --base <the merge base with the
   default branch>` after staging and before committing. A pass means the graph is structurally
   valid and covered changes have review records; it does not mean the claims are true.
7. *Do not:* edit `{{GRAPH_ROOT}}/graph-schema.ttl`, or generate the graph in CI.

It is language-neutral and names no extractor or parser. It uses lowercase prose and code spans
that are not PascalCase, so the adopter's term checker accepts it.

`templates/source-graph/manifest.ttl` (adopter-owned) is a canonical document in `{{NAMESPACE_URI}}`
with the graph resource `:graph` (`kit:schemaVersion 1`, `kit:coverage :coverage-graph-root`) and
`:coverage-graph-root` excluding `{{GRAPH_ROOT}}/**` at priority 1000 with a reason.
`templates/source-graph/nodes.ttl` is the three prefix lines only. The runbook covers: installing
and `--force` upgrades; enabling and the `sourceGraph` section with the evidence selectors; a
Terraform-only deployment example (`"deployment": ["**/*.tf"]`); partial coverage and gaps with
reasons; the author loop (reader, edit, records, staged check); the required check name and how to
require it; what a pass does and does not prove; the Turtle subset and its limits; and migrating an
older Markdown-only ontology with `build-ontology.mjs`.

Complete tests (append to `tests/templates.test.mjs`, plus a new
`tests/source-graph-templates.test.mjs`):

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { substitute } from "../bin/install-ontology.mjs";
import { checkRevision } from "../templates/scripts/check-source-graph.mjs";
import { treeFromRevision } from "../templates/scripts/source-graph-git.mjs";
import { renderSchema } from "../templates/scripts/source-graph-model.mjs";
import { withTempRepo } from "./helpers/temp-repo.mjs";

const template = (rel) => readFileSync(fileURLToPath(new URL(`../templates/${rel}`, import.meta.url)), "utf8");
const NS = "https://ontology.example/widgets#";

test("the starter graph passes the checker with no coverage but the graph root", async () => {
  await withTempRepo(async (repo) => {
    const values = { GRAPH_ROOT: "docs/source-knowledge-graph", NAMESPACE_URI: NS };
    repo.write("docs/source-knowledge-graph/manifest.ttl", substitute(template("source-graph/manifest.ttl"), values));
    repo.write("docs/source-knowledge-graph/nodes.ttl", substitute(template("source-graph/nodes.ttl"), values));
    repo.write("docs/source-knowledge-graph/graph-schema.ttl", renderSchema());
    repo.write("docs/ontology.md", "# Widgets — Application Ontology\n");
    repo.write("docs/ontology.ttl", `@prefix : <${NS}> .\n`);
    repo.write("ontology.config.json", JSON.stringify({ ontologyPath: "docs/ontology.md", namespaceUri: NS, sourceGraph: { enabled: true } }));
    repo.git("add", "-A"); repo.git("commit", "-q", "-m", "starter");
    assert.deepEqual(checkRevision(treeFromRevision(repo.dir, "HEAD")), []);
  });
});

test("the protocol carries each instruction the behaviours require", () => {
  const text = template("protocol/source-graph-protocol.md");
  for (const pattern of [/query-source-graph\.mjs search/, /assertion/, /inferred/, /tentative/, /coverage/, /STALE/,
    /ontology term/, /refresh record/, /git rev-parse :/, /check-source-graph\.mjs --staged --base/, /does not mean the claims are true/,
    /\{\{GRAPH_ROOT\}\}/]) assert.match(text, pattern);
  assert.doesNotMatch(text, /graphify|tree-sitter|roslyn|javaparser/i);
});

test("no installed graph markdown contains a backticked PascalCase term", () => {
  for (const rel of ["protocol/source-graph-protocol.md", "docs/source-knowledge-graph.md"]) {
    const prose = template(rel).replace(/^```[\s\S]*?^```/gm, "");
    assert.doesNotMatch(prose, /`[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*`/, rel);
  }
});
```

Test failure first, write the files, rerun, run global checks, commit
`feat: add the graph agent protocol and runbook`, and push.

## Task 9 — workflow and opt-in installation

**Files:** new `templates/github/workflows/source-graph-check.yml`; modify
`bin/install-ontology.mjs`, `tests/install-ontology.test.mjs`, `tests/templates.test.mjs`; new
`templates/source-graph/config-section.json`.

**Interfaces:**

- `buildPlan({ withSourceGraph, sourceGraphRoot })` adds, all `substitute: false` and kit-owned
  unless noted: `scripts/source-graph-turtle.mjs`, `source-graph-git.mjs`, `source-graph-model.mjs`,
  `check-source-graph.mjs`, `query-source-graph.mjs`, each with its `.test.mjs`,
  `scripts/source-graph-test-helpers.mjs`, `.github/workflows/source-graph-check.yml`
  (`substitute: true`), `docs/source-knowledge-graph.md` (`substitute: true`), `<root>/graph-schema.ttl`
  from `source-graph/graph-schema.ttl`; and adopter-owned `<root>/manifest.ttl` and `<root>/nodes.ttl`
  (`substitute: true`). Default root `docs/source-knowledge-graph`. `scripts/owl-ontology.mjs`
  is already in the core plan and is required by the checker.
- `--source-graph-root <path>` is validated with `normaliseRepoRelativePath` before anything is
  written, implies `--with-source-graph`, and is added to `VALUE_OPTIONS`, the usage text and the
  `--target is required` message. `--with-source-graph` is added to `FLAG_OPTIONS`.
- New placeholders `GRAPH_ROOT` and `ONTOLOGY_TTL_PATH` (existing) are supplied in `values`.
- The protocol block is spliced by a new `spliceBlock(existing, body, startMarker, endMarker)`
  that `spliceProtocol` delegates to unchanged; the graph block uses
  `<!-- source-graph-protocol:start -->`/`end` and is appended after the ontology block. Without
  the flag the instruction file is byte-identical to today's output.
- `templates/source-graph/config-section.json` is the `sourceGraph` object text (two-space indent,
  compact arrays like the config template) with `{{GRAPH_ROOT}}`, `{{ONTOLOGY_PATH}}` and
  `{{ONTOLOGY_TTL_PATH}}`; defaults: `implementation: ["**"]`, `test: ["**"]`,
  `selected-document: ["docs/**"]`, `ontology: [ontologyPath, ontologyTtlPath]`, `deployment: []`.
  When `ontology.config.json` is written fresh, `insertConfigSection(configText, sectionText)`
  replaces the final `\n}` with `,\n  "sourceGraph": …\n}`. A normal install or `--force`
  preserves an existing config and `install()` returns `configNotice` holding the section text and
  a sentence naming the file. With explicit `--reset-content`, replace an existing config with the
  starter config including the `sourceGraph` section, discard its previous settings, and return no
  config notice. When an existing config is preserved, resolve its `namespaceUri` through
  `validateConfig` before writing new starter manifest and nodes, and substitute that URI in those
  new files (including the validator's default when the field is absent).
  The graph `configNotice` still describes only the opt-in section. If the preserved config is
  invalid, fail before writing rather than install graph files with a guessed namespace. With
  explicit reset, use the generated namespace in both replacement config and graph starters.
  Do not rewrite pre-existing adopter graph files during normal or
  `--force` installation. Task 11 supplies this regression and repair; Task 9 is already pushed.
- The workflow, with `{{DEFAULT_BRANCH}}` substituted:

```yaml
name: Source graph check

on:
  pull_request:
  push:
    branches: ["{{DEFAULT_BRANCH}}"]

permissions:
  contents: read

jobs:
  source-graph:
    name: source-graph
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Check the proposed graph against the pull request base
        if: github.event_name == 'pull_request'
        env:
          BASE_SHA: ${{ github.event.pull_request.base.sha }}
        run: node scripts/check-source-graph.mjs --base "$BASE_SHA" --head HEAD
      - name: Check the merged graph
        if: github.event_name == 'push'
        run: node scripts/check-source-graph.mjs --rev HEAD
```

The CLI prints the install notice: after the existing "Next" lines, when `configNotice` is set,
print it; when the flag was given, add "Commit docs/ontology.ttl first (`node scripts/build-ontology.mjs`);
the graph check requires it."

Complete tests (append to `tests/install-ontology.test.mjs`):

```js
test("--with-source-graph adds scripts, tests, helper, workflow, schema, runbook and starter graph", () => {
  const entries = buildPlan({ withSourceGraph: true });
  const dests = entries.map((e) => e.dest);
  for (const path of [
    "scripts/source-graph-turtle.mjs", "scripts/source-graph-git.mjs", "scripts/source-graph-model.mjs",
    "scripts/check-source-graph.mjs", "scripts/query-source-graph.mjs", "scripts/source-graph-test-helpers.mjs",
    "scripts/check-source-graph.test.mjs", "scripts/query-source-graph.test.mjs",
    ".github/workflows/source-graph-check.yml", "docs/source-knowledge-graph.md",
    "docs/source-knowledge-graph/graph-schema.ttl", "docs/source-knowledge-graph/manifest.ttl",
    "docs/source-knowledge-graph/nodes.ttl",
  ]) assert.ok(dests.includes(path), `missing ${path}`);
  const owner = (dest) => entries.find((e) => e.dest === dest).ownedBy;
  assert.equal(owner("docs/source-knowledge-graph/manifest.ttl"), "adopter");
  assert.equal(owner("docs/source-knowledge-graph/nodes.ttl"), "adopter");
  assert.equal(owner("docs/source-knowledge-graph/graph-schema.ttl"), "kit");
  assert.equal(owner("scripts/check-source-graph.mjs"), "kit");
});

test("a core install writes nothing about the source graph", () => {
  assert.equal(buildPlan({}).some((e) => /source-graph|source-knowledge-graph/.test(e.dest)), false);
});

test("--source-graph-root moves the graph files and rejects an unsafe root", async () => {
  const dests = buildPlan({ withSourceGraph: true, sourceGraphRoot: "graph" }).map((e) => e.dest);
  assert.ok(dests.includes("graph/manifest.ttl"));
  await withTempRepo(async (repo) => {
    assert.throws(() => install({ target: repo.dir, sourceGraphRoot: "../out", withSourceGraph: true }), /--source-graph-root/);
  });
});

test("installed graph scripts are byte-identical to the templates and the fresh config validates", async () => {
  await withTempRepo(async (repo) => {
    const result = install({ target: repo.dir, projectName: "Widgets", withSourceGraph: true });
    for (const name of ["check-source-graph", "query-source-graph", "source-graph-model", "source-graph-git", "source-graph-turtle"]) {
      const rel = `scripts/${name}.mjs`;
      assert.equal(readFileSync(join(repo.dir, rel), "utf8"),
        readFileSync(fileURLToPath(new URL(`../templates/${rel}`, import.meta.url)), "utf8"));
    }
    const config = loadConfig({ cwd: repo.dir });
    assert.equal(config.sourceGraph.enabled, true);
    assert.equal(result.configNotice, null);
  });
});

test("a fresh config contains the sourceGraph section; an existing one is left alone with a notice", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withSourceGraph: true });
    const raw = JSON.parse(readFileSync(join(repo.dir, "ontology.config.json"), "utf8"));
    assert.equal(raw.sourceGraph.enabled, true);
    assert.equal(raw.sourceGraph.root, "docs/source-knowledge-graph");
    assert.deepEqual(raw.sourceGraph.evidence.ontology, ["docs/ontology.md", "docs/ontology.ttl"]);
  });
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets" });
    const before = readFileSync(join(repo.dir, "ontology.config.json"), "utf8");
    const result = install({ target: repo.dir, projectName: "Widgets", withSourceGraph: true });
    assert.equal(readFileSync(join(repo.dir, "ontology.config.json"), "utf8"), before);
    assert.match(result.configNotice, /sourceGraph/);
    assert.match(result.configNotice, /ontology\.config\.json/);
  });
});

test("the graph protocol block is spliced once, idempotently, after the ontology block", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withSourceGraph: true });
    const once = readFileSync(join(repo.dir, "AGENTS.md"), "utf8");
    install({ target: repo.dir, projectName: "Widgets", withSourceGraph: true, force: true });
    const twice = readFileSync(join(repo.dir, "AGENTS.md"), "utf8");
    assert.equal(twice, once);
    assert.equal(once.split("<!-- source-graph-protocol:start -->").length, 2);
    assert.ok(once.indexOf("<!-- ontology-protocol:end -->") < once.indexOf("<!-- source-graph-protocol:start -->"));
    assert.match(once, /docs\/source-knowledge-graph/);
  });
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets" });
    assert.doesNotMatch(readFileSync(join(repo.dir, "AGENTS.md"), "utf8"), /source-graph-protocol/);
  });
});

test("--force keeps adopter graph data and --reset-content restores the starter", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withSourceGraph: true });
    const nodes = join(repo.dir, "docs/source-knowledge-graph/nodes.ttl");
    writeFileSync(nodes, "adopter data\n");
    install({ target: repo.dir, projectName: "Widgets", withSourceGraph: true, force: true });
    assert.equal(readFileSync(nodes, "utf8"), "adopter data\n");
    install({ target: repo.dir, projectName: "Widgets", withSourceGraph: true, resetContent: true });
    assert.notEqual(readFileSync(nodes, "utf8"), "adopter data\n");
  });
});

test("--reset-content replaces an existing config with the graph-enabled starter", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets" });
    const configPath = join(repo.dir, "ontology.config.json");
    const existing = JSON.parse(readFileSync(configPath, "utf8"));
    existing.ignorePaths = ["custom/**"];
    writeFileSync(configPath, JSON.stringify(existing));
    const result = install({ target: repo.dir, projectName: "Widgets", withSourceGraph: true, resetContent: true });
    const reset = JSON.parse(readFileSync(configPath, "utf8"));
    assert.deepEqual(reset.ignorePaths, []);
    assert.equal(reset.sourceGraph.enabled, true);
    assert.equal(reset.sourceGraph.root, "docs/source-knowledge-graph");
    assert.equal(result.configNotice, null);
  });
});

test("the workflow is read-only, secretless, full-history and passes the base through env", () => {
  const text = readFileSync(fileURLToPath(new URL("../templates/github/workflows/source-graph-check.yml", import.meta.url)), "utf8");
  assert.match(text, /permissions:\s+contents: read/);
  assert.match(text, /fetch-depth: 0/);
  assert.match(text, /BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(text, /--base "\$BASE_SHA" --head HEAD/);
  assert.match(text, /--rev HEAD/);
  assert.doesNotMatch(text, /secrets\.|write|pull_request_target|run:.*\$\{\{/);
});
```

The test file needs `loadConfig` from `../templates/scripts/ontology-config.mjs`, `writeFileSync`
from `node:fs` and `fileURLToPath` from `node:url` added to its imports. Add a test that
`parseCliArgs(["--target", "x", "--with-source-graph"])` sets `withSourceGraph` and that
`parseCliArgs(["--target", "x", "--source-graph-root", "g"])` sets `withSourceGraph` too. Test failure first with `node --test tests/install-ontology.test.mjs
tests/templates.test.mjs`, implement, rerun, run `npm test`, run global checks, commit
`feat: install the source graph opt-in`, and push.

## Task 10 — cross-language acceptance, documentation and ontology

**Files:** new `tests/source-graph-acceptance.test.mjs`; modify
`templates/scripts/check-source-graph.mjs`, `templates/scripts/query-source-graph.mjs`, `README.md`,
`docs/ai-agent-install.md`, `docs/ontology.md`; the widgets fixture is reused unchanged.

**Interfaces:** no new interface; the widgets fixture already holds Terraform and an uncovered
Docker Compose file, and its `deployment` selector is `**/*.tf`. Nothing new is installed.

Both command entry-point guards must recognise invocation through a symlinked script path. Resolve
`process.argv[1]` using `realpathSync` and compare it to the filesystem path of `import.meta.url`
using `fileURLToPath`; handle a missing or unresolvable argument as a non-entry-point import. This
only resolves the command script's own path; graph data and configuration still come from Git
objects. The already pushed Task 6 and 7 commits remain intact: include both script repairs in the
single Task 10 commit, after their regression tests fail.

The supplied bare-Git and shipped-test cases below are amended to ensure they really execute:
clear `NODE_TEST_CONTEXT` for spawned Node processes, enumerate the installed `.test.mjs` files
instead of passing a directory to `node --test`, and assert output from both bare-Git commands and
from an installed test. Add the explicit symlink test below. Preserve all existing assertions.

Complete tests:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { install } from "../bin/install-ontology.mjs";
import { withTempRepo } from "./helpers/temp-repo.mjs";
import { widgets, writeGraph, refreshRecord, blobId, setPair, find, S, LANGUAGES } from "../templates/scripts/source-graph-test-helpers.mjs";

const run = (dir, args) => {
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  try { return { code: 0, out: execFileSync("node", args, { cwd: dir, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }), err: "" }; }
  catch (e) { return { code: e.status, out: e.stdout?.toString() ?? "", err: e.stderr?.toString() ?? "" }; }
};

async function installedWidgets(repo, language = "csharp") {
  repo.git("symbolic-ref", "HEAD", "refs/heads/main");
  install({ target: repo.dir, projectName: "Widgets", withSourceGraph: true });
  const spec = widgets(repo, language);   // overwrites the starter graph, ontology and config with the fixture
  repo.git("add", "-A");
  repo.git("commit", "-q", "-m", "baseline");
  return spec;
}

test("the installed commands pass on a clean widgets repository in every language", async () => {
  for (const language of Object.keys(LANGUAGES)) {
    await withTempRepo(async (repo) => {
      await installedWidgets(repo, language);
      assert.equal(run(repo.dir, ["scripts/check-source-graph.mjs", "--rev", "HEAD"]).code, 0, language);
      assert.equal(run(repo.dir, ["scripts/query-source-graph.mjs", "search", "invoice"]).code, 0, language);
    });
  }
});

test("B13: checker and reader output is identical across languages once paths are normalised", async () => {
  const outputs = [];
  for (const language of Object.keys(LANGUAGES)) {
    await withTempRepo(async (repo) => {
      await installedWidgets(repo, language);
      const check = run(repo.dir, ["scripts/check-source-graph.mjs", "--rev", "HEAD", "--json"]);
      const query = run(repo.dir, ["scripts/query-source-graph.mjs", "neighbors", "node-impl", "--json"]);
      const strip = (text) => text.replaceAll(/[0-9a-f]{40,64}/g, "<sha>")
        .replaceAll(LANGUAGES[language].impl, "<impl>").replaceAll(LANGUAGES[language].test, "<test>")
        .replaceAll(LANGUAGES[language].dep, "<dep>");
      outputs.push([strip(check.out), strip(query.out)]);
    });
  }
  for (const pair of outputs.slice(1)) assert.deepEqual(pair, outputs[0]);
});

test("the full loop: a covered change is blocked, refreshed, then accepted, and the reader pins the old commit", async () => {
  await withTempRepo(async (repo) => {
    const spec = await installedWidgets(repo, "csharp");
    const pinned = repo.git("rev-parse", "HEAD").trim();
    repo.git("checkout", "-q", "-b", "change");
    writeFileSync(join(repo.dir, spec.paths.impl), "edited\nby\nan\nagent\nsession\nhere\n");
    repo.git("add", "-A"); repo.git("commit", "-q", "-m", "edit");
    const blocked = run(repo.dir, ["scripts/check-source-graph.mjs", "--base", "main", "--head", "HEAD"]);
    assert.equal(blocked.code, 1);
    assert.match(blocked.err, /src\/Invoice\.cs/);

    spec.records = spec.covered.map((p) => refreshRecord(repo, p));
    for (const e of spec.evidence) setPair(e, "kit:blobId", S(blobId(repo.dir, e.pairs.find((p) => p.predicate === "kit:path").object)));
    writeGraph(repo, spec);
    repo.git("add", "-A"); repo.git("commit", "-q", "-m", "refresh graph");
    assert.equal(run(repo.dir, ["scripts/check-source-graph.mjs", "--base", "main", "--head", "HEAD"]).code, 0);

    const old = run(repo.dir, ["scripts/query-source-graph.mjs", "neighbors", "node-impl", "--rev", pinned, "--working-rev", "HEAD"]);
    assert.match(old.out, new RegExp(`graph revision ${pinned}`));
    assert.match(old.out, /STALE/);
  });
});

test("the checker and reader work from git objects alone, with the working tree removed", async () => {
  await withTempRepo(async (repo) => {
    await installedWidgets(repo, "csharp");
    const clone = mkdtempSync(join(tmpdir(), "sg-bare-"));
    try {
      execFileSync("git", ["clone", "-q", "--bare", repo.dir, join(clone, "r.git")]);
      cpSync(join(repo.dir, "scripts"), join(clone, "scripts"), { recursive: true });
      const check = run(join(clone, "r.git"), [join(clone, "scripts/check-source-graph.mjs"), "--rev", "HEAD"]);
      assert.equal(check.code, 0, check.err);
      assert.match(check.out, /source graph ok: revision/);
      const query = run(join(clone, "r.git"), [join(clone, "scripts/query-source-graph.mjs"), "search", "invoice"]);
      assert.equal(query.code, 0, query.err);
      assert.match(query.out, /node-invoice/);
    } finally { rmSync(clone, { recursive: true, force: true }); }
  });
});

test("B14: Docker Compose cannot be deployment evidence in the pilot, Terraform can", async () => {
  await withTempRepo(async (repo) => {
    const spec = await installedWidgets(repo, "csharp");
    writeFileSync(join(repo.dir, "docker-compose.yml"), "services:\n  app: {}\n");
    setPair(find(spec.coverage, ":coverage-compose"), "kit:status", "kit:covered");
    spec.records.push(refreshRecord(repo, "docker-compose.yml"));
    setPair(find(spec.evidence, ":evidence-e6"), "kit:path", S("docker-compose.yml"));
    setPair(find(spec.evidence, ":evidence-e6"), "kit:blobId", S(blobId(repo.dir, "docker-compose.yml")));
    writeGraph(repo, spec);
    repo.git("add", "-A"); repo.git("commit", "-q", "-m", "compose as deployment");
    const result = run(repo.dir, ["scripts/check-source-graph.mjs", "--rev", "HEAD"]);
    assert.equal(result.code, 1);
    assert.match(result.err, /evidence-role-mismatch/);
  });
});

test("the installed Markdown passes the adopter's own term check", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withSourceGraph: true });
    repo.git("add", "-A"); repo.git("commit", "-q", "-m", "install");
    const result = run(repo.dir, ["scripts/check-ontology-terms.mjs"]);
    assert.equal(result.code, 0, result.err);
  });
});

test("the shipped graph tests pass inside the target repository", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withSourceGraph: true });
    const tests = readdirSync(join(repo.dir, "scripts")).filter((name) => name.endsWith(".test.mjs"));
    assert.ok(tests.length > 0);
    const result = run(repo.dir, ["--test", ...tests.map((name) => `scripts/${name}`)]);
    assert.equal(result.code, 0, result.out + result.err);
    assert.match(result.out, /a canonical document parses/);
  });
});

test("both commands execute when their script path contains a symlink", async () => {
  await withTempRepo(async (repo) => {
    await installedWidgets(repo, "csharp");
    symlinkSync(join(repo.dir, "scripts"), join(repo.dir, "linked-scripts"), "dir");
    const check = run(repo.dir, ["linked-scripts/check-source-graph.mjs", "--rev", "HEAD"]);
    assert.equal(check.code, 0, check.err);
    assert.match(check.out, /source graph ok: revision/);
    const query = run(repo.dir, ["linked-scripts/query-source-graph.mjs", "search", "invoice"]);
    assert.equal(query.code, 0, query.err);
    assert.match(query.out, /node-invoice/);
  });
});
```

`widgets`, `writeGraph` and `refreshRecord` use only `repo.dir` and `repo.write`, which the
`withTempRepo` repository already provides, so the acceptance tests pass it straight through and
commit with `repo.git`. The pilot test does not need a separate `pilot` builder: Docker Compose is
already an uncovered file in the fixture, and the test promotes it to covered deployment evidence.

Documentation changes in the same commit:

- `README.md`: add `--with-source-graph` and `--source-graph-root` to the option table with a link
  to the runbook; add a short section after the semantic-review one: what the graph is, what is
  installed, that it is opt-in and blocking only once required in branch protection, that a
  migration needs `build-ontology.mjs` first, and what a pass does not prove.
- `docs/ai-agent-install.md`: one paragraph: add `--with-source-graph` only when the user asks for
  it; commit `docs/ontology.ttl` first; the config notice is for the user to apply.
- `docs/ontology.md`: add any term the build introduced that the architecture phase did not. The
  expected additions are none; if a new backticked PascalCase term appeared in a shipped
  Markdown file, rename it instead. Add one invariant for the currency rule — *`GraphRefreshRecord`
  — every covered existing file has a record whose blob equals its current blob at the checked
  revision* — and one for the bypass guard — *`OntologyConfig` — a pull request cannot disable or
  relocate an enabled source graph check* — inside the existing Business Rules section, with the
  ontology Turtle regenerated if the repository keeps one.

Verification. Run `node --test tests/source-graph-acceptance.test.mjs` (fail first), then
`npm test`. In a disposable GitHub repository, install with the flag, open a pull request that
changes a covered file without a record, and confirm the `source-graph` check fails and names the
file, then refresh and confirm it passes; confirm the job name can be required in branch
protection. If GitHub access is unavailable, say the branch-protection integration is unverified
for the user's acceptance rather than claiming it passed. Commit
`feat: accept the source graph across languages` and push. In the commit body, explain that the
bare-Git test had checked only the checker's exit code and that the nested shipped-test invocation
could silently run no tests; the amended assertions verify actual command and test output.

## Task 11 — final-review repair after the ten pushed tasks

**Start point and files.** Resume `feature/source-knowledge-graph/dev-build` at `c1a3983` after
this amendment is merged and pushback is cleared. Modify only
`templates/scripts/check-source-graph.mjs`, `templates/scripts/check-source-graph.test.mjs`,
`bin/install-ontology.mjs`, `tests/install-ontology.test.mjs`, and
`tests/source-graph-acceptance.test.mjs`. The first two are the Task 5/6 checker repair; the next
two are the Task 9 installer repair; the last verifies the installed loop. The current ontology
already defines the relevant concepts and invariants, so this repair introduces no new ontology
term. Keep the ten existing task commits byte-for-byte and append one repair commit.

**Interface contracts.** Keep `checkTree`, `checkPullRequest`, `install` and `buildPlan` signatures,
the existing exit codes, and the installed script layout. `checkTree` reports
`evidence-path-missing` for a blank or non-normalized `kit:path` (as well as an absent blob) and
`evidence-range` whenever the line integers are not positive and ordered, even if the source path
does not exist. Only compare with the blob's line count when the path exists. `checkPullRequest`
compares the base graph's covered selectors with all proposed selector strings and reports
`coverage-transition` for each base covered selector that disappeared. The finding names the
old selector and its base declaration. A proposed declaration with the same selector and status
unknown/excluded is accepted only with its non-empty reason; the existing single-tree shape check
enforces that requirement. A narrower covered selector may take higher priority within that
reasoned gap. This declaration-level rule is separate from, and does not weaken, the existing
union-of-covered-scopes record rule for changed files. A base graph absent because the feature is
being installed has no transitions to compare. `install` resolves `NAMESPACE_URI` from a preserved
existing config through `validateConfig`, using the target's own ontology path for validation;
fresh installation and explicit reset keep using the generated starter namespace. Resolve this
before any writes. Existing adopter graph files remain untouched without reset.

**Step 1 — write the checker regressions, then see them fail.** Append to
`templates/scripts/check-source-graph.test.mjs`, reusing `pr`, `widgets`, `writeGraph`,
`withScratchRepo`, `find`, `setPair`, `block`, `S`, `checkRevision` and `treeFromRevision` already
in that file. The tests must include these assertions:

```js
test("empty evidence path and line zero each produce a finding", async () => {
  await withScratchRepo(async (repo) => {
    const spec = widgets(repo);
    const evidence = find(spec.evidence, ":evidence-e1");
    setPair(evidence, "kit:path", S(""));
    setPair(evidence, "kit:startLine", 0);
    writeGraph(repo, spec);
    repo.commit("invalid evidence");
    const findings = checkRevision(treeFromRevision(repo.dir, "HEAD"));
    assert.ok(findings.some((f) => f.subject === evidence.subject && f.rule === "evidence-path-missing"));
    assert.ok(findings.some((f) => f.subject === evidence.subject && f.rule === "evidence-range"));
  });
});

test("non-normalized evidence paths fail before coverage or blob lookup", async () => {
  for (const badPath of [" ", "./src/Invoice.cs", "../src/Invoice.cs", "/src/Invoice.cs"]) {
    await withScratchRepo(async (repo) => {
      const spec = widgets(repo);
      const evidence = find(spec.evidence, ":evidence-e1");
      setPair(evidence, "kit:path", S(badPath));
      writeGraph(repo, spec);
      repo.commit("invalid path");
      assert.ok(checkRevision(treeFromRevision(repo.dir, "HEAD")).some(
        (f) => f.subject === evidence.subject && f.rule === "evidence-path-missing"), badPath);
    });
  }
});

test("removed covered selector is visible with no source edit", async () => {
  const findings = await pr((repo, spec) => {
    spec.coverage = spec.coverage.filter((c) => c.subject !== ":coverage-c0");
    const removed = new Set(spec.evidence.filter((e) =>
      e.pairs.some((p) => p.predicate === "kit:path" && p.object === spec.paths.impl))
      .map((e) => e.subject));
    spec.evidence = spec.evidence.filter((e) => !removed.has(e.subject));
    spec.assertions = spec.assertions.filter((a) =>
      !a.pairs.some((p) => p.predicate === "kit:evidence" && removed.has(p.object)));
  });
  assert.ok(findings.some((f) => f.rule === "coverage-transition" && f.message.includes("src/**")),
    JSON.stringify(findings));
});

test("narrowed selector needs the old selector as a reasoned gap", async () => {
  const narrow = (repo, spec) => spec.coverage.push(block(":coverage-impl-only", "kit:GraphCoverage", [
    ["kit:pathSelector", S(spec.paths.impl)], ["kit:priority", 11], ["kit:status", "kit:covered"]]));
  const missing = await pr((repo, spec) => {
    spec.coverage = spec.coverage.filter((c) => c.subject !== ":coverage-c0");
    narrow(repo, spec);
  });
  assert.ok(missing.some((f) => f.rule === "coverage-transition" && f.message.includes("src/**")));
  const explicit = await pr((repo, spec) => {
    const old = find(spec.coverage, ":coverage-c0");
    setPair(old, "kit:status", "kit:unknown");
    setPair(old, "kit:reason", S("Only the invoice source remains covered"));
    narrow(repo, spec);
  });
  assert.deepEqual(explicit, []);
  const noReason = await pr((repo, spec) => {
    setPair(find(spec.coverage, ":coverage-c0"), "kit:status", "kit:excluded");
    narrow(repo, spec);
  });
  assert.ok(noReason.some((f) => f.rule === "coverage-malformed"));
});

test("adding unrelated future coverage does not create a transition", async () => {
  assert.deepEqual(await pr((repo, spec) => spec.coverage.push(block(":coverage-future", "kit:GraphCoverage", [
    ["kit:pathSelector", S("future/**")], ["kit:priority", 10], ["kit:status", "kit:covered"]]))), []);
});
```

If a fixture mutation inadvertently creates an unrelated finding, adjust the fixture so the
assertion isolates the intended rule; keep the source files unchanged in the removed-selector
test. Run `node --test templates/scripts/check-source-graph.test.mjs` and confirm the new cases
fail against the current checker. The existing changed-file narrowing and deletion tests remain
in place; they exercise the independent record rule.

**Step 2 — write the installer and installed-loop regressions, then see them fail.** Append to
`tests/install-ontology.test.mjs` using its `withTempRepo`, `install`, `readFileSync` and
`writeFileSync`. The custom
namespace test starts with a core install, then edits its config to
`https://customer.example/ontology#` and opts into the graph with a deliberately different
`projectName`. Assert that the config is byte-for-byte preserved, both newly written Turtle
starters start with the custom `@prefix :`, and the notice supplies the `sourceGraph` section.
Apply that section to the preserved config, run the installed `build-ontology.mjs`, commit the
files, then run the installed checker with `--rev HEAD`; assert its stdout contains
`source graph ok: revision`, not just exit code 0. Also assert `--force` preserves a hand-edited
adopter manifest and the config. A separate reset case changes the existing namespace, calls
`install({ target: repo.dir, projectName: "Widgets", withSourceGraph: true,
resetContent: true })`, and asserts that both replacement graph starters and the replacement
config use `https://ontology.example/widgets#`, with no config notice. Add a test for malformed
preserved config to verify that opt-in fails before writing any graph starter. In
`tests/source-graph-acceptance.test.mjs`, add an installed-checker regression that applies an
existing config's custom namespace, enables the supplied graph section, commits and checks the
starter graph; assert the command's output. Run
`node --test tests/install-ontology.test.mjs tests/source-graph-acceptance.test.mjs`; confirm the
custom-namespace case fails on the current installer with `namespace-mismatch`.

The concrete assertions for `tests/install-ontology.test.mjs` are:

```js
test("graph opt-in uses the namespace of a preserved config", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Old" });
    const configPath = join(repo.dir, "ontology.config.json");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    config.namespaceUri = "https://customer.example/ontology#";
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
    const before = readFileSync(configPath, "utf8");
    const result = install({ target: repo.dir, projectName: "Different", withSourceGraph: true });
    assert.equal(readFileSync(configPath, "utf8"), before);
    assert.match(result.configNotice, /"sourceGraph":/);
    for (const name of ["manifest.ttl", "nodes.ttl"]) {
      assert.match(readFileSync(join(repo.dir, "docs/source-knowledge-graph", name), "utf8"),
        /@prefix : <https:\/\/customer\.example\/ontology#> \./);
    }
    const manifest = join(repo.dir, "docs/source-knowledge-graph/manifest.ttl");
    writeFileSync(manifest, "adopter graph\n");
    install({ target: repo.dir, projectName: "Different", withSourceGraph: true, force: true });
    assert.equal(readFileSync(configPath, "utf8"), before);
    assert.equal(readFileSync(manifest, "utf8"), "adopter graph\n");
  });
});

test("explicit graph reset replaces config and starters with one namespace", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Old" });
    const configPath = join(repo.dir, "ontology.config.json");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    config.namespaceUri = "https://customer.example/ontology#";
    writeFileSync(configPath, JSON.stringify(config));
    const result = install({ target: repo.dir, projectName: "Widgets", withSourceGraph: true,
      resetContent: true });
    assert.equal(result.configNotice, null);
    assert.equal(JSON.parse(readFileSync(configPath, "utf8")).namespaceUri,
      "https://ontology.example/widgets#");
    for (const name of ["manifest.ttl", "nodes.ttl"]) {
      assert.match(readFileSync(join(repo.dir, "docs/source-knowledge-graph", name), "utf8"),
        /@prefix : <https:\/\/ontology\.example\/widgets#> \./);
    }
  });
});

test("invalid preserved config fails before graph starter writes", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Old" });
    writeFileSync(join(repo.dir, "ontology.config.json"), "{invalid json");
    assert.throws(() => install({ target: repo.dir, withSourceGraph: true }), /ontology\.config\.json|JSON/);
    assert.equal(existsSync(join(repo.dir, "docs/source-knowledge-graph/manifest.ttl")), false);
  });
});
```

Add `existsSync` to that test file's `node:fs` import. The installed acceptance case uses the
existing `run` helper and imports already in `tests/source-graph-acceptance.test.mjs`:

```js
test("a custom-namespace existing config produces a runnable starter graph", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Original" });
    const configPath = join(repo.dir, "ontology.config.json");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    config.namespaceUri = "https://customer.example/ontology#";
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
    const notice = install({ target: repo.dir, projectName: "Other", withSourceGraph: true }).configNotice;
    const section = JSON.parse(`{${notice.slice(notice.indexOf('"sourceGraph":'))}}`).sourceGraph;
    config.sourceGraph = section;
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
    const build = run(repo.dir, ["scripts/build-ontology.mjs"]);
    assert.equal(build.code, 0, build.err);
    repo.git("add", "-A"); repo.git("commit", "-q", "-m", "enable graph");
    const check = run(repo.dir, ["scripts/check-source-graph.mjs", "--rev", "HEAD"]);
    assert.equal(check.code, 0, check.err);
    assert.match(check.out, /source graph ok: revision [0-9a-f]{40}/);
  });
});
```

**Step 3 — implement the smallest repairs.** In `checkTree`, validate path syntax before guarded
blob, coverage and role checks. Validate integer lower bounds and ordering outside the `tree.has`
branch; validate the upper bound inside it. Keep one deterministic `evidence-path-missing` finding
per invalid path. In `checkPullRequest`, read each base covered resource's literal selector and
check presence in the proposed coverage resource set. Emit one `coverage-transition` per missing
selector; sort consistently with the existing finding order and do not enumerate file paths to
decide whether the declaration may disappear. In `install`, when graph opt-in preserves an
existing config, read it and call `validateConfig` with `ontologyExists` against the target;
use its resolved `namespaceUri` for `NAMESPACE_URI` before the write loop. Skip this read for
`--reset-content`, because it intentionally replaces the config. Do not change any kit-owned
script's installed bytes based on the target repository.

**Step 4 — verify.** Run the three focused test files, then
`node scripts/check-ontology-terms.mjs` and `npm test`. Inspect `git diff` for only the five
files named above. The GitHub required-check and branch-protection integration remains
unverified until a disposable GitHub repository demonstrates it; do not claim that local tests
prove it.

**Step 5 — one repair commit and push.** Stage only the five named files, review
`git diff --cached --name-only` and `git diff --cached`, rerun the ontology checker and full
suite, then commit `fix: close source graph review gaps` and push to the existing
`feature/source-knowledge-graph/dev-build` branch. Do not amend Tasks 1–10 or create separate
fix commits for their original file owners. This is the reviewed repair boundary for the reopened
build; only after it passes may the dev-build checklist and handoff resume.

## Handoff notes for the build

- The pilot (JointBooking) needs only configuration: `evidence.deployment: ["**/*.tf"]` and
  coverage selectors for its Terraform. It is verified here with fixtures; real adoption happens
  after user acceptance.
- Hand-writing one refresh record per covered file is the main authoring cost when an adopter first
  declares broad coverage. The checker's messages print each expected blob ID so an agent can fill
  them in; a helper that writes the records is a possible later side issue, not part of this plan.
- The repository's own `scripts/` copies are not synchronised by this plan; dogfooding the graph
  here is a separate decision.
