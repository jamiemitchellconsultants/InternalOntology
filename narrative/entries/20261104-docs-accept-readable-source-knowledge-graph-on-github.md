---
date: 2026-11-04
slug: docs-accept-readable-source-knowledge-graph-on-github
title: "docs: accept readable source knowledge graph on GitHub"
summary: "Accept the current-state Markdown view for the tested GitHub deployments based on scripted walkthroughs, approved executable cases and hosted evidence."
kind: product
status: accepted
sequence: 2026-11-04T05:19:46.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/81; merge commit c414e1f9c78568e369c9745f31b745714b8b35d4"
---

## Context

The user phase found that green structural and Markdown freshness checks did not establish usable hosted evidence navigation. That failure produced the merged build amendment in PR #79 and required acceptance to resume against real hosted views.

## Decision

Accept the current-state Markdown view for the tested GitHub deployments based on scripted walkthroughs, approved executable cases and hosted evidence. Preserve the failed trial alongside the correction and successful reruns, and record the untested Enterprise-host boundary explicitly.

## Consequences

Maintainers have a runbook, a user guide and a reproducible acceptance record. The named GitHub deployments demonstrate readable claims, source-line access, retained snapshot retrieval and required-check enforcement. Semantic judgement remains human; host retention observations do not promise indefinite availability. The parent feature can close after this user-phase PR merges and feature status reports all phases done.

AI-Fingerprint: sha256:f269d2797c48
