# Matched ontology projection

## Product owner: vision

### Problem

Every model request the `SemanticReviewWorker` makes carries the whole ontology projection, whatever
the Markdown chunk is about. JEPA-Speech's 202 entries come to 64,394 characters, sent again with
every chunk of every changed file. That causes three problems. As an ontology grows it hits the
`RequestBudget` and the review stops with `too-large`. The only fix today is to raise
`ONTOLOGY_MAX_REQUEST_CHARS`, which moves the limit (about 600 entries at the 200,000-character
default) without removing it. Runs are slow and expensive, which matters most on the home-lab model.
And the model has to hunt for the few relevant rows among hundreds, which risks noisy or missed
findings. Maintainers want each request to carry only the part of the ontology the chunk could be
talking about, chosen deterministically so that the same input always gives the same request. That
choice must not quietly lose the paraphrases the reviewer exists to catch.

### Users

- Maintainers of adopting repositories with large ontologies (JEPA-Speech today, Grooveloom next),
  who have had to raise the budget to keep semantic review running.
- Maintainers running the reviewer on a home-lab or metered model, who pay for every resent
  ontology in time or tokens.
- Pull request authors, who read the semantic status and its pull request record and need to know
  what their Markdown was actually checked against.
- The kit maintainer, who ships the byte-identical reviewer and needs a regression guard that the
  smaller requests still find what the full projection found.

### Outcomes and measures

These outcomes are judged by the maintainer. The figures show what to look at, not targets.

1. **Each request carries only the ontology its chunk needs.** Measure: the pull request record shows,
   for each reviewed file, how many entries were sent and how many characters they took, next to the
   size of the full projection.
2. **Matching keeps the findings the full projection found.** Measure: replaying the ten recorded
   JEPA-Speech findings (pull requests #210 and #217) under the matched projection, the evidence entry
   each one cites is in the projection sent for its file. The replay is kept as a regression test.
3. **A chunk that matches nothing is still reviewed.** Measure: a chunk with no matched entry is sent
   with a small fixed core set of the ontology instead of being skipped, and the record says so.
4. **Reduced coverage is visible, not silent.** Measure: the pull request record says when a file was
   reviewed against a matched or core-set projection rather than the full one. A finding can cite
   only an entry that was sent, and the evidence-key list in each request lists only those entries.
5. **Adopters get it by default and can switch back.** Measure: after a kit update, a repository's
   reviewer uses the matched projection with no configuration change. One `OntologyConfig` setting
   restores the full projection, and no script is edited.

### Decisions to settle

Left to the analyst and architect, with the research below as evidence:

- **The matching rule.** Matching exact entry names finds none of the recorded findings, and matching
  the words of a name finds all ten but sends much more. Somewhere between them is a precision and
  recall trade-off to choose deliberately.
- **What "directly related" means.** Adding every entry a matched row mentions sends most of the
  ontology. Adding only the relationship rows that touch a matched entry costs almost nothing.
- **What the core set is,** and whether it is also sent with matched chunks.
- **Whether matching runs per chunk or per file,** and how it interacts with chunking against the
  `RequestBudget`.

### Scope

- A deterministic selection, per request, of the ontology entries matched to the Markdown being
  reviewed, plus their directly related entries, with the evidence-key list restricted to those
  entries.
- A small core set for chunks that match nothing.
- Making the matched projection the default, with an `OntologyConfig` setting that restores the full
  projection.
- Recording in the `SemanticReviewRun` record and the pull request record what each file was reviewed
  against.
- Unit tests, a replay of the recorded JEPA-Speech findings as a regression test, and updates to the
  runbook `templates/docs/ontology-semantic-review.md` and the README.

### Out of scope

- Embedding-based or other model-based retrieval. That is a later feature, and this one must not
  close it off.
- Changing the system prompt, how a `SemanticFinding` is judged, or the dismissal flow.
- The drift reviewer and the graph naming reviewer, which build their own requests.
- Adding banned aliases or alternative labels to adopters' ontologies, and editing any consumer
  repository.
- Changing the `RequestBudget` defaults or the `too-large` outcome, other than its now applying to the
  matched projection.

### Research

All measurements use the shipped `catalogOntology` from `templates/scripts/semantic-review-model.mjs`
against each repository's configured sections. The scratch scripts are not committed.

1. **The full projection's size today.** JEPA-Speech: 202 entries, 64,394 characters. InternalOntology:
   130 entries, 32,281. LocalOntologySetup: 105, 25,273. EventBooking: 100, 22,491. Source: each
   repository's `docs/ontology.md` at its current default branch.
2. **Every recorded finding is a paraphrase, so exact names miss them all.** JEPA-Speech's run records
   (the hidden run markers in its pull request comments) hold ten findings. Examples: "AuditRecord"
   for the entity AuditEvent, "RemovalStatus" for the enum SessionRemovalState, and "pending,
   running, done" for that enum's values. Matching whole entry names selected the cited entry for none
   of them. Matching any significant word of a name, plus an enum's value words, selected it for all
   ten, with 21 to 56 entries (8,000 to 19,000 characters, 12% to 30% of the full projection). Matching
   only words shared by three or fewer entry names cut the size to 4 to 17 entries but kept the cited
   entry for only 4 of the 10. Source: JEPA-Speech pull requests #210 and #217, files replayed at
   their recorded revisions.
3. **Savings across real Markdown depend on the rule.** Over each repository's tracked Markdown
   (ontology, narrative and generated graph files excluded), matching name words sent a median of
   38% (JEPA-Speech), 39% (InternalOntology) and 69% (EventBooking) of the full projection, with the
   90th percentile at 66% to 79%. The rare-word rule sent medians of 19%, 15% and 42%. Exact names
   sent little, but matched nothing at all in 87 of JEPA-Speech's 210 files and 52 of EventBooking's
   534. Source: the same repositories at their default branches.
4. **"Directly related" can blow up.** Adding every entry that a matched entry's row mentions by name
   took the selection to 104 to 148 of JEPA-Speech's 202 entries. Adding only the relationship rows
   that touch a matched entry added one entry at most. Source: the replay in finding 2.
5. **There is little alias data to match on.** None of JEPA-Speech, InternalOntology, EventBooking or
   Grooveloom configures banned aliases. In `docs/ontology.ttl`, each entry's `rdfs:label` is the
   same PascalCase name, and there are no alternative labels. Names, their words, enum values and
   descriptions are all there is to match against. Source: each repository's `ontology.config.json`
   and JEPA-Speech's `docs/ontology.ttl`.
