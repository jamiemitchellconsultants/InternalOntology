---
date: 2026-11-20
slug: docs-design-semantic-repository-index-architecture
title: "docs: design semantic repository index architecture"
summary: "Use a checkout-local CLI and separately approved committed configuration. Read the selected Git tree, use exact cosine search, and store a portable vector file with atomic promotion."
kind: product
status: accepted
sequence: 2026-11-20T08:38:39.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/158; merge commit c6febeb8e831a5dd94f58f1f8cce75ca622f256c"
---

## Context

The accepted behaviours require source references tied to a Git commit, owner-supplied embeddings, incremental refresh, and portable release assets that teammates can reuse. The Kit also needs to preserve a complete local index through a failed build or import and keep endpoint and source approval independent of the checkout's current branch.

## Decision

Use a checkout-local CLI and separately approved committed configuration. Read the selected Git tree, use exact cosine search, and store a portable vector file with atomic promotion. One OpenAI-compatible adapter serves local and remote embedding models. Authenticated release exchange verifies the chosen release, its pushed source commit, and publisher authority.

- [ADR 0029 · Local CLI and trusted settings](https://github.com/jamiemitchellconsultants/InternalOntology/blob/feature/semantic-repository-index/architect/docs/adr/0029-semantic-index-local-cli-and-trusted-settings.md)
- [ADR 0030 · Pinned source and exact search](https://github.com/jamiemitchellconsultants/InternalOntology/blob/feature/semantic-repository-index/architect/docs/adr/0030-semantic-index-pinned-source-and-exact-search.md)
- [ADR 0031 · Portable file and atomic promotion](https://github.com/jamiemitchellconsultants/InternalOntology/blob/feature/semantic-repository-index/architect/docs/adr/0031-semantic-index-portable-file-and-promotion.md)
- [ADR 0032 · Embedding adapter](https://github.com/jamiemitchellconsultants/InternalOntology/blob/feature/semantic-repository-index/architect/docs/adr/0032-semantic-index-embedding-adapter.md)
- [ADR 0033 · Release exchange](https://github.com/jamiemitchellconsultants/InternalOntology/blob/feature/semantic-repository-index/architect/docs/adr/0033-semantic-index-release-exchange.md)

## Consequences

Adopting repositories can search without a vector service and share a single compressed asset without adding generated vectors to Git history. Repositories choose their model and publishing scope. The pilot will measure the size and latency of the portable file and exact search before the Kit takes on a vector engine or additional provider adapters.

AI-Fingerprint: sha256:5095f31f39a2
