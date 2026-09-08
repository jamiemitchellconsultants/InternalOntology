# Seeding an ontology from an existing repository

The ontology catalogues vocabulary the repository already uses. It does not introduce new domain
decisions. If you find yourself deciding what a concept *should* be called rather than recording
what it *is* called, stop and raise it with the user — that is a design decision wearing a
documentation costume.

## Where to look, in order

1. **Domain code** — entity classes, enums, value types, aggregate definitions. The most reliable
   source, because it is executable.
2. **Specs and design documents** — the names the repository uses when it explains itself.
3. **Database schema or migrations** — table and column names, and enum columns in particular.
4. **API contracts** — but be careful: an external system's DTO names are *its* vocabulary, not
   this repository's. They belong in the allowlist, not the ontology.
5. **Issue titles and commit messages** — weakest source; useful only for spotting a concept the
   documents never named.

## Writing the rows

- One concept, one row, one name. If two names exist for one thing, pick one and note the other as
  a banned alias or fix the code.
- Descriptions say what the concept *is*, not what it does mechanically. "A candidate-facing
  four-hour window proposed by one manager" is useful; "the SlotProposal entity" is not.
- List every enum value. A partial list is worse than none, because the enum lock test will encode
  the partial list as truth.
- Invariants are prose bullets opening with the bolded concept they constrain. They are the part a
  reader remembers, so write them as rules, not as observations.
- Where a fact is genuinely undecided, say so in the row and name what would decide it. Do not
  invent a placeholder value.

## Where existing repositories disagree

Two worked examples, both real:

- **An integration.** Its ontology leads with External Systems and names the
  paraphrases prose must not use. Its Subsystems section exists to let specs describe boundaries
  between components without designing their internals.
- **A single application with no external systems.** It has no External Systems or
  Domain Events section at all, and adds Use Cases, because its specs refer to operations by name.

Neither is the template for the other. Read the repository in front of you.

## Before you present it

- Does every row come from something in the repository, or did you invent it?
- Does the enum section list every value of every enum?
- Would a new contributor reading only this file use the right word for each concept?
