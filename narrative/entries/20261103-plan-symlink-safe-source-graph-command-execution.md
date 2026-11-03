---
date: 2026-11-03
slug: plan-symlink-safe-source-graph-command-execution
title: "Plan symlink-safe source graph command execution"
summary: "Task 10 will repair both command entry-point guards and test execution through linked script paths. Its acceptance tests will assert command output and run the installed test files explicitly."
kind: product
status: accepted
sequence: 2026-11-03T04:47:32.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/54; merge commit a4e1d2229889f0b8f47bcd4d1e030dccfb0a19e6"
---

## Context

The bare-Git acceptance test found that the installed commands can silently exit without running when their script paths include a symbolic link. The supplied test also allowed the nested shipped-test invocation to run no tests.

## Decision

Task 10 will repair both command entry-point guards and test execution through linked script paths. Its acceptance tests will assert command output and run the installed test files explicitly. Keep the existing task commits intact and include the repairs in the single Task 10 commit.

## Consequences

The build retains its ordered commit history and verifies that both commands actually run from a bare checkout. Script-path resolution does not change where graph data or configuration is read. GitHub branch-protection verification remains a separate acceptance check.
