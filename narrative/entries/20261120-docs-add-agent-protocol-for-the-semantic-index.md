---
date: 2026-11-20
slug: docs-add-agent-protocol-for-the-semantic-index
title: "docs: add agent protocol for the semantic index"
summary: "Ship the guidance as an installed protocol block, the same mechanism the ontology and source graph protocols use, enabled only by `--with-semantic-index`."
kind: product
status: accepted
sequence: 2026-11-20T20:34:18.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/176; merge commit 0f4e33c1a14099ad4bd63f4fe20a1bdc85ba897a"
---

## Context

The semantic index shipped with a runbook, user guide and setup reference, but no agent-facing instructions. `AGENTS.md` and the installed protocol never mentioned it, so an agent had no prompt to use it, to refresh a stale index, or to treat results as unverified.

## Decision

Ship the guidance as an installed protocol block, the same mechanism the ontology and source graph protocols use, enabled only by `--with-semantic-index`. Results are framed as leads that must be resolved against Git before use, and `upload`, `download` and scope changes are reserved for explicit requests. Rejected: a standalone doc only, because agents read the instruction file, not setup docs.

## Consequences

Adopters installing or upgrading with `--with-semantic-index` get the block in their agent file. Existing installs receive it on re-run. The block is only guidance and enforces nothing. Embedding endpoints receive source on `refresh`, so the block tells agents not to refresh when told otherwise.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
