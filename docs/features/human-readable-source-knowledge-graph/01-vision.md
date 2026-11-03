# Human-readable source knowledge graph — vision

## Problem

JEPA-Speech was the first live use of the source knowledge graph introduced by [feature #35](https://github.com/jamiemitchellconsultants/InternalOntology/issues/35). Its maintainer found the Turtle files difficult to read: meaningful content is embedded in structural elements, making it hard to see the claims and assess their accuracy. Maintainers need to read the current `SourceKnowledgeGraph` as a generated Markdown document, much as they read the generated ontology Markdown rather than its Turtle source. The document should expose the graph's meaning while retaining enough recognisable terms to find the underlying Turtle when closer investigation is needed.

## Users

- Repository maintainers who assess whether graph claims accurately describe their source.
- Engineers who read the recorded relationships and follow their supporting evidence.

JEPA-Speech is the first live-use example and the initial readability trial. The feature belongs to the Ontology Kit and must work for other adopting repositories through their own `OntologyConfig` and graph data.

## Outcomes and measures

1. **The current claims are readable.** A maintainer can identify the subjects, relationships and objects of the graph's assertions from Markdown without interpreting Turtle structure. On the JEPA-Speech pilot, compare the document with all 12 recorded assertions: every claim must be represented faithfully, with no invented claim.
2. **A maintainer can assess accuracy.** The readable claims retain access to their `GraphEvidence` and distinguish direct claims from inferences. In a review trial, the maintainer can follow each pilot claim to its supporting source and record an accuracy judgement without first decoding Turtle. Exercise an inferred example separately, since the pilot contains only direct assertions; its tentative basis must remain clear.
3. **Readable terms lead back to the source graph.** When a maintainer needs a closer look, terms or references visible in Markdown provide a route to the corresponding Turtle assertions. For each pilot claim, verify that the maintainer can locate the matching source assertion using information from the document.
4. **The view preserves the graph's limits.** A reader can distinguish recorded facts from unknown or excluded areas. Compare the displayed `GraphCoverage` and reasons with the graph's declarations, and verify that the document never presents missing coverage as an absence of real-world relationships.
5. **Markdown stays a generated view.** A Git workflow produces the document from the canonical Turtle files. Regeneration from unchanged graph data produces unchanged readable content; refreshing the view requires no manual editing of Markdown.

## Scope

- An ordinary Markdown document presenting the current state of the whole published `SourceKnowledgeGraph`, including a graph split across multiple Turtle files.
- Readable `GraphNode` names and `GraphAssertion` relationships, their direct or inferred basis, and supporting evidence accessible from the readable claims.
- Declared covered, unknown and excluded areas, with their recorded reasons.
- Recognisable terms or references sufficient to find a claim in the canonical Turtle for further investigation, without requiring the reader to start there.
- Generation through a Git workflow, with the Turtle files remaining canonical and the Markdown generated rather than hand-edited.
- A maintainer review trial using JEPA-Speech's first live-use graph, supplemented by an inferred assertion example and coverage examples as needed to test the stated outcomes.
- The Kit's existing installation discipline: installed scripts stay byte-identical across adopting repositories, and repository-specific settings belong in `OntologyConfig`.

The exact document layout, output path, generation command and workflow publishing mechanics belong to later phases. They must serve an ordinary readable Markdown document of current state.

## Out of scope

- An added, changed or removed assertion report, a pull-request comparison, or a change history. The owner will use the readable terms to investigate the Turtle when that detail is needed.
- Diagrams, a diagram renderer, an interactive graph browser, or a separate website.
- Replacing the canonical Turtle with Markdown, or editing graph content through the generated document.
- Extracting new assertions, widening an adopter's coverage, or changing the graph schema as a goal of this feature.
- Automatic judgement of semantic accuracy, or treating a successful structural check as proof that a claim is true. Maintainers continue to make that judgement.

## Research

- **First live-use feedback.** In the feature #62 vision discussion, the owner described the meaningful content as embedded in too many structural elements. They asked for the current state in Markdown, analogous to generated ontology Markdown, and explicitly excluded an added/changed/removed view. They would investigate Turtle using terms found in the Markdown.
- **A concrete first-use graph.** [JEPA-Speech pull request #194](https://github.com/jamiemitchellconsultants/JEPA-Speech/pull/194) introduces 12 direct assertions about implementation, tests, documentation and project dependencies. At the inspected revision, the [assertion file](https://github.com/jamiemitchellconsultants/JEPA-Speech/blob/f27c3e0fffd3ce0821a70f0d2f3d6cdbcf715465/docs/source-knowledge-graph/assertions/console-removal-audit.ttl) connects claims to separate evidence records with paths, line ranges, roles and blob IDs, while [node labels](https://github.com/jamiemitchellconsultants/JEPA-Speech/blob/f27c3e0fffd3ce0821a70f0d2f3d6cdbcf715465/docs/source-knowledge-graph/nodes.ttl) live in another file. This is a concrete case for bringing a claim's meaning and evidence together in a readable view; it is not evidence of usability across all adopters.
- **Partial coverage must remain visible.** The pilot's [manifest](https://github.com/jamiemitchellconsultants/JEPA-Speech/blob/f27c3e0fffd3ce0821a70f0d2f3d6cdbcf715465/docs/source-knowledge-graph/manifest.ttl) covers the Console Domain and Application projects, their tests and the ontology, excludes the graph files, and explicitly marks the rest unknown with a reason. A readable account must retain those limits.
- **Human review is already required.** [B11 of feature #35](../source-knowledge-graph/02-behaviours.md) leaves semantic accuracy to maintainers. The [installed source graph guide](../../../templates/docs/source-knowledge-graph.md) likewise says the check proves structure and refresh records, not truth. This feature makes the current claims easier to inspect; it adds no semantic validation guarantee and does not implement B11's change-comparison view.
- **Readable views were anticipated.** The [accepted source knowledge graph vision](../source-knowledge-graph/01-vision.md) anticipates downstream views while leaving renderer selection outside that phase. This feature selects a readable Markdown snapshot as its product; diagrams remain outside its scope.
