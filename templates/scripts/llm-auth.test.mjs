// Ships with the model reviewers. Depends on nothing but the script beside it.

import test from "node:test";
import assert from "node:assert/strict";
import { createModelAuth, authorizedFetch, AuthConfigError, TokenRequestError } from "./llm-auth.mjs";

const OIDC = { ONTOLOGY_OIDC_TOKEN_URL: "https://kc.example/token", ONTOLOGY_OIDC_CLIENT_ID: "cid",
  ONTOLOGY_OIDC_CLIENT_SECRET: "s3cr3t-value" };
const tokenFetch = (bodies) => {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init });
    const b = bodies[Math.min(calls.length - 1, bodies.length - 1)];
    return b instanceof Response ? b : Response.json(b);
  };
  f.calls = calls;
  return f;
};

test("B1 fetches a token with form-encoded client credentials and Basic auth", async () => {
  const f = tokenFetch([{ access_token: "tok1", expires_in: 300 }]);
  const auth = createModelAuth({ env: OIDC, staticKeyVar: "K", fetchImpl: f });
  assert.equal(await auth.getBearer(), "tok1");
  const { url, init } = f.calls[0];
  assert.equal(url, OIDC.ONTOLOGY_OIDC_TOKEN_URL);
  assert.equal(init.method, "POST");
  assert.equal(String(init.body), "grant_type=client_credentials");
  assert.equal(init.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.equal(init.headers.Authorization, `Basic ${Buffer.from("cid:s3cr3t-value").toString("base64")}`);
});

test("B14 caches until 60 seconds before expiry, then refetches", async () => {
  let t = 0;
  const f = tokenFetch([{ access_token: "a", expires_in: 300 }, { access_token: "b", expires_in: 300 }]);
  const auth = createModelAuth({ env: OIDC, staticKeyVar: "K", fetchImpl: f, now: () => t });
  assert.equal(await auth.getBearer(), "a");
  t = 239_000;
  assert.equal(await auth.getBearer(), "a");
  assert.equal(f.calls.length, 1);
  t = 241_000;
  assert.equal(await auth.getBearer(), "b");
  assert.equal(f.calls.length, 2);
});

test("B14 concurrent callers share one fetch; unusable expires_in is not cached", async () => {
  const f = tokenFetch([{ access_token: "a", expires_in: 300 }]);
  const auth = createModelAuth({ env: OIDC, staticKeyVar: "K", fetchImpl: f });
  await Promise.all([auth.getBearer(), auth.getBearer(), auth.getBearer()]);
  assert.equal(f.calls.length, 1);
  const g = tokenFetch([{ access_token: "x" }]);
  const bare = createModelAuth({ env: OIDC, staticKeyVar: "K", fetchImpl: g });
  await bare.getBearer();
  await bare.getBearer();
  assert.equal(g.calls.length, 2);
});

test("B3 a 401 refreshes the token and retries exactly once", async () => {
  const tf = tokenFetch([{ access_token: "old", expires_in: 300 }, { access_token: "new", expires_in: 300 }]);
  const auth = createModelAuth({ env: OIDC, staticKeyVar: "K", fetchImpl: tf });
  const seen = [];
  const model = async (_u, init) => {
    seen.push(init.headers.Authorization);
    return new Response("", { status: seen.length === 1 ? 401 : 200 });
  };
  const res = await authorizedFetch(auth, model, "https://gw/x", { method: "POST" });
  assert.equal(res.status, 200);
  assert.deepEqual(seen, ["Bearer old", "Bearer new"]);
  let n = 0;
  const counting = async () => { n++; return new Response("", { status: 401 }); };
  const second = await authorizedFetch(auth, counting, "https://gw/x", {});
  assert.equal(second.status, 401);
  assert.equal(n, 2);
});

test("B8/B9/B10 static fallback, none, and OIDC precedence", async () => {
  const f = tokenFetch([{ access_token: "t", expires_in: 300 }]);
  const s = createModelAuth({ env: { K: "static" }, staticKeyVar: "K", fetchImpl: f });
  assert.equal(s.mode(), "Static");
  assert.equal(await s.getBearer(), "static");
  assert.equal(f.calls.length, 0);
  assert.equal(createModelAuth({ env: {}, staticKeyVar: "K" }).mode(), "None");
  assert.equal(await createModelAuth({ env: {}, staticKeyVar: "K" }).getBearer(), null);
  const both = createModelAuth({ env: { ...OIDC, K: "static" }, staticKeyVar: "K", fetchImpl: f });
  assert.equal(both.mode(), "Oidc");
  assert.equal(await both.getBearer(), "t");
  let hdr;
  await authorizedFetch(s, async (_u, i) => { hdr = i.headers.Authorization; return new Response(""); }, "u", {});
  assert.equal(hdr, "Bearer static");
  let n = 0;
  const res = await authorizedFetch(s, async () => { n++; return new Response("", { status: 401 }); }, "u", {});
  assert.equal(res.status, 401);
  assert.equal(n, 1);
  let sent = "unset";
  await authorizedFetch(createModelAuth({ env: {}, staticKeyVar: "K" }),
    async (_u, i) => { sent = i.headers.Authorization; return new Response(""); }, "u", {});
  assert.equal(sent, undefined);
});

test("B11 partial config fails before any request and names variables only", async () => {
  const f = tokenFetch([{ access_token: "t" }]);
  const auth = createModelAuth({ env: { ONTOLOGY_OIDC_TOKEN_URL: "https://kc/t", K: "static" }, staticKeyVar: "K", fetchImpl: f });
  await assert.rejects(auth.getBearer(), (e) => e instanceof AuthConfigError
    && /ONTOLOGY_OIDC_CLIENT_ID/.test(e.message) && /ONTOLOGY_OIDC_CLIENT_SECRET/.test(e.message)
    && !e.message.includes("https://kc/t") && !e.message.includes("static"));
  assert.equal(f.calls.length, 0);
});

test("B12/B13 token endpoint failures carry the status only and leak nothing", async () => {
  const leak = "LEAK-BODY-xyz";
  for (const res of [new Response(leak, { status: 500 }), Response.json({ error: leak }), Response.json({ access_token: "" })]) {
    const auth = createModelAuth({ env: OIDC, staticKeyVar: "K", fetchImpl: tokenFetch([res]) });
    await assert.rejects(auth.getBearer(), (e) => e instanceof TokenRequestError
      && !e.message.includes(leak) && !e.message.includes(OIDC.ONTOLOGY_OIDC_CLIENT_SECRET));
  }
  const boom = createModelAuth({ env: OIDC, staticKeyVar: "K",
    fetchImpl: async () => { throw new Error(`down ${OIDC.ONTOLOGY_OIDC_CLIENT_SECRET}`); } });
  await assert.rejects(boom.getBearer(), (e) => !e.message.includes(OIDC.ONTOLOGY_OIDC_CLIENT_SECRET));
});

test("a changed configuration does not reuse a cached token", async () => {
  const env = { ...OIDC };
  const f = tokenFetch([{ access_token: "a", expires_in: 300 }, { access_token: "b", expires_in: 300 }]);
  const auth = createModelAuth({ env, staticKeyVar: "K", fetchImpl: f });
  assert.equal(await auth.getBearer(), "a");
  env.ONTOLOGY_OIDC_CLIENT_ID = "other";
  assert.equal(await auth.getBearer(), "b");
});
