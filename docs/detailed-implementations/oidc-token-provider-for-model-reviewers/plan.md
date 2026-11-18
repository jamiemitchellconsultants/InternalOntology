# OIDC token provider for model reviewers — detailed implementation plan

Execute after the [task plan](../../superpowers/plans/oidc-token-provider-for-model-reviewers/plan.md)
has merged. Read the feature [behaviours and architecture](../../features/oidc-token-provider-for-model-reviewers/feature.md)
and ADRs 0012 and 0013 first. Work on `feature/oidc-token-provider-for-model-reviewers/build`. Each
task is a separate test-first commit and push; before each commit run its focused test,
`node scripts/check-ontology-terms.mjs`, and `npm test`, staging only that task's files and
reviewing `git diff --cached`. Installed files must remain byte-identical across adopters.

Code fragments are contracts and complete minimal tests, not implementation bodies. Keep test names.

## Task 1 — `llm-auth.mjs`

**Files:** `templates/scripts/llm-auth.mjs`, `templates/scripts/llm-auth.test.mjs`.

**Interface** (ES module, no imports beyond Node built-ins):

```js
export class AuthConfigError extends Error {}
export class TokenRequestError extends Error {}   // message: "token request failed: HTTP <status>" or
                                                  // "token request failed: no usable access_token"
export function createModelAuth({ env = process.env, staticKeyVar, fetchImpl = fetch,
  now = Date.now, timeoutMs = 30_000 }) // returns { mode(), getBearer(), invalidate() }
export async function authorizedFetch(auth, fetchImpl, url, init)
```

- `mode()` reads `env` at call time and returns `"Oidc"` when all three of
  `ONTOLOGY_OIDC_TOKEN_URL`, `ONTOLOGY_OIDC_CLIENT_ID`, `ONTOLOGY_OIDC_CLIENT_SECRET` are non-empty,
  `"None"`/`"Static"` when none of them is set (by whether `env[staticKeyVar]` is non-empty), and
  throws AuthConfigError naming the missing variable names (never values) when only some are set.
- `getBearer()` returns `null` for `None`, the static key for `Static`, else the cached token or a
  new one: POST `application/x-www-form-urlencoded` body `grant_type=client_credentials`,
  header `Authorization: Basic base64(urlencode(id):urlencode(secret))`, `Accept: application/json`,
  abort after `timeoutMs`. Non-2xx throws TokenRequestError with the status only. A 2xx lacking a
  non-empty string `access_token` throws TokenRequestError. Catch fetch/parse errors and rethrow
  as `TokenRequestError("token request failed")` without the cause message.
- Cache until `now() + expires_in*1000 - 60_000`. Missing, non-numeric or non-positive `expires_in`
  means no caching. Cache is keyed by the (url, id, secret) tuple, so a changed config refetches.
  Concurrent calls share one in-flight promise, cleared on settle.
- `invalidate()` drops the cached token.
- `authorizedFetch` sets `Authorization: Bearer <bearer>` (omitted when `null`) over `init.headers`,
  calls `fetchImpl(url, init)`; on status 401 and `mode() === "Oidc"` it cancels the body,
  `invalidate()`s, fetches a new bearer and repeats once, returning the second response whatever its
  status. A static-key 401 is returned unretried.

Complete tests (`node:test`; `staticKeyVar: "K"`; helpers `tokenFetch(responses)` that records calls
and returns `Response.json`):

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createModelAuth, authorizedFetch, AuthConfigError, TokenRequestError } from "./llm-auth.mjs";

const OIDC = { ONTOLOGY_OIDC_TOKEN_URL: "https://kc.example/token", ONTOLOGY_OIDC_CLIENT_ID: "cid",
  ONTOLOGY_OIDC_CLIENT_SECRET: "s3cr3t-value" };
const tokenFetch = (bodies) => { const calls = []; const f = async (url, init) => {
  calls.push({ url, init }); const b = bodies[Math.min(calls.length - 1, bodies.length - 1)];
  return b instanceof Response ? b : Response.json(b); }; f.calls = calls; return f; };

test("B1 fetches a token with form-encoded client credentials and Basic auth", async () => {
  const f = tokenFetch([{ access_token: "tok1", expires_in: 300 }]);
  const auth = createModelAuth({ env: OIDC, staticKeyVar: "K", fetchImpl: f });
  assert.equal(await auth.getBearer(), "tok1");
  const { url, init } = f.calls[0];
  assert.equal(url, OIDC.ONTOLOGY_OIDC_TOKEN_URL);
  assert.equal(init.method, "POST");
  assert.equal(String(init.body), "grant_type=client_credentials");
  assert.equal(init.headers.Authorization, `Basic ${Buffer.from("cid:s3cr3t-value").toString("base64")}`);
});

test("B14 caches until 60 seconds before expiry, then refetches", async () => {
  let t = 0; const f = tokenFetch([{ access_token: "a", expires_in: 300 }, { access_token: "b", expires_in: 300 }]);
  const auth = createModelAuth({ env: OIDC, staticKeyVar: "K", fetchImpl: f, now: () => t });
  assert.equal(await auth.getBearer(), "a");
  t = 239_000; assert.equal(await auth.getBearer(), "a"); assert.equal(f.calls.length, 1);
  t = 241_000; assert.equal(await auth.getBearer(), "b"); assert.equal(f.calls.length, 2);
});

test("B14 concurrent callers share one fetch; unusable expires_in is not cached", async () => {
  const f = tokenFetch([{ access_token: "a", expires_in: 300 }]);
  const auth = createModelAuth({ env: OIDC, staticKeyVar: "K", fetchImpl: f });
  await Promise.all([auth.getBearer(), auth.getBearer(), auth.getBearer()]);
  assert.equal(f.calls.length, 1);
  const g = tokenFetch([{ access_token: "x" }]);
  const bare = createModelAuth({ env: OIDC, staticKeyVar: "K", fetchImpl: g });
  await bare.getBearer(); await bare.getBearer();
  assert.equal(g.calls.length, 2);
});

test("B3 a 401 refreshes the token and retries exactly once", async () => {
  const tf = tokenFetch([{ access_token: "old", expires_in: 300 }, { access_token: "new", expires_in: 300 }]);
  const auth = createModelAuth({ env: OIDC, staticKeyVar: "K", fetchImpl: tf });
  const seen = [];
  const model = async (_u, init) => { seen.push(init.headers.Authorization);
    return new Response("", { status: seen.length === 1 ? 401 : 200 }); };
  const res = await authorizedFetch(auth, model, "https://gw/x", { method: "POST" });
  assert.equal(res.status, 200); assert.deepEqual(seen, ["Bearer old", "Bearer new"]);
  const always401 = async () => new Response("", { status: 401 }); let n = 0;
  const counting = async (...a) => { n++; return always401(...a); };
  const second = await authorizedFetch(auth, counting, "https://gw/x", {});
  assert.equal(second.status, 401); assert.equal(n, 2);
});

test("B8/B9/B10 static fallback, none, and OIDC precedence", async () => {
  const f = tokenFetch([{ access_token: "t", expires_in: 300 }]);
  const s = createModelAuth({ env: { K: "static" }, staticKeyVar: "K", fetchImpl: f });
  assert.equal(s.mode(), "Static"); assert.equal(await s.getBearer(), "static"); assert.equal(f.calls.length, 0);
  assert.equal(createModelAuth({ env: {}, staticKeyVar: "K" }).mode(), "None");
  assert.equal(await createModelAuth({ env: {}, staticKeyVar: "K" }).getBearer(), null);
  const both = createModelAuth({ env: { ...OIDC, K: "static" }, staticKeyVar: "K", fetchImpl: f });
  assert.equal(both.mode(), "Oidc"); assert.equal(await both.getBearer(), "t");
  let hdr; await authorizedFetch(s, async (_u, i) => { hdr = i.headers.Authorization; return new Response(""); }, "u", {});
  assert.equal(hdr, "Bearer static");
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
  const boom = createModelAuth({ env: OIDC, staticKeyVar: "K", fetchImpl: async () => { throw new Error(`down ${OIDC.ONTOLOGY_OIDC_CLIENT_SECRET}`); } });
  await assert.rejects(boom.getBearer(), (e) => !e.message.includes(OIDC.ONTOLOGY_OIDC_CLIENT_SECRET));
});
```

**Commit:** `feat: add model auth provider with OIDC client credentials`.

## Task 2 — drift reviewer

**Files:** `templates/scripts/review-ontology-drift.mjs`, `templates/scripts/review-ontology-drift.test.mjs`.

**Interface:** `modelJson(url, init, fetchImpl = fetch, timeoutMs = 300_000, auth = defaultAuth)`
where `const defaultAuth = createModelAuth({ env: process.env, staticKeyVar: "ONTOLOGY_LLM_API_KEY" })`
at module level (reads env at call time, so one cache serves every batch). It calls
`authorizedFetch(auth, fetchImpl, url, { ...init, signal, headers })` instead of reading the key.
The HttpError path is unchanged. The AuthConfigError/TokenRequestError propagate as ordinary
errors, which the existing advisory handling already reports without failing a merge. Update the
doc comment to mention OIDC.

**Tests:** keep the three existing `modelJson` tests (the static-key one still passes through the
default provider; leave its env setup). Add: OIDC env set with a `fetch` stub for the token URL
(via an injected `auth` built with `createModelAuth({ env, fetchImpl })`) produces a Bearer
header from the token; a 401 then 200 from the model fetch is retried once; and a thrown
AuthConfigError message contains no env values.

**Commit:** `feat: drift reviewer authenticates through ModelAuthProvider`.

## Task 3 — semantic reviewer

**Files:** `templates/scripts/semantic-review-model.mjs`, `semantic-review-worker.mjs` and their tests.

**Interface:** `reviewFiles({ ..., auth, ... })` replaces `apiKey`; inside `assess` use
`authorizedFetch(auth, fetchImpl, endpoint, { method, body, signal, headers: {"Content-Type": ...} })`.
An AuthConfigError or TokenRequestError thrown inside `assess` falls into the existing `catch`,
which must return `reason: "model credential could not be obtained"` for those two classes (never
the error message). `runSemanticReview({ ..., auth })` replaces `secret`; treat
`auth.mode() === "None"` as the existing "semantic model credential is unavailable" outcome, and a
thrown AuthConfigError from `mode()` as the same unavailable outcome with reason
"semantic model credential is misconfigured". The worker builds
`createModelAuth({ env: process.env, staticKeyVar: "ONTOLOGY_SEMANTIC_LLM_API_KEY" })` once and
passes it as `auth`.

**Tests:** in `semantic-review-model.test.mjs` replace `apiKey: "test-key"` with
`auth: createModelAuth({ env: { K: "test-key" }, staticKeyVar: "K" })`; add 401-then-200 retry with an
OIDC provider, and a case where the token fetch fails and the run reports incomplete with the fixed
reason and no secret text. In `semantic-review-worker.test.mjs` replace each `secret: "secret"` with
the same static `auth`, and `secret: ""` with `auth` over empty env (outcome unchanged); add one
misconfigured-partial-OIDC case expecting the unavailable outcome.

**Commit:** `feat: semantic reviewer authenticates through ModelAuthProvider`.

## Task 4 — installer

**Files:** `bin/install-ontology.mjs`, `tests/` installer test that lists planned files.

Add `scripts/llm-auth.mjs` and `scripts/llm-auth.test.mjs` to the `withDriftReview` plan and to the
`withSemanticReview` plan, de-duplicated when both flags are set. Test: with each flag alone and
both, the dry-run plan contains each file exactly once, `ownedBy: "kit"`.

**Commit:** `feat: install llm-auth with the model reviewers`.

## Task 5 — workflows

**Files:** `templates/github/workflows/ontology-drift-review.yml`, `ontology-semantic-review.yml`,
and any test that asserts their content.

Drift: header comment lists `vars.ONTOLOGY_OIDC_TOKEN_URL`, `vars.ONTOLOGY_OIDC_CLIENT_ID`,
`secrets.KEYCLOAK_CLIENT_SECRET` (mapped to `ONTOLOGY_OIDC_CLIENT_SECRET`) and the optional
`secrets.ONTOLOGY_LLM_API_KEY`; remove the "add your own network step" comments, noting the gateway
is public. In both env blocks add the three OIDC variables. The configuration check requires
`ONTOLOGY_LLM_BASE_URL` and `ONTOLOGY_MODEL`, then passes when either all three OIDC values are
non-empty or `ONTOLOGY_LLM_API_KEY` is non-empty, errors naming what is missing otherwise, and
errors on a partial OIDC set. Semantic: add the three OIDC env entries to the review step; the
secret still comes from the `ontology-semantic-review` environment.

**Commit:** `ci: workflow templates pass OIDC settings to the reviewers`.

## Task 6 — documentation

**Files:** `templates/docs/ontology-drift-review.md`, `templates/docs/ontology-semantic-review.md`,
`README.md`, `docs/how-it-works.md`, `docs/ai-agent-install.md` if it mentions the key.

Document: `ONTOLOGY_LLM_BASE_URL=https://gateway.tqaentry.com/v1`, `ONTOLOGY_MODEL=ontology-review`,
`ONTOLOGY_OIDC_TOKEN_URL=https://auth.tqaentry.com/realms/homelab/protocol/openid-connect/token`,
`ONTOLOGY_OIDC_CLIENT_ID=litellm-ci`, the secret `KEYCLOAK_CLIENT_SECRET` mapped to
`ONTOLOGY_OIDC_CLIENT_SECRET` (add it to the `ontology-semantic-review` environment for the semantic
reviewer), static-key fallback, token lifetime and refresh, and per-consumer upgrade steps
(`node bin/install-ontology.mjs --target <repo> --force --with-drift-review`, set the vars, enable
`semanticReview` in `ontology.config.json`). Say that nothing here was verified against the live gateway.
Files under `templates/` are excluded from the term check; README and how-it-works are not, so use
only ontology terms in backticks.

**Commit:** `docs: document OIDC authentication for the model reviewers`.

## Task 7 — wrap-up

Confirm `docs/ontology.md` already carries `ModelAuthProvider`, `OidcClientConfig`, `AuthMode`;
update `DriftReviewer` and `SemanticReviewWorker` descriptions only if wording is now stale. Run
`npm test` and the term check. Open the build PR (label `narrative-required`, the three Narrative
headings, linking ADRs 0012 and 0013, the per-consumer follow-ups, and what was not verified against
the live gateway). Allowlist entries only with a written reason.
