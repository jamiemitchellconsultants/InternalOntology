# 0008 — Use a versioned core graph vocabulary

- **Status:** accepted
- **Date:** 2026-11-02
- **Feature:** #35 (docs/features/source-knowledge-graph/)

## Context

The graph must help agents across C#, TypeScript, Java, and Python and support later
cross-repository consumers. If each adopter uses arbitrary strings for node kinds and
relationships, the checker cannot catch typos and division-ontology cannot reliably interpret
equivalent facts. A closed vocabulary would prevent repositories from recording useful facts that
the first Kit version did not anticipate.

## Decision

Version a small core `GraphVocabulary` with the graph schema: kinds for concepts, source files
and symbols, tests, dependencies, documents, deployment resources, systems, and components; and
relationships for containment, implementation, tests, dependencies, documentation, calls,
communication, and deployment. Adopters may declare additional kinds or relationships as IRIs in
their own namespace, with definitions in their Turtle manifest. `GraphChecker` rejects unknown
values and collisions, but does not infer semantics or impose language-specific endpoint types.

The core is published as stable `kit:` IRIs in a Kit-owned schema file. The initial kinds are
`kit:concept`, `kit:source-file`, `kit:source-symbol`, `kit:test`, `kit:dependency`,
`kit:document`, `kit:deployment-resource`, `kit:system`, and `kit:component`. The initial
relationships are `kit:contains`, `kit:implements`, `kit:tested-by`, `kit:depends-on`,
`kit:documented-by`, `kit:calls`, `kit:communicates-with`, and `kit:deployed-by`. Local extensions
use the adopter's namespace and carry definitions in its Turtle manifest.

## Consequences

Agents and downstream consumers can query the same core values across repositories. Local values
remain usable for grounding, but a cross-repository consumer treats them as opaque until mapped
explicitly. Changing the core requires a schema version decision. Maintainers still judge whether
an assertion's relationship correctly describes its evidence; the deterministic checker cannot.

## Alternatives considered

- Allow arbitrary adopter-authored strings: maximally flexible, but typos and synonyms silently
  fragment cross-repository queries.
- Close the vocabulary to only Kit-defined values: simple to validate, but forces useful new
  relationships into vague categories or waits for a Kit release.
- Reuse ontology terms as graph relationships: each repository's ontology names its own domain,
  while source graph relationships need stable cross-repository meanings.
