---
date: 2026-11-18
slug: fix-semantic-reviewer-reads-fenced-replies-and-resolves-evidence-keys
title: "fix: semantic reviewer reads fenced replies and resolves evidence keys"
summary: "Parse one surrounding code fence; resolve evidence keys to the unique catalog item with the same name instead of requiring an exact key; list the valid keys in the prompt; report fixed, specific reasons ([ADR…"
kind: product
status: accepted
sequence: 2026-11-18T13:42:23.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/119; merge commit b03e0c6c41faefa255d679cee92c8ff1867b06c3"
---

## Context

The first live trial of the blocking semantic reviewer showed that it never reviewed anything: the gateway's correct reply was fenced JSON with a singular section prefix in its evidence keys, and the reviewer rejected it as unusable without saying why.

## Decision

Parse one surrounding code fence; resolve evidence keys to the unique catalog item with the same name instead of requiring an exact key; list the valid keys in the prompt; report fixed, specific reasons ([ADR 0019](docs/adr/0019-grounding-of-model-findings.md)). Rejected: fixing only the fence, fixing only the prompt, fuzzy name matching, and requesting JSON mode without verifying the gateway.

## Consequences

A finding is now grounded by an exact quote plus a real item name, slightly looser than an exact key. The prompt grows by one line per ontology entry. Unreadable replies are diagnosable from the pull request comment. Adopters need `--force` to receive the fix.
