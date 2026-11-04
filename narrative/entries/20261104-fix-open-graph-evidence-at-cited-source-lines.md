---
date: 2026-11-04
slug: fix-open-graph-evidence-at-cited-source-lines
title: "fix: open graph evidence at cited source lines"
summary: "Select source view explicitly on generated source-file links using the host's `plain=1` query parameter, preserving commit-pinned destinations and numeric line anchors."
kind: product
status: accepted
sequence: 2026-11-04T04:55:14.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/79; merge commit 35cb962013c61fde9552823248fdc95da93e150e"
---

## Context

Hosted acceptance of PR #77 exposed a gap that local link-shape tests and green CI missed: GitHub renders Markdown evidence by default and does not expose its cited source-line range in Preview. User acceptance raised pushback against the build phase for B4.

## Decision

Select source view explicitly on generated source-file links using the host's `plain=1` query parameter, preserving commit-pinned destinations and numeric line anchors. Verify the URL contract locally and the actual selected source lines in the browser.

## Consequences

Maintainers can navigate to Markdown evidence source lines. Existing generated views need regeneration after upgrading the renderer. The full user acceptance phase, including retention and required-check trials, resumes after this amendment is reviewed and merged.

AI-Fingerprint: sha256:a2c5cbeadf6c
