import { test } from "node:test";
import assert from "node:assert/strict";
import { collectGraphNamingInput, readPermission } from "./graph-naming-github.mjs";

const BASE = "c".repeat(40), HEAD = "a".repeat(40);
const config = { ontologyPath: "docs/ontology.md", sourceGraph: { root: "g" } };
const pull = { number: 7, head: { sha: HEAD }, base: { sha: BASE }, changed_files: 1 };
const entry = (path, sha) => ({ path, type: "blob", sha });
const trees = {
  [BASE]: { truncated: false, tree: [entry("g/nodes.ttl", "s1"), entry("g/graph-schema.ttl", "s0"), entry("docs/ontology.md", "s2"), entry("docs/ontology.ttl", "s3"), entry("src/a.cs", "s9")] },
  [HEAD]: { truncated: false, tree: [entry("g/nodes.ttl", "s4"), entry("g/more/extra.ttl", "s5"), entry("g/README.md", "s6"), entry("g/graph-schema.ttl", "s0"), entry("docs/ontology.md", "s7"), entry("docs/ontology.ttl", "s8")] },
};
const blobs = { s1: "base nodes", s2: "base md", s3: "base ttl", s4: "head nodes", s5: "head extra", s7: "head md", s8: "head ttl" };
function client({ files, trees: t = trees }) {
  const calls = [];
  return { calls,
    async getAll(path) { calls.push(path); if (path === "/pulls/7/files?per_page=100") return files; throw new Error(`unexpected ${path}`); },
    async get(path) {
      calls.push(path);
      const tree = /^\/git\/trees\/([0-9a-f]{40})\?recursive=1$/.exec(path);
      if (tree) return t[tree[1]];
      const blob = /^\/git\/blobs\/(\w+)$/.exec(path);
      if (blob) return { encoding: "base64", content: Buffer.from(blobs[blob[1]]).toString("base64") };
      throw new Error(`unexpected ${path}`);
    } };
}

test("B31: a pull request that touches no graph Turtle or ontology file is unchanged and fetches nothing else", async () => {
  const c = client({ files: [{ filename: "src/a.cs" }, { filename: "g/README.md" }] });
  assert.deepEqual(await collectGraphNamingInput(c, { ...pull, changed_files: 2 }, config), { changed: false, incomplete: false, base: null, head: null });
  assert.deepEqual(c.calls, ["/pulls/7/files?per_page=100"]);
});

test("B32: snapshots hold the graph Turtle except the schema, and both ontology files, as text", async () => {
  for (const filename of ["g/nodes.ttl", "docs/ontology.md", "docs/ontology.ttl", "g/more/extra.ttl"]) {
    const input = await collectGraphNamingInput(client({ files: [{ filename }] }), pull, config);
    assert.equal(input.changed, true, filename);
    assert.deepEqual(input.base, { files: [{ path: "g/nodes.ttl", text: "base nodes" }], markdown: "base md", turtle: "base ttl" });
    assert.deepEqual(input.head, { files: [{ path: "g/more/extra.ttl", text: "head extra" }, { path: "g/nodes.ttl", text: "head nodes" }], markdown: "head md", turtle: "head ttl" });
  }
});

test("an incomplete file listing is treated as changed and marked incomplete", async () => {
  const input = await collectGraphNamingInput(client({ files: [{ filename: "src/a.cs" }] }), { ...pull, changed_files: 3 }, config);
  assert.deepEqual([input.changed, input.incomplete], [true, true]);
});

test("a base without graph or ontology yields empty content; a head without the ontology fails", async () => {
  const noBase = { ...trees, [BASE]: { truncated: false, tree: [entry("src/a.cs", "s9")] } };
  assert.deepEqual((await collectGraphNamingInput(client({ files: [{ filename: "g/nodes.ttl" }], trees: noBase }), pull, config)).base, { files: [], markdown: null, turtle: null });
  const noHead = { ...trees, [HEAD]: { truncated: false, tree: [entry("g/nodes.ttl", "s4")] } };
  await assert.rejects(collectGraphNamingInput(client({ files: [{ filename: "g/nodes.ttl" }], trees: noHead }), pull, config), /proposed ontology is missing/);
});

test("a truncated tree listing fails rather than reviewing part of the graph", async () => {
  const truncated = { ...trees, [HEAD]: { ...trees[HEAD], truncated: true } };
  await assert.rejects(collectGraphNamingInput(client({ files: [{ filename: "g/nodes.ttl" }], trees: truncated }), pull, config), /tree listing is truncated/);
});

test("B42: readPermission returns the role name, null for no role or no login, and rethrows other errors", async () => {
  const c = (get) => ({ get });
  assert.equal(await readPermission(c(async (path) => { assert.equal(path, "/collaborators/a%20b/permission"); return { role_name: "maintain" }; }), "a b"), "maintain");
  assert.equal(await readPermission(c(async () => { throw new Error("GitHub API GET returned 404 for /x"); }), "x"), null);
  await assert.rejects(readPermission(c(async () => { throw new Error("GitHub API GET returned 500 for /x"); }), "x"), /500/);
  assert.equal(await readPermission(c(async () => { throw new Error("must not be called"); }), ""), null);
});
