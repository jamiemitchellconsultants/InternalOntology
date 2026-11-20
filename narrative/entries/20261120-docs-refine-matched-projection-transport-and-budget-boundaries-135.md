---
date: 2026-11-20
slug: docs-refine-matched-projection-transport-and-budget-boundaries-135
title: "Docs: refine matched projection transport and budget boundaries (#135)"
summary: "- The semantic reviewer requests raw Contents bytes at the reviewed head SHA for both the Turtle source and the Markdown fallback. It decodes strict UTF-8 and uses the numeric HTTP 404 from the source read as the only fallback trigger."
kind: product
status: accepted
sequence: 2026-11-20T09:21:27.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/160; merge commit 04344bdbaa73753283a955813c5a62fdda7b75fb"
---

## Context

The build review found two cases outside the original green tests. A kit-generated 3,840-entry source occupied 1,091,379 bytes of Turtle, above GitHub's inline Contents limit, while its matched name index used just 67,657 of the default 200,000 characters. The planner produced 16 requests when it received the rendered ontology. Separately, a single emoji with one UTF-16 code unit of room reached the pre-send guard intact and got the generic too-large reason. B18 requires the original line's offset and the budget setting. [Build pushback](https://github.com/jamiemitchellconsultants/InternalOntology/issues/135#issuecomment-7035269602)

## Decision

- The semantic reviewer requests raw Contents bytes at the reviewed head SHA for both the Turtle source and the Markdown fallback. It decodes strict UTF-8 and uses the numeric HTTP 404 from the source read as the only fallback trigger. This keeps the existing read permission and avoids a second API lookup for an existing file. [ADR 0034](docs/adr/0034-semantic-review-reads-raw-ontology-contents.md)
- The matched projector budgets each piece with its own selected projection and keeps code points whole. If an indivisible piece cannot fit, it reports the line too-large cause with the original line's offset and discards the file's plan. The model module continues to guard actual sends and handle HTTP 413 as before. [ADR 0035](docs/adr/0035-matched-planner-budgets-whole-code-points.md)

## Consequences

- The name-index ceiling can be exercised without the former inline Contents limit. The raw response still has the GitHub endpoint limit and shares the existing renderer, evidence keys and finding identity.
- Initial matched planning can diagnose an indivisible piece before any chunk of the file is sent. Extra selection is confined to pieces of long lines. Full mode retains its request construction.
- Developer planning and build need amendment coverage for raw Turtle beyond the inline limit, fallback and source errors, in-word selection, the surrogate-pair boundary and the empty name index. The user phase still verifies the installed reviewer, including a live model run in JEPA-Speech.
