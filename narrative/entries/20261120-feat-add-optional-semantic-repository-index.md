---
date: 2026-11-20
slug: feat-add-optional-semantic-repository-index
title: "feat: add optional semantic repository index"
summary: "Ship the indexing commands as an opt-in part of the Kit. Keep index state in an ignored file per checkout, with versioned GitHub Release assets as the shared distribution channel. Read model and scope settings from a trusted commit."
kind: product
status: accepted
sequence: 2026-11-20T17:43:14.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/169; merge commit ee57d634a2d23e9273fa655184683920bbd7de3a"
---

## Context

Adopting repositories need a way to search committed code by meaning and to reuse the indexing work across checkouts. The owner needs control over which committed files are sent to the model and who can publish a snapshot that teammates consume.

## Decision

Ship the indexing commands as an opt-in part of the Kit. Keep index state in an ignored file per checkout, with versioned GitHub Release assets as the shared distribution channel. Read model and scope settings from a trusted commit. Require current default-branch publishing policy and the exact pushed release commit before upload.

## Consequences

Teams can index local commits, reuse matching assets, and refresh incrementally. Query embedding still uses the configured model. A suitable adopting repository and approved model and release are needed for live acceptance and retrieval-quality measurement. Automated tests exercise the workflow with simulated model and GitHub services.

AI-Fingerprint: sha256:7d2a8de4c0c5
