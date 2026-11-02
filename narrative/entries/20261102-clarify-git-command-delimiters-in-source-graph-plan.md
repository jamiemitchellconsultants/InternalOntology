---
date: 2026-11-02
slug: clarify-git-command-delimiters-in-source-graph-plan
title: "Clarify Git command delimiters in source graph plan"
summary: "Use argument arrays for every Git invocation and NUL-delimited output for commands that list paths. Keep the detailed plan's specified arguments for object and tree commands."
kind: product
status: accepted
sequence: 2026-11-02T18:39:14.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/50; merge commit 5836deb48aab50333288881a5d94edab96f8a410"
---

## Context

The build found that Task 3 required `-z` for every Git command, although the specified object and tree commands do not all support that option.

## Decision

Use argument arrays for every Git invocation and NUL-delimited output for commands that list paths. Keep the detailed plan's specified arguments for object and tree commands.

## Consequences

The build can handle unusual filenames without adding unsupported options to Git commands. The graph behaviour and architecture remain unchanged.
