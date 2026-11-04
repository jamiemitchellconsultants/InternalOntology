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
