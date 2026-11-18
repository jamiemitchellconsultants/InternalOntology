// Request budget and model timeout shared by the model-backed reviewers. Adopters change them with
// the ONTOLOGY_MAX_REQUEST_CHARS and ONTOLOGY_MODEL_TIMEOUT_MS repository variables, never by editing a
// script.

// A complete-request character budget, not a diff-only one. Character counts are a planning
// heuristic; a 413 from the endpoint is handled authoritatively by recursive splitting.
//
// 200,000 characters is about 50,000 to 67,000 tokens, so a complete request uses at most about half
// of a 131,072-token window and leaves room for a reasoning model's thinking and its output cap.
export const MAX_REQUEST_CHARS = 200_000;
export const MODEL_TIMEOUT_MS = 300_000;

/**
 * Unset, empty or whitespace gives the fallback; otherwise digits forming a positive safe integer.
 * @param {Record<string, string | undefined>} env
 * @param {string} name
 * @param {number} fallback
 * @returns {number}
 */
export function readPositiveInteger(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = raw.trim();
  if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`${name} must be a positive integer, got "${value}"`);
  }
  return Number(value);
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ maxRequestChars: number, modelTimeoutMs: number }}
 */
export function resolveRequestBudget(env = process.env) {
  return {
    maxRequestChars: readPositiveInteger(env, "ONTOLOGY_MAX_REQUEST_CHARS", MAX_REQUEST_CHARS),
    modelTimeoutMs: readPositiveInteger(env, "ONTOLOGY_MODEL_TIMEOUT_MS", MODEL_TIMEOUT_MS),
  };
}
