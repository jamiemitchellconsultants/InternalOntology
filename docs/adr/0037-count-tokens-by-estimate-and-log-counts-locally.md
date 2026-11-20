# 0037 — Count tokens by estimate and log counts locally

- **Status:** accepted
- **Date:** 2026-11-20
- **Feature:** #178 (docs/features/semantic-index-token-efficiency/)

## Context

B1 to B4 need every search and passage response to report what it cost, and a baseline over time. The Kit installs no dependencies, supports several model families, and must never store query or source text. An exact count would need a model-specific tokenizer.

## Decision

Estimate tokens as the response's character count divided by four, rounded up, and always label it an estimate. Append one counts-only record per response to a Git-ignored log in the existing `.ontology-index/` storage. A failure to write the log is reported in the response and never fails the command. The log rotates once at 1 MiB, keeping one previous file, which answers the retention question in U9.

## Consequences

The figure is deterministic and needs no dependency, so the same response always gives the same estimate and tests can assert it. It is approximate and will differ by model and by content, so comparisons are only meaningful between runs that use it the same way (B4 measures the difference). The log lives with the checkout and is never shared, so a team baseline needs each developer's report.

## Alternatives considered

- **A model tokenizer.** Exact for one family but adds a dependency or a network call and varies by model. Rejected.
- **Print the estimate only.** Nothing recorded, so no baseline over time. Rejected.
- **Log the query text as well.** Richer analysis but stores developer questions on disk. Rejected.
