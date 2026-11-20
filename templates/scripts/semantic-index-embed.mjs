const REQUEST_BYTES = 64 * 1024;
const RESPONSE_BYTES = 8 * 1024 * 1024;
const BATCH_SIZE = 16;

function invalidResponse() {
  return new Error("invalid embedding response");
}

async function readResponse(response) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of response.body ?? []) {
    bytes += chunk.byteLength;
    if (bytes > RESPONSE_BYTES) throw invalidResponse();
    chunks.push(chunk);
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, bytes)));
}

function orderedVectors(data, count, dimensions) {
  if (!Array.isArray(data) || data.length !== count) throw invalidResponse();
  const vectors = new Array(count);
  for (const item of data) {
    const { index, embedding } = item ?? {};
    if (!Number.isInteger(index) || index < 0 || index >= count || vectors[index] ||
        !Array.isArray(embedding) || embedding.length !== dimensions || !embedding.every(Number.isFinite)) {
      throw invalidResponse();
    }
    const vector = Float32Array.from(embedding);
    const length = Math.hypot(...vector);
    if (!Number.isFinite(length) || length === 0) throw invalidResponse();
    vectors[index] = vector.map((value) => value / length);
  }
  return vectors;
}

export function createEmbeddingAdapter(profile, { fetchImpl = fetch, token, timeoutMs = 30_000 } = {}) {
  const { endpoint, model, dimensions, documentPrefix = "", queryPrefix = "" } = profile;
  const requestBody = (input) => JSON.stringify({ model, input });

  async function request(body, count) {
    const headers = { "Content-Type": "application/json", Accept: "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST", headers, body, redirect: "error", signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new Error("Embedding endpoint could not be reached.");
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error("Embedding request failed: HTTP " + response.status);
    }
    try {
      return orderedVectors((await readResponse(response)).data, count, dimensions);
    } catch {
      throw invalidResponse();
    }
  }

  async function embed(texts, prefix) {
    const result = [];
    let batch = [];
    for (const text of texts) {
      const input = prefix + text;
      if (Buffer.byteLength(requestBody([input])) > REQUEST_BYTES) {
        throw new Error("Embedding input exceeds the request limit.");
      }
      const next = [...batch, input];
      if (next.length > BATCH_SIZE || Buffer.byteLength(requestBody(next)) > REQUEST_BYTES) {
        result.push(...await request(requestBody(batch), batch.length));
        batch = [input];
      } else {
        batch = next;
      }
    }
    if (batch.length) result.push(...await request(requestBody(batch), batch.length));
    return result;
  }

  return {
    embedSource: (texts) => embed(texts, documentPrefix),
    embedQuery: async (text) => (await embed([text], queryPrefix))[0],
  };
}
