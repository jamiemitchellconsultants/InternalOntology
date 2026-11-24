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

test("E6: a missing line bound gives a range message without NaN", async () => {
  for (const key of ["kit:startLine", "kit:endLine"]) {
    const findings = await run((s) => dropPair(find(s.evidence, ":evidence-e1"), key));
    const f = findings.find((x) => x.rule === "evidence-range" && x.subject === ":evidence-e1");
    assert.ok(f, key);
    assert.match(f.message, /^src\/\S+ has no valid line range$/, f.message);
  }
});

test("B22: a version 1 manifest that uses no version 2 value passes against the version 2 schema", async () => {
  assert.deepEqual(await run((s) => { assert.equal(s.version, 1); }), []);
});

test("B2: the version 2 design fixture has no schema-version or schema-version-too-old findings", async () => {
  const findings = await design((s) => { assert.equal(s.version, 2); });
  for (const rule of ["schema-version", "schema-version-too-old"]) assert.ok(!has(findings, rule), rule);
});

test("B1: the too-old scan uses the lowest valid manifest version, whichever manifest comes first", async () => {
  for (const iri of [":aaa-graph", ":zzz-graph"]) {
    const findings = await run((s) => {
      s.version = 2;
      s.coverage.push(block(iri, "kit:SourceKnowledgeGraph", [["kit:schemaVersion", 1]]));
      setPair(find(s.assertions, ":assertion-a5"), "kit:relationship", "kit:replaced-by");
    });
    assert.ok(has(findings, "schema-version-too-old", ":assertion-a5"), `${iri}: ${JSON.stringify(findings)}`);
  }
});

test("B3: a version 1 node carrying the same version 2 value twice gets one message per value", async () => {
  const findings = await run((s) => {
    s.nodes.push(block(":behaviour-widgets-B1", "kit:GraphNode", [["kit:designStatus", "kit:current"], ["kit:designStatus", "kit:current"],
      ["kit:kind", "kit:behaviour"], ["kit:kind", "kit:behaviour"], ["rdfs:label", S("widgets#B1 Post an invoice")]]));
  });
  const messages = findings.filter((f) => f.rule === "schema-version-too-old" && f.subject === ":behaviour-widgets-B1").map((f) => f.message).sort();
  assert.deepEqual(messages, ["kit:behaviour needs kit:schemaVersion 2", "kit:current needs kit:schemaVersion 2", "kit:designStatus needs kit:schemaVersion 2"]);
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
  for (const rule of ["design-status", "design-evidence", "schema-version-too-old", "dangling-reference", "bad-value", "unknown-kind"]) assert.ok(!ok.has(rule), rule);
  const decision = (pairs) => run((s) => { s.version = 2; s.nodes.push(block(":decision-widgets", "kit:GraphNode", [["kit:kind", "kit:decision"], ["rdfs:label", S("ADR 0001 X")], ...pairs])); });
  assert.ok(!rulesOf(await decision([["kit:designStatus", "kit:accepted"], ["kit:evidence", ":evidence-e4"]])).has("design-status"), "decision accepts kit:accepted");
  assert.ok(rulesOf(await decision([["kit:designStatus", "kit:current"], ["kit:evidence", ":evidence-e4"]])).has("design-status"), "decision rejects kit:current");
  assert.ok((await shaped([["kit:designStatus", "kit:current"], ["kit:designStatus", "kit:retired"], ["kit:evidence", ":evidence-e4"]])).has("design-status"), "two statuses");
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
  assert.equal(hits[0].subject, "");
  assert.equal(hits[0].file, "docs/features/payments/02-behaviours.md");
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

test("B6: an evidence item without a start line gives a message with no NaN", async () => {
  const behaviour = (await design((s) => { dropPair(find(s.evidence, ":evidence-d1"), "kit:startLine"); })).find((f) => f.rule === "design-undeclared" && f.subject === ":behaviour-payments-B1");
  assert.equal(behaviour?.message, `${LITE} does not declare B1`);
  for (const pair of ["kit:startLine", "kit:endLine"]) {
    const findings = await design((s) => { dropPair(find(s.evidence, ":evidence-d4"), pair); });
    const decision = findings.find((f) => f.rule === "design-undeclared" && f.subject === ":decision-0001");
    assert.equal(decision?.message, `${ADR1} does not declare ADR 0001 on its title and Status lines`, pair);
    assert.ok(!findings.some((f) => f.rule.startsWith("design-") && f.message.includes("NaN")), pair);
  }
});

test("B19: a decision number with more than one ADR file is undeclared and names every file", async () => {
  const findings = await design((s, r) => { r.write("docs/adr/0001-zzz-duplicate.md", "# 0001 — Duplicate\n\n- **Status:** accepted\n"); });
  const hit = findings.find((f) => f.rule === "design-undeclared" && f.subject === ":decision-0001");
  assert.equal(hit?.message, `ADR 0001 has more than one file: ${ADR1}, docs/adr/0001-zzz-duplicate.md`);
});

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

test("B10: replacement link messages state the expectation and the count", async () => {
  const message = async (subject, mutate) => (await design(mutate)).find((f) => f.rule === "design-replacement" && f.subject === subject)?.message;
  assert.equal(await message(":behaviour-payments-B3", (s) => { s.assertions = s.assertions.filter((a) => a.subject !== ":assertion-d1"); }),
    ":behaviour-payments-B3 expects kit:replaced-by :behaviour-payments-B2");
  assert.equal(await message(":behaviour-payments-B1", (s) => { s.assertions.push(linkOf("x0", ":behaviour-payments-B1", "kit:replaced-by", ":behaviour-payments-B2")); }),
    ":behaviour-payments-B1 has kit:replaced-by :behaviour-payments-B2 that its document does not name");
  assert.equal(await message(":behaviour-payments-B3", (s) => { s.assertions.push(linkOf("x3", ":behaviour-payments-B3", "kit:replaced-by", ":behaviour-payments-B2")); }),
    ":behaviour-payments-B3 has 2 kit:replaced-by links; expects exactly one to :behaviour-payments-B2");
  assert.equal(await message(":behaviour-payments-B1", (s) => {
    s.assertions.push(linkOf("x4", ":behaviour-payments-B1", "kit:replaced-by", ":behaviour-payments-B2"), linkOf("x5", ":behaviour-payments-B1", "kit:replaced-by", ":behaviour-payments-B3")); }),
    ":behaviour-payments-B1 has 2 kit:replaced-by links; expects none");
});

test("B10: a superseded decision that names no successor needs no link and a stray link on an earlier failure is silent", async () => {
  assert.deepEqual(await design((s, r) => {
    rewriteDoc(r, s, ADR2, DESIGN_ADRS[ADR2].replace("superseded by ADR 0001", "superseded"));
    s.assertions = s.assertions.filter((a) => a.subject !== ":assertion-d2");
  }), []);
  const findings = await design((s) => {
    setPair(find(s.nodes, ":behaviour-payments-B1"), "rdfs:label", S("payments#B1 Pay invoice"));
    s.assertions.push(linkOf("x6", ":behaviour-payments-B1", "kit:replaced-by", ":behaviour-payments-B2"));
  });
  assert.ok(has(findings, "design-label", ":behaviour-payments-B1"));
  assert.ok(!has(findings, "design-replacement", ":behaviour-payments-B1"), JSON.stringify(findings));
});

test("B10: kit:superseded-by to a non-decision object gives design-link-kinds", async () => {
  const findings = await design((s) => { s.assertions.push(linkOf("x7", ":decision-0001", "kit:superseded-by", ":node-ledger")); });
  assert.ok(has(findings, "design-link-kinds", ":assertion-x7"), JSON.stringify(findings));
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

test("B15: a graph with no design nodes and no reports writes no summary", async () => {
  await withScratchRepo(async (repo) => {
    writeGraph(repo, widgets(repo));
    repo.commit("graph");
    const summary = join(repo.dir, "summary.md");
    writeFileSync(summary, "untouched\n");
    const text = cli(repo, ["--rev", "HEAD", "--summary", summary]);
    assert.equal(text.code, 0, text.err);
    assert.doesNotMatch(text.out, /retired design links/);
    assert.equal(readFileSync(summary, "utf8"), "untouched\n");
  });
});

test("B15: a design graph with no reports writes None to the summary", async () => {
  await withScratchRepo(async (repo) => {
    const spec = widgets(repo);
    addDesignDocs(repo, spec);
    spec.assertions = spec.assertions.filter((a) => a.subject !== ":assertion-d4");
    writeGraph(repo, spec);
    repo.commit("graph");
    const summary = join(repo.dir, "summary.md");
    const run1 = cli(repo, ["--rev", "HEAD", "--summary", summary]);
    assert.equal(run1.code, 0, run1.err);
    assert.equal(readFileSync(summary, "utf8"), "### Retired design links\n\nNone.\n");
  });
});

test("B13: a summary that cannot be written is reported and the exit code follows the findings alone", async () => {
  await withScratchRepo(async (repo) => {
    const spec = widgets(repo);
    addDesignDocs(repo, spec);
    writeGraph(repo, spec);
    repo.commit("graph");
    const result = cli(repo, ["--rev", "HEAD", "--summary", join(repo.dir, "missing-dir", "summary.md")]);
    assert.equal(result.code, 0);
    assert.match(result.err, /^could not write summary: .+$/m);
  });
});

test("B14: an empty --summary value writes nothing and is not an error; a missing value is exit 2", async () => {
  await withScratchRepo(async (repo) => {
    const spec = widgets(repo);
    addDesignDocs(repo, spec);
    writeGraph(repo, spec);
    repo.commit("graph");
    const empty = cli(repo, ["--rev", "HEAD", "--summary", ""]);
    assert.equal(empty.code, 0, empty.err);
    assert.equal(empty.err, "");
    assert.equal(cli(repo, ["--rev", "HEAD", "--summary"]).code, 2);
  });
});

test("B16: a deprecated decision is reported with status kit:deprecated", async () => {
  await withScratchRepo(async (repo) => {
    const spec = widgets(repo);
    addDesignDocs(repo, spec);
    rewriteDoc(repo, spec, ADR1, DESIGN_ADRS[ADR1].replace("- **Status:** accepted", "- **Status:** deprecated"));
    setPair(find(spec.nodes, ":decision-0001"), "kit:designStatus", "kit:deprecated");
    writeGraph(repo, spec);
    repo.commit("graph");
    const tree = treeFromRevision(repo.dir, "HEAD");
    const report = retiredDesignLinks(loadGraph(tree, loadCheckConfig(tree))).find((r) => r.assertion === ":assertion-d6");
    assert.equal(report?.status, "kit:deprecated");
    assert.equal(report?.inactive, ":decision-0001");
    assert.equal(report?.replacement, null);
  });
});

test("B16: failing findings plus reports exit 1 and still print the reports", async () => {
  await withScratchRepo(async (repo) => {
    const spec = widgets(repo);
    addDesignDocs(repo, spec);
    setPair(find(spec.nodes, ":behaviour-payments-B1"), "rdfs:label", S("payments#B1 Pay invoice"));
    writeGraph(repo, spec);
    repo.commit("graph");
    const result = cli(repo, ["--rev", "HEAD"]);
    assert.equal(result.code, 1);
    assert.match(result.err, /design-label/);
    assert.match(result.out, /^retired design links: 1$/m);
    assert.match(result.out, /^:assertion-d4: /m);
  });
});

test("B17: a node with several replacement links reports the first by assertion IRI", async () => {
  await withScratchRepo(async (repo) => {
    const spec = widgets(repo);
    addDesignDocs(repo, spec);
    spec.assertions.push(linkOf("c9", ":behaviour-payments-B3", "kit:replaced-by", ":behaviour-payments-B1"));
    writeGraph(repo, spec);
    repo.commit("graph");
    const tree = treeFromRevision(repo.dir, "HEAD");
    const report = retiredDesignLinks(loadGraph(tree, loadCheckConfig(tree))).find((r) => r.assertion === ":assertion-d4");
    assert.equal(report?.replacement, ":behaviour-payments-B1");
  });
});

test("B12: --json findings and reports equal checkRevision and retiredDesignLinks", async () => {
  await withScratchRepo(async (repo) => {
    const spec = widgets(repo);
    addDesignDocs(repo, spec);
    writeGraph(repo, spec);
    repo.commit("graph");
    const tree = treeFromRevision(repo.dir, "HEAD"), config = loadCheckConfig(tree);
    const json = JSON.parse(cli(repo, ["--rev", "HEAD", "--json"]).out);
    assert.deepEqual(json.findings, checkRevision(tree));
    assert.deepEqual(json.reports, retiredDesignLinks(loadGraph(tree, config)));
  });
});

test("B20: rewriteDoc gives every evidence item citing the file, and its refresh record, the new blob ID", async () => {
  await withScratchRepo(async (repo) => {
    const spec = widgets(repo);
    addDesignDocs(repo, spec);
    const cites = (b, path) => b.pairs.some((p) => p.predicate === "kit:path" && p.object === path);
    const before = spec.evidence.filter((e) => cites(e, LITE)).map((e) => e.subject);
    assert.ok(before.length > 1, "the lite feature file is cited more than once");
    rewriteDoc(repo, spec, LITE, DESIGN_FEATURE + "\nAn extra line.\n");
    const expected = blobId(repo.dir, LITE);
    const blobOf = (b) => b.pairs.find((p) => p.predicate === "kit:blobId")?.object;
    const cited = spec.evidence.filter((e) => cites(e, LITE));
    assert.deepEqual(cited.map((e) => e.subject), before);
    for (const e of cited) assert.equal(blobOf(e), expected, e.subject);
    const record = spec.records.filter((r) => cites(r, LITE));
    assert.equal(record.length, 1);
    assert.equal(blobOf(record[0]), expected);
    for (const e of spec.evidence.filter((x) => !cites(x, LITE))) assert.notEqual(blobOf(e), expected, e.subject);
  });
});
