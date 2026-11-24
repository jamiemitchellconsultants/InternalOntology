// Acceptance for #185, source graph links to feature documents. Every test installs the kit into a scratch repository and
// drives the INSTALLED protocol, runbook, checker and reader, with fetch replaced so that any network call fails. The graph
// is built with the installed test helpers, so the fixture is the one the shipped tests use.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { install } from "../bin/install-ontology.mjs";
import { withTempRepo } from "./helpers/temp-repo.mjs";

const OFFLINE = "data:text/javascript,globalThis.fetch=()=>{throw new Error('network call')}";
const flat = (text) => text.replace(/\s+/g, " ");

async function installed(body) {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withSourceGraph: true });
    const helpers = await import(pathToFileURL(join(repo.dir, "scripts/source-graph-test-helpers.mjs")).href);
    const scratch = { dir: repo.dir, write: repo.write, git: repo.git, commit: (message) => { repo.git("add", "-A"); repo.git("commit", "-q", "-m", message); return repo.git("rev-parse", "HEAD").trim(); } };
    await body(scratch, helpers);
  });
}

function run(repo, script, args) {
  const result = spawnSync(process.execPath, ["--import", OFFLINE, `scripts/${script}.mjs`, ...args], { cwd: repo.dir, encoding: "utf8", env: { PATH: process.env.PATH } });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

test("B8–B16: the installed protocol and runbook tell every agent to link design documents in the same change", async () => {
  await installed(async (repo) => {
    const agents = flat(readFileSync(join(repo.dir, "AGENTS.md"), "utf8"));
    assert.match(agents, /record it in the graph in the same change: a `kit:behaviour` node `:behaviour-<slug>-B<n>`/);
    assert.match(agents, /assert `kit:implements` from a symbol only when that one symbol carries out the behaviour/);
    assert.match(agents, /Record nothing for code that does not exist yet/);
    assert.match(agents, /Raise the manifest's `kit:schemaVersion` to 2 in the change that records the first behaviour or decision/);
    const runbook = flat(readFileSync(join(repo.dir, "docs/source-knowledge-graph.md"), "utf8"));
    assert.match(runbook, /## Link design documents/);
    assert.match(runbook, /node scripts\/query-source-graph\.mjs behaviour <slug>#B<n>/);
  });
});

test("B1, B5, B17, B20, B22: the installed checker passes a linked graph and reports its retired link without failing", async () => {
  await installed(async (repo, h) => {
    const spec = h.widgets(repo);
    h.addDesignDocs(repo, spec);
    h.writeGraph(repo, spec);
    repo.commit("design graph");
    const check = run(repo, "check-source-graph", ["--rev", "HEAD"]);
    assert.equal(check.code, 0, check.err);
    assert.match(check.out, /^retired design links: 1$/m);
  });
});

test("B3, B6, B24: the installed reader answers both questions offline", async () => {
  await installed(async (repo, h) => {
    const spec = h.widgets(repo);
    h.addDesignDocs(repo, spec);
    h.writeGraph(repo, spec);
    repo.commit("design graph");
    const behaviour = run(repo, "query-source-graph", ["behaviour", "payments#B1"]);
    assert.equal(behaviour.code, 0, behaviour.err);
    assert.match(behaviour.out, /^:node-ledger kit:implements :behaviour-payments-B1$/m);
    const code = run(repo, "query-source-graph", ["code", ":node-ledger"]);
    assert.equal(code.code, 0, code.err);
    assert.match(code.out, /^:node-ledger kit:documented-by :decision-0001$/m);
  });
});

test("B22: an upgraded version 1 graph with no design nodes still passes the installed checker", async () => {
  await installed(async (repo, h) => {
    const spec = h.widgets(repo);
    h.writeGraph(repo, spec);
    repo.commit("version 1 graph");
    assert.equal(spec.version, 1);
    const check = run(repo, "check-source-graph", ["--rev", "HEAD"]);
    assert.equal(check.code, 0, check.err);
  });
});

test("B19: reusing a retired id in a pull request fails the installed check", async () => {
  await installed(async (repo, h) => {
    const spec = h.widgets(repo);
    h.addDesignDocs(repo, spec);
    h.writeGraph(repo, spec);
    const base = repo.commit("design graph");
    h.rewriteDoc(repo, spec, "docs/features/payments/feature.md", h.DESIGN_FEATURE.replace("- **B3 Pay by cheque.**", "- **B2 Pay by cheque.**"));
    h.writeGraph(repo, spec);
    repo.commit("reuse B2");
    const check = run(repo, "check-source-graph", ["--base", base, "--head", "HEAD"]);
    assert.equal(check.code, 1, check.out);
    assert.match(check.err, /design-id-reused/);
  });
});

test("B22: after a schema upgrade, regenerating the Markdown makes the render check pass again", async () => {
  await installed(async (repo) => {
    const render = await import(pathToFileURL(join(repo.dir, "scripts/source-graph-render-test-helpers.mjs")).href);
    render.seedRenderRepo(repo);
    const schemaPath = join(repo.dir, "docs/source-knowledge-graph/graph-schema.ttl");
    const current = readFileSync(schemaPath, "utf8");
    assert.match(current, /kit:schemaVersion 2 ;/);
    // The installed checker rejects a version 1 schema file, so the previous kit's text is simulated by a schema that differs in content only.
    const old = `${current}# schema text from the previous kit\n`;
    repo.write("docs/source-knowledge-graph/graph-schema.ttl", old);
    repo.commit("old kit schema");
    const first = run(repo, "render-source-graph", []);
    assert.equal(first.code, 0, first.err);
    repo.commit("render with the old schema");
    assert.equal(run(repo, "render-source-graph", ["--check"]).code, 0);
    install({ target: repo.dir, projectName: "Widgets", withSourceGraph: true, force: true });
    assert.equal(readFileSync(schemaPath, "utf8"), current);
    repo.commit("upgrade the kit");
    assert.notEqual(run(repo, "render-source-graph", ["--check"]).code, 0, "stale Markdown must fail the check");
    const regenerated = run(repo, "render-source-graph", []);
    assert.equal(regenerated.code, 0, regenerated.err);
    repo.commit("regenerate the graph Markdown");
    const check = run(repo, "render-source-graph", ["--check"]);
    assert.equal(check.code, 0, check.err);
  });
});

test("B6, B9–B12: installed lookups expose the source and document evidence on design links", async () => {
  await installed(async (repo, h) => {
    const spec = h.widgets(repo);
    const { featurePath } = h.addDesignDocs(repo, spec);
    const code = "class Ledger {\n    void PayInvoice() {}\n}\n";
    h.rewriteDoc(repo, spec, spec.paths.impl, code);
    spec.nodes.push(h.block(":node-pay", "kit:GraphNode", [
      ["kit:kind", "kit:source-symbol"], ["rdfs:label", h.S("PayInvoice")],
    ]));
    spec.assertions.push(h.block(":assertion-symbol-behaviour", "kit:GraphAssertion", [
      ["kit:subject", ":node-pay"], ["kit:relationship", "kit:implements"], ["kit:object", ":behaviour-payments-B1"],
      ["kit:basis", "kit:direct"], ["kit:evidence", ":evidence-d1"], ["kit:evidence", ":evidence-e5"],
    ]));
    spec.assertions.push(h.block(":assertion-symbol-decision", "kit:GraphAssertion", [
      ["kit:subject", ":node-pay"], ["kit:relationship", "kit:documented-by"], ["kit:object", ":decision-0001"],
      ["kit:basis", "kit:inferred"], ["kit:evidence", ":evidence-d4"], ["kit:evidence", ":evidence-e5"],
    ]));
    h.writeGraph(repo, spec);
    const pinned = repo.commit("graph with design link evidence");

    function query(command, reference, ...options) {
      const result = run(repo, "query-source-graph", [command, reference, "--json", ...options]);
      assert.equal(result.code, 0, result.err);
      return JSON.parse(result.out);
    }
    const evidence = (assertion) => assertion.evidence.map(({ role, path, startLine, endLine }) =>
      [role, path, startLine, endLine]);
    const impl = ["kit:role-implementation", spec.paths.impl, 2, 2];
    const behaviour = ["kit:role-selected-document", featurePath, 11, 11];
    const result = query("behaviour", "payments#B1");
    const [component] = result.components;
    assert.equal(component.basis, "kit:direct");
    assert.equal(component.subject.iri, ":node-ledger");
    assert.deepEqual(evidence(component), [["kit:role-selected-document", featurePath, 22, 22], impl]);
    assert.equal(result.symbols[0].subject.iri, ":node-pay");
    assert.deepEqual(evidence(result.symbols[0]), [behaviour, impl]);
    assert.deepEqual(query("behaviour", "payments#B3").symbols, []);
    assert.equal(result.tests[0].object.iri, ":node-test");
    assert.deepEqual(evidence(result.tests[0]), [behaviour, ["kit:role-test", spec.paths.test, 1, 2]]);
    const [adr] = query("code", ":node-ledger").decisions;
    assert.equal(adr.object.iri, ":decision-0001");
    assert.deepEqual(evidence(adr), [["kit:role-selected-document", "docs/adr/0001-use-a-ledger.md", 1, 3], impl]);

    h.rewriteDoc(repo, spec, spec.paths.impl, code.replace("PayInvoice", "PayOpenInvoice"));
    h.writeGraph(repo, spec);
    const working = repo.commit("new evidence revision");
    const args = ["--rev", pinned, "--working-rev", working];
    const historical = query("code", ":node-pay", ...args);
    assert.equal(historical.stale, true);
    assert.equal(historical.decisions[0].tentative, true);
    const historicalText = run(repo, "query-source-graph", ["code", ":node-pay", ...args]);
    assert.equal(historicalText.code, 0, historicalText.err);
    assert.match(historicalText.out, /^STALE$/m);
    assert.match(historicalText.out, /\(tentative\)/);
  });
});
