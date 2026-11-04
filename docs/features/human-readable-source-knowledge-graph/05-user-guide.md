# Human-readable source knowledge graph — user guide

This guide is for repository maintainers assessing graph accuracy and engineers reading recorded relationships. Open the generated `<graph-root>/README.md`, or the configured alternative. The [runbook](05-runbook.md) covers setup, authoring, checks and recovery. Turtle remains canonical; Markdown presents the recorded current state for human assessment.

## B1 — Read every current claim

Start at Nodes, then Current claims. Each claim names its subject, directed relationship and object. Read the sentence in that direction; a relationship in the opposite direction or an indirect shortcut is not implied. Claims may come from several Turtle files. The JEPA-Speech trial should show all 12 recorded assertions.

## B2 — Read names and relationship meanings

Use the recorded names as displayed. Core relationships have readable phrases such as “implements” or “is tested by.” A used local relationship has its declared meaning available in the vocabulary section. Special punctuation is content. Two equal labels can still identify different nodes; follow the claim's source reference when disambiguation matters.

## B3 — Interpret unconnected or empty parts

An isolated node stays in Nodes with no recorded assertions. A valid graph with no assertions still has a document with coverage and limits. “No recorded assertions” describes the graph's knowledge; it does not establish that no relationship exists in the repository.

## B4 — Inspect every supporting source

Beside a claim, follow each file-and-line evidence link. Its role identifies implementation, test, selected document, ontology or deployment evidence. Inspect every supporting reference when there is more than one. Links pin the input source commit; check the source path and line range rather than relying on a green structural check alone.

## B5 — Distinguish direct claims and inference

Direct claims and “Inferred (tentative)” claims are visibly different. Inference evidence is a supporting observation, not direct proof of the inferred relationship. Judge whether the claim follows from its source; generation does not approve semantic accuracy. The all-direct JEPA-Speech pilot needs a separate inferred example for this check.

## B6 — Identify the source snapshot

Expand Source identifiers and provenance to find the full source commit. Evidence and Turtle links identify that same snapshot, including when the branch later advances. An older document does not say the claim was rechecked against newer code. Report unavailable source rather than treating it as verified; use the runbook's recovery procedure when needed.

## B7 — Locate the exact Turtle assertion

Follow the Turtle source link beside the readable claim to its resource block. Use the secondary assertion identifiers and claim anchors to distinguish claims with shared names or subjects. You can begin with ordinary recorded terms without decoding a full IRI. Content corrections belong in that Turtle source.

## B8 — Interpret scope and priority

Read each Coverage selector, status, priority and reason. The highest matching priority wins when selectors overlap. Unmatched paths remain unknown. Covered scope does not promise that every possible relationship in a file has been recorded.

## B9 — Keep gaps distinct from negative facts

For an unanswered question, inspect unknown and excluded areas and their reasons. Say the graph lacks a recorded answer. Valid claims remain usable while other repository areas are unknown or excluded; missing knowledge is not proof that a relationship is absent.

## B10 — Keep the view generated

The document identifies itself as generated and directs corrections to Turtle. Authors commit canonical inputs first, generate with `node scripts/render-source-graph.mjs`, and commit the view afterward in the same PR. CI checks the tracked view with read-only access. Do not maintain a second account by editing the Markdown manually.

## B11 — Expect repeatable output

Repeating generation with unchanged rendering inputs reuses the same source snapshot and produces identical bytes. An unrelated commit does not refresh the claims or change their evidence destinations. If relevant inputs change, follow B12 rather than editing generated provenance.

## B12 — Read the replacement current state

After canonical claims, evidence or coverage change, authors commit the source and regenerate. The new view contains only that graph's current claims and limits. It has no added/changed/removed report, history or diagram. Investigate deeper changes in canonical Turtle.

## B13 — Recognise failure without trusting stale output

A failed generation names the affected input and reason and preserves the previous successful document. That preserved document has not been refreshed. An authored destination is also preserved. Use the runbook to fix canonical inputs, restore the pinned source or choose a safe output path, then regenerate and check again.

## B14 — Use the adopter's configuration

Read the graph and source paths selected by this repository's configuration. Maintainers set its root, namespace, browser URL and optional Markdown path. The same installed scripts serve other repositories without local script changes. JEPA-Speech labels and assertion counts are examples, not defaults.
