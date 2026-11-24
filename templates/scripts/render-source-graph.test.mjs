import { test } from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withScratchRepo, seedRenderRepo } from './source-graph-render-test-helpers.mjs';
import { writeGraph } from './source-graph-test-helpers.mjs';
import { parseProvenance, readRenderInput } from './source-graph-render-input.mjs';
import { treeFromRevision } from './source-graph-git.mjs';
import { renderMarkdown } from './source-graph-markdown.mjs';
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

test('B22: an upgraded renderer refreshes Markdown pinned to a version 1 schema', async () => {
  await withScratchRepo(async r => {
    const f = seedRenderRepo(r);
    const schemaPath = `${f.root}/graph-schema.ttl`;
    const currentSchema = read(r, schemaPath);
    const input = readRenderInput(treeFromRevision(r.dir, f.source));
    r.write(schemaPath, `@prefix kit: <https://ontology-kit.dev/schema#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

kit:GraphVocabulary a rdfs:Class ;
    kit:schemaVersion 1 ;
    rdfs:comment "Core source graph vocabulary." .
`);
    const oldSource = r.commit('version 1 schema and manifest');
    const oldTree = treeFromRevision(r.dir, oldSource);
    const oldInventory = input.inventory.map(([path, blob]) =>
      [path, path === schemaPath ? oldTree.blobId(path) : blob]);
    const oldFingerprint = createHash('sha256').update(JSON.stringify([1, oldInventory])).digest('hex');
    const oldMarkdown = renderMarkdown({ ...input, tree: oldTree, fingerprint: oldFingerprint });
    r.write(f.markdownPath, oldMarkdown);
    r.commit('version 1 generated Markdown');
    r.write(schemaPath, currentSchema);
    const upgrade = r.commit('upgrade the kit schema, keeping the version 1 manifest');

    const stale = run(r, ['--check']);
    assert.equal(stale.code, 1, stale.stderr);
    assert.match(stale.stderr, /stale source graph Markdown/);
    assert.equal(read(r, f.markdownPath), oldMarkdown);

    const regenerated = run(r);
    assert.equal(regenerated.code, 0, regenerated.stderr);
    const markdown = read(r, f.markdownPath);
    assert.equal(parseProvenance(markdown).sourceRevision, upgrade);
    assert.ok(markdown.includes(`/blob/${upgrade}/`));
    r.git('add', f.markdownPath);
    assert.equal(run(r, ['--check', '--staged']).code, 0);
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
