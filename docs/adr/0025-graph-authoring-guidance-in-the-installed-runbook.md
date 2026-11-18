# 0025 — Graph authoring guidance in the installed runbook

- **Status:** accepted
- **Date:** 2026-11-18
- **Feature:** #122 (docs/features/agent-maintained-knowledge-graph/)

## Context

B1–B12 and B26 must reach every agent through the `AgentInstructionFile` (B5). B13–B19 are detailed authoring guidance needed only when a developer asks for an entry. Every agent reads the protocol block on every task, so its length has a cost. The analyst left the placement to this phase (U10), and the concept-first lookup needed a home (B20–B24).

## Decision

The `GraphAgentProtocol` block carries the always-on rules in a few short paragraphs: look up before naming, record what was built with `kit:implements`, propose narrow coverage for unknown scope and none for excluded scope, list graph changes in the pull request body, record only implemented source, never settle naming results, apply accepted corrections. It tells the agent to read "Authoring graph entries" in `docs/source-knowledge-graph.md` before any add or refine request. That section of the installed runbook holds the label, kind, concept link, evidence and refinement rules, with worked examples. The lookup is a `concept` command of the existing `GraphReader` script, with the same output conventions and the same offline guarantees.

## Consequences

The block stays readable and every workflow gets the rules that matter on every task. Agents asked to author entries get the full guidance at the moment they need it, at the cost of one more file read. Both files are kit-owned and replaced on upgrade. A single reader script keeps one place for staleness and coverage reporting.

## Alternatives considered

- Everything in the protocol block: longer instructions in every agent's context for a rare task.
- A separate skill: would need claude-plugins changes, which the vision excludes, and would not reach other agents.
- A separate lookup script: duplicates the reader's revision, staleness and output code.
