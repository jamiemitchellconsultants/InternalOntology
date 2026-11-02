---
date: 2026-11-02
slug: clarify-source-graph-configuration-reset-behaviour
title: "Clarify source graph configuration reset behaviour"
summary: "Preserve existing configuration for normal installs and forced upgrades. An explicit content reset restores the graph-enabled starter configuration and discards the prior settings, consistent with the existing reset contract."
kind: product
status: accepted
sequence: 2026-11-02T19:27:44.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/52; merge commit 3de29cc94fc6aaf9dc53ee4723c27f00b2dccd5f"
---

## Context

The source graph plan said existing configuration is never edited, while the installer's explicit content reset already replaces adopter-owned configuration. The build needed a consistent rule for combining the graph option with that reset.

## Decision

Preserve existing configuration for normal installs and forced upgrades. An explicit content reset restores the graph-enabled starter configuration and discards the prior settings, consistent with the existing reset contract.

## Consequences

The detailed plan includes a test for the combined options and the absence of a config notice after reset. Existing settings remain protected during normal installation and forced upgrades; an explicit reset remains destructive.
