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
