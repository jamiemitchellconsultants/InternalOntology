import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTree, loadCheckConfig, CheckSetupError } from "./check-source-graph.mjs";
import { treeFromRevision } from "./source-graph-git.mjs";
import { withScratchRepo, widgets, writeGraph, find, setPair, dropPair, block, S, ttl, blobId, ROOT } from "./source-graph-test-helpers.mjs";

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
  ["schema-version", (s) => { s.version = 2; }],
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

import { checkPullRequest, checkRevision, main } from "./check-source-graph.mjs";
import { refreshIdFor } from "./source-graph-model.mjs";
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
