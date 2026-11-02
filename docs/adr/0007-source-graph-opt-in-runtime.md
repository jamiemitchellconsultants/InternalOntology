# 0007 — Install a local graph workflow explicitly

- **Status:** accepted
- **Date:** 2026-11-02
- **Feature:** #35 (docs/features/source-knowledge-graph/)

## Context

Participating repositories need agent authoring and a blocking graph check, while existing
Ontology Kit adopters must not silently acquire a new required policy on upgrade. Corporate use
places a high bar on external dependencies. The contract must work with C#, TypeScript, Java, and
Python and let JointBooking use Terraform alone for deployment evidence.

## Decision

Add an explicit `--with-source-graph` installation path. It installs byte-identical Kit-owned
Node.js reader and checker scripts, a read-only PR and default-branch workflow, a marked agent
protocol, and a runbook. The adopter owns the graph files, including declared coverage, and
`OntologyConfig` settings for graph location and eligible evidence roles. The authoring agent
updates the graph before a PR; CI validates structure and freshness without generating facts.
Maintainers review semantic truth. No Graphify or hosted graph service is required.

## Consequences

Current adopters keep their existing checks until they opt in. A participating repository can
require the graph check in branch protection and can upgrade Kit-owned scripts by copying files.
The agent can use language-specific tools available locally, but the graph contract and checker
do not depend on a particular parser. Repository-specific evidence selection stays in adopter
data and configuration. The source repository does not render C4 views; division-ontology or
another consumer can derive them from pinned reviewed facts and visible gaps.

## Alternatives considered

- Enable a blocking graph check on every routine Kit upgrade: would change existing adopters'
  merge policy without an explicit decision.
- Generate the graph in CI: hides the proposed facts from the PR author and makes the check rely
  on semantic generation rather than deterministic validation.
- Require Graphify or a hosted graph database: adds external dependencies to every participating
  repository and conflicts with the corporate portability constraint.
