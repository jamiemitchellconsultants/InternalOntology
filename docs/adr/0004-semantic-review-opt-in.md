# 0004 — Introduce blocking review as a separate opt-in

- **Status:** accepted
- **Date:** 2026-10-30
- **Feature:** #14 (docs/features/semantic-ontology-matching/)

## Context

The kit already ships an optional advisory `DriftReviewer` through `--with-drift-review`. The
accepted vision changes both its file scope and its merge effect. Existing adopters may have
installed that reviewer and must not acquire a blocking policy by a routine `--force` upgrade.
Maintainers also need to disable the new experiment if findings have no subjective value.

## Decision

Ship the blocking path as a separate `--with-semantic-review` opt-in. Keep the existing advisory
installation unchanged during the pilot. Put `enabled`, model, and endpoint settings in the
adopter-owned `OntologyConfig`; keep the credential in a default-branch-only environment secret.
An installed but disabled reviewer publishes an explicit nonblocking disabled result. Migration guidance tells an
adopter to disable the old advisory workflow when enabling the new path.

## Consequences

Upgrading the kit cannot silently turn advisory findings into merge blockers. Two review paths
exist temporarily, so the installer, documentation, and tests must make their roles clear.
Repository-specific settings remain outside kit-owned scripts. Maintainers can turn the pilot off
without removing its status context or changing the deterministic `TermChecker`.

## Alternatives considered

- Change `--with-drift-review` in place: less code, but a routine upgrade could unexpectedly block
  existing adopters' PRs.
- Replace the deterministic check: contrary to the accepted requirement that it stay independent.
- Require a separate hosted service: adds an operational dependency to a feature designed as an
  optional kit installation.
