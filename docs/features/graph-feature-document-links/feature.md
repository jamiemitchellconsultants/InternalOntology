# Source graph links to feature documents

## Product owner: vision

### Problem

A feature's design lives in its documents: the analyst's behaviours, the architect's components and ADRs. The code that results lives in the `SourceKnowledgeGraph`. Nothing connects the two. When pushback changes a behaviour, nobody can ask "what code and tests does this affect?". When an agent or reviewer reads a class, they cannot find which behaviour it serves or which ADR shaped it. A division ontology cannot assemble a feature → behaviour → code view. The only link today is the architect's traceability table, which stops at components that may not exist yet. So people and agents rediscover these connections by hand, or guess.

### Users

- Developers in repositories with the kit and the source graph installed, who run features through the persona skills, read the graph, and want to know why code exists and what a behaviour change touches. JEPA-Speech's maintainer is the first.
- The agents those developers direct, in persona-skill runs and in pencils-down runs, which write the links as they build and use them when an amendment arrives.
- Maintainers reviewing pull requests, who judge whether a link such as "this symbol implements `<slug>#B3`" is true.
- Division ontology repositories, which import each repository's graph at a pinned commit and want to traverse from features through behaviours to code across repositories.

### Outcomes and measures

Success is the owner's own judgement in a trial on JEPA-Speech, after reinstalling the kit and refreshing its persona skills from claude-plugins. No numeric targets are set.

1. **"What does this behaviour touch?" has an answer.** Starting from `<slug>#B3`, a developer or agent finds the components, code and tests linked to it, at a recorded revision. Measure: the owner asks for several behaviours and checks the answers against source.
2. **"Why does this code exist?" has an answer.** Starting from a symbol or component, a developer or agent finds the behaviours it serves and the ADRs that shaped it. Measure: the owner picks several symbols and judges whether the answers are right and useful.
3. **Agents record the links as they build.** In a persona-skill run, links are added in the same change as the code or test they describe, and every link cites evidence that exists. Measure: the owner reviews the trial pull requests and judges the links complete, well formed and not noisy.
4. **Links stay true through amendments.** When pushback changes or retires a behaviour, a deterministic check reports every link to a retired or missing behaviour, and the amendment's handoff can list the code and tests it affects. Measure: in the trial, the owner amends one behaviour and confirms that the affected links are reported.
5. **A division can follow the links.** Behaviours, decisions and their links use core graph kinds and relationships that a downstream consumer can rely on across repositories, and a division import keeps them. Measure: the owner judges that a division import of the trial graph can be traversed from a feature's behaviours to its code. Building a dedicated division view is not part of this measure.

### Scope

- Core graph support for behaviours and decisions (ADRs) as node kinds a division consumer can rely on. A behaviour node has a stable identity derived from `<slug>#B<n>` and cites its declaration in the feature's behaviours document; a retired behaviour stays visible as retired.
- Direct links only: a behaviour to its acceptance test; a component to the code it contains; a component or symbol to the ADR that shaped it; a component to the behaviours the traceability table gives it, once its code exists; and a symbol to a behaviour only where one symbol carries out the use case.
- Lookups both ways in the `GraphReader`: from a behaviour to its components, code and tests, and from a symbol or component to its behaviours and ADRs.
- A deterministic, offline check that reports links to retired or missing behaviours, with no model call.
- A stronger `GraphAgentProtocol` in `AGENTS.md` saying when an agent writes each link, so it reaches every workflow.
- Feature documents and ADRs as eligible evidence under the selected-document role.
- A trial on JEPA-Speech.

### Out of scope

- Nodes for vision outcomes; they are reachable through behaviours.
- Planned components that have no code yet.
- Symbol → behaviour links that could only be inferred from a flow across several symbols.
- Behaviour ids in code comments or commit trailers.
- Retrofitting links for features built before this one, except as an "add or refine" request.
- Changes to the claude-plugins persona skills or to superpowers. Phase-specific hooks would be a separate claude-plugins change.
- A model check of whether a link is true; maintainers judge that, and the graph naming review stays limited to names.
- Cross-repository search, the division runtime, and a dedicated division view of features.

### Research

- **The vocabulary half-expects behaviours.** Schema version 1 of the [graph vocabulary](../../../templates/source-graph/graph-schema.ttl) has nine kinds and no behaviour or decision kind, but `kit:implements` is already defined as realising "the named concept or behaviour", and `kit:document` with `kit:documented-by` can already hold an ADR. The [graph checker](../../../templates/scripts/check-source-graph.mjs) enforces no endpoint kinds and requires `kit:denotes` only on concept nodes, so a repository could model behaviours today as local kinds. [ADR 0008](../../adr/0008-source-graph-vocabulary.md) makes local kinds opaque to cross-repository consumers, so outcome 5 needs them in the core, which is a schema version decision.
- **Lookups are concept-only.** The [graph reader](../../../templates/scripts/query-source-graph.mjs) `concept` command follows `kit:denotes` and `kit:implements` from an ontology term; nothing starts from a behaviour, and reverse lookup is only the generic neighbours command. The installed [graph protocol](../../../templates/protocol/source-graph-protocol.md) already says never to record a planned or designed component.
- **Behaviour ids are written three ways.** Every feature here and in JEPA-Speech starts a behaviour with a bold `B<n>`, but as `**B1 — Title.**`, `- **B1 Title.**` or `**B1. Title.**`, in `02-behaviours.md` (full mode) or `feature.md` (lite mode). No feature has a retired behaviour yet. A deterministic check that a cited line declares `B<n>` has to accept these forms or rely on one fixed form. The claude-plugins analyst skill now makes ids permanent, never reused, and names them `<slug>#B<n>` outside their feature (claude-plugins PR 10, merged).
- **The JEPA-Speech trial ground.** At `main` commit `71f8a2b`, it has one feature (`zener-shape-tracing-motor-test`, full mode, behaviours B1 onwards in `02-behaviours.md`) and six ADRs in `docs/adr/`. Its graph holds 3 component, 4 concept, 3 source-file, 2 test, 2 dependency and 1 document nodes, with `kit:implements`, `kit:tested-by`, `kit:documented-by` and `kit:depends-on` assertions. `docs/adr/**` is configured as selected-document evidence; `docs/features/**` is not. Its persona skills predate stable behaviour ids and need refreshing from claude-plugins before the trial.
- **The division import is generic.** division-ontology's [C4 graph reader](https://github.com/jamiemitchellconsultants/division-ontology/blob/main/src/c4/graph.mjs) reads every `GraphNode`'s kind, label and `kit:denotes`, and every `GraphAssertion`'s subject, relationship, object, basis and evidence, without a fixed list of kinds. New core kinds should survive import; a view that uses them would be division work.
- **Prior art for requirement links.** The [OSLC Requirements Management vocabulary](https://docs.oasis-open.org/oslc-domains/oslc-rm/v2.1/cs01/part2-requirements-management-vocab/oslc-rm-v2.1-cs01-part2-requirements-management-vocab.html) gives a requirement `implementedBy` and `validatedBy` links, the latter to tests, which match `kit:implements` (inverted) and `kit:tested-by`. There is no established RDF vocabulary for ADRs: [e-adr](https://github.com/adr/e-adr) embeds decisions as Java annotations in code. Research on decision traceability ([Gerdes et al., ECSA 2014](https://www.inf.uni-hamburg.de/en/inst/ab/swk/research/publications/pdf/2014-08-25-ecsa2014-wien-gerdes-lehnert-riebisch-paper.pdf)) argues that fine-grained links from decisions to code enable change impact analysis, and [a WICSA 2014 paper](https://swc.rwth-aachen.de/docs/publications/2014_WICSA_DLB_SWC.pdf) notes that architects prefer lightweight links over heavy cross-repository integration, which supports keeping links few and direct.
