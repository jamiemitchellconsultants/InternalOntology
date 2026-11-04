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
