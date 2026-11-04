---
date: 2026-11-04
slug: keep-narrative-proposals-up-to-date
title: "Keep narrative proposals up to date"
summary: "Install the documented refresh workflow. Refresh after default-branch narrative changes and successful maintenance runs, and allow manual recovery."
kind: product
status: accepted
sequence: 2026-11-04T06:01:23.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/83; merge commit d4bba882b9fd1e9826ea651d9b7986774ff312bc"
---

## Context

Narrative proposals compile a shared document from separate fragments. When another proposal merges first, an older proposal can conflict and require manual regeneration. A push-triggered refresh alone can also finish before the maintenance workflow creates its proposal.

## Decision

Install the documented refresh workflow. Refresh after default-branch narrative changes and successful maintenance runs, and allow manual recovery. Run from the trusted default branch with write access to contents and read access to pull requests.

## Consequences

Open proposals can be updated and their compiled narrative validated without force-pushing. Conflicts outside generated output remain for human resolution. The workflow must reach the default branch before it can run, and narrative proposals remain subject to review.
