# 0041 — Add behaviour and decision kinds in graph schema version 2

- **Status:** accepted
- **Date:** 2026-11-23
- **Feature:** #185 (docs/features/graph-feature-document-links/)

## Context

B1, B5, B17, B18 and B22 need a `FeatureBehaviour` and a `DesignDecision` to be graph nodes with a status and a link to a replacement or successor, in values that a division consumer can rely on across repositories. [ADR 0008](0008-source-graph-vocabulary.md) makes adopter-local kinds opaque to such consumers, and says a change to the core needs a schema version decision.

## Decision

Raise `CORE.schemaVersion` to 2 and add, as core `GraphVocabulary` values:

- kinds `kit:behaviour` and `kit:decision`;
- an optional `GraphNode` predicate `kit:designStatus`, allowed only on those two kinds and required on them, with values `kit:current` and `kit:retired` for a behaviour (`BehaviourStatus`) and `kit:proposed`, `kit:accepted`, `kit:superseded` and `kit:deprecated` for a decision (`DecisionStatus`);
- relationships `kit:replaced-by` (behaviour to behaviour) and `kit:superseded-by` (decision to decision).

Node IRIs are `:behaviour-<slug>-B<n>` and `:decision-<NNNN>` in the graph's namespace. `renderSchema()` writes `CORE.schemaVersion` instead of a literal 1.

## Consequences

Consumers can query behaviours and decisions by the same IRIs in every repository. Status is a property of the node because it describes the document, not a link; replacement and successor are assertions, so they appear in lookups, the rendered graph and a division import with no extra handling. `GraphChecker` gains one node predicate and one value list per kind. Existing `kit:implements`, `kit:tested-by` and `kit:documented-by` carry the new links unchanged.

## Alternatives considered

- Adopter-local kinds: no kit change, but opaque to division consumers, so outcome 5 fails.
- Status encoded in the kind (for example `kit:retired-behaviour`): one fewer predicate, but a status change would change the kind and break queries by kind.
- Replacement and successor as node predicates: fewer assertions, but invisible to the reader's link lookups and the division import's assertion model.
