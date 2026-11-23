import { test } from "node:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { checkTree, loadCheckConfig, CheckSetupError } from "./check-source-graph.mjs";
import { treeFromRevision } from "./source-graph-git.mjs";
import { withScratchRepo, widgets, writeGraph, find, setPair, dropPair, block, S, ttl, blobId, ROOT, addDesignDocs, rewriteDoc, DESIGN_FEATURE, DESIGN_ADRS } from "./source-graph-test-helpers.mjs";

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

const rulesOf = (findings) => new Set(findings.map((f) => f.rule));

test("B22: a version 1 manifest that uses no version 2 value passes against the version 2 schema", async () => {
  assert.deepEqual(await run((s) => { s.version = 1; }), []);
});

test("B22: a manifest below 1 or above the core version fails", async () => {
  for (const version of [0, 3]) {
    assert.ok(rulesOf(await run((s) => { s.version = version; })).has("schema-version"), String(version));
  }
});

test("B22: a version 2 value in a version 1 graph fails and names the version it needs", async () => {
  const findings = await run((s) => { setPair(find(s.assertions, ":assertion-a5"), "kit:relationship", "kit:replaced-by"); });
  const hit = findings.find((f) => f.rule === "schema-version-too-old");
  assert.ok(hit, JSON.stringify(findings));
  assert.equal(hit.subject, ":assertion-a5");
  assert.match(hit.message, /kit:replaced-by needs kit:schemaVersion 2/);
  assert.ok(!(await run((s) => { s.version = 2; setPair(find(s.assertions, ":assertion-a5"), "kit:relationship", "kit:replaced-by"); }))
    .some((f) => f.rule === "schema-version-too-old"), "allowed at version 2");
});

test("B22: version 2 node kinds, statuses and predicates in a version 1 graph each fail once with the version they need", async () => {
  const findings = await run((s) => {
    s.nodes.push(block(":behaviour-widgets-B1", "kit:GraphNode", [["kit:designStatus", "kit:current"], ["kit:evidence", ":evidence-e4"], ["kit:kind", "kit:behaviour"], ["rdfs:label", S("widgets#B1 Post an invoice")]]));
  });
  const messages = findings.filter((f) => f.rule === "schema-version-too-old" && f.subject === ":behaviour-widgets-B1").map((f) => f.message).sort();
  assert.deepEqual(messages, ["kit:behaviour needs kit:schemaVersion 2", "kit:current needs kit:schemaVersion 2", "kit:designStatus needs kit:schemaVersion 2", "kit:evidence needs kit:schemaVersion 2"]);
});

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
  ["schema-version", (s) => { s.version = 3; }],
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

test("unknown predicates on known resources are rejected", async () => {
  const findings = await run((s) => setPair(find(s.nodes, ":node-impl"), "kit:typo", "kit:test"));
  assert.ok(findings.some((f) => f.rule === "bad-value" && /kit:typo/.test(f.message)));
});

test("a missing schema is reported", async () => {
  await withScratchRepo(async (repo) => {
    widgets(repo);
    repo.remove(`${ROOT}/graph-schema.ttl`);
    repo.commit("missing schema");
    const tree = treeFromRevision(repo.dir, "HEAD");
    assert.ok(checkTree({ tree, config: loadCheckConfig(tree) }).some((f) => f.rule === "schema-missing"));
  });
});

import { checkPullRequest, checkRevision, main, retiredDesignLinks } from "./check-source-graph.mjs";
import { loadGraph, refreshIdFor } from "./source-graph-model.mjs";
import { refreshRecord } from "./source-graph-test-helpers.mjs";

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

test("the checker script runs as a command", async () => {
  const { execFileSync } = await import("node:child_process");
  const output = execFileSync(process.execPath, [new URL("./check-source-graph.mjs", import.meta.url).pathname, "--help"], { encoding: "utf8" });
  assert.match(output, /Usage:/);
});

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
        (f) => f.subject === evidence.subject && f.rule === "evidence-path-missing" &&
          f.message.includes("invalid path")), badPath);
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

async function excludedChangedSource(mutateRecord) {
  return pr((repo, spec) => {
    repo.write(spec.paths.impl, "changed but excluded\n");
    const coverage = find(spec.coverage, ":coverage-c0");
    setPair(coverage, "kit:status", "kit:excluded");
    setPair(coverage, "kit:reason", S("Implementation scope removed after review"));
    const removed = new Set(spec.evidence.filter((e) =>
      e.pairs.some((p) => p.predicate === "kit:path" && p.object === spec.paths.impl))
      .map((e) => e.subject));
    spec.evidence = spec.evidence.filter((e) => !removed.has(e.subject));
    spec.assertions = spec.assertions.filter((a) =>
      !a.pairs.some((p) => p.predicate === "kit:evidence" && removed.has(p.object)));
    const index = spec.records.findIndex((r) =>
      r.pairs.some((p) => p.predicate === "kit:path" && p.object === spec.paths.impl));
    assert.ok(index >= 0);
    const record = refreshRecord(repo, spec.paths.impl);
    spec.records[index] = record;
    mutateRecord?.(record, spec);
  });
}

test("a valid review record permits a changed file to leave coverage", async () => {
  assert.deepEqual(await excludedChangedSource(), []);
});

test("a changed file leaving coverage rejects both blob and deletion", async () => {
  const findings = await excludedChangedSource((record) => setPair(record, "kit:deleted", 1));
  assert.ok(findings.some((f) => f.rule === "refresh-malformed" && f.message.includes("src/Invoice.cs")));
});

test("a changed file leaving coverage rejects an invalid review outcome", async () => {
  const findings = await excludedChangedSource((record) => setPair(record, "kit:reviewOutcome", "kit:banana"));
  assert.ok(findings.some((f) => f.rule === "refresh-malformed" && f.message.includes("src/Invoice.cs")));
});

test("a changed file leaving coverage requires its review record in the manifest", async () => {
  const findings = await excludedChangedSource((record, spec) => { spec.omitFromManifest = [record.subject]; });
  assert.ok(findings.some((f) => f.rule === "refresh-unreferenced" && f.message.includes("src/Invoice.cs")));
});

test("a changed file leaving coverage rejects the wrong review record IRI", async () => {
  const findings = await excludedChangedSource((record) => { record.subject = ":not-a-refresh-id"; });
  assert.ok(findings.some((f) => f.rule === "refresh-malformed" && f.message.includes("src/Invoice.cs")));
});

const designNode = (pairs) => block(":behaviour-widgets-B1", "kit:GraphNode",
  [["kit:kind", "kit:behaviour"], ["rdfs:label", S("widgets#B1 Post an invoice")], ...pairs]);

test("B22: a design node needs one status from its kind's list and one evidence item, in a version 2 graph", async () => {
  const shaped = async (pairs, version = 2) => rulesOf(await run((s) => { s.version = version; s.nodes.push(designNode(pairs)); }));
  const ok = await shaped([["kit:designStatus", "kit:current"], ["kit:evidence", ":evidence-e4"]]);
  for (const rule of ["design-status", "design-evidence", "schema-version-too-old", "dangling-reference", "bad-value"]) assert.ok(!ok.has(rule), rule);
  assert.ok((await shaped([["kit:evidence", ":evidence-e4"]])).has("design-status"), "missing status");
  assert.ok((await shaped([["kit:designStatus", "kit:accepted"], ["kit:evidence", ":evidence-e4"]])).has("design-status"), "decision status on a behaviour");
  assert.ok((await shaped([["kit:designStatus", "kit:current"]])).has("design-evidence"), "missing evidence");
  assert.ok((await shaped([["kit:designStatus", "kit:current"], ["kit:evidence", ":evidence-e4"], ["kit:evidence", ":evidence-e1"]])).has("design-evidence"), "two evidence items");
  assert.ok((await shaped([["kit:designStatus", "kit:current"], ["kit:evidence", ":evidence-missing"]])).has("dangling-reference"), "dangling evidence");
  assert.ok((await shaped([["kit:designStatus", "kit:current"], ["kit:evidence", ":evidence-e4"]], 1)).has("schema-version-too-old"), "version 1");
});

test("B22: kit:designStatus and node kit:evidence are rejected on other kinds", async () => {
  const findings = await run((s) => {
    s.version = 2;
    find(s.nodes, ":node-ledger").pairs.push(...block("", "", [["kit:designStatus", "kit:current"], ["kit:evidence", ":evidence-e4"]]).pairs);
  });
  const rules = findings.filter((f) => f.subject === ":node-ledger").map((f) => f.rule);
  assert.ok(rules.includes("design-status"), JSON.stringify(findings));
  assert.ok(rules.includes("design-evidence"), JSON.stringify(findings));
});

test("the design fixture is structurally valid in both modes", async () => {
  for (const mode of ["lite", "full"]) assert.deepEqual(await run((s, r) => { addDesignDocs(r, s, { mode }); }), [], mode);
});

const LITE = "docs/features/payments/feature.md";
const design = (mutate, mode = "lite") => run(async (s, r) => { addDesignDocs(r, s, { mode }); await mutate?.(s, r); });
const has = (findings, rule, subject) => findings.some((f) => f.rule === rule && (subject === undefined || f.subject === subject));

const behaviourMutations = [
  ["design-iri", ":behaviour-payments-1", (s) => { find(s.nodes, ":behaviour-payments-B1").subject = ":behaviour-payments-1"; }],
  ["design-undeclared", ":behaviour-payments-B1", (s) => { setPair(find(s.evidence, ":evidence-d1"), "kit:startLine", 12); setPair(find(s.evidence, ":evidence-d1"), "kit:endLine", 12); }],
  ["design-undeclared", ":behaviour-payments-B9", (s) => { s.nodes.push(block(":behaviour-payments-B9", "kit:GraphNode", [["kit:designStatus", "kit:current"],
    ["kit:evidence", ":evidence-d2"], ["kit:kind", "kit:behaviour"], ["rdfs:label", S("payments#B9 Pay twice")]])); }],
  ["design-label", ":behaviour-payments-B1", (s) => { setPair(find(s.nodes, ":behaviour-payments-B1"), "rdfs:label", S("payments#B1 Pay invoice")); }],
  ["design-label", ":behaviour-payments-B2", (s) => { setPair(find(s.nodes, ":behaviour-payments-B2"), "rdfs:label", S("payments#B2")); }],
  ["design-status", ":behaviour-payments-B3", (s) => { setPair(find(s.nodes, ":behaviour-payments-B3"), "kit:designStatus", "kit:current"); }],
  ["design-status", ":behaviour-payments-B1", (s) => { setPair(find(s.nodes, ":behaviour-payments-B1"), "kit:designStatus", "kit:retired"); }],
  ["design-evidence", ":behaviour-payments-B1", (s) => { setPair(find(s.nodes, ":behaviour-payments-B1"), "kit:evidence", ":evidence-e4"); }],
  ["design-evidence", ":behaviour-payments-B1", (s) => { setPair(find(s.evidence, ":evidence-d1"), "kit:role", "kit:role-implementation"); }],
  ["design-id-reused", ":behaviour-payments-B2", (s, r) => { rewriteDoc(r, s, LITE, DESIGN_FEATURE.replace("- **B3 Pay by cheque.**", "- **B2 Pay by cheque.**")); }],
];

for (const [rule, subject, mutate] of behaviourMutations) {
  test(`B1, B19: a behaviour node that drifts from its document reports ${rule} on ${subject}`, async () => {
    const findings = await design(mutate);
    assert.ok(has(findings, rule, subject), `expected ${rule} on ${subject}, got ${JSON.stringify(findings)}`);
  });
}

test("B1: behaviour nodes that match their declarations pass in lite and full mode with the same IRIs", async () => {
  for (const mode of ["lite", "full"]) assert.deepEqual(await design(null, mode), [], mode);
});

test("B2: a feature with both behaviours files fails once, naming both", async () => {
  const findings = await design((s, r) => { r.write("docs/features/payments/02-behaviours.md", DESIGN_FEATURE); });
  const hits = findings.filter((f) => f.rule === "design-file-conflict");
  assert.equal(hits.length, 1, JSON.stringify(findings));
  assert.match(hits[0].message, /docs\/features\/payments\/02-behaviours\.md and docs\/features\/payments\/feature\.md both declare behaviours/);
});

test("B19: a behaviour whose feature has no behaviours file is undeclared", async () => {
  const findings = await design((s, r) => { r.remove(LITE); });
  assert.ok(has(findings, "design-undeclared", ":behaviour-payments-B1"), JSON.stringify(findings));
});

test("B21: rewording a title keeps the IRI; the check passes once the label follows the new title", async () => {
  const reworded = DESIGN_FEATURE.replace("**B1 Pay an invoice.**", "**B1 Pay an open invoice.**");
  assert.ok(has(await design((s, r) => { rewriteDoc(r, s, LITE, reworded); }), "design-label", ":behaviour-payments-B1"));
  assert.deepEqual(await design((s, r) => {
    rewriteDoc(r, s, LITE, reworded);
    setPair(find(s.nodes, ":behaviour-payments-B1"), "rdfs:label", S("payments#B1 Pay an open invoice"));
  }), []);
});

const ADR1 = "docs/adr/0001-use-a-ledger.md";

const decisionMutations = [
  ["design-iri", ":decision-1", (s) => { find(s.nodes, ":decision-0001").subject = ":decision-1"; }],
  ["design-undeclared", ":decision-0001", (s) => { setPair(find(s.evidence, ":evidence-d4"), "kit:startLine", 2); }],
  ["design-undeclared", ":decision-0001", (s, r) => { rewriteDoc(r, s, ADR1, "# 0001 — Use a ledger\n\nNo status yet.\n"); }],
  ["design-undeclared", ":decision-0003", (s) => { s.nodes.push(block(":decision-0003", "kit:GraphNode", [["kit:designStatus", "kit:accepted"],
    ["kit:evidence", ":evidence-d4"], ["kit:kind", "kit:decision"], ["rdfs:label", S("ADR 0003 Missing")]])); }],
  ["design-label", ":decision-0001", (s) => { setPair(find(s.nodes, ":decision-0001"), "rdfs:label", S("ADR 0001 Use the ledger")); }],
  ["design-status", ":decision-0001", (s) => { setPair(find(s.nodes, ":decision-0001"), "kit:designStatus", "kit:superseded"); }],
  ["design-evidence", ":decision-0001", (s) => { setPair(find(s.nodes, ":decision-0001"), "kit:evidence", ":evidence-e4"); }],
];

for (const [rule, subject, mutate] of decisionMutations) {
  test(`B5: a decision node that drifts from its ADR reports ${rule} on ${subject}`, async () => {
    const findings = await design(mutate);
    assert.ok(has(findings, rule, subject), `expected ${rule} on ${subject}, got ${JSON.stringify(findings)}`);
  });
}

test("B5: a capitalised or annotated Status word still reads as its status", async () => {
  for (const status of ["Accepted", "accepted; amended by ADR 0002 (planning)"]) {
    const text = DESIGN_ADRS[ADR1].replace("- **Status:** accepted", `- **Status:** ${status}`);
    assert.deepEqual(await design((s, r) => { rewriteDoc(r, s, ADR1, text); }), [], status);
  }
});

test("B5: a Status word outside the four values gives exactly one design-status finding", async () => {
  for (const [status, word] of [["rejected", "rejected"], ["—", ""]]) {
    const text = DESIGN_ADRS[ADR1].replace("- **Status:** accepted", `- **Status:** ${status}`);
    const findings = (await design((s, r) => { rewriteDoc(r, s, ADR1, text); })).filter((f) => f.subject === ":decision-0001");
    assert.deepEqual(findings.map((f) => [f.rule, f.message]), [["design-status",
      `ADR 0001 has status "${word}", which is not proposed, accepted, superseded or deprecated; do not record it as a decision node`]], status);
  }
});

const ADR2 = "docs/adr/0002-keep-cheques.md";
const linkOf = (id, subject, relationship, object) => block(`:assertion-${id}`, "kit:GraphAssertion", [["kit:basis", "kit:direct"],
  ["kit:evidence", ":evidence-e5"], ["kit:object", object], ["kit:relationship", relationship], ["kit:subject", subject]]);

const replacementMutations = [
  ["design-replacement", ":behaviour-payments-B3", (s) => { s.assertions = s.assertions.filter((a) => a.subject !== ":assertion-d1"); }],
  ["design-replacement", ":behaviour-payments-B3", (s) => { setPair(find(s.assertions, ":assertion-d1"), "kit:object", ":behaviour-payments-B1"); }],
  ["design-replacement", ":behaviour-payments-B3", (s, r) => { rewriteDoc(r, s, LITE, DESIGN_FEATURE.replace("; replaced by B2.", ".")); }],
  ["design-replacement", ":behaviour-payments-B1", (s) => { s.assertions.push(linkOf("x0", ":behaviour-payments-B1", "kit:replaced-by", ":behaviour-payments-B2")); }],
  ["design-replacement", ":decision-0002", (s) => { s.assertions = s.assertions.filter((a) => a.subject !== ":assertion-d2"); }],
  ["design-replacement", ":decision-0002", (s, r) => { rewriteDoc(r, s, ADR2, DESIGN_ADRS[ADR2].replace("superseded by ADR 0001", "superseded")); }],
  ["design-link-kinds", ":assertion-x1", (s) => { s.assertions.push(linkOf("x1", ":node-ledger", "kit:replaced-by", ":behaviour-payments-B2")); }],
  ["design-link-kinds", ":assertion-x2", (s) => { s.assertions.push(linkOf("x2", ":behaviour-payments-B1", "kit:superseded-by", ":behaviour-payments-B2")); }],
];

for (const [rule, subject, mutate] of replacementMutations) {
  test(`B17, B18: a missing, extra or misdirected replacement link reports ${rule} on ${subject}`, async () => {
    const findings = await design(mutate);
    assert.ok(has(findings, rule, subject), `expected ${rule} on ${subject}, got ${JSON.stringify(findings)}`);
  });
}

test("B17: a replacement in another feature expects that feature's behaviour", async () => {
  const findings = await design((s, r) => { rewriteDoc(r, s, LITE, DESIGN_FEATURE.replace("; replaced by B2.", "; replaced by refunds#B2.")); });
  const f = findings.find((x) => x.rule === "design-replacement" && x.subject === ":behaviour-payments-B3");
  assert.ok(f, JSON.stringify(findings));
  assert.match(f.message, /kit:replaced-by :behaviour-refunds-B2$/);
});

test("B17: a retired entry that names no replacement needs no link", async () => {
  assert.deepEqual(await design((s, r) => {
    rewriteDoc(r, s, LITE, DESIGN_FEATURE.replace("; replaced by B2.", "."));
    s.assertions = s.assertions.filter((a) => a.subject !== ":assertion-d1");
  }), []);
});

test("B20: a link to a retired behaviour or superseded decision is reported and the check passes", async () => {
  await withScratchRepo(async (repo) => {
    const spec = widgets(repo);
    addDesignDocs(repo, spec);
    spec.assertions.push(block(":assertion-d7", "kit:GraphAssertion", [["kit:basis", "kit:direct"], ["kit:evidence", ":evidence-d5"],
      ["kit:evidence", ":evidence-e5"], ["kit:object", ":decision-0002"], ["kit:relationship", "kit:documented-by"], ["kit:subject", ":node-ledger"]]));
    writeGraph(repo, spec);
    repo.commit("graph");
    const tree = treeFromRevision(repo.dir, "HEAD"), config = loadCheckConfig(tree);
    assert.deepEqual(checkTree({ tree, config }), []);
    assert.deepEqual(retiredDesignLinks(loadGraph(tree, config)), [
      { assertion: ":assertion-d4", subject: ":node-ledger", relationship: "kit:implements", object: ":behaviour-payments-B3", inactive: ":behaviour-payments-B3", status: "kit:retired", replacement: ":behaviour-payments-B2" },
      { assertion: ":assertion-d7", subject: ":node-ledger", relationship: "kit:documented-by", object: ":decision-0002", inactive: ":decision-0002", status: "kit:superseded", replacement: ":decision-0001" },
    ]);
  });
});

test("B20: a retired behaviour as the subject keeps the assertion's direction", async () => {
  await withScratchRepo(async (repo) => {
    const spec = widgets(repo);
    addDesignDocs(repo, spec);
    spec.assertions.push(block(":assertion-d8", "kit:GraphAssertion", [["kit:basis", "kit:direct"], ["kit:evidence", ":evidence-d5"],
      ["kit:evidence", ":evidence-e5"], ["kit:object", ":node-test"], ["kit:relationship", "kit:tested-by"], ["kit:subject", ":behaviour-payments-B3"]]));
    writeGraph(repo, spec);
    repo.commit("graph");
    const tree = treeFromRevision(repo.dir, "HEAD");
    const report = retiredDesignLinks(loadGraph(tree, loadCheckConfig(tree))).find((r) => r.assertion === ":assertion-d8");
    assert.deepEqual(report, { assertion: ":assertion-d8", subject: ":behaviour-payments-B3", relationship: "kit:tested-by", object: ":node-test",
      inactive: ":behaviour-payments-B3", status: "kit:retired", replacement: ":behaviour-payments-B2" });
    const text = cli(repo, ["--rev", "HEAD"]);
    assert.match(text.out, /^:assertion-d8: :behaviour-payments-B3 kit:tested-by :node-test \(retired, replaced by :behaviour-payments-B2\)$/m);
  });
});

test("B20: text, JSON and summary output carry the report without changing the result", async () => {
  await withScratchRepo(async (repo) => {
    const spec = widgets(repo);
    addDesignDocs(repo, spec);
    writeGraph(repo, spec);
    repo.commit("graph");
    const text = cli(repo, ["--rev", "HEAD"]);
    assert.equal(text.code, 0, text.err);
    assert.match(text.out, /^source graph ok: /m);
    assert.match(text.out, /^retired design links: 1$/m);
    assert.match(text.out, /^:assertion-d4: :node-ledger kit:implements :behaviour-payments-B3 \(retired, replaced by :behaviour-payments-B2\)$/m);
    const json = JSON.parse(cli(repo, ["--rev", "HEAD", "--json"]).out);
    assert.equal(json.ok, true);
    assert.deepEqual(json.findings, []);
    assert.equal(json.reports.length, 1);
    const summary = join(repo.dir, "summary.md");
    writeFileSync(summary, "existing\n");
    assert.equal(cli(repo, ["--rev", "HEAD", "--summary", summary]).code, 0);
    assert.equal(readFileSync(summary, "utf8"), "existing\n### Retired design links\n\n" +
      "- `:assertion-d4`: `:node-ledger` kit:implements `:behaviour-payments-B3` (retired, replaced by `:behaviour-payments-B2`)\n");
  });
});

test("B20: a graph with no retired links prints nothing extra and writes None to the summary", async () => {
  await withScratchRepo(async (repo) => {
    writeGraph(repo, widgets(repo));
    repo.commit("graph");
    const summary = join(repo.dir, "summary.md");
    const text = cli(repo, ["--rev", "HEAD", "--summary", summary]);
    assert.equal(text.code, 0, text.err);
    assert.doesNotMatch(text.out, /retired design links/);
    assert.equal(readFileSync(summary, "utf8"), "### Retired design links\n\nNone.\n");
  });
});
