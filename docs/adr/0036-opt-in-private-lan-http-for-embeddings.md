# 0036 — Opt in to private LAN HTTP for embeddings

- **Status** Accepted
- **Date** 2026-11-20
- **Feature** [#143](https://github.com/jamiemitchellconsultants/InternalOntology/issues/143)
- **Amends** [ADR 0032 · Use an OpenAI-compatible embeddings adapter](0032-semantic-index-embedding-adapter.md)

## Context

B14 and B16 require an owner-approved model destination and control over credentials. During JEPA-Speech acceptance, the approved Qwen service accepted synthetic batches on the private LAN and returned valid indexed vectors. The existing HTTPS-or-loopback rule blocked the installed Kit at configuration validation. The owner chose to support explicit LAN HTTP for developers who can reach the model within the private network. [Architecture issue #146](https://github.com/jamiemitchellconsultants/InternalOntology/issues/146)

## Decision

Accept the optional boolean `semanticIndex.embedding.allowLanHttp` in the trusted committed `OntologyConfig`. Its default is `false`. HTTPS and loopback HTTP are available without the flag. A configured off-loopback HTTP URL requires `true`. The existing URL checks require a path and reject URL credentials, query strings, and fragments. The flag approves HTTP to the one configured embedding endpoint under the address rules below.

For each LAN HTTP request, validate a literal address directly or resolve the configured hostname through the system resolver, including local names such as `.local`. Eligible connection addresses are private IPv4 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) and IPv6 unique-local (`fc00::/7`). Classify IPv4-mapped IPv6 addresses using their embedded IPv4 address. Treat IPv6 link-local answers as local hints and exclude them from connection candidates. Reject the endpoint if there is any answer outside these classes or if the eligible address list is empty. This permits a hostname that returns private IPv4 alongside unscoped link-local IPv6 and rejects a hostname that returns both private and public addresses. [RFC 1918 §3](https://www.rfc-editor.org/rfc/rfc1918.html#section-3) · [RFC 4193 §3.1](https://www.rfc-editor.org/rfc/rfc4193.html#section-3.1) · [RFC 4291 §2.4](https://www.rfc-editor.org/rfc/rfc4291.html#section-2.4)

Connect directly to an address from the validated result, using the configured host, port, and path for the HTTP request. Constrain the connection to those validated addresses, bypass proxy settings on this path, and reject redirects. Address resolution and connection establishment share the existing request deadline. Apply this check only when an embedding request would otherwise be sent. A failing address check reports a local diagnostic before sending source or query data.

Reject a non-empty `ONTOLOGY_INDEX_EMBEDDING_TOKEN` before resolving or connecting to a LAN HTTP endpoint. A service that requires a bearer can use HTTPS or loopback HTTP under the existing credential policy. The owner uses the opt-in for a network and source scope approved for plaintext model requests. Advertise the setting and its credential behaviour in the installed setup guide.

The transport setting and endpoint address stay outside the embedding-space fingerprint and `IndexSnapshot` format. Compatibility follows the configured model identity, revision, dimensions, and prefixes. Both source and query requests use the same approved transport. The store retains its existing atomic promotion and error handling when a request fails.

## Consequences

Developers who can reach an owner-approved private model can build and search without exposing the service publicly. The Kit rejects an opt-in request when an address is outside the allowed classes, a hostname has no eligible address, or a bearer is configured. The LAN service receives approved text in plaintext. Operators can switch to an approved HTTPS endpoint that serves the same embedding space and reuse compatible snapshots.

The amendment's executable checks cover the default policy, opt-in through literal and resolved private addresses, mixed public and private answers, the observed private IPv4 and IPv6 link-local combination, request-time address pinning, bearer rejection, and preservation after connection failure. The deployed JEPA-Speech check exercises refresh and search through the installed CLI against the approved LAN service and verifies the returned citations against its pinned commit.

## Alternatives considered

- Require every LAN service to use an HTTPS gateway. This would require a gateway deployment for a model the owner deliberately hosts on the private network.
- Allow arbitrary HTTP destinations behind a general opt-in. This would extend plaintext transport to public addresses beyond the approved LAN use case.
- Trust a `.local` suffix or an initial address check as sufficient. Checking the resolved address at connection time ties the enforcement to the destination actually used.
