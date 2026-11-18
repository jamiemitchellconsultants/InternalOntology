# Configurable semantic reviewer request budget

## Product owner: vision

### Problem

The blocking semantic reviewer plans every model request against a fixed 24,000-character budget in
`templates/scripts/semantic-review-model.mjs`. Feature #100 raised and made configurable the budget of
the advisory drift reviewer only. For a repository whose ontology projection is larger than that
budget (JEPA-Speech 58,094 and Grooveloom 73,517 characters, as measured for #100), the semantic
reviewer never reviews anything. Reproduced with the real review function and a 62,826-character
ontology: no model call is made, every changed file is listed as unreviewed with the reason
"ontology projection exceeds semantic review request budget", the run outcome is `unavailable`, and
the published status is a **success** reading "Semantic match not reviewed: service or configuration
unavailable". So a blocking reviewer fails open, silently, and with text that blames the service or
configuration instead of the size. Adopters cannot change the budget without editing a script that
must stay byte-identical in every repository, and the same models that now accept 131,072 tokens
could easily review these ontologies.

### Users

- Maintainers of adopting repositories with a large ontology (JEPA-Speech, Grooveloom) who want to
  turn on the semantic pilot.
- Maintainers who move to cloud models with larger windows and want to raise the budget without a kit
  release.
- Pull request authors, who see the status and need to know whether their Markdown was actually checked.
- The kit maintainer, who needs a regression guard for large ontologies in the semantic reviewer.

### Outcomes and measures

1. The semantic reviewer reviews repositories with large ontologies. Measure: with the default
   budget, a fixture ontology of about 60 KB reaches the model (no "exceeds request budget" outcome).
2. An adopter can change the budget without editing a script, using the same conventions as #100.
   Measure: one repository variable changes it, with the same positive-integer validation and a clear
   error for junk.
3. A too-large ontology no longer looks like a service outage. Measure: when the ontology still does
   not fit, the published status and pull request record say that the ontology is too large for the
   configured budget and how to fix it, not "service or configuration unavailable".
4. The blocking reviewer's contract stays coherent. Measure: the decision on how a too-large ontology
   surfaces in the status model (see below) is made explicitly, recorded in an ADR, and covered by tests.
5. The gap is guarded. Measure: a large-ontology case exists in the semantic reviewer's tests and in
   the acceptance tests.

### Decision to settle

How should a too-large ontology surface in the blocking reviewer's status model? Today it publishes a
success status with the text "service or configuration unavailable". Options for the analyst and
architect to weigh, not decided here:

- keep the non-blocking `unavailable` outcome but give it an accurate reason and description;
- introduce a distinct, still non-blocking outcome for "ontology too large";
- fail the status, so a pull request cannot merge unreviewed (this conflicts with ADR 0002's rule that
  an unavailable review permits merge, and with the rule that the reviewer must not silently pass).

The constraint from the request: a blocking reviewer must neither silently pass nor hard-fail on size
without a clear message.

### Scope

- Raise the default request budget of the semantic reviewer and make it overridable by an environment
  variable fed from a repository variable, with the same validation and error conventions as #100.
- A graceful, explained too-large outcome that fits the semantic reviewer's status model, per the
  decision above, including its pull request record.
- Review of the interplay between the larger budget, the model timeout and the output cap in the
  semantic reviewer (its own timeout and request shape), and a decision on a configurable timeout.
- Unit tests, a large-ontology case in the acceptance tests, and updates to the runbook
  `templates/docs/ontology-semantic-review.md` and the README.

### Out of scope

- Splitting the ontology projection across requests.
- Changing the projection, prompts, finding semantics or the dismissal flow.
- The drift reviewer (done in #100) and authentication (done in #92).
- Editing any consumer repository.

### Research

One finding, from reproduction in this repository: with a 62,826-character ontology the semantic
review function makes no model call and reports the file unreviewed with the reason above; the status
mapping publishes `success` with "Semantic match not reviewed: service or configuration unavailable"
for the `unavailable` outcome (`semantic-review-ledger.mjs`). This was shown by calling the review
function directly, not by a full worker run. The 58,094 and 73,517 sizes come from the #100 request and
were not re-measured. Nothing was checked against the live gateway.

## Analyst: behaviours

Terms: no new domain term. The existing `RequestBudget` (settings `ONTOLOGY_MAX_REQUEST_CHARS` and
`ONTOLOGY_MODEL_TIMEOUT_MS`) now also governs the `SemanticReviewWorker`; the ontology row, one
relationship and the invariant are updated. If the architect adds a new run outcome, the ontology
gains that value in the architect phase. "Capacity" means the budget minus the 1,000-character request
overhead, the ontology projection and the file path, which must be at least one character for any
Markdown to be sent.

### Outcome 1: the semantic reviewer reviews large ontologies

- **B1 Raised default.** Given neither setting is present, a 60,000-character ontology projection and a
  changed Markdown file, when the `SemanticReviewWorker` runs, then it sends the file to the model in
  requests no larger than the default budget and the file counts as reviewed.
- **B2 Headroom.** Given the default budget, then a projection leaves usable capacity until the
  capacity above falls below one character; only then does the too-large behaviour (B7) apply.

### Outcome 2: the budget is configurable without editing a script

- **B3 Override.** Given `ONTOLOGY_MAX_REQUEST_CHARS` is a valid positive integer N, then the semantic
  reviewer plans every request against N.
- **B4 Unset or empty.** Given the setting is unset, empty or whitespace, then the default applies.
- **B5 Junk rejected.** Given the setting is not digits forming a positive safe integer (for example
  `abc`, `0`, `-5`, `1.5`, `2e5`, `200_000`), when the review runs, then it fails before any model call
  with an error naming the variable and the offending value. (Which status the pull request then
  shows is open question OQ2.)
- **B6 Workflow wiring.** Given the installed semantic review workflow, then its review step passes
  `ONTOLOGY_MAX_REQUEST_CHARS` and `ONTOLOGY_MODEL_TIMEOUT_MS` from repository variables of the same
  names, no value is baked in, and the model credential stays an environment secret.

### Outcome 3: a too-large ontology is explained, not a silent pass

- **B7 Explained, never silent.** Given the capacity is below one character at the configured budget,
  when the review runs, then no model call is made, every eligible file is recorded as not reviewed
  with a reason that says the ontology is too large for the configured budget, and the status
  description and the pull request record both say so and name `ONTOLOGY_MAX_REQUEST_CHARS` as the
  setting to raise. The text "service or configuration unavailable" is not used for this cause.
- **B8 Status state per decision.** Given the situation in B7, then the published status state (and
  therefore whether the pull request can merge) is the one chosen in OQ1, recorded in an ADR. Whatever
  is chosen, the reviewer neither passes silently nor fails without the message in B7.
- **B9 Persistent token limit.** Given the model keeps answering 413 even for the smallest chunk,
  when the review runs, then the file is reported with the same too-large explanation as B7 rather than
  the bare "model rejected minimum-size chunk".
- **B10 413 split stays.** Given the endpoint answers 413 for a larger chunk, then the chunk is split
  and retried exactly as today.
- **B11 Non-regression.** Given an ontology that fits, then findings, stable finding ids, dismissals,
  partial and unavailable outcomes for other causes (credential, timeout, unusable answer) behave
  exactly as before.

### Outcome 4: requests stay within what the gateway can answer

- **B12 Timeout setting.** Given `ONTOLOGY_MODEL_TIMEOUT_MS` is valid, then each semantic model request
  uses it as its timeout; junk fails as in B5; unset or empty uses the default. The default value is
  open question OQ3 (the semantic reviewer's request timeout is 30,000 ms today, against 300,000 ms
  for the drift reviewer).
- **B13 Documented coupling.** Given the runbook, then it states that larger prompts take longer, that
  the timeout default has not been measured near the budget against any gateway, and that the
  semantic request sets no output cap of its own.

### Outcome 5: the gap is guarded

- **B14 Unit cases.** Given the unit tests of the model module and the worker, then they include a
  roughly 60,000-character projection that is reviewed by default, a projection that is too large at a
  small budget and a persistent-413 case.
- **B15 Acceptance.** Given an installed repository with a roughly 60 KB ontology and a local stand-in
  for the model endpoint, when the installed semantic reviewer runs, then it sends a request and
  records the file as reviewed; with a tiny budget it records the too-large result of B7.
- **B16 Docs.** Given the semantic runbook and README, then they state the default, the override, the
  too-large outcome and the timeout caveat.
- **B17 Byte-identical.** Given the change, then no repository-specific value appears in any script.

### Open questions for the architect (deliberately not decided here)

- **OQ1 Status model for a too-large ontology.** Three options from the vision, with what each
  implies:
  1. *Keep `unavailable`, give it an accurate reason and description.* Smallest change; state stays
     `success` and the pull request can merge; the outcome is indistinguishable by code from a real
     outage, only by text.
  2. *A distinct non-blocking outcome for "ontology too large".* State `success`, but a separate
     outcome, description and record line; needs the ledger's outcome list, its status mapping and the
     ontology updated; keeps ADR 0002's rule that an unreviewed run permits merge.
  3. *A failing status.* Blocks merge until the budget is raised; prevents a silent unreviewed merge but
     contradicts ADR 0002 and the rule that a later unavailable run permits merge (B10 there), and would
     break pull requests for every adopter whose ontology outgrows the budget.
  Constraint from the request for all three: neither silently pass nor hard-fail without a clear message.
- **OQ2 Junk setting and the status.** B5 fails the job; the architect decides whether the existing
  finalize path leaves a misleading status or whether the review step must publish an explicit result.
- **OQ3 Default semantic timeout.** Keep 30,000 ms or raise it. Relevant evidence (relayed, not
  re-measured): the drift reviewer took about 18 s for a 58 KB ontology on the live gateway.

### Uncertainties

| # | Question | Decision |
| --- | --- | --- |
| U1 | Variable names? | Reuse `ONTOLOGY_MAX_REQUEST_CHARS` and `ONTOLOGY_MODEL_TIMEOUT_MS` for both reviewers, as the request asked ("same override variable"). A repository using different models for the two reviewers shares one value; the architect confirms this is acceptable. |
| U2 | Default budget? | 200,000 characters as in #100; the architect restates the justification. |
| U3 | Validation rules? | Identical to #100: digits only, positive safe integer, empty or unset is the default. |
| U4 | Budget in `ontology.config.json` instead? | No: keep one convention with #100 (environment variable fed from a repository variable). |
| U5 | Does a persistent 413 count as too large? | Yes (B9), as in #100. |
| U6 | Which status state for a too-large ontology? | Explicitly deferred to the architect as OQ1, not out of scope: it must be decided in the architect phase. |
| U7 | Status after a junk setting? | Deferred to the architect (OQ2). |
| U8 | Default semantic timeout? | Deferred to the architect (OQ3). |
| U9 | Cap the semantic output (max_tokens)? | Out of scope; not changed. |
| U10 | Split the ontology projection across requests? | Out of scope (vision). |
| U11 | Is the budget right for the live gateway? | Cannot be decided here; unverified until a large-ontology consumer runs the semantic reviewer. |
