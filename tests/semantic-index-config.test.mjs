import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_RESPONSE_CAP, validateConfig } from "../templates/scripts/ontology-config.mjs";

const base = { ontologyPath: "docs/ontology.md", sections: { required: [], optional: [] } };
const policy = {
  enabled: true,
  scope: { include: ["src/", "docs/ontology.md", "src/"], exclude: ["src/private/"] },
  embedding: { endpoint: "http://127.0.0.1:11434/v1/embeddings", model: "pilot", revision: "r1", dimensions: 2 },
};
const parse = (raw) => validateConfig(raw, { ontologyExists: () => true }).semanticIndex;

test("B13 preserves the disabled and absent cases for core-only installs", () => {
  assert.equal(parse(base), null);
  assert.deepEqual(parse({ ...base, semanticIndex: { enabled: false } }), { enabled: false });
  assert.throws(() => parse({ ...base, semanticIndex: { enabled: true } }), /scope/);
});

test("B14 and B15 normalize purpose prefixes and scope independently of the host", () => {
  const result = parse({ ...base, semanticIndex: policy });
  assert.deepEqual(result.scope, { include: ["docs/ontology.md", "src/"], exclude: ["src/private/"] });
  assert.equal(result.embedding.documentPrefix, "");
  assert.equal(result.embedding.queryPrefix, "");
  assert.equal(result.release, null);
});

test("B16 rejects credentials and endpoint overrides in committed JSON", () => {
  for (const endpoint of ["http://example.test/v1/embeddings", "https://key@example.test/v1/embeddings", "https://example.test/v1/embeddings?token=x"]) {
    assert.throws(() => parse({ ...base, semanticIndex: { ...policy, embedding: { ...policy.embedding, endpoint } } }), /endpoint/);
  }
  assert.throws(() => parse({ ...base, semanticIndex: { ...policy, token: "secret" } }), /unknown key/);
  assert.throws(() => parse({ ...base, semanticIndex: { ...policy, scope: { include: ["src/../private"] } } }), /scope/);
});

test("B13 rejects malformed settings and normalizes GitHub identity", () => {
  const candidate = (value) => parse({ ...base, semanticIndex: { ...policy, ...value } });
  for (const value of [
    { scope: { include: [] } }, { scope: { ...policy.scope, typo: true } },
    { embedding: { ...policy.embedding, revision: "" } }, { embedding: { ...policy.embedding, model: "" } },
    { embedding: { ...policy.embedding, dimensions: 8193 } }, { embedding: { ...policy.embedding, typo: true } },
    { release: { repository: "https://github.com/owner/repo" } },
    { release: { repository: "github.com/owner/repo", publishers: [] } },
    { release: { repository: "github.com/owner/repo", typo: true } },
  ]) assert.throws(() => candidate(value), /semanticIndex/);
  assert.throws(() => parse({ ...base, semanticIndex: { enabled: false, scope: {} } }), /unknown key/);
  const result = candidate({ scope: { include: ["Src/", "src/"] }, release: { repository: "github.com/Owner/Repo", publishers: ["DEV", "dev"] } });
  assert.deepEqual(result.scope.include, ["Src/", "src/"]);
  assert.deepEqual(result.release, { repository: "github.com/owner/repo", publishers: ["dev"] });
});

test("B9 defaults the response cap to 4000 estimated tokens", () => {
  assert.equal(DEFAULT_RESPONSE_CAP, 4000);
  assert.equal(parse({ ...base, semanticIndex: policy }).responseCap, 4000);
  assert.equal(parse({ ...base, semanticIndex: { ...policy, responseCap: 250 } }).responseCap, 250);
});

test("B9 rejects a cap that is not a positive integer and names the setting", () => {
  for (const responseCap of [0, -1, 1.5, "4000", null, true, 2 ** 53]) {
    assert.throws(() => parse({ ...base, semanticIndex: { ...policy, responseCap } }), /semanticIndex\.responseCap must be a positive integer/);
  }
  assert.throws(() => parse({ ...base, semanticIndex: { enabled: false, responseCap: 10 } }), /unknown key/);
});
