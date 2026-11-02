---
date: 2026-11-02
slug: docs-feature-plan-source-knowledge-graph-implementation
title: "docs(feature): plan source knowledge graph implementation"
summary: "Fill the gaps conservatively and record them in the task plan's decisions table. An evidence role with no configured selector accepts no evidence, so Terraform-only deployment is plain configuration."
kind: product
status: accepted
sequence: 2026-11-02T17:13:00.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/48; merge commit 5766634418e5540e9d74e47ae376215b8201d89c"
---

## Context

The accepted architecture fixes the behaviour of the graph but leaves several contract details to the developer: the shape of the graph settings in `OntologyConfig`, the IRIs for evidence roles and outcomes, how a deleted file is recorded, how a review record is named, and how the checker and reader are invoked locally and in CI. The plan has to settle these without changing a behaviour or an ADR, keep the installed scripts byte-identical across repositories, and let every claim be proved by a test that runs without a model, secret or network.

## Decision

Fill the gaps conservatively and record them in the task plan's decisions table. An evidence role with no configured selector accepts no evidence, so Terraform-only deployment is plain configuration. Every existing covered file must carry a review record whose blob equals its current blob; pull request mode adds the base-and-proposed union rule from ADR 0006 and a guard against a pull request disabling or relocating the check. Revisions are read from Git objects, including the index for a staged candidate, never from the working tree. Rejected: baking a fixed evidence default into the scripts, which would break byte-identical installs, and reading configuration from the working directory, which a pull request could rewrite.

## Consequences

The build can proceed task by task with each behaviour mapped to the task that proves it. The first broad declaration of coverage by an adopter needs one review record per covered file, which an agent must write by hand; the checker prints each expected blob ID, and a record-writing helper is left as a possible later change. The branch-protection integration of the new workflow is verified only in a disposable GitHub repository during the final task, or reported as unverified. Numeric grounding targets stay deferred.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
