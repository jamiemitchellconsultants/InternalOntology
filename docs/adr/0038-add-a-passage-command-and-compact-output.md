# 0038 — Add a passage command and compact output

- **Status:** accepted
- **Date:** 2026-11-20
- **Feature:** #178 (docs/features/semantic-index-token-efficiency/)

## Context

Search already returns only commit, path, line range and score for each hit. The remaining cost is the reading an agent does afterwards, usually whole files, and the commit repeated on every hit in JSON. B5 to B7 ask for a way to read only the cited lines and a more compact presentation without changing which results are returned.

## Decision

Add a `show` command to the installed index script that takes a path and line range, and optionally the indexed commit, and returns only those lines read from the indexed Git commit. It refuses a commit other than the indexed one, a path outside the effective `IndexSourceScope`, and a range outside the file. Add a `--compact` flag to JSON search output that states the commit once and lists path, line range and score per hit. Output without the flag stays byte-identical.

## Consequences

Agents can follow the existing rule to read cited lines and pay only for those lines. Existing callers are unaffected. The passage reader shares the source module's Git blob reading and scope checks, so it cannot read an unapproved file. The command reads the committed text, so it does not show uncommitted edits, which matches the existing dirty-checkout notice.

## Alternatives considered

- **Excerpts in search results.** Fewer follow-up reads, but every search costs more whether or not the excerpt is needed. Rejected.
- **Only trim the JSON.** No effect on the larger cost of reading whole files. Rejected.
- **Read the working tree.** Could return text that was never indexed or approved. Rejected.
