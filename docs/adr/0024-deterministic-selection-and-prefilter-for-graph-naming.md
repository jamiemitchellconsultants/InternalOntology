# 0024 — Deterministic selection and prefilter for graph naming

- **Status:** accepted
- **Date:** 2026-11-18
- **Feature:** #122 (docs/features/agent-maintained-knowledge-graph/)

## Context

False positives cost more than missed detections. B27 limits comparison to added or changed nodes and nodes whose ontology item changed; B28 says a label containing the implemented concept's canonical name is never a mismatch; B29–B30 require grounded results with an identity independent of the model's wording.

## Decision

The worker, not the model, decides what is compared. It diffs base and head graph resources by IRI and the base and head `Ontology`, and selects nodes as the architecture describes. It forms (label, item) pairs and drops, before any request, every pair whose label contains the item's local name as a whole PascalCase word sequence. Only the remaining pairs go to the model, with the ontology catalog of the head `Ontology`. Replies are parsed and grounded by the rules of ADR 0019, adapted to nodes: the node IRI must be a compared node, the quoted value must equal its current label or `kit:denotes` target, and the item must resolve to one catalog entry. The result key is the SHA-256 of node IRI, pair type, compared values and canonical ontology key.

## Consequences

The model never sees, and so never reports on, unchanged nodes or names that already contain the canonical term. The rule is tested without a model. Requests are smaller, so the `RequestBudget` goes further. Some real mismatches are missed by design, for example a label that contains the canonical name but means something else. A full sweep of the graph stays a follow-up.

## Alternatives considered

- Send the whole graph and let the model choose: noisier, larger, and results on old nodes nobody touched.
- Put the B28 rule only in the prompt: depends on the model obeying it.
- Compare symbol names in source files: needs fetching pull request source and parsing languages; the graph's `kit:source-symbol` label is what the agent wrote and what the graph claims.
