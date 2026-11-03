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
