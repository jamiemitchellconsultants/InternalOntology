# 0032 — Use an OpenAI-compatible embeddings adapter

- **Status:** accepted
- **Date:** 2026-11-20
- **Feature:** #143 (docs/features/semantic-repository-index/)

## Context

B13–B16 require owner-supplied embeddings from either a local or approved remote model, observable compatibility, and separate credentials. A model response needs to correlate each embedding with the corresponding input. Equal dimensions are insufficient to establish comparability.

## Decision

Use the OpenAI-compatible embeddings HTTP contract with ordered input batches and indexed numeric vectors. The adapter checks for one response per input by index, the expected dimensions, and finite, nonzero vectors and converts them to the local Float32 representation. It uses the configured model name, model revision, optional document and query prefixes, and expected dimensions to identify the embedding space. The adopter advances the model revision when replacing weights or incompatible encoding behind a stable endpoint. One adapter can exercise both a local Ollama endpoint and a compatible remote service. [Ollama API compatibility](https://docs.ollama.com/api/openai-compatibility#v1-embeddings), [Embedding request and response reference](https://developers.openai.com/api/reference/resources/embeddings/methods/create)

Restrict calls to the explicitly approved endpoint, using HTTPS remotely and HTTP only on loopback. Reject URL credentials, query strings, and fragments. Disable redirects and bound request time, batch size, and response reading. Support optional bearer authentication through `ONTOLOGY_INDEX_EMBEDDING_TOKEN`, independent of the credentials configured for model reviewers and `gh`. Return a safe error on provider failure and preserve the complete local index when a refresh cannot finish.

## Consequences

Owners can choose the provider, model and deployment where the interface matches. Two approved endpoint addresses can share an index when they serve the same declared embedding space. The provider may expose a model alias without disclosing its weights, so the owner-managed revision is part of the compatibility contract. Providers exposing only proprietary APIs need a compatible gateway or a later adapter. The pilot covers local and remote use without requiring a specific vendor.

## Alternatives considered

- Ship and manage one model for all adopters. That would remove owner choice and add runtime dependencies.
- Support different native APIs in the first release. Each adapter would add credential and response contracts before the common workflow is validated.
- Identify the model only by its name or output length. Two incompatible deployments can share either value.
