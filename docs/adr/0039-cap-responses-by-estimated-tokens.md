# 0039 — Cap responses by estimated tokens

- **Status:** accepted
- **Date:** 2026-11-20
- **Feature:** #178 (docs/features/semantic-index-token-efficiency/)

## Context

B8 to B10 need a bound on the size of one search or passage response, set by the repository owner, that does not make an agent's task fail.

## Decision

Add an optional integer `responseCap` under `semanticIndex` in `OntologyConfig`, in estimated tokens, validated with the other index settings and read from the trusted committed configuration. The default when unset is 4000 estimated tokens, about 16,000 characters. A response over the cap is cut at the largest whole line, or whole result, that fits, marked truncated, and states what was returned and what remains. Size never produces an error.

## Consequences

Owners control the worst case in the same unit the log reports. A passage can be requested again from the first line not returned. The default is a starting point to revisit once the baseline from B3 exists (U7). A cap smaller than one line still returns a truncated response that names the omission, so no response is empty without explanation.

## Alternatives considered

- **Refuse oversize requests.** Forces a retry loop for the agent. Rejected.
- **A cap in characters or bytes.** Does not match the unit the feature reports. Rejected.
- **A cap from an environment variable.** Would let an untrusted session raise it. Rejected.
