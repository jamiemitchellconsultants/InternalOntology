# 0042 — Accept graph manifests at an older schema version

- **Status:** accepted
- **Date:** 2026-11-23
- **Feature:** #185 (docs/features/graph-feature-document-links/)

## Context

`GraphChecker` requires the adopter-owned manifest's `kit:schemaVersion`, the kit-owned `graph-schema.ttl` and `CORE.schemaVersion` to be equal. An upgrade replaces `graph-schema.ttl` but not the manifest, so raising the core to version 2 ([ADR 0041](0041-behaviour-and-decision-kinds-in-schema-version-2.md)) would fail every existing graph, including graphs that never use a version 2 value.

## Decision

Tag each core value with the schema version that introduced it. `GraphChecker` still requires `graph-schema.ttl` to match `CORE.schemaVersion`, but accepts a manifest at any version from 1 up to the core version, and fails a graph that uses a value newer than its manifest's version, naming the value and the version it needs. The installer does not edit manifests. The protocol tells the agent to raise the manifest's version in the same change as the first value that needs it.

## Consequences

A kit upgrade never turns an existing graph's check red. A repository moves to version 2 only when it records its first behaviour or decision, and the check says exactly why. `CORE` carries a version per value, and every later schema change must be additive or take a new decision.

## Alternatives considered

- Keep the exact-match rule and tell adopters to edit one line on upgrade: simpler checker, but a failing required check in every graph-enabled repository until someone edits the manifest.
- Have the installer rewrite the manifest: no red check, but the installer would edit adopter-owned data, which it otherwise never does.
