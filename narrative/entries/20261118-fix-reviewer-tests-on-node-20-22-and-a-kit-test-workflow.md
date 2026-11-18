---
date: 2026-11-18
slug: fix-reviewer-tests-on-node-20-22-and-a-kit-test-workflow
title: "fix: reviewer tests on Node 20/22 and a kit test workflow"
summary: "Fix the tests, not the runtime: the hanging-call simulation now keeps the event loop alive itself. Add a kit CI workflow that runs the suite on Node 20, 22 and 24 and runs shipped test files alone from the shipped directory."
kind: product
status: accepted
sequence: 2026-11-18T11:56:49.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/108; merge commit 6fb8936d52c33f0dbd0a753967586b9af5d56788"
---

## Context

The kit's reviewer tests were cancelled on Node 20 and 22, which adopters' `deterministic-preparation` jobs use, and the kit ran no test job in CI, so nobody saw it until JEPA-Speech#205.

## Decision

Fix the tests, not the runtime: the hanging-call simulation now keeps the event loop alive itself. Add a kit CI workflow that runs the suite on Node 20, 22 and 24 and runs shipped test files alone from the shipped directory. Make temp repositories independent of the host's default branch. Rejected: changing `AbortSignal.timeout` use in `modelJson` (not the defect), and adding the check to branch protection in this PR (done by the maintainer after it has run once on `main`).

## Consequences

Test regressions on the supported Node versions now fail the pull request. The workflow's check names (`test (20)`, `test (22)`, `test (24)`) can be made required once it has run. Adopters need `--force` to receive the corrected test file.
