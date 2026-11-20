---
date: 2026-11-20
slug: test-document-semantic-index-acceptance
title: "test: document semantic index acceptance"
summary: "Pair the walkthroughs and their evidence with repeatable tests of the installed commands. Use an isolated model and release fixture for the local tests and a private synthetic adopter with a live GitHub draft and Ollama for the pilot."
kind: product
status: accepted
sequence: 2026-11-20T19:57:21.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/171; merge commit 7b820b2d7392e42d30270eb5f795378178d4ab61"
---

## Context

The semantic index build shipped local search and GitHub Release snapshot exchange. Acceptance needed evidence that a second developer could reuse the index, verify citations against Git, and recover from incompatible or interrupted operations. Maintainers asked to review executable behaviour in natural-language Markdown.

## Decision

Pair the walkthroughs and their evidence with repeatable tests of the installed commands. Use an isolated model and release fixture for the local tests and a private synthetic adopter with a live GitHub draft and Ollama for the pilot. Use a Markdown test description as the maintainer review artefact.

## Consequences

The local suite and the live draft release exchange provide evidence for the supported workflow. The representative JEPA-Speech trial used local Ollama and obtained 8 of 12 semantic top-five hits and 1 of 12 keyword top-five hits. All 60 semantic citations resolved at the pinned commit. The maintainer's authenticated HTTPS Qwen probe accepted both the default and explicit float requests for a two-input batch, returning 4,096-dimensional vectors. The installed Kit refreshed 33 passages on a 12-file JEPA-Speech trial. It validated all 60 citations and measured 12 of 12 semantic top-five hits and 3 of 12 keyword top-five hits. Separate reader-account evidence is pending. The LAN HTTP design amendment has merged, with implementation still pending.

AI-Fingerprint: sha256:8cc6ff3e1719
