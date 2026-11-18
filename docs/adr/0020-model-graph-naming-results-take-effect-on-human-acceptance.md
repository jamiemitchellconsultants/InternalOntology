# 0020 — Model graph naming results take effect only on human acceptance

- **Status:** accepted
- **Date:** 2026-11-18
- **Feature:** #122 (docs/features/agent-maintained-knowledge-graph/)

## Context

[#35 B11](../features/source-knowledge-graph/02-behaviours.md) kept semantic review of the source graph human and kept the validation script free of model calls, secrets and network access; the narrative entry `docs-feature-behaviours-for-source-knowledge-graph` recorded that maintainers remain responsible for claims. Feature #122 needs a model to find likely naming mismatches between graph names and the `Ontology` (Outcome 5, B25–B34), which B11 as written rules out. The owner widened B11 in the #122 vision. [#62](../features/human-readable-source-knowledge-graph/01-vision.md) keeps automatic accuracy judgement out of scope.

## Decision

A model may produce semantic results about the graph, and a result takes effect only when a person with write access accepts it. For #122 the only such results are `GraphNamingResult`s about names. `GraphChecker`, `GraphCheckWorkflow` and the `GraphRenderer` are unchanged: they make no model call and need no secret or network access after checkout, and a pass still states structural validity only. The model-assisted check runs in its own workflows (`ReviewGraphNaming`), never inside the deterministic check. This partly corrects the accepted decision `docs-feature-behaviours-for-source-knowledge-graph`.

## Consequences

Humans stay responsible for claims: no result changes the graph, the merge outcome or the generated Markdown except through a person's settlement (B37–B39, B44). #62 stands, because a result a person must accept, reject or defer is not automatic judgement. A later model check of whether evidence supports each claim fits under the same rule but needs its own feature. The narrative history gains a `correction` entry citing the original slug; the original entry is not rewritten.

## Alternatives considered

- Keep B11 as written and rely on human review alone: leaves Outcome 5 unmet; JEPA-Speech shows names drifting unnoticed.
- Add model calls to `GraphChecker`: breaks the offline, secret-free guarantee adopters rely on and couples a structural check to a model's availability.
- Let model results block or pass on their own: automatic judgement, which #62 excludes.
