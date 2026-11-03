# Human-readable source knowledge graph — detailed implementation plan

Execute only after the [task plan](../../superpowers/plans/human-readable-source-knowledge-graph/plan.md) has been reviewed and merged. Read the [vision](../../features/human-readable-source-knowledge-graph/01-vision.md), [behaviours](../../features/human-readable-source-knowledge-graph/02-behaviours.md), [architecture](../../features/human-readable-source-knowledge-graph/03-architecture.md) and ADRs 0009–0011 first. Work on `feature/human-readable-source-knowledge-graph/dev-build`. The task plan's global constraints apply to every task here.

Each task has a red/green cycle, required staged-diff/ontology/full-suite validation, then its own commit and push. The code blocks below are interface contracts, complete test/fixture files or precise workflow copy, not permission to build during dev-plan. Do not extract them into product files until the plan gate opens. Keep prose paragraphs/list items on one source line.

## Shared contracts

All runtime APIs and file ownership are in the task plan. The types below are ordinary JavaScript shapes, not new ontology terms.

```js
// A validated input returned by readRenderInput(tree):
// { tree, config, graph, markdownPath, repositoryUrl,
//   inventory: Array<[repositoryRelativePath, gitBlobId]>, fingerprint: string }
// Metadata returned by parseProvenance(text):
// { format: 1, sourceRevision: string, fingerprint: string }
// RenderError(message, code = 2) carries integer .code, preserving graph finding names in .message.
```

Use SHA-256 over the exact UTF-8 JSON serialization of `[1, inventory]`. Inventory pairs sort by ordinal path, contain no duplicate path, and use blob IDs from the selected Git tree. Include config, configured ontology Markdown/Turtle, every graph-root `.ttl` including schema, and every existing effectively covered file. Exclude the generated Markdown. Validate the full tree before projecting, so an added covered file without a review record fails even before comparison.

Provenance is exactly the first-line HTML comment defined in the task plan. Its JSON object has only `format`, `sourceRevision` and `fingerprint`, in that encoding order. Bound that comment to 4096 UTF-8 bytes before parsing; require one marker, format 1, full 40/64-character lowercase hex source ID and a 64-character lowercase hex fingerprint. Require the first line to equal canonical re-encoding of the parsed fields, rejecting duplicate JSON keys and alternate spellings. No `eval`, dynamic import or shell interpolation. A valid inspection result is SHA plus LF and nothing else on stdout.

Source selection for write mode is: validate committed HEAD and compare its inventory with the index; fail if relevant index changes are uncommitted. An explicit source revision must be valid and inventory-identical to HEAD. Otherwise, reuse a marked document's S if available and matching; choose HEAD when valid prior input differs. An unavailable S or malformed provenance is an error with retrieval/explicit-source recovery. An explicit source revision may repair malformed metadata in a recognizably marked generated file, but never overwrite an unmarked authored file. Recheck the real index immediately before replacement, after the optional test hook, to catch concurrent staging.

Check mode reads the document in the selected current revision/index, parses S, validates both trees, compares actual inventories and the recorded fingerprint, then compares exact `renderMarkdown(sourceInput)` bytes. A graph finding is invalid input (exit 2); valid-but-different source/candidate inventory or noncanonical output is stale (exit 1). It must not trust a matching attacker-supplied digest instead of computing the inventory. The bootstrap inspection mode parses bounded metadata without needing S locally; the subsequent check still performs all validation.

Every task ends with the same gate: stage only intended task files; inspect cached names and full diff; run the ontology checker and `npm test`; then make the specified commit and `git push -u origin feature/human-readable-source-knowledge-graph/dev-build`. If a required check fails, repair the task and repeat its validation before committing. Do not amend or combine already pushed task commits.

## Task 1 — configuration

Modify `templates/scripts/ontology-config.mjs` and append these complete cases to `tests/ontology-config.test.mjs`, using its existing imports and `minimal` fixture. Also update every existing deep-equal source-graph default to include normalized `markdownPath` and empty `repositoryUrl`, including the default returned when graph configuration is absent. Absent or blank URLs normalize to an empty string for graph-only compatibility; the renderer requires a non-empty URL. Non-blank supplied URLs follow the strict browser-base rules.

```js
const renderConfig = (extra = {}) => ({
  ...minimal,
  sourceGraph: { enabled: true, root: 'graph', evidence: {}, ...extra },
});
const renderDeps = { ontologyExists: () => true };

test('renderer settings normalize defaults without requiring a URL for graph-only use', () => {
  const c = validateConfig(renderConfig(), renderDeps);
  assert.equal(c.sourceGraph.markdownPath, 'graph/README.md');
  assert.equal(c.sourceGraph.repositoryUrl, '');
  assert.equal(validateConfig(renderConfig({ repositoryUrl: '' }), renderDeps).sourceGraph.repositoryUrl, '');
  const absent = validateConfig(minimal, renderDeps).sourceGraph;
  assert.equal(absent.markdownPath, 'docs/source-knowledge-graph/README.md');
  assert.equal(absent.repositoryUrl, '');
});

test('renderer settings support a custom root, document and Enterprise browser base', () => {
  const c = validateConfig(renderConfig({ root: './graph', markdownPath: './graph/view.md',
    repositoryUrl: 'https://git.example.test/team/widgets/' }), renderDeps);
  assert.equal(c.sourceGraph.root, 'graph');
  assert.equal(c.sourceGraph.markdownPath, 'graph/view.md');
  assert.equal(c.sourceGraph.repositoryUrl, 'https://git.example.test/team/widgets');
});

test('renderer output cannot leave excluded graph scope or overwrite the ontology', () => {
  for (const markdownPath of ['/tmp/view.md', '../view.md', 'outside/view.md', 'graph/../view.md',
    'graph/view.ttl', 'graph/', '']) {
    assert.throws(() => validateConfig(renderConfig({ markdownPath }), renderDeps), /markdownPath/);
  }
  assert.throws(() => validateConfig({ ...minimal, sourceGraph: {
    enabled: true, root: 'docs', markdownPath: 'docs/ontology.md' } }, renderDeps), /markdownPath/);
});

test('renderer browser URLs reject credentials, non-HTTPS and ambiguous bases', () => {
  for (const repositoryUrl of ['http://github.com/team/repo', 'https://user:secret@host/team/repo',
    'https://host/team/repo?q=1', 'https://host/team/repo#x', 'https://host/team',
    'https://host/team/repo/extra', 'https://host/team%2frepo/name', 'https://host/team/../repo']) {
    assert.throws(() => validateConfig(renderConfig({ repositoryUrl }), renderDeps), /repositoryUrl/);
  }
});
```

- [ ] Run `node --test tests/ontology-config.test.mjs` red, implement the allowlist/normalization/typedef extensions, then run it green. Detect raw dot segments before URL normalization erases them.
- [ ] Apply the shared commit gate. Commit `feat: validate source graph Markdown settings` and push.

## Task 2 — validated inputs and provenance

Create the three files named in Task 2. First create this complete shipped fixture helper at `templates/scripts/source-graph-render-test-helpers.mjs`. It layers over existing test APIs, never imports repository-root helpers, and deliberately commits a source snapshot before returning. `mutate` edits the existing spec; `afterWrite` can create graph shards/local declarations. Callers changing covered source must refresh its records and evidence before committing.

```js
import { readFileSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { widgets, writeGraph, refreshRecord, ROOT, NS, S, find, setPair } from './source-graph-test-helpers.mjs';
export { withScratchRepo } from './source-graph-test-helpers.mjs';

export function seedRenderRepo(repo, { root = ROOT, repositoryUrl = 'https://github.com/example/widgets',
  markdownPath = `${root}/README.md`, namespace = NS, mutate, afterWrite } = {}) {
  const spec = widgets(repo);
  spec.config.namespaceUri = namespace;
  Object.assign(spec.config.sourceGraph, { root, repositoryUrl, markdownPath });
  setPair(find(spec.coverage, ':coverage-graph-root'), 'kit:pathSelector', S(`${root}/**`));
  mutate?.(spec, repo);
  if (namespace !== NS) {
    repo.write('docs/ontology.ttl', readFileSync(join(repo.dir, 'docs/ontology.ttl'), 'utf8').replaceAll(NS, namespace));
    spec.records = spec.records.map(record => record.pairs.find(p => p.predicate === 'kit:path')?.object === 'docs/ontology.ttl'
      ? refreshRecord(repo, 'docs/ontology.ttl') : record);
  }
  writeGraph(repo, spec);
  if (root !== ROOT) {
    mkdirSync(dirname(join(repo.dir, root)), { recursive: true });
    rmSync(join(repo.dir, root), { recursive: true, force: true });
    renameSync(join(repo.dir, ROOT), join(repo.dir, root));
  }
  if (namespace !== NS) for (const rel of [`${root}/nodes.ttl`,
    `${root}/manifest.ttl`, `${root}/assertions/widgets.ttl`]) {
    repo.write(rel, readFileSync(join(repo.dir, rel), 'utf8').replaceAll(NS, namespace));
  }
  repo.write('ontology.config.json', JSON.stringify(spec.config, null, 2) + '\n');
  afterWrite?.(repo, { spec, root, markdownPath });
  return { spec, root, markdownPath, source: repo.commit('canonical graph source') };
}
```

Implement the input module contracts from the task plan. Obtain the config with `loadCheckConfig(tree)`, require the renderer URL, call `checkRevision(tree)` and reject all findings before returning a loaded graph. Construct the inventory using effective `resolveCoverage`, not selector text guesses. `chooseSource` receives an already validated committed candidate and uses the selection algorithm above; it does not fetch or execute anything.

Complete `templates/scripts/source-graph-render-input.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withScratchRepo, seedRenderRepo } from './source-graph-render-test-helpers.mjs';
import { treeFromRevision, treeFromIndex } from './source-graph-git.mjs';
import { RenderError, readRenderInput, encodeProvenance, parseProvenance, chooseSource,
  PROVENANCE_PREFIX } from './source-graph-render-input.mjs';

test('input projection includes all validation input, excludes output and ignores unrelated files', async () => {
  await withScratchRepo(async r => {
    const f = seedRenderRepo(r), a = readRenderInput(treeFromRevision(r.dir, f.source));
    for (const path of ['ontology.config.json', 'docs/ontology.md', 'docs/ontology.ttl',
      `${f.root}/graph-schema.ttl`, `${f.root}/manifest.ttl`, ...f.spec.covered]) {
      assert.ok(a.inventory.some(([p]) => p === path), path);
    }
    assert.equal(new Set(a.inventory.map(([p]) => p)).size, a.inventory.length);
    r.write(f.markdownPath, encodeProvenance({ sourceRevision: f.source, fingerprint: a.fingerprint }));
    r.write('uncovered.txt', 'unrelated');
    r.commit('document and unrelated file');
    const b = readRenderInput(treeFromRevision(r.dir, 'HEAD'));
    assert.deepEqual(b.inventory, a.inventory);
    assert.equal(b.fingerprint, a.fingerprint);
    assert.equal(chooseSource({ cwd: r.dir, candidate: b }).tree.id, f.source);
  });
});

test('provenance is canonical bounded data and does not require the source object to parse', () => {
  const value = { sourceRevision: 'a'.repeat(40), fingerprint: 'b'.repeat(64) };
  assert.deepEqual(parseProvenance(encodeProvenance(value)), { format: 1, ...value });
  const line = obj => PROVENANCE_PREFIX + JSON.stringify(obj) + ' -->\n';
  for (const bad of ['', line({ format: 1, ...value, extra: 1 }), line({ format: 2, ...value }),
    line({ format: 1, ...value, sourceRevision: '--upload-pack=bad' }),
    line({ format: 1, ...value, sourceRevision: 'A'.repeat(40) }),
    line({ format: 1, ...value, fingerprint: 'x' }),
    encodeProvenance(value).repeat(2), PROVENANCE_PREFIX + ' '.repeat(4096) + ' -->\n']) {
    assert.throws(() => parseProvenance(bad), e => e instanceof RenderError && e.code === 2);
  }
});

test('input validation rejects stale evidence and a new covered file without a review', async () => {
  await withScratchRepo(async r => {
    const f = seedRenderRepo(r);
    r.write(f.spec.paths.impl, 'different\nsource\nwith\nenough\nlines\nhere\n');
    r.git('add', '-A');
    assert.throws(() => readRenderInput(treeFromIndex(r.dir)), /evidence-blob-mismatch/);
    r.git('reset', '--hard', f.source);
    r.write('src/new.cs', 'new source\n');
    r.git('add', '-A');
    assert.throws(() => readRenderInput(treeFromIndex(r.dir)), /refresh-missing/);
  });
});

test('explicit source must exist and match actual candidate input rather than a supplied digest', async () => {
  await withScratchRepo(async r => {
    const f = seedRenderRepo(r), original = readRenderInput(treeFromRevision(r.dir, f.source));
    r.write('docs/ontology.md', '# Changed vocabulary view\n');
    const current = readRenderInput(treeFromRevision(r.dir, r.commit('changed relevant input')));
    assert.notEqual(current.fingerprint, original.fingerprint);
    assert.throws(() => chooseSource({ cwd: r.dir, candidate: current, explicitSourceRev: f.source }), /match|projection/);
    assert.throws(() => chooseSource({ cwd: r.dir, candidate: current, explicitSourceRev: '0'.repeat(40) }), /source|revision|git/);
  });
});
```

- [ ] Run `node --test templates/scripts/source-graph-render-input.test.mjs` red/green. Retain existing graph-only behaviour and finding names. Apply the shared gate, commit `feat: bind graph rendering to validated source snapshots`, and push.

## Task 3 — pure readable Markdown

Create the Task 3 module/test file. Use these fixed user-facing notices: `Generated from canonical Turtle. Edit the Turtle source and regenerate this document.`; `Recorded claims for human assessment; structural validity does not establish semantic accuracy.`; for empty content `No recorded assertions. Missing graph knowledge does not prove that a relationship is absent.`; and for coverage `The highest matching priority wins. Unmatched paths remain unknown. Covered files may still have unrecorded relationships.` Preserve the approved grouping and ordering. Label basis "Direct" or "Inferred (tentative)".

Use standard Markdown headings "Nodes", "Current claims", "Coverage", optional "Local vocabulary", and "Source details". Primary source links display path/range and role. Source details can hold complete assertion identities and provenance so distinct claims remain traceable. Escape HTML before adding renderer-controlled markup; encode literal backticks as `&#96;` and table pipes as `&#124;`, escape Markdown delimiters in text/labels and represent a recorded newline with renderer-controlled `<br>` on the same source line. Do not backtick labels automatically. Link paths are encoded segment-by-segment; source IDs are full commit IDs; line fragments are `#L1` or `#L1-L3`.

For testable per-claim navigation, emit a renderer-controlled HTML anchor `<a id="claim-KEY"></a>`, a blank line, then one prose line per assertion. KEY is full SHA-256 hex of `input.config.namespaceUri + assertion.iri`. This stable identity anchor is also used by the node index/source details. Start that claim line with `**SUBJECT** RELATIONSHIP **OBJECT**. **BASIS**.` followed by its evidence links and Turtle reference. Fixed core phrases are "contains", "implements", "is tested by", "depends on", "is documented by", "calls", "communicates with" and "is deployed by". Keep the hidden key out of the reading text.

Complete `templates/scripts/source-graph-markdown.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { withScratchRepo, seedRenderRepo } from './source-graph-render-test-helpers.mjs';
import { block, S, find, setPair, ttl } from './source-graph-test-helpers.mjs';
import { parseGraphTurtle } from './source-graph-turtle.mjs';
import { treeFromRevision } from './source-graph-git.mjs';
import { readRenderInput } from './source-graph-render-input.mjs';
import { renderMarkdown, sourceLink } from './source-graph-markdown.mjs';

test('B1–B9: all shards, claims, evidence, basis, shared/isolated nodes and scope stay readable', async () => {
  await withScratchRepo(async r => {
    const f = seedRenderRepo(r, { mutate(spec) {
      spec.nodes.push(block(':node-isolated', 'kit:GraphNode', [['kit:kind', 'kit:component'], ['rdfs:label', S('Unconnected')]]));
      setPair(find(spec.nodes, ':node-ledger'), 'rdfs:label', S('Invoice'));
      spec.assertions[0].pairs.push(...block('', '', [['kit:evidence', ':evidence-e2']]).pairs);
    }, afterWrite(repo, { root }) {
      const file = `${root}/assertions/widgets.ttl`;
      const { blocks } = parseGraphTurtle(readFileSync(join(repo.dir, file), 'utf8'), file);
      repo.write(file, ttl(blocks.filter((_, i) => i % 2 === 0)));
      repo.write(`${root}/assertions/more.ttl`, ttl(blocks.filter((_, i) => i % 2 === 1)));
    } });
    const input = readRenderInput(treeFromRevision(r.dir, f.source)), md = renderMarkdown(input);
    const key = id => createHash('sha256').update(input.config.namespaceUri + id).digest('hex');
    const expected = [
      [':assertion-a1', 'src/Invoice.cs', 'implements', 'Invoice', 'Direct', [['src/Invoice.cs', 1, 3], ['tests/InvoiceTests.cs', 1, 2]]],
      [':assertion-a2', 'Invoice', 'is tested by', 'tests/InvoiceTests.cs', 'Direct', [['tests/InvoiceTests.cs', 1, 2]]],
      [':assertion-a3', 'src/Invoice.cs', 'depends on', 'money', 'Direct', [['Widgets.csproj', 1, 1]]],
      [':assertion-a4', 'Invoice', 'is documented by', 'design', 'Direct', [['docs/design.md', 1, 3]]],
      [':assertion-a5', 'src/Invoice.cs', 'communicates with', 'Invoice', 'Inferred (tentative)', [['src/Invoice.cs', 2, 2]]],
      [':assertion-a6', 'Invoice', 'is deployed by', 'bucket', 'Direct', [['infra/main.tf', 1, 1]]],
    ];
    const rendered = [...md.matchAll(/^<a id="claim-([a-f0-9]{64})"><\/a>\n\n([^\n]+)$/gm)];
    assert.equal(rendered.length, expected.length);
    assert.deepEqual(rendered.map(m => m[1]).sort(), expected.map(row => key(row[0])).sort());
    const byKey = new Map(rendered.map(m => [m[1], m[2]]));
    for (const [id, subject, relationship, object, basis, evidence] of expected) {
      const line = byKey.get(key(id));
      assert.ok(line.startsWith(`**${subject}** ${relationship} **${object}**. **${basis}**.`), id);
      const urls = [...line.matchAll(/\]\((https:[^)]+)\)/g)].map(m => m[1]);
      const evidenceUrls = evidence.map(([path, start, end]) => `${input.repositoryUrl}/blob/${f.source}/${path}#L${start}` + (start === end ? '' : `-L${end}`));
      const resource = input.graph.resources.get(id);
      assert.deepEqual(urls, [...evidenceUrls, `${input.repositoryUrl}/blob/${f.source}/${resource.file}#L${resource.line}`], id);
      assert.ok(md.includes(id.slice(1)), 'source details retain assertion identity');
    }
    for (const evidence of f.spec.evidence) {
      const v = p => evidence.pairs.find(x => x.predicate === p).object;
      const range = v('kit:startLine') === v('kit:endLine') ? `#L${v('kit:startLine')}` : `#L${v('kit:startLine')}-L${v('kit:endLine')}`;
      assert.ok(md.includes(`${input.repositoryUrl}/blob/${f.source}/${v('kit:path')}${range}`));
    }
    for (const text of ['Invoice', 'Unconnected', 'Direct', 'Inferred (tentative)',
      'Coverage', 'unknown', 'excluded', '1000', 'not an accepted deployment source',
      'Unmatched paths remain unknown', 'structural validity does not establish semantic accuracy']) assert.ok(md.includes(text), text);
    assert.ok(md.includes('/assertions/more.ttl#L'));
    assert.doesNotMatch(md, /^## (Added|Changed|Removed|Diagram)/m);
    const shuffled = { ...input, graph: { ...input.graph, byType: type => input.graph.byType(type).reverse() } };
    assert.equal(renderMarkdown(shuffled), md);
  });
});

test('B2: supplied markup is text and used local relationship meaning remains accessible', async () => {
  await withScratchRepo(async r => {
    const f = seedRenderRepo(r, { mutate(spec) {
      setPair(find(spec.nodes, ':node-impl'), 'rdfs:label', S('x <img src=x> [name] `RawSymbol` | value'));
      setPair(spec.assertions[0], 'kit:relationship', ':rel-settles');
    }, afterWrite(repo, { root }) {
      const file = `${root}/manifest.ttl`;
      const { blocks } = parseGraphTurtle(readFileSync(join(repo.dir, file), 'utf8'), file);
      blocks.find(b => b.subject === ':graph').pairs.push(...block('', '', [['kit:declaresRelationship', ':rel-settles']]).pairs);
      blocks.push(block(':rel-settles', 'kit:GraphRelationshipDefinition', [['rdfs:comment', S('The subject settles the object.')]]));
      repo.write(file, ttl(blocks));
    } });
    const md = renderMarkdown(readRenderInput(treeFromRevision(r.dir, f.source)));
    assert.doesNotMatch(md, /<img|`RawSymbol`/);
    assert.match(md, /&lt;img/);
    assert.ok(md.includes('&#96;RawSymbol&#96;'));
    assert.ok(md.includes('&#124;'));
    assert.ok(md.includes('The subject settles the object.'));
    assert.ok(md.includes('rel-settles'));
  });
});

test('B3: an empty valid graph produces a document with limits, not fabricated relationships', async () => {
  await withScratchRepo(async r => {
    const f = seedRenderRepo(r, { mutate(spec) { spec.nodes = []; spec.assertions = []; spec.evidence = []; } });
    const md = renderMarkdown(readRenderInput(treeFromRevision(r.dir, f.source)));
    assert.match(md, /No recorded assertions/);
    assert.match(md, /Missing graph knowledge does not prove/);
    assert.match(md, /Coverage/);
  });
});

test('B4/B6/B7: source destinations remain immutable after branch advancement and encode paths', async () => {
  await withScratchRepo(async r => {
    const f = seedRenderRepo(r), input = readRenderInput(treeFromRevision(r.dir, f.source));
    const before = r.git('show', `${f.source}:${f.spec.paths.impl}`);
    const link = sourceLink(input, f.spec.paths.impl, 1, 3);
    assert.equal(link, `${input.repositoryUrl}/blob/${f.source}/${f.spec.paths.impl}#L1-L3`);
    assert.equal(sourceLink(input, 'src/a #%.cs', 2), `${input.repositoryUrl}/blob/${f.source}/src/a%20%23%25.cs#L2`);
    r.write(f.spec.paths.impl, 'new branch contents\n');
    r.commit('advance the branch after opening Markdown');
    const pinned = new URL(link).pathname.split('/blob/')[1].split('/');
    assert.equal(pinned.shift(), f.source);
    assert.equal(r.git('show', `${f.source}:${pinned.join('/')}`), before);
    assert.notEqual(r.git('show', `HEAD:${f.spec.paths.impl}`), before);
    assert.equal(sourceLink(input, f.spec.paths.impl, 1, 3), link);
  });
});
```

- [ ] Run the Task 3 test file red/green. Tests compare all six fixture assertions, which are test data rather than the JEPA-Speech pilot's separate 12. The real pilot/human/hosted trials remain feature-user work.
- [ ] Apply the shared gate, commit `feat: render the current source graph as readable Markdown`, and push.

## Task 4 — CLI and atomic publication

Implement the public `main`/`publishMarkdown` signatures in the task plan. The optional `beforePublish` callback runs before the CLI's own final index recheck; it is a deterministic concurrency-test seam, not a flag. `publishMarkdown` checks ownership and all existing path ancestors with `lstat`, writes a unique exclusive temporary sibling, runs `beforeReplace`, renames, and cleans up on every failure. Reject symlinks at the destination or any ancestor and paths escaping the real worktree. Check modes never call publication. Match existing realpath-aware entry guards so importing `main` does not execute it and symlinked CLI paths work.

Complete `templates/scripts/render-source-graph.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withScratchRepo, seedRenderRepo } from './source-graph-render-test-helpers.mjs';
import { writeGraph } from './source-graph-test-helpers.mjs';
import { parseProvenance } from './source-graph-render-input.mjs';
import { main, publishMarkdown } from './render-source-graph.mjs';

function run(r, args = [], extra = {}) {
  let stdout = '', stderr = '';
  const code = main(args, { cwd: r.dir, stdout: { write: s => { stdout += s; } },
    stderr: { write: s => { stderr += s; } }, ...extra });
  return { code, stdout, stderr };
}
const read = (r, p) => readFileSync(join(r.dir, p), 'utf8');

test('B10/B11: source then document commits, staged check, source reuse and historical checks', async () => {
  await withScratchRepo(async r => {
    const f = seedRenderRepo(r);
    assert.equal(run(r).code, 0);
    const md = read(r, f.markdownPath);
    assert.equal(parseProvenance(md).sourceRevision, f.source);
    r.git('add', f.markdownPath);
    assert.equal(run(r, ['--check', '--staged']).code, 0);
    const doc = r.commit('generated document');
    assert.equal(run(r, ['--check']).code, 0);
    assert.equal(run(r).code, 0);
    assert.equal(read(r, f.markdownPath), md);
    assert.equal(r.git('status', '--porcelain').trim(), '');
    r.write('uncovered.txt', 'new unrelated file'); r.commit('unrelated change');
    assert.equal(run(r).code, 0);
    assert.equal(read(r, f.markdownPath), md);
    r.write(f.markdownPath, md + '\ntampered\n'); r.git('add', f.markdownPath);
    assert.equal(run(r, ['--check', '--staged']).code, 1);
    assert.equal(run(r, ['--check', '--rev', doc]).code, 0);
    assert.equal(read(r, f.markdownPath), md + '\ntampered\n');
  });
});

test('B12: a changed valid graph replaces current state and an old-source check fails stale', async () => {
  await withScratchRepo(async r => {
    const f = seedRenderRepo(r); assert.equal(run(r).code, 0); r.commit('document');
    f.spec.assertions = f.spec.assertions.filter(a => a.subject !== ':assertion-a1');
    writeGraph(r, f.spec); const newer = r.commit('remove a recorded assertion');
    assert.equal(run(r, ['--check']).code, 1);
    assert.equal(run(r, ['--source-rev', f.source]).code, 2);
    assert.equal(run(r).code, 0);
    const md = read(r, f.markdownPath);
    assert.equal(parseProvenance(md).sourceRevision, newer);
    assert.doesNotMatch(md, /assertion-a1/);
    assert.doesNotMatch(md, /^## (Added|Changed|Removed)/m);
  });
});

test('B13: invalid input and concurrent staging preserve the previous document', async () => {
  await withScratchRepo(async r => {
    const f = seedRenderRepo(r); assert.equal(run(r).code, 0); r.commit('document');
    const md = read(r, f.markdownPath);
    r.write('docs/ontology.md', '# Uncommitted relevant change\n'); r.git('add', '-A');
    assert.equal(run(r).code, 2);
    assert.equal(read(r, f.markdownPath), md);
    r.git('reset', '--hard', 'HEAD');
    const result = run(r, [], { beforePublish() {
      r.write('docs/ontology.md', '# Concurrent staging\n'); r.git('add', '-A');
    } });
    assert.equal(result.code, 2);
    assert.match(result.stderr, /index|staged|candidate|changed/);
    assert.equal(read(r, f.markdownPath), md);
    r.git('reset', '--hard', 'HEAD');
    r.write(f.spec.paths.impl, 'invalid\nevidence\nsource\nwith\nsix\nlines\n'); r.git('add', '-A');
    const invalid = run(r);
    assert.equal(invalid.code, 2);
    assert.match(invalid.stderr, /evidence-blob-mismatch/);
    assert.equal(read(r, f.markdownPath), md);
  });
});

test('B13: authored files, symlinks and replacement failures are preserved', async () => {
  await withScratchRepo(async r => {
    const f = seedRenderRepo(r); r.write(f.markdownPath, 'authored notes\n');
    assert.equal(run(r).code, 2);
    assert.equal(read(r, f.markdownPath), 'authored notes\n');
    r.remove(f.markdownPath); assert.equal(run(r).code, 0);
    const md = read(r, f.markdownPath);
    const entries = readdirSync(join(r.dir, f.root)).sort();
    assert.throws(() => publishMarkdown({ cwd: r.dir, markdownPath: f.markdownPath,
      markdown: md + 'new', beforeReplace() { throw new Error('simulated replacement failure'); } }), /simulated/);
    assert.equal(read(r, f.markdownPath), md);
    assert.deepEqual(readdirSync(join(r.dir, f.root)).sort(), entries);
    r.write('outside/keep.md', 'keep\n');
    symlinkSync(join(r.dir, 'outside'), join(r.dir, 'linked'));
    assert.throws(() => publishMarkdown({ cwd: r.dir, markdownPath: 'linked/keep.md', markdown: md }), /symlink|symbolic/);
    assert.equal(read(r, 'outside/keep.md'), 'keep\n');
    assert.throws(() => publishMarkdown({ cwd: r.dir, markdownPath: '../escape.md', markdown: md }), /relative|outside|escape/);
  });
});

test('bootstrap inspection is SHA-only; bad modes and malformed metadata are explicit failures', async () => {
  await withScratchRepo(async r => {
    const f = seedRenderRepo(r); assert.equal(run(r).code, 0); r.commit('document');
    assert.deepEqual(run(r, ['--print-source-rev']), { code: 0, stdout: f.source + '\n', stderr: '' });
    for (const args of [['--unknown'], ['--staged'], ['--check', '--source-rev', 'HEAD'],
      ['--check', '--rev', 'HEAD', '--staged'], ['--source-rev']]) assert.equal(run(r, args).code, 2);
    const md = read(r, f.markdownPath);
    r.write(f.markdownPath, md.replace(f.source, '--upload-pack=bad')); r.commit('invalid metadata');
    assert.equal(run(r, ['--print-source-rev']).code, 2);
    assert.equal(run(r, ['--check']).code, 2);
    assert.equal(run(r, ['--source-rev', 'HEAD']).code, 0);
    assert.match(parseProvenance(read(r, f.markdownPath)).sourceRevision, /^[a-f0-9]{40,64}$/);
  });
});
```

Append this complete entry-command test to that file:

```js
test('the actual command runs through a symlink and checks without changing output', async () => {
  await withScratchRepo(async r => {
    const f = seedRenderRepo(r); assert.equal(run(r).code, 0);
    const doc = r.commit('generated document'), md = read(r, f.markdownPath);
    const link = join(r.dir, 'renderer-link.mjs');
    symlinkSync(fileURLToPath(new URL('./render-source-graph.mjs', import.meta.url)), link);
    const result = spawnSync(process.execPath, [link, '--check'], { cwd: r.dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes(doc));
    assert.ok(result.stdout.includes(f.source));
    assert.equal(read(r, f.markdownPath), md);
  });
});
```

- [ ] Run red/green with `node --test templates/scripts/render-source-graph.test.mjs`. Successful check output must identify both checked revision and pinned source, while inspection mode still prints only the source SHA.
- [ ] Apply the shared gate, commit `feat: check and atomically publish source graph Markdown`, and push.

## Task 5 — workflow and missing-source bootstrap

Create `templates/github/workflows/source-graph-render.yml` with this exact flow. It is a separate check; retain the existing graph workflow unchanged.

```yaml
name: Source graph Markdown
on:
  pull_request:
  push:
    branches: ["{{DEFAULT_BRANCH}}"]
permissions:
  contents: read
jobs:
  source-graph-markdown:
    name: source-graph-markdown
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Fetch pinned source snapshot
        run: |
          source_revision="$(node scripts/render-source-graph.mjs --print-source-rev --rev HEAD)"
          if ! git cat-file -e "${source_revision}^{commit}" 2>/dev/null; then
            git fetch --no-tags origin "$source_revision"
          fi
      - name: Check source graph Markdown
        run: node scripts/render-source-graph.mjs --check --rev HEAD
```

Complete `tests/source-graph-render-workflow.test.mjs`. This is a local transport proof, not a claim about live GitHub retention. It executes the actual bootstrap extracted from the workflow and proves source-object absence before fetching. The root-only fixture can copy runtime modules because it is not shipped.

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs';
import { join, delimiter } from 'node:path';
import { withScratchRepo, seedRenderRepo } from '../templates/scripts/source-graph-render-test-helpers.mjs';
import { main } from '../templates/scripts/render-source-graph.mjs';

const file = new URL('../templates/github/workflows/source-graph-render.yml', import.meta.url);
function bootstrap(text) {
  const part = text.split('      - name: Fetch pinned source snapshot\n')[1]?.split('      - name: Check source graph Markdown\n')[0];
  assert.ok(part, 'missing bootstrap boundary');
  const body = part.split('        run: |\n')[1]; assert.ok(body);
  return body.split('\n').map(line => line.replace(/^          /, '')).join('\n');
}
function git(cwd, ...args) { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }); }
async function transportTrial(body) {
  await withScratchRepo(async r => {
    for (const name of ['ontology-config', 'owl-ontology', 'source-graph-git', 'source-graph-turtle',
      'source-graph-model', 'check-source-graph', 'source-graph-render-input', 'source-graph-markdown', 'render-source-graph']) {
      r.write(`scripts/${name}.mjs`, readFileSync(new URL(`../templates/scripts/${name}.mjs`, import.meta.url), 'utf8'));
    }
    const f = seedRenderRepo(r);
    assert.equal(main([], { cwd: r.dir, stdout: { write() {} }, stderr: { write() {} } }), 0);
    const d = r.commit('generated document');
    const bare = join(r.dir, 'transport/remote.git'), clone = join(r.dir, 'transport/clone');
    mkdirSync(join(r.dir, 'transport'), { recursive: true });
    git(r.dir, 'init', '--bare', bare);
    git(r.dir, 'remote', 'add', 'origin', bare);
    git(r.dir, 'push', 'origin', `${d}:refs/heads/topic`, `${d}:refs/pull/1/head`);
    const tree = git(r.dir, 'rev-parse', `${d}^{tree}`).trim();
    const squashed = execFileSync('git', ['commit-tree', tree], { cwd: r.dir, input: 'squashed source and view\n', encoding: 'utf8' }).trim();
    git(r.dir, 'push', 'origin', `${squashed}:refs/heads/main`, ':refs/heads/topic');
    git(r.dir, 'clone', '--no-local', '--single-branch', '--branch', 'main', bare, clone);
    assert.notEqual(spawnSync('git', ['cat-file', '-e', `${f.source}^{commit}`], { cwd: clone }).status, 0);
    await body({ r, f, clone, bare });
  });
}

test('workflow is read-only, unfiltered, full-history and uses bounded SHA inspection', () => {
  const text = readFileSync(file, 'utf8');
  for (const required of ['pull_request:', '{{DEFAULT_BRANCH}}', 'contents: read', 'fetch-depth: 0',
    'name: source-graph-markdown', '--print-source-rev --rev HEAD', '--check --rev HEAD']) assert.ok(text.includes(required));
  assert.doesNotMatch(text, /contents: write|pull_request_target|secrets\.|paths:|git push/);
  assert.match(bootstrap(text), /git fetch --no-tags origin "\$source_revision"/);
});

test('squashed fresh clone retrieves retained source and passes the real check', async () => {
  await transportTrial(async ({ f, clone }) => {
    execFileSync('bash', ['-e', '-c', bootstrap(readFileSync(file, 'utf8'))], { cwd: clone, stdio: 'pipe' });
    assert.equal(spawnSync('git', ['cat-file', '-e', `${f.source}^{commit}`], { cwd: clone }).status, 0);
    const result = spawnSync(process.execPath, ['scripts/render-source-graph.mjs', '--check'], { cwd: clone, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(git(clone, 'status', '--porcelain').trim(), '');
  });
});

test('unavailable source fails bootstrap and preserves the tracked document', async () => {
  await transportTrial(async ({ f, clone }) => {
    const original = readFileSync(join(clone, f.markdownPath), 'utf8');
    git(clone, 'config', 'user.name', 'Graph Test'); git(clone, 'config', 'user.email', 'test@example.com');
    const changed = original.replaceAll(f.source, '0'.repeat(40));
    writeFileSync(join(clone, f.markdownPath), changed);
    git(clone, 'add', f.markdownPath); git(clone, 'commit', '-m', 'unavailable source');
    assert.throws(() => execFileSync('bash', ['-e', '-c', bootstrap(readFileSync(file, 'utf8'))], { cwd: clone, stdio: 'pipe' }));
    assert.equal(readFileSync(join(clone, f.markdownPath), 'utf8'), changed);
    const result = spawnSync(process.execPath, ['scripts/render-source-graph.mjs', '--check'], { cwd: clone, encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /source|snapshot|revision/);
  });
});
```

Append this complete adversarial-metadata test; it records attempted fetches while forwarding normal Git reads:

```js
test('invalid provenance cannot reach the fetch command', async () => {
  await transportTrial(async ({ f, clone }) => {
    const realGit = process.env.PATH.split(delimiter).map(dir => join(dir, 'git')).find(existsSync);
    assert.ok(realGit);
    const tools = join(clone, '..', 'tools'), log = join(tools, 'fetch.log');
    mkdirSync(tools, { recursive: true });
    const wrapper = join(tools, 'git');
    writeFileSync(wrapper, '#!/usr/bin/env node\n' +
      "const fs = require('node:fs'); const cp = require('node:child_process');\n" +
      "if (process.argv[2] === 'fetch') { fs.appendFileSync(process.env.FETCH_LOG, JSON.stringify(process.argv.slice(2))); process.exit(99); }\n" +
      'const r = cp.spawnSync(' + JSON.stringify(realGit) + ", process.argv.slice(2), {stdio:'inherit'}); process.exit(r.status ?? 2);\n");
    chmodSync(wrapper, 0o755);
    git(clone, 'config', 'user.name', 'Graph Test'); git(clone, 'config', 'user.email', 'test@example.com');
    const path = join(clone, f.markdownPath);
    writeFileSync(path, readFileSync(path, 'utf8').replaceAll(f.source, '--upload-pack=bad'));
    git(clone, 'add', f.markdownPath); git(clone, 'commit', '-m', 'bad provenance');
    assert.throws(() => execFileSync('bash', ['-e', '-c', bootstrap(readFileSync(file, 'utf8'))], {
      cwd: clone, stdio: 'pipe', env: { ...process.env, PATH: tools + delimiter + process.env.PATH, FETCH_LOG: log },
    }));
    assert.equal(existsSync(log), false);
  });
});
```

- [ ] Run `node --test tests/source-graph-render-workflow.test.mjs` red/green. This adversarial case proves rejection precedes fetch rather than only relying on a source scan.
- [ ] Apply the shared gate, commit `feat: verify source graph Markdown in read-only CI`, and push.

## Task 6 — installation and the real installed loop

Extend the source-graph `buildPlan` loop with the three runtime module names and their corresponding `.test.mjs` files. Add `source-graph-render-test-helpers.mjs` explicitly as Kit-owned, unsubstituted, and add the render workflow as Kit-owned with the default-branch substitution. Keep core installs unchanged. Preserve existing authored/config/Turtle files under `--force`; do not create a generated placeholder or synthesize `repositoryUrl` from an unrelated Git remote. Print the URL-configuration and source-then-document instructions from the installer when source graph support is requested.

Extend the existing destination and byte-identical assertions in `tests/install-ontology.test.mjs`. Extend the existing installed-test discovery in `tests/source-graph-acceptance.test.mjs` to assert the three new shipped test names are included; keep its existing full shipped-test run rather than adding another duplicate run. `tests/templates.test.mjs` must recognize the new template while retaining known-placeholder and installed-Markdown constraints.

Complete new file `tests/source-graph-render-install.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { install, buildPlan } from '../bin/install-ontology.mjs';
import { withScratchRepo, seedRenderRepo } from '../templates/scripts/source-graph-render-test-helpers.mjs';

const modules = ['source-graph-render-input', 'source-graph-markdown', 'render-source-graph'];
function command(r, ...args) {
  return spawnSync(process.execPath, args, { cwd: r.dir, encoding: 'utf8' });
}

test('renderer files are opt-in Kit-owned entries and an install never creates placeholder content', async () => {
  const core = buildPlan({}).map(e => e.dest), enabled = buildPlan({ withSourceGraph: true });
  for (const name of modules) for (const suffix of ['.mjs', '.test.mjs']) {
    const path = `scripts/${name}${suffix}`;
    assert.equal(core.includes(path), false);
    const entry = enabled.find(e => e.dest === path);
    assert.equal(entry.ownedBy, 'kit'); assert.equal(entry.substitute, false);
  }
  assert.ok(enabled.some(e => e.dest === '.github/workflows/source-graph-render.yml'));
  assert.ok(enabled.some(e => e.dest === 'scripts/source-graph-render-test-helpers.mjs'));
  await withScratchRepo(async r => {
    install({ target: r.dir, projectName: 'Widgets', withSourceGraph: true });
    assert.equal(existsSync(join(r.dir, 'docs/source-knowledge-graph/README.md')), false);
  });
});

test('installed alternate-root/namespace/Enterprise configuration generates, checks and survives upgrade', async () => {
  await withScratchRepo(async r => {
    const root = 'knowledge', repositoryUrl = 'https://git.example.test/team/other';
    install({ target: r.dir, projectName: 'Widgets', withSourceGraph: true, sourceGraphRoot: root });
    const f = seedRenderRepo(r, { root, repositoryUrl, markdownPath: `${root}/current.md`, namespace: 'https://example.test/custom#' });
    for (const name of modules) assert.equal(readFileSync(join(r.dir, `scripts/${name}.mjs`), 'utf8'),
      readFileSync(new URL(`../templates/scripts/${name}.mjs`, import.meta.url), 'utf8'));
    const source = readFileSync(join(r.dir, `${root}/assertions/widgets.ttl`), 'utf8');
    const cfg = readFileSync(join(r.dir, 'ontology.config.json'), 'utf8');
    let result = command(r, 'scripts/render-source-graph.mjs'); assert.equal(result.status, 0, result.stderr);
    const md = readFileSync(join(r.dir, f.markdownPath), 'utf8');
    assert.ok(md.includes(`${repositoryUrl}/blob/${f.source}/`));
    r.commit('generated view');
    result = command(r, 'scripts/render-source-graph.mjs', '--check'); assert.equal(result.status, 0, result.stderr);
    result = command(r, 'scripts/check-ontology-terms.mjs'); assert.equal(result.status, 0, result.stderr);
    install({ target: r.dir, projectName: 'Ignored replacement', withSourceGraph: true, sourceGraphRoot: root, force: true });
    assert.equal(readFileSync(join(r.dir, f.markdownPath), 'utf8'), md);
    assert.equal(readFileSync(join(r.dir, `${root}/assertions/widgets.ttl`), 'utf8'), source);
    assert.equal(readFileSync(join(r.dir, 'ontology.config.json'), 'utf8'), cfg);
    assert.ok(existsSync(join(r.dir, 'docs/source-knowledge-graph.md')));
  });
});
```

- [ ] Run the three focused root test files red/green. Ensure a marked document at a default/custom output path survives ordinary installation upgrades and an unmarked authored README is never overwritten. The Task 4 collision test and configuration override provide the recovery route.
- [ ] Update the existing protocol/guide and installation docs with approved source commit → generation → stage/review/validate → generated-document commit → same PR, URL/path configuration, no manual Markdown editing, missing-S recovery and the stable required check name. Keep domain vocabulary in shipped prose unbackticked unless supplied by the adopter's ontology.
- [ ] Run the full suite, including the single existing installed-test execution. Apply the shared gate, commit `feat: ship the source graph Markdown authoring workflow`, and push.

## Final build review and later acceptance

After all six task commits, review the complete branch against B1–B14 and ADRs 0009–0011. Check no renderer network imports, model calls or dynamic source execution were added; fetch exists only in workflow bootstrap. Run required checks after any review fixes, then open the build PR closing #67 with the Narrative label and headings, linting its scratch body. Hand off to feature-user and stop at that checkpoint.

The feature-user phase owns the JEPA-Speech 12-assertion readability/accuracy trial, actual browser navigation from an open document after branch advancement, live GitHub/Enterprise source-object retention after squash/rebase/deletion, workflow runs, required-check setup, user guide and acceptance record. The local transport/Git-object tests above give executable evidence for mechanism and immutability; they do not claim those hosted or human outcomes have already passed.
