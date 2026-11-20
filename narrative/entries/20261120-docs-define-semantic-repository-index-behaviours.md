---
date: 2026-11-20
slug: docs-define-semantic-repository-index-behaviours
title: "docs: define semantic repository index behaviours"
summary: "Search uses approved content from the current Git commit, including local commits, with an explicit refresh after a change to the commit or source scope. An exact compatible release asset can be searched with zero source re-embedding."
kind: product
status: accepted
sequence: 2026-11-20T08:16:39.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/154; merge commit b7ce52f9bbf21562b5c1fe1b8c89588bbe06f619"
---

## Context

The accepted vision calls for owner-supplied embeddings, a checkout-local index, and GitHub Release assets that teammates can reuse. Developers need source citations they can resolve and clear guidance when an index is unavailable, stale, or incompatible. Publishing must associate the shared vectors with the exact source teammates can check out.

## Decision

Search uses approved content from the current Git commit, including local commits, with an explicit refresh after a change to the commit or source scope. An exact compatible release asset can be searched with zero source re-embedding. A compatible ancestor asset can seed a refresh. Explicit uploads require repository write access and a release that points to the pushed indexed commit.

## Consequences

Source locations resolve at a named revision. Interrupted imports and refreshes preserve the last complete local index, and failed uploads preserve existing release assets. The pilot compares retrieval with keyword search and measures reuse and refresh costs. Architecture will choose the storage, client interfaces, embedding integration, and release tooling.

AI-Fingerprint: sha256:40814a485326
