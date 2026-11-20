---
date: 2026-11-20
slug: docs-define-semantic-repository-index-vision
title: "docs: define semantic repository index vision"
summary: "Offer semantic repository search as an opt-in capability. The repository owner supplies the embedding model and approves the indexed content. Each checkout uses a rebuildable, Git-ignored vector store."
kind: product
status: accepted
sequence: 2026-11-20T07:57:41.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/151; merge commit c8886f9acc6ac3c4aed5d3aa97c6adc0cf012e6e"
---

## Context

Developers and coding agents often know the behaviour they need to find before they know the exact names used in an unfamiliar repository. The Ontology Kit already gives them canonical vocabulary and optional source graph evidence. Code Context and Greptile demonstrate semantic retrieval and cross-file context. Adopting repositories need control over the embedding model and a way to share precomputed vectors with teammates.

## Decision

Offer semantic repository search as an opt-in capability. The repository owner supplies the embedding model and approves the indexed content. Each checkout uses a rebuildable, Git-ignored vector store. Developers with repository access can download a snapshot from the adopting repository's GitHub Releases, and a publisher with write access can upload a snapshot for a pushed commit.

## Consequences

A developer can reuse the published vectors with access to the matching model and refresh the local index as source changes. Release assets keep generated vectors out of Git history and give the snapshot a repository-owned distribution point. The pilot will compare search quality with keyword search and measure refresh work and asset size. Snapshot selection, publication cadence, and implementation choices carry forward to later phases.

AI-Fingerprint: sha256:6cce40ee1dfb
