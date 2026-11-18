// Supplies the bearer credential for model requests: an OIDC client-credentials token when all
// three ONTOLOGY_OIDC_* settings are present, otherwise the static key named by the caller.
// Errors never carry the client secret, a token, or any token-endpoint response body.

const EARLY_REFRESH_MS = 60_000;
const OIDC_VARS = ["ONTOLOGY_OIDC_TOKEN_URL", "ONTOLOGY_OIDC_CLIENT_ID", "ONTOLOGY_OIDC_CLIENT_SECRET"];

export class AuthConfigError extends Error {}
export class TokenRequestError extends Error {}

export function createModelAuth({ env = process.env, staticKeyVar, fetchImpl = fetch, now = Date.now,
  timeoutMs = 30_000 }) {
  let cache = null;
  let inflight = null;

  function mode() {
    const present = OIDC_VARS.filter((name) => env[name]);
    if (present.length === OIDC_VARS.length) return "Oidc";
    if (present.length > 0) {
      const missing = OIDC_VARS.filter((name) => !env[name]);
      throw new AuthConfigError(`incomplete OIDC configuration; also set: ${missing.join(", ")}`);
    }
    return env[staticKeyVar] ? "Static" : "None";
  }

  async function requestToken(url, id, secret) {
    const basic = Buffer.from(`${encodeURIComponent(id)}:${encodeURIComponent(secret)}`).toString("base64");
    let response;
    let body;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json" },
        body: "grant_type=client_credentials",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        await response.body?.cancel?.();
        throw new TokenRequestError(`token request failed: HTTP ${response.status}`);
      }
      body = await response.json();
    } catch (error) {
      if (error instanceof TokenRequestError) throw error;
      throw new TokenRequestError("token request failed");
    }
    const token = body?.access_token;
    if (typeof token !== "string" || token === "") {
      throw new TokenRequestError("token request failed: no usable access_token");
    }
    const seconds = Number(body.expires_in);
    const expiresAt = Number.isFinite(seconds) && seconds > 0 ? now() + seconds * 1000 - EARLY_REFRESH_MS : 0;
    return { token, expiresAt };
  }

  async function getBearer() {
    const current = mode();
    if (current === "None") return null;
    if (current === "Static") return env[staticKeyVar];
    const [url, id, secret] = OIDC_VARS.map((name) => env[name]);
    const key = JSON.stringify([url, id, secret]);
    if (cache && cache.key === key && cache.expiresAt > now()) return cache.token;
    if (!inflight || inflight.key !== key) {
      const pending = { key, promise: null };
      pending.promise = requestToken(url, id, secret).then((value) => {
        cache = { key, ...value };
        return value.token;
      }).finally(() => { if (inflight === pending) inflight = null; });
      inflight = pending;
    }
    return inflight.promise;
  }

  return { mode, getBearer, invalidate() { cache = null; } };
}

export async function authorizedFetch(auth, fetchImpl, url, init = {}) {
  const send = async () => {
    const bearer = await auth.getBearer();
    const headers = { ...init.headers };
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    return fetchImpl(url, { ...init, headers });
  };
  const response = await send();
  if (response.status !== 401 || auth.mode() !== "Oidc") return response;
  await response.body?.cancel?.();
  auth.invalidate();
  return send();
}
