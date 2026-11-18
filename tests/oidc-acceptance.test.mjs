// Acceptance tests for feature #92 (docs/features/oidc-token-provider-for-model-reviewers/).
// Each test installs the kit into a scratch repository and runs the INSTALLED scripts over real
// HTTP against a local stand-in for the token endpoint and the model gateway. Nothing here calls
// the real gateway or Keycloak.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { install } from "../bin/install-ontology.mjs";
import { withTempRepo } from "./helpers/temp-repo.mjs";

const KIT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SECRET = "acceptance-secret-value";
const OIDC_KEYS = ["ONTOLOGY_OIDC_TOKEN_URL", "ONTOLOGY_OIDC_CLIENT_ID", "ONTOLOGY_OIDC_CLIENT_SECRET",
  "ONTOLOGY_LLM_API_KEY"];

async function listen(handler) {
  const server = createServer(handler);
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

// A stand-in for the identity provider and the gateway. `expiresIn` controls token lifetime;
// `rejectFirstToken` makes the gateway answer 401 once for the first token it ever issued.
async function stage({ expiresIn = 300, rejectFirstToken = false, tokenStatus = 200 } = {}) {
  const state = { tokenCalls: [], modelCalls: [], issued: 0 };
  const kc = await listen((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      state.tokenCalls.push({ auth: req.headers.authorization, type: req.headers["content-type"], body });
      if (tokenStatus !== 200) { res.statusCode = tokenStatus; res.end("LEAK-TOKEN-BODY"); return; }
      state.issued += 1;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ access_token: `jwt-${state.issued}`, expires_in: expiresIn }));
    });
  });
  const gateway = await listen((req, res) => {
    req.resume();
    req.on("end", () => {
      const bearer = req.headers.authorization ?? null;
      state.modelCalls.push(bearer);
      if (rejectFirstToken && bearer === "Bearer jwt-1") { res.statusCode = 401; res.end("{}"); return; }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ findings: [] }) } }] }));
    });
  });
  return { state, kc, gateway,
    env: { ONTOLOGY_OIDC_TOKEN_URL: `${kc.url}/token`, ONTOLOGY_OIDC_CLIENT_ID: "litellm-ci",
      ONTOLOGY_OIDC_CLIENT_SECRET: SECRET },
    close: () => { kc.server.close(); gateway.server.close(); } };
}

async function withEnv(values, body) {
  const saved = Object.fromEntries(OIDC_KEYS.map((key) => [key, process.env[key]]));
  for (const key of OIDC_KEYS) delete process.env[key];
  Object.assign(process.env, values);
  try { return await body(); } finally {
    for (const key of OIDC_KEYS) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  }
}

const installed = async (repo, path) => import(pathToFileURL(join(repo.dir, "scripts", path)).href);
const read = (path) => readFileSync(join(KIT, path), "utf8");

test("B1 B2 B5 the drift reviewer reaches the gateway with a JWT and no static key", async () => {
  const s = await stage();
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withDriftReview: true });
      const { modelJson } = await installed(repo, "review-ontology-drift.mjs");
      await withEnv(s.env, async () => {
        await modelJson(`${s.gateway.url}/chat/completions`, { method: "POST", body: "{}" });
      });
    });
    assert.equal(s.state.tokenCalls.length, 1);
    const call = s.state.tokenCalls[0];
    assert.equal(call.body, "grant_type=client_credentials");
    assert.match(call.type, /application\/x-www-form-urlencoded/);
    assert.equal(call.auth, `Basic ${Buffer.from(`litellm-ci:${SECRET}`).toString("base64")}`);
    assert.deepEqual(s.state.modelCalls, ["Bearer jwt-1"]);
  } finally { s.close(); }
});

test("B4 B2 the semantic reviewer reaches the gateway with a JWT", async () => {
  const s = await stage();
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
      const { reviewFiles } = await installed(repo, "semantic-review-model.mjs");
      const { createModelAuth } = await installed(repo, "llm-auth.mjs");
      const auth = createModelAuth({ env: s.env, staticKeyVar: "ONTOLOGY_SEMANTIC_LLM_API_KEY" });
      const result = await reviewFiles({ files: [{ path: "docs/a.md", text: "plain prose" }],
        ontologyText: "## Entities\n\n| Name | Description |\n| --- | --- |\n| `Invoice` | bill |",
        sections: { required: ["Entities"], optional: [] }, model: "ontology-review",
        baseUrl: s.gateway.url, auth, headSha: "a".repeat(40) });
      assert.deepEqual(result.reviewed, ["docs/a.md"]);
    });
    assert.deepEqual(s.state.modelCalls, ["Bearer jwt-1"]);
  } finally { s.close(); }
});

test("B14 a token is reused while fresh and replaced once it is within 60 seconds of expiry", async () => {
  const s = await stage({ expiresIn: 61 });
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withDriftReview: true });
      const { modelJson } = await installed(repo, "review-ontology-drift.mjs");
      await withEnv(s.env, async () => {
        const url = `${s.gateway.url}/chat/completions`;
        await Promise.all([modelJson(url, { method: "POST" }), modelJson(url, { method: "POST" })]);
        assert.equal(s.state.tokenCalls.length, 1);
        await new Promise((done) => setTimeout(done, 1150));
        await modelJson(url, { method: "POST" });
      });
    });
    assert.equal(s.state.tokenCalls.length, 2);
    assert.equal(s.state.modelCalls.at(-1), "Bearer jwt-2");
  } finally { s.close(); }
});

test("B3 a 401 from the gateway fetches a fresh token and retries exactly once", async () => {
  const s = await stage({ rejectFirstToken: true });
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withDriftReview: true });
      const { modelJson } = await installed(repo, "review-ontology-drift.mjs");
      await withEnv(s.env, async () => {
        await modelJson(`${s.gateway.url}/chat/completions`, { method: "POST" });
      });
    });
    assert.deepEqual(s.state.modelCalls, ["Bearer jwt-1", "Bearer jwt-2"]);
    assert.equal(s.state.tokenCalls.length, 2);
  } finally { s.close(); }
});

test("B8 B9 B10 the static key still works, no credential sends no header, and OIDC wins", async () => {
  const s = await stage();
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withDriftReview: true });
      const { modelJson } = await installed(repo, "review-ontology-drift.mjs");
      const url = `${s.gateway.url}/chat/completions`;
      await withEnv({ ONTOLOGY_LLM_API_KEY: "static-key" }, () => modelJson(url, { method: "POST" }));
      await withEnv({}, () => modelJson(url, { method: "POST" }));
      await withEnv({ ...s.env, ONTOLOGY_LLM_API_KEY: "static-key" }, () => modelJson(url, { method: "POST" }));
    });
    assert.deepEqual(s.state.modelCalls, ["Bearer static-key", null, "Bearer jwt-1"]);
    assert.equal(s.state.tokenCalls.length, 1);
  } finally { s.close(); }
});

test("B11 a partial OIDC set fails before any network call and names variables, not values", async () => {
  const s = await stage();
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withDriftReview: true });
      const { modelJson } = await installed(repo, "review-ontology-drift.mjs");
      await withEnv({ ONTOLOGY_OIDC_CLIENT_SECRET: SECRET, ONTOLOGY_LLM_API_KEY: "static-key" }, async () => {
        await assert.rejects(modelJson(`${s.gateway.url}/x`, { method: "POST" }), (error) =>
          /ONTOLOGY_OIDC_TOKEN_URL/.test(error.message) && /ONTOLOGY_OIDC_CLIENT_ID/.test(error.message)
          && !error.message.includes(SECRET) && !error.message.includes("static-key"));
      });
    });
    assert.equal(s.state.tokenCalls.length + s.state.modelCalls.length, 0);
  } finally { s.close(); }
});

test("B12 B13 a failing token endpoint surfaces its status only, never its body or the secret", async () => {
  const s = await stage({ tokenStatus: 503 });
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withDriftReview: true });
      const { modelJson } = await installed(repo, "review-ontology-drift.mjs");
      await withEnv(s.env, async () => {
        await assert.rejects(modelJson(`${s.gateway.url}/x`, { method: "POST" }), (error) =>
          /503/.test(error.message) && !error.message.includes("LEAK-TOKEN-BODY")
          && !error.message.includes(SECRET) && !String(error.stack).includes(SECRET));
      });
    });
    assert.equal(s.state.modelCalls.length, 0);
  } finally { s.close(); }
});

test("B6 B7 the installed workflows map the shared secret and accept either authentication mode", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withDriftReview: true, withSemanticReview: true });
    for (const name of ["ontology-drift-review.yml", "ontology-semantic-review.yml"]) {
      const yaml = readFileSync(join(repo.dir, ".github/workflows", name), "utf8");
      assert.match(yaml, /ONTOLOGY_OIDC_CLIENT_SECRET: \$\{\{ secrets\.KEYCLOAK_CLIENT_SECRET \}\}/, name);
      assert.match(yaml, /vars\.ONTOLOGY_OIDC_TOKEN_URL/, name);
      assert.match(yaml, /vars\.ONTOLOGY_OIDC_CLIENT_ID/, name);
    }
    const drift = readFileSync(join(repo.dir, ".github/workflows/ontology-drift-review.yml"), "utf8");
    assert.match(drift, /OIDC settings are incomplete/);
    assert.match(drift, /no model credential/);
    const semantic = readFileSync(join(repo.dir, ".github/workflows/ontology-semantic-review.yml"), "utf8");
    assert.match(semantic, /name: ontology-semantic-review/);
  });
});

test("B15 the installed runbooks state the gateway values and the secret mapping", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withDriftReview: true, withSemanticReview: true });
    const drift = readFileSync(join(repo.dir, "docs/ontology-drift-review.md"), "utf8");
    for (const expected of ["https://gateway.tqaentry.com/v1", "ontology-review", "litellm-ci",
      "https://auth.tqaentry.com/realms/homelab/protocol/openid-connect/token", "KEYCLOAK_CLIENT_SECRET",
      "ONTOLOGY_OIDC_CLIENT_SECRET"]) assert.ok(drift.includes(expected), `drift runbook lacks ${expected}`);
    const semantic = readFileSync(join(repo.dir, "docs/ontology-semantic-review.md"), "utf8");
    for (const expected of ["KEYCLOAK_CLIENT_SECRET", "ontology-semantic-review", "ONTOLOGY_OIDC_TOKEN_URL"]) {
      assert.ok(semantic.includes(expected), `semantic runbook lacks ${expected}`);
    }
  });
});

test("B16 the installed auth scripts are byte-identical to the templates and hold no repository value", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withDriftReview: true, withSemanticReview: true });
    for (const file of ["llm-auth.mjs", "llm-auth.test.mjs", "review-ontology-drift.mjs",
      "semantic-review-model.mjs", "semantic-review-worker.mjs"]) {
      assert.equal(readFileSync(join(repo.dir, "scripts", file), "utf8"), read(`templates/scripts/${file}`), file);
    }
    const auth = read("templates/scripts/llm-auth.mjs");
    for (const forbidden of ["tqaentry", "litellm", "homelab", "Widgets"]) {
      assert.equal(auth.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
    }
  });
});
