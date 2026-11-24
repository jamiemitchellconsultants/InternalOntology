---
date: 2026-11-24
slug: restore-source-graph-markdown-regeneration-after-kit-upgrades-185
title: "Restore source graph Markdown regeneration after kit upgrades (#185)"
summary: "Validate the previously recorded source revision with support for its earlier schema. Require the current schema when validating canonical inputs, and retain the provenance and input matching checks."
kind: product
status: accepted
sequence: 2026-11-24T05:31:14.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/196; merge commit 733449939c06ddb5a6f681a4dcecb13a71f58cd2"
---

## Context

During JEPA-Speech acceptance, the version 2 kit accepted an existing version 1 manifest but stopped before regenerating its Markdown. The generated document pointed to a source revision with the version 1 schema. The failure reopened Dev Build for #185.

## Decision

Validate the previously recorded source revision with support for its earlier schema. Require the current schema when validating canonical inputs, and retain the provenance and input matching checks. The documented default generation can now replace a stale view after a schema upgrade.

## Consequences

Existing adopters can regenerate their view immediately after upgrading while keeping the version 1 manifest. The refreshed Markdown pins the upgrade revision and passes the staged check. A direct graph check still rejects an outdated schema. The installed upgrade needs a fresh USER walkthrough in the JEPA-Speech trial.
