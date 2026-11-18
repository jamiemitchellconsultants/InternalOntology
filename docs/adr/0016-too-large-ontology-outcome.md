# 0016 — A too-large ontology is its own non-blocking outcome

- **Status:** accepted (for review on the design pull request)
- **Date:** 2026-11-18
- **Feature:** #111 (docs/features/semantic-request-budget/)

## Context

Open question OQ1. When the ontology projection leaves no room in a request, the semantic reviewer
makes no model call and records every eligible file as unreviewed. The run outcome is `unavailable`,
so the fixed `ontology/semantic-match` status is `success` with the text "Semantic match not reviewed:
service or configuration unavailable". That text blames the service or configuration, not the size,
and nothing tells the maintainer which setting to change. The reviewer is blocking only through its
findings: ADR 0002 makes `failure` mean "an active finding remains" and makes every case in which
review did not run (unavailable, disabled, out of scope, incomplete without findings) a `success`
that can be superseded by a later run.

## Decision

Add a distinct outcome, `too-large`, mapped to `success` with the description "Semantic match not
reviewed: ontology too large for the configured budget (raise ONTOLOGY_MAX_REQUEST_CHARS)". The
pull request record states the same, lists each file with its reason, and says the result permits
merge. A run gets the outcome when no file was reviewed, there are no findings, and every unreviewed
file carries the machine code `too-large` (set when capacity is below one character, and when a
persistent 413 cannot be split further). Any mixture stays `partial` or `unavailable` as today. The
ontology records the new value and the invariant already added in the analyst phase.

## What each option means for a blocking reviewer

1. **Keep `unavailable` with a better reason.** Smallest change. The status stays `success`, so merging
   is unaffected. The cause appears only in free text: code, tests and the ledger cannot tell a size
   problem from an outage, and the status description would need to be chosen from reason strings.
2. **A distinct non-blocking outcome (chosen).** Same merge behaviour as option 1, so it respects
   ADR 0002, but the outcome is an explicit value with its own description and record line, can be
   tested and counted, and cannot be confused with an outage. It costs a ledger mapping, a record
   line and one ontology value. Records written by this version are read only by the same installed
   version (the scripts upgrade together), so an unknown value is not a compatibility problem.
3. **A failing status.** Blocks merge of every pull request with eligible Markdown until the budget is
   raised or the ontology shrinks, so nothing is merged unreviewed. This directly contradicts ADR 0002:
   that ADR makes "a later unavailable run unblocks the same revision" a requirement (its B10), and
   it makes failure mean a finding. It would stop every Markdown pull request in each large-ontology
   repository the moment the pilot is switched on, for a cause no pull request author can fix, and a
   mistake in the budget would become a merge outage. It also breaks the repository principle that a
   noisy or wrongly blocking check is worse than a missed detection.

## Consequences

The blocking reviewer neither passes silently nor hard-fails on size: it passes, loudly and
specifically, and says which setting to raise. A repository that wants a hard stop can require the
status and add a check of its own; the kit does not do that. A maintainer reading only the green tick
still cannot tell review did not run, which ADR 0002 already accepts and the description addresses.
The ledger's status mapping and the record text change; the dismissal flow is untouched.

## Alternatives considered

Options 1 and 3 above. A further variant, failing only when the ontology is "much" too large, was
rejected as an arbitrary threshold with the same contradiction.
