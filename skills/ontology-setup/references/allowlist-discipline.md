# Allowlist discipline

The allowlist is the pressure valve on the deterministic check. It is also the single most likely
way for this control to decay into decoration, so treat every entry as a small admission of defeat
that has to be justified.

## The three responses to a flagged term

In order of preference:

1. **Use the canonical name.** The prose is wrong. Fix the prose.
2. **Add the concept to the ontology.** The prose is right and the ontology is incomplete. This is
   a real finding — the check just did its job.
3. **Allowlist it.** The term is not a domain concept at all.

Reaching for 3 first is the failure mode. If more than roughly a fifth of a first run ends in the
allowlist, the ontology is probably too thin — go back to seeding.

## What legitimately belongs in the allowlist

- Framework and language types named in prose: `DateOnly`, `Guid`, `DateTimeOffset`.
- Architecture type and interface names that are not domain concepts: `IClock`, `IEmailSender`.
- Configuration keys and provider identifiers: `TenantId`, `Smtp`.
- Another system's DTO names, where prose has to quote the external contract.
- Other repositories' or products' names.
- Process vocabulary the repository's own governance uses: status values like `Accepted`,
  `Proposed`, `Rejected`.

## What does not

- Anything that names a thing in this repository's domain. If prose needs it, the ontology needs
  it.
- A misspelling of a canonical term. Fix the spelling.
- A synonym someone prefers. Pick one name; that is the whole point.

## Writing the reason

The reason is read by whoever wonders, a year later, why this term was exempted. Make it answer
that question:

- Good: `"BCL type: calendar date with no time component, used for SlotWindow.date"`
- Good: `"ADR status value from the governance lifecycle, not a domain concept"`
- Useless: `"not a domain concept"` — that is the category, not the reason.
- Useless: `"needed for the build to pass"`

The checker rejects an entry with no reason at all. It cannot reject a bad one; you have to.
