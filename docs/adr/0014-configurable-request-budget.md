# 0014 — Request budget and timeout are environment settings, default 200,000 characters

- **Status:** accepted
- **Date:** 2026-11-18
- **Feature:** #100 (docs/features/drift-request-budget/)

## Context

`MAX_REQUEST_CHARS` is a fixed 24,000, below the ontology projection of JEPA-Speech (58,094) and
Grooveloom (73,517) characters, so the reviewer refuses to run. Scripts must stay byte-identical, so
a per-repository value cannot live in the script. The home models have a 131,072-token window.

## Decision

The default becomes 200,000 characters. At roughly 3 to 4 characters per token for English prose and
identifier-heavy tables, that is about 50,000 to 67,000 tokens, so a complete request uses at most
about half of a 131,072-token window and leaves at least 64,000 tokens for a reasoning model's
thinking and its 8,192-token output cap. Every batch is planned against this budget, so no request
exceeds it. The budget is read from `ONTOLOGY_MAX_REQUEST_CHARS` and the model timeout from
`ONTOLOGY_MODEL_TIMEOUT_MS`, both through one exported parser, `readPositiveInteger(env, name,
fallback)`: unset, empty or whitespace gives the fallback, digits forming a positive safe integer is
accepted, anything else throws an error naming the variable and the value. The timeout default stays
300,000 ms and `max_tokens` stays 8,192. The workflow template passes both from repository
variables of the same names.

## Consequences

Large-ontology repositories work without a kit release, and cloud-model adopters raise one variable.
The character count remains a heuristic, so the 413 split stays the authoritative fallback. The
300,000 ms timeout is unmeasured against a prompt near 200,000 characters; the runbook says so.
A larger prompt costs more per run.

## Alternatives considered

- Read the budget from `ontology.config.json`: also valid, but the setting varies with the model
  and endpoint, which already live in repository variables, and the config is adopter-owned prose.
- Derive the budget from a model context window setting: needs a new setting and a tokeniser guess.
- Raise the constant only: still forces a script edit for cloud models.
- Split the ontology projection across requests: rejected as out of scope in the vision.
