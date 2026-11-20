# 0029 — Use an opt-in CLI and read trusted committed settings

- **Status:** accepted
- **Date:** 2026-11-20
- **Feature:** #143 (docs/features/semantic-repository-index/)

## Context

B1, B2 and B13–B16 require a search interface for developers and agents, with the owner controlling which source and queries an endpoint receives. The Kit installs byte-identical scripts, and a checkout can contain branch changes from people who lack authority to change these settings.

## Decision

Ship an opt-in Node 20+ CLI with human and JSON output and separate `status`, `refresh`, `search`, `download` and `upload` operations. The `Installer` supplies the scripts and runbook. `gh` is required only for release exchange. The adopter's config stays in `OntologyConfig`.

Read `OntologyConfig` from a trusted committed ref, defaulting to the local remote-tracking default branch. Allow an adopter to explicitly nominate a different owner-trusted full ref or commit with `ONTOLOGY_INDEX_CONFIG_REF`. Report a missing trusted ref or disabled or invalid settings before any network activity. The trusted Git ref supplies the policy, while `HEAD` supplies the source revision. An imported asset can supply compatibility evidence only.

## Consequences

Each checkout can search without a daemon or GitHub access. It uses the settings from the last fetched trusted revision and can report that revision for diagnosis. Its owner can update the policy on that ref. The installer or runbook verifies the ignore rule before writing local state. The adopter still runs the Kit scripts they trust. Configuration is credential-free. Model and release credentials enter through their respective runtime mechanisms.

## Alternatives considered

- Read settings directly from the current tree. Branch changes could redirect a model call or widen its source scope.
- Fetch policy from GitHub on every command. This would make local search and status depend on GitHub availability.
- Ship a daemon or an MCP server first. A local CLI with JSON provides the callable interface for the pilot without a second process to deploy and maintain.
