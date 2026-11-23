# 0044 — Report retired design links without failing the check

- **Status:** accepted
- **Date:** 2026-11-23
- **Feature:** #185 (docs/features/graph-feature-document-links/)

## Context

B20 needs every `RetiredDesignLink` reported while the check passes, so an analyst can retire a behaviour before the code that links it changes, and so the agent can copy the list into the pull request body and the amendment handoff. `GraphChecker` today has only failing findings and exit codes.

## Decision

Give `GraphChecker` a second, non-failing list, `reports`. Each entry names the assertion, its subject, the retired behaviour or superseded or deprecated decision, and any replacement or successor. Text output prints it after the result line; `--json` includes it alongside `findings`; `ok` and the exit code depend on `findings` alone. `GraphCheckWorkflow` appends the reports to the job's step summary.

## Consequences

The same command the agent runs before a pull request gives it the list B20 asks it to copy, and reviewers see the same list in CI. Reports never block a merge, so a forgotten clean-up stays visible but is not enforced; enforcement, if wanted later, is a new decision.

## Alternatives considered

- Fail on retired links: simplest, but blocks an analyst's amendment on code it may not yet change (U8).
- A separate report command: keeps the checker unchanged, but agents and CI would have to remember a second command.
- A pull-request comment from CI: more visible, but needs write permission the read-only check workflow deliberately lacks.
