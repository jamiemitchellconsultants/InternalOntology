---
date: 2026-11-20
slug: docs-amend-matched-ontology-projection-plans-after-acceptance-pushback-1
title: "docs: amend matched ontology projection plans after acceptance pushback (#135)"
summary: "- **A projector stays a callable function**, carrying `mode` and, when matched, `plan`. ADR 0030 describes an object with `mode`, `project` and `plan`."
kind: product
status: accepted
sequence: 2026-11-20T08:25:20.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/155; merge commit bb35528efa444743ede30d7873cdc3739408ca4d"
---

## Context

User acceptance of #135 pushed back because the matched `OntologyProjection` did not scale. The analyst amended B7, B17, B18, B24 and B25, and the architect added ADRs 0029 to 0031 (#150). The plan step had to turn them into tasks without re-deciding anything. Several details were left to the developer:
- the index's shape and how it is cached;
- how a chunk's projection size is computed without rendering;
- the reason strings;
- how a projector carries `plan`.

The design's size figures were estimates made before building, and the tool had no command to reopen a later phase after an amendment in lite mode.

## Decision

- **A projector stays a callable function**, carrying `mode` and, when matched, `plan`. ADR 0030 describes an object with `mode`, `project` and `plan`. A function with those properties keeps the worker and every existing stub projector unchanged.
- **Planned chunks carry their own `keys` and size.** `plan` computes each chunk's projection size from its selection, using a formula that mirrors the renderer. Every test checks it against `project` of the chunk's text, so the union-of-paragraphs shortcut can never drift from the real projection.
- **Pieces of a line stand alone.** Paragraphs and lines are packed together, because a line break separates every word and name. A piece cut inside a word is never joined to a neighbour, and its true projection is recorded. The existing pre-send guard halves it if the cut makes it select more than its line.
- **Phrases are checked on the joined text.** Banned aliases, and names with whitespace, are matched against the chunk's whole text, so a phrase across a paragraph break is still selected. Other names and words are matched once per paragraph or line.
- **Only a 404 falls back to `ontology.md`.** A source that exists but cannot be read or parsed fails the run, and an `ontologyPath` without `.md` is read once as Markdown.
- **The name-index reason** gives the size of an empty selection's projection: the header and the grouped name index.
- **The [Dev] Plan and [Dev] Build boxes on #135 were unticked by hand** with the library's own `untickSection`, at the maintainer's choice. In lite mode, `pushback` unticks only the phase it names, and no command reopens later phases. The plan boxes are re-ticked after this PR merges.

Rejected: dropping the per-file pre-pass for every projector. It would have changed the stub-projector tests and the path an embedding projector without `plan` would take. Keeping it for projectors without `plan` leaves `full` and those tests untouched.

## Consequences

- The build can run task by task from the detailed plan. Every test is written out and has been run.
- The measured results meet or beat the design's estimates, except InternalOntology's index reduction, 39.3% against a 40% low end, because its section names are short against its entry names.
- Packing fills each chunk while it fits, so a broad file's requests approach the budget. That is within the design, but it means matched requests at scale are few and large rather than many and small.
- The grouped name index still needs a live model run. That belongs to the user phase, in JEPA-Speech.
- Lite mode still has no command to reopen later phases after an amendment. This PR records the manual step; a command for it is a possible follow-up to the feature tool.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
