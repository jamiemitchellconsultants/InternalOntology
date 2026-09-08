---
date: 2026-09-08
slug: add-codeowners-naming-the-repository-owner
title: "Add CODEOWNERS naming the repository owner"
summary: "Added a single catch-all CODEOWNERS entry (`* @jamiemitchellconsultants`) rather than per-path ownership, since there is currently one maintainer."
kind: product
status: accepted
sequence: 2026-09-08T07:12:58.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/4; merge commit 1698be5e9f45d87a80e03df7d833e4af69c1943c"
---

## Context

`main` had no branch protection and no CODEOWNERS, so any push could land directly with no review.
The repository is moving to a required-review model for `main`.

## Decision

Added a single catch-all CODEOWNERS entry (`* @jamiemitchellconsultants`) rather than per-path
ownership, since there is currently one maintainer. Branch protection (required PR review, required
code-owner review, admin override allowed) is applied separately via the GitHub API/UI, not in this
PR, since it's a repository setting rather than repository content.

## Consequences

Once branch protection is enabled, pull requests into `main` will require review before merging,
except that repository admins can override the requirement. Future maintainers or path-specific
owners can be added to CODEOWNERS by extending this file with more specific patterns above the
catch-all line.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
