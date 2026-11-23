# 0043 — Check behaviour and decision nodes against their documents

- **Status:** accepted
- **Date:** 2026-11-23
- **Feature:** #185 (docs/features/graph-feature-document-links/)

## Context

B2, B19 and B21 need missing ids, reused ids and both behaviours files at once to fail, and B17 and B18 need a node's status to follow its document. The existing checker only confirms that cited lines exist; it never reads what they say. B9's traceability evidence could also be checked against the table's content.

## Decision

Add a kit-owned `DesignDocumentReader` script that, from a Git tree, finds a feature's behaviours file by mode, the behaviour declarations in it (a line or list item whose first bold text starts with `B<n>`, in any of the three existing forms), the declarations under a Retired behaviours heading, and an ADR's title line and the first word of its Status line. `GraphChecker` uses it to fail a behaviour or decision node whose IRI's id is not declared in its cited lines, whose recorded `kit:designStatus` differs from the document, whose id is both current and retired, or whose feature has both `02-behaviours.md` and `feature.md` declaring behaviours. `GraphReader` uses it to say whether an unknown reference is declared (B4). Traceability rows are not parsed: like all other evidence, a cited row is checked for existence and maintainers judge its meaning.

## Consequences

Ids and statuses in the graph cannot drift from the documents without a failing check, and the agent's B17 and B18 updates are verified. The checker now reads Markdown from feature folders and `docs/adr/`, but only files already cited as evidence or named by a node's IRI. The declaration patterns become a contract: a fourth format would need a change here.

## Alternatives considered

- Check only that cited lines exist: no new parser, but a renumbered, reused or mislabelled behaviour would pass.
- Parse traceability rows too: catches a component linked to the wrong behaviour, but the table's layout is free-form, and judging a claim's truth is the maintainers' job under #35.
