# Human-readable source knowledge graph — behaviours

These behaviours describe `RenderSourceKnowledgeGraph`, serving the five outcomes in the [accepted vision](01-vision.md). They specify what a maintainer can observe in the generated Markdown, leaving components, document layout and workflow publishing mechanics to architecture. The evidence presentation in B4 reflects the owner's explicit preference for readable claims with evidence links. The other decisions below follow the accepted vision or are analyst proposals for review.

## Behaviours

### Outcome 1: The current claims are readable

**B1 — Present every current claim faithfully.** Given a valid `SourceKnowledgeGraph` whose assertions may be spread across several configured Turtle files, when `RenderSourceKnowledgeGraph` generates its Markdown document, then every `GraphAssertion` is represented with its recorded subject, relationship and object, preserving relationship direction and keeping distinct assertions identifiable. The document contains no invented assertions or inferred shortcuts between recorded relationships. For the pinned JEPA-Speech pilot, all 12 recorded assertions are represented.

**B2 — Make recorded names and relationship meanings readable.** Given assertions use `GraphNode` labels and relationships defined by the core or locally extended `GraphVocabulary`, when the document presents them, then the reader can understand who or what is related and the meaning of the relationship without decoding Turtle predicates, prefixes or full IRIs. Recorded names retain their spelling; local relationship definitions remain accessible rather than being silently replaced with a guessed meaning. Markdown-special characters in labels, paths and explanatory text remain readable as their recorded content.

**B3 — Describe an empty or unconnected part honestly.** Given a valid graph has a node with no recorded assertions, or has no assertions at all, when the document is generated, then the recorded node names remain discoverable and the absence is described as no recorded assertions. The document does not invent a relationship or claim that no such relationship exists in the repository. An empty graph still has a usable document showing its declared coverage and limits.

### Outcome 2: A maintainer can assess accuracy

**B4 — Put usable evidence beside each claim.** Given a `GraphAssertion` has one or more `GraphEvidence` references, when a maintainer reads its Markdown representation, then each evidence reference is accessible through a link identified by its source file and recorded line range, with its evidence role understandable. The link resolves to that source and range in the input source snapshot. Blob hashes and full graph identifiers do not dominate the main reading flow; any additional provenance can be reached through references or secondary detail. Every supporting reference remains available, including multiple sources for one claim.

**B5 — Preserve the basis without endorsing the claim.** Given a graph contains both directly evidenced and inferred assertions, when they are rendered, then each claim's direct or inferred basis is explicit, inferred claims are visibly tentative, and their evidence is presented as supporting observations rather than proof of the inferred relationship. The document makes clear that it presents recorded claims for human assessment and that structural validity does not establish semantic accuracy. Exercise an inferred assertion separately from JEPA-Speech's all-direct pilot.

**B6 — Identify the snapshot being read.** Given generation reads a graph and its supporting source at a recorded input revision, when a maintainer opens the document, then the document identifies that input snapshot and its evidence links refer to the same snapshot. Reading an older generated document later does not present its claims as freshly verified against a newer source revision. The document does not claim to have rechecked semantic accuracy merely because generation succeeded.

### Outcome 3: Readable terms lead back to the source graph

**B7 — Find the matching Turtle assertion.** Given a maintainer identifies a claim in Markdown and wants to investigate it, when they use the terms or source references supplied with that claim, then they can locate the corresponding `GraphAssertion` in its Turtle file and distinguish it from other assertions with the same subject, relationship or node label. Recognisable recorded names remain the reading entry point; a reader need not decode a full graph IRI before finding the claim. Verify this route for every assertion in the pinned JEPA-Speech pilot.

### Outcome 4: The view preserves the graph's limits

**B8 — Show declared scope and its precedence.** Given a graph declares covered, unknown and excluded `GraphCoverage` selectors with recorded reasons, when the document is generated, then each declaration, its status and any recorded reason are readable. Where selectors overlap, the document supplies enough precedence information to interpret the highest-priority rule correctly, and states that unmatched paths remain unknown. It does not imply that a covered scope records every possible fact about its files.

**B9 — Keep missing knowledge distinct from a negative fact.** Given a topic has no recorded assertion or falls within unknown or excluded coverage, when a maintainer reads the document, then they can see the relevant coverage declarations and the limitation of the graph's account. Missing assertions or coverage are never described as proof that a relationship does not exist. Valid recorded claims remain readable even when the rest of the repository is unknown or excluded.

### Outcome 5: Markdown stays a generated view

**B10 — Generate an ordinary document from canonical input.** Given a repository has the source graph enabled and valid configured Turtle input, when its Git workflow runs generation successfully, then it produces an ordinary Markdown document of the current graph without requiring hand-editing of that document. Generation leaves canonical Turtle assertions, evidence and coverage unchanged and creates no new source claims. The document identifies itself as generated and directs content corrections to the Turtle source.

**B11 — Reproduce unchanged input without churn.** Given graph data, supporting source snapshot, input revision and rendering settings are unchanged, when generation is repeated, then the Markdown bytes are identical. A run timestamp, run identifier or other execution-specific value does not introduce a content change. The same current assertions, evidence and coverage appear in a stable reading order.

**B12 — Replace the snapshot when the graph changes.** Given a later valid graph has new, revised or removed assertions, changed evidence or changed coverage, when generation succeeds for that input, then the document presents only that input's current state, including its current evidence and coverage. It does not retain superseded claims as current or add an added/changed/removed report, a change history, or a diagram.

**B13 — Fail clearly without publishing a partial replacement.** Given required graph or configuration input is missing, malformed, contradictory, or fails structural or evidence validation, when generation is attempted, then it reports failure with the affected input and a reason and does not publish an apparently successful partial document or replace the last successful document with partial output. If an earlier document remains available, the failed generation is not presented as having refreshed it. A valid empty or partially covered graph, as described in B3 and B9, is not a failure.

**B14 — Respect each adopter's configuration.** Given two adopting repositories use different supported source graph roots, namespaces and source paths in their `OntologyConfig`, when each runs the same installed generation scripts, then each document describes only its own configured graph and points to its own source. Neither repository requires a local edit to a Kit-owned script. JEPA-Speech-specific names, locations and assertion counts are trial data, not installed defaults.

## Uncertainties

The owner's decisions are identified explicitly below. Analyst proposals are concrete defaults for acceptance with this document, rather than claims that the owner chose their details. Technical choices expressly reserved to architecture remain deferred; no behavioural outcome depends on silently settling one of those choices.

| ID | Question | Decision or deferral | Basis |
| --- | --- | --- | --- |
| U1 | Is this a snapshot or an assertion-change report? | A Markdown document of current state. Added/changed/removed reports and change history are out of scope (B1, B12). | Owner decision in the vision discussion. |
| U2 | How should evidence appear without recreating the Turtle clutter? | Show the source file and line range with an evidence link, keeping blob hashes and full graph identifiers out of the main reading flow (B4). Additional provenance can remain reachable through references or secondary detail. | Owner explicitly accepted this evidence presentation during analysis. |
| U3 | What does whole-graph rendering include? | Cover every current assertion, recorded node names, evidence access, basis and declared coverage, including assertions split across configured files. Do not dump prefixes, schema triples or refresh-record bookkeeping into the main reading flow (B1–B5, B8). | Accepted scope, with the treatment of unconnected nodes in B3 proposed by the analyst. |
| U4 | How are custom vocabulary and labels treated? | Preserve recorded names and make the declared relationship meaning accessible without guessing a replacement. Keep special Markdown characters readable as content (B2). | Analyst proposal, consistent with existing `GraphVocabulary`. |
| U5 | Must a reader see full identifiers to find an assertion? | No. Provide terms or source references that unambiguously locate the matching assertion, including when labels are shared; do not make full IRIs the reading entry point (B7). Exact reference and link presentation are deferred to architecture. | Accepted source-lookup outcome; disambiguation is an analyst proposal. |
| U6 | What makes evidence links trustworthy when source changes later? | Identify the input snapshot and link to its evidence rather than silently following a moving branch (B4, B6). Rendering does not establish semantic truth (B5). Snapshot representation and avoiding a self-referential generated commit are deferred to architecture. | Existing `GraphEvidence` and `SourceKnowledgeGraph` revision semantics. |
| U7 | Does absence mean a relationship is false or coverage is complete? | No. Show unknown and excluded declarations and reasons, explain selector precedence and unmatched paths, and distinguish no recorded assertion from no real relationship (B3, B8–B9). | Accepted coverage outcome and existing `GraphCoverage` semantics. |
| U8 | What happens with an empty graph or an invalid graph? | A valid empty graph produces a document with its limits. Invalid input causes a visible failure and no partial successful replacement (B3, B13). Exact validation reuse and publication safeguards are deferred to architecture. | Analyst proposal. |
| U9 | What does repeatability mean? | Identical graph data, supporting source snapshot, input revision and settings produce byte-identical Markdown, without execution-specific metadata (B11). Snapshot identity and workflow triggers are deferred to architecture. | Accepted generation outcome, made testable by the analyst. |
| U10 | Is the output committed, uploaded or displayed in a workflow summary? | Deferred to architecture, together with output location and publishing mechanics. The delivered product must remain an ordinary usable Markdown document of current state (B10); a summary alone must not replace that product. | The accepted vision reserves these mechanics to later phases. |
| U11 | Does the feature extract more facts or provide interactive navigation or diagrams? | No extraction, coverage expansion, diagram renderer, interactive graph browser or semantic correctness judgement. These are out of scope. | Accepted exclusions. |
| U12 | Is the pilot sufficient to prove every outcome? | No. Use its pinned 12 direct assertions for completeness, readability and source lookup; add an inferred assertion, shared-label, empty-graph, coverage-overlap, invalid-input and alternate-configuration cases for the remaining scenarios. A maintainer review trial remains necessary to assess readability and accuracy review. | Accepted measures, supplemented by the analyst's edge cases. |

## Terms

- `RenderSourceKnowledgeGraph` is the new use case: generate the readable current-state Markdown view from the canonical graph without changing its claims or judging their accuracy. It is added to this repository's canonical `docs/ontology.md`; this repository does not keep a Turtle ontology source to regenerate.
- Existing terms used with their canonical meanings are `SourceKnowledgeGraph`, `GraphNode`, `GraphAssertion`, `GraphEvidence`, `GraphCoverage`, `GraphVocabulary` and `OntologyConfig`.
- The Markdown document is a generated view, not a second canonical graph. No new entity, value object, event or enum is introduced in this phase.
