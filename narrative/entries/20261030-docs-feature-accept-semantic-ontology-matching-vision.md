---
date: 2026-10-30
slug: docs-feature-accept-semantic-ontology-matching-vision
title: "docs(feature): accept semantic ontology matching vision"
summary: "Accept the vision in `docs/features/semantic-ontology-matching/01-vision.md`: findings block merge; model or configuration failure is reported as not reviewed and does not block; repository maintainers own model configuration and…"
kind: product
status: accepted
sequence: 2026-10-30T11:33:00.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/22; merge commit 0e3df2fc80ad4e4894f44247ddd8eb6ddd238954"
---

## Context

The kit's current semantic reviewer is optional, advisory, and examines only added lines. The feature discussion established a different product need: trusted collaborators' PRs should be checked for semantic mismatches across each changed Markdown file, with a path for agents to resolve findings and maintainers to dismiss false positives.

## Decision

Accept the vision in `docs/features/semantic-ontology-matching/01-vision.md`: findings block merge; model or configuration failure is reported as not reviewed and does not block; repository maintainers own model configuration and credentials; the PR author's agent may commit corrections under the author's identity, while other agents propose them; a maintainer may dismiss a specific false positive with a recorded reason. The pilot has no numerical value target and may be disabled if maintainers see no subjective value.

## Consequences

The analyst and architect phases must define the exact review, resolution, and secure execution behavior. This PR records product intent; it does not yet change the existing reviewer or its advisory documentation. Fork PRs remain outside this feature and have a separate manual-investigation issue (#21).

AI-Fingerprint: sha256:5526c065773d
