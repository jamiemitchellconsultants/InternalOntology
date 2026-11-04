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
    const f = seedRenderRepo(r, { root, repositoryUrl, markdownPath: `${root}/current.md`, namespace: 'https://example.test/custom#',
      afterWrite(repo) { repo.write('docs/ontology.md', '# Widgets — Application Ontology\n\n## Entities\n\n| Name | Description |\n| --- | --- |\n| `Invoice` | Invoice |\n'); } });
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

test('ordinary upgrades preserve both the default generated view and an authored README', async () => {
  await withScratchRepo(async r => {
    install({ target: r.dir, projectName: 'Widgets', withSourceGraph: true });
    const f = seedRenderRepo(r);
    const result = command(r, 'scripts/render-source-graph.mjs'); assert.equal(result.status, 0, result.stderr);
    const md = readFileSync(join(r.dir, f.markdownPath), 'utf8');
    install({ target: r.dir, projectName: 'Widgets', withSourceGraph: true, force: true });
    assert.equal(readFileSync(join(r.dir, f.markdownPath), 'utf8'), md);
    r.write(f.markdownPath, 'Authored source graph notes\n');
    install({ target: r.dir, projectName: 'Widgets', withSourceGraph: true, force: true });
    assert.equal(readFileSync(join(r.dir, f.markdownPath), 'utf8'), 'Authored source graph notes\n');
  });
});
