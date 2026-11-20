---
date: 2026-11-20
slug: docs-plan-semantic-repository-index-implementation
title: "docs: plan semantic repository index implementation"
summary: "Implement seven separately testable tasks covering configuration, committed source, embeddings, storage, local commands, release exchange, and installer and pilot integration."
kind: product
status: accepted
sequence: 2026-11-20T12:40:00.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/167; merge commit 178c6c12e456db8d1f4433ce74b1ba1166c3cc7b"
---

## Context

The adopter supplies an OpenAI-compatible embedding endpoint and keeps a portable index in its checkout. The build needs a precise contract for trusted Git input, storage and refresh, and GitHub Release exchange before installed scripts or public command output are introduced.

## Decision

Implement seven separately testable tasks covering configuration, committed source, embeddings, storage, local commands, release exchange, and installer and pilot integration. The plan fixes their command and file contracts, error and compatibility handling, and the tests that prove all 16 behaviours. The build branches from main and pushes one validated commit per task from the dedicated worktree.

## Consequences

Reviewers can assess the implementation and its failure cases before code is written. The build uses offline fixtures for model and release responses. Owner-authorised live endpoints and a release provide the paired-checkout evidence in the acceptance phase.

AI-Fingerprint: sha256:7696fcffa70f
