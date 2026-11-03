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
    line({ format: 1, ...value, sourceRevision: [value.sourceRevision] }),
    line({ format: 1, ...value, fingerprint: [value.fingerprint] }),
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
