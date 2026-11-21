---
date: 2026-11-20
slug: docs-design-opt-in-lan-http-for-semantic-embeddings
title: "docs: design opt-in LAN HTTP for semantic embeddings"
summary: "Allow `semanticIndex.embedding.allowLanHttp` in trusted committed configuration."
kind: product
status: accepted
sequence: 2026-11-20T19:45:13.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/172; merge commit 1ded660f1e81569730fe6a973449a0350581dce5"
---

## Context

The owner-approved Qwen service is reachable on the private network. During JEPA-Speech acceptance it returned valid 4,096-dimensional vectors for synthetic inputs, while the Kit's HTTPS-or-loopback rule rejected its LAN URL at configuration validation. The maintainer chose to support explicitly configured LAN HTTP.

## Decision

Allow `semanticIndex.embedding.allowLanHttp` in trusted committed configuration. Off-loopback HTTP is opt-in, connects directly to a validated private address, rejects public or mixed address answers, and rejects a configured embedding bearer before connecting. The adapter keeps its bounded request and response checks. [ADR 0036](https://github.com/jamiemitchellconsultants/InternalOntology/blob/feature/semantic-repository-index/architect-amend/docs/adr/0036-opt-in-private-lan-http-for-embeddings.md)

## Consequences

Developers on the approved network can use the hosted model over plaintext HTTP. An HTTPS endpoint continues to serve deployments that need bearer authentication. Snapshot compatibility follows the embedding space, so the transport option is outside the compatibility fingerprint. Developer planning and implementation amendments come before the installed JEPA-Speech LAN trial in #149.

AI-Fingerprint: sha256:99cca93d341e
