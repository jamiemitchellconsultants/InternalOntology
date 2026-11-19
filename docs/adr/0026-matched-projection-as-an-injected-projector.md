# 0026 — Matched projection as an injected projector in its own module

- **Status:** accepted
- **Date:** 2026-11-19
- **Feature:** #135 (docs/features/matched-ontology-projection/)

## Context

B1 and B13 to B21 change what goes into each semantic review request. Three things constrain the
change:

- The graph naming reviewer imports `catalogOntology`, `REQUEST_OVERHEAD`, `stripFence` and
  `resolveEvidenceKey` from `semantic-review-model.mjs`. It is installed even without
  `--with-semantic-review`, and it is out of scope here.
- B21 requires the `full` projection to stay byte-identical to today's.
- U13 requires embedding retrieval to stay possible later without reshaping the reviewer.

## Decision

The selection lives in a new kit-owned module, `templates/scripts/ontology-projection.mjs`, which
`createProjector({ mode, bannedAliases })` returns. A projector is a function from the catalog and a
Markdown text to the projection text and the evidence keys sent in full. `reviewFiles` takes it as an
optional `project` argument and calls it once per file to plan chunks (B17) and once per request,
including each half of a 413 split (B19). When the argument is absent, `reviewFiles` uses a built-in
full projector that returns `catalog.projection` unchanged. So `semantic-review-model.mjs` does not
import the new module, and graph naming neither needs it nor changes. The `SemanticReviewWorker` builds
the projector from `OntologyConfig` and passes it in.

`catalogOntology` gains one additive field that groups every row by evidence key in ontology order
(B8). Its `projection`, `entries`, `evidenceKeys` and `rows` stay exactly as they are.

## Consequences

The full projection, graph naming and every existing caller of `reviewFiles` behave as before. The
matching rules can be tested without a model or the reviewer. A later embedding selector is another
projector behind the same argument; it would have to be awaited, so `reviewFiles` awaits the projector
from the start. The installer copies one more file, and its test, with `--with-semantic-review`. The
`rows` map keeps its last-row-wins behaviour for compatibility, so new code must use the grouped field.

## Alternatives considered

- **Put the selection inside `semantic-review-model.mjs`:** no installer change. But the file is
  shared with graph naming, so every adopter of either reviewer would get selection code it may never
  use, and swapping in another selector later would mean editing it again.
- **Import the new module from `semantic-review-model.mjs`:** graph-naming-only installs would then
  need it too, which couples them to a feature they do not use.
- **Fix `rows` in place to hold every row:** it is returned to callers, so changing its shape risks
  graph naming and existing tests for no gain over an additive field.
