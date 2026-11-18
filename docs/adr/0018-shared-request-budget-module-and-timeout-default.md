# 0018 — One shared budget module and a 300,000 ms default timeout

- **Status:** accepted (for review on the design pull request)
- **Date:** 2026-11-18
- **Feature:** #111 (docs/features/semantic-request-budget/)

## Context

Open question OQ3, and the question of how two reviewers share one parser. The drift reviewer owns the
budget parser and defaults (200,000 characters, 300,000 ms; ADR 0014). The semantic reviewer has its
own 24,000-character constant and a 30,000 ms request timeout. Scripts must stay byte-identical, and a
repository may install either reviewer or both. The only live timing available is relayed: the drift
reviewer took about 18 s for a 58 KB ontology on the live gateway; no semantic run has been timed.

## Decision

Move the settings code into a new dependency-free module, `templates/scripts/request-budget.mjs`
(`readPositiveInteger`, `resolveRequestBudget`, `MAX_REQUEST_CHARS`, `MODEL_TIMEOUT_MS`), installed with
either reviewer like `llm-auth.mjs`. The drift reviewer re-exports the same names, so existing imports
and tests keep working. Both reviewers share the variable names, the 200,000 default and the
300,000 ms default timeout; the semantic reviewer's request timeout default therefore rises from
30,000 ms to 300,000 ms. A larger prompt means a longer prefill, and a 30,000 ms limit would turn the
newly allowed requests into "model timed out" results, recorded as unreviewed files.

## Consequences

One parser, one set of defaults, one runbook paragraph for both reviewers. The cost is that a hung model
call can now hold a semantic review request for up to five minutes instead of thirty seconds, and chunks
are reviewed in sequence, so a stalled gateway lengthens the job; the timeout is configurable, and the
job's own GitHub timeout still bounds it. The 300,000 ms figure is unmeasured for semantic prompts near
the budget and is documented as such. A repository using different models for the two reviewers shares
one budget and timeout.

## Alternatives considered

- Keep 30,000 ms: smallest change, but it risks turning large prompts into timeouts that look like
  outages.
- Separate semantic-specific variable names: avoids sharing one value across models, but contradicts the
  request to reuse the #100 conventions and doubles the settings an adopter must learn.
- Duplicate the parser in the semantic module: simpler diff, but two copies would drift.
