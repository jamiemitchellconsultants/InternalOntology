# Configurable drift reviewer request budget

## Product owner: vision

### Problem

The advisory drift reviewer refuses to run for repositories with a mid-sized or large ontology.
`MAX_REQUEST_CHARS` is fixed at 24,000 characters in `templates/scripts/review-ontology-drift.mjs`,
and the reviewer throws "ontology projection and system prompt leave no useful diff budget" before
any model call when the ontology projection plus the system prompt fill that budget. The live
JEPA-Speech run (JEPA-Speech#205) hit this. Measured with the real projection and each repository's
config (system prompt 1,506 characters): DiveVolkTelemetry 11,310 (fits), EventBooking 20,078 (about
2,400 characters of room), JEPA-Speech 58,094 and Grooveloom 73,517 (both fail). The models behind
the gateway have a 131,072-token context and cloud models will have more, so the cap is far below
what they accept. An adopter cannot change it without editing a script that must stay byte-identical
in every repository, and the failure reaches the maintainer as an unexplained red job.

### Users

- Maintainers of adopting repositories whose ontology is larger than a few thousand lines
  (JEPA-Speech, Grooveloom now; EventBooking soon).
- Adopters who later move to cloud models with larger windows and want to raise the budget without
  waiting for a kit release.
- The kit maintainer, who needs a regression guard for large ontologies.

### Outcomes and measures

1. The reviewer runs for JEPA-Speech and Grooveloom. Measure: with the default budget, an ontology
   fixture of about 60 KB produces batches and no budget error.
2. An adopter can change the budget without editing a script. Measure: one repository variable, fed
   to an environment variable, changes the budget; junk values fail with a clear error.
3. When the ontology still does not fit, the maintainer understands why. Measure: the outcome is a
   neutral, explained "skipped: ontology too large for the configured budget", not an unexplained
   red job.
4. Requests stay within what the gateway can answer. Measure: the interplay of the larger budget with
   the model timeout and `max_tokens` is checked and the decision on configurable timeout recorded.
5. The gap that let this through is closed. Measure: a large-ontology case exists in the acceptance
   tests.

### Scope

- Raise the default budget (proposal: 200,000 characters, about 50,000 to 67,000 tokens, leaving at
  least half of a 131,072-token window for the reasoning model's thinking and output; to be justified
  or adjusted in the design).
- A per-repository override through an environment variable fed from a repository variable in the
  workflow template, validated as a positive integer.
- A graceful, explained outcome when the projection still does not fit.
- The 413 and context-length recursive split remains the authoritative fallback.
- Review of the timeout and `max_tokens` interplay, and a decision on making the timeout configurable.
- Unit tests, a large-ontology acceptance case, and updates to the runbook and README.

### Out of scope

- Splitting the ontology projection itself across requests.
- Changing the projection's selection of ontology content.
- Changing prompts, model choice or finding semantics.
- Editing any consumer repository.
- Any change to authentication (feature #92).

### Research

None commissioned. The measurements and the context-window figures come from the JEPA-Speech run
and the home lab owner, relayed by another session; they have not been re-measured from this
repository or checked against the live gateway.
