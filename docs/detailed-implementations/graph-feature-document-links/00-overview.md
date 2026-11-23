# Source graph links to feature documents — detailed implementation plan

Execute only after the [task plan](../../superpowers/plans/graph-feature-document-links/plan.md) has been reviewed and merged. Read [feature.md](../../features/graph-feature-document-links/feature.md) (vision, behaviours, architecture) and ADRs 0041–0044 first. Work on `feature/graph-feature-document-links/build`. The task plan's global constraints, interfaces and planning decisions apply to every task here.

Each task is a red/green cycle, then the shared commit gate. The code blocks are complete test files or test additions, exact copy, or algorithm contracts; they are not permission to build during dev-plan. Keep prose paragraphs and list items on one source line.

## Increments

| Increment | File | Behaviour ids | Tasks |
| --- | --- | --- | --- |
| 1 — Schema version 2 skeleton | [01-schema-version-2.md](01-schema-version-2.md) | B22 | 1–2 |
| 2 — Behaviour and decision nodes held to their documents | [02-design-nodes.md](02-design-nodes.md) | B1, B2, B5, B19, B21 | 3–6 |
| 3 — Retirement, supersession and reports | [03-retirement-and-reports.md](03-retirement-and-reports.md) | B17, B18, B20 | 7–9 |
| 4 — Behaviour and code lookups | [04-lookups.md](04-lookups.md) | B3, B4, B6, B7, B24 | 10–11 |
| 5 — Agents record the links | [05-agents-record-links.md](05-agents-record-links.md) | B8–B16, B23 | 12–13 |

Build one increment per session. When an increment's last task is committed and CI is green, post a handoff on #185 naming the increment done, its behaviour ids and the next increment, then stop.

## Shared contracts

These are JavaScript shapes, not ontology terms.

```js
// Declaration (source-graph-design-docs.mjs)
{ id: number, title: string, line: number /* 1-based */, retired: boolean, replacement: number | null }
// BehavioursFile
{ path: string, lite: boolean, conflict: null } | { path: null, lite: null, conflict: [fullPath, litePath] } | null
// Decision
{ path, number: "NNNN", title: string | null, titleLine: number | null, status: string | null /* lower-case first word */, statusLine: number | null, successor: "NNNN" | null }
// Finding (unchanged shape)
{ file, subject, rule, message }
// Report, one RetiredDesignLink
{ assertion, subject, relationship, object, status /* "kit:retired" | "kit:superseded" | "kit:deprecated" */, replacement /* node IRI */ | null }
```

The fixed fixture (Task 4) is a lite feature `payments` in `docs/features/payments/feature.md` (or `02-behaviours.md` in full mode) and two ADRs. Its line numbers are part of the contract: B1 on line 11, B2 on line 12, the Retired behaviours heading on line 14, B3 (retired, replaced by B2) on line 16, the traceability row for B1 on line 22; each ADR's title is line 1 and its Status line is line 3.

## Commit gate

Every task ends with the same gate: stage only the task's files; inspect `git diff --cached --name-only` and `git diff --cached`; run `node scripts/check-ontology-terms.mjs` and `npm test`; then make the task's commit and `git push -u origin feature/graph-feature-document-links/build`. If a check fails, repair the task and repeat its validation. Do not amend or combine pushed task commits.
