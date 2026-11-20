import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { withTempRepo } from "./helpers/temp-repo.mjs";
import { resolveIndexContext, listIndexEntries, readIndexPassages, hasIndexEdits, verifyIndexSource } from
  "../templates/scripts/semantic-index-source.mjs";

const policy = {
  enabled: true,
  scope: { include: ["src/"], exclude: ["src/private/"] },
  embedding: { endpoint: "https://owner.test/v1/embeddings", model: "pilot", revision: "r1", dimensions: 2 },
};

test("B9 and B15 separate owner policy from the source commit and dirty content", async () => {
  await withTempRepo(async (repo) => {
    repo.write("ontology.config.json", JSON.stringify({ ontologyPath: "docs/ontology.md", semanticIndex: policy }));
    repo.write("docs/ontology.md", "# Ontology\n");
    repo.write("src/allowed.txt", "stable\nsecond\n");
    repo.write("src/private/secret.txt", "secret\n");
    repo.write("src/binary.dat", "a\0b");
    repo.git("add", ".");
    const linkBlob = repo.git("hash-object", "-w", "src/private/secret.txt").trim();
    repo.git("update-index", "--add", "--cacheinfo", "120000," + linkBlob + ",src/link");
    repo.git("commit", "-qm", "owner configuration and source");
    const policyCommit = repo.git("rev-parse", "HEAD").trim();
    repo.git("update-ref", "refs/remotes/origin/main", policyCommit);
    repo.git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
    repo.git("switch", "-qc", "topic");
    const branchPolicy = { ...policy, embedding: { ...policy.embedding, endpoint: "https://other.test/v1/embeddings" } };
    repo.write("ontology.config.json", JSON.stringify({ ontologyPath: "docs/ontology.md", semanticIndex: branchPolicy }));
    repo.git("add", "ontology.config.json");
    repo.git("commit", "-qm", "feature branch policy edit");
    repo.write("src/allowed.txt", "dirty\n");
    repo.write("src/untracked.txt", "new file\n");

    const context = resolveIndexContext(repo.dir, {});
    assert.equal(context.configurationCommit, policyCommit);
    assert.equal(context.sourceTree.id, repo.git("rev-parse", "HEAD").trim());
    assert.equal(context.policy.embedding.endpoint, policy.embedding.endpoint);
    const entries = listIndexEntries(context.sourceTree, context.policy.scope);
    assert.deepEqual(entries.map((entry) => entry.path), ["src/allowed.txt", "src/binary.dat"]);
    assert.deepEqual(readIndexPassages(context.sourceTree, entries[1]), []);
    const [passage] = readIndexPassages(context.sourceTree, entries[0]);
    assert.deepEqual([passage.text, passage.startLine, passage.endLine, passage.position], ["stable\nsecond\n", 1, 2, 0]);
    assert.equal(hasIndexEdits(context), true);
  });
});

test("B9 and B15 bound committed text and validate the complete passage inventory", async () => {
  await withTempRepo(async ({ dir, write, git }) => {
    write("ontology.config.json", JSON.stringify({ ontologyPath: "docs/ontology.md", semanticIndex: policy }));
    write("docs/ontology.md", "# Ontology\n");
    const long = "a".repeat(2047) + "é\n";
    write("src/long.txt", long);
    write("src/blank.txt", " \n");
    write("src-other/other.txt", "outside normal prefix\n");
    write("src/private/secret.txt", "secret\n");
    writeFileSync(join(dir, "src/bad.txt"), Buffer.from([0xff]));
    git("add", ".");
    git("commit", "-qm", "source");
    const first = git("rev-parse", "HEAD").trim();
    git("update-index", "--add", "--cacheinfo", `160000,${first},src/submodule`);
    git("commit", "-qm", "gitlink");
    const context = resolveIndexContext(dir, { ONTOLOGY_INDEX_CONFIG_REF: first });
    const entries = listIndexEntries(context.sourceTree, context.policy.scope);
    assert.deepEqual(entries.map(({ path }) => path), ["src/bad.txt", "src/blank.txt", "src/long.txt"]);
    const records = entries.flatMap((entry) => readIndexPassages(context.sourceTree, entry));
    assert.deepEqual(records.map(({ startLine, endLine, position, text }) => [startLine, endLine, position, text]),
      [[1, 1, 0, "a".repeat(2047)], [1, 1, 1, "é\n"]]);
    await verifyIndexSource(context.sourceTree, context.policy.scope, records);
    for (const tampered of [[records[0]], [{ ...records[0], endLine: 2 }, records[1]],
      [records[0], records[0]], [...records, { ...records[0], path: "src/private/secret.txt" }]]) {
      await assert.rejects(verifyIndexSource(context.sourceTree, context.policy.scope, tampered), /source references/);
    }
    assert.deepEqual(entries.flatMap((entry) => readIndexPassages(context.sourceTree, entry)), records);
    write("src/long.txt", "staged\n");
    git("add", "src/long.txt");
    write("src/long.txt", long);
    assert.equal(hasIndexEdits(context), true);
    assert.throws(() => context.sourceTree.readBounded("src/long.txt", 1024), /read limit/);
  });
});
