# OWL/TTL machine-readable ontology — design

**Date:** 2026-09-08
**Status:** Approved for planning

## Problem

The kit's ontology is Markdown-only. It is easy for humans and AI agents to read and diff in a
pull request, but nothing about it is machine-readable — no adopting repository can point a real
OWL/RDF tool (a reasoner, a SHACL validator, a knowledge-graph import) at its own domain model.
`docs/ontology.md` is also hand-maintained, which is exactly the failure mode the rest of the kit
exists to close for domain vocabulary generally: two representations of the same fact, kept in
sync by discipline rather than by construction.

## Goals

- Every adopting repository gets a formal OWL ontology (`.ttl`, Turtle syntax) alongside its
  human-readable `.md`, with no possibility of the two drifting apart.
- The mechanism follows the pattern this repository already uses for `Narrative.md`: one file is
  the source, edited directly; the other is generated and never hand-edited.
- A repository that already has a hand-written `docs/ontology.md` (from before this feature, or
  freshly scaffolded from the kit's own template) adopts the mechanism with a one-time,
  no-judgement migration — no one re-transcribes their ontology by hand.
- CI catches a stale generated `.md` the same way it already catches an undefined term.

## Non-goals

- This spec does not self-adopt the kit onto this repository (`InternalOntology` has no
  `docs/ontology.md` of its own today). That is a separate, later task.
- No change to `check-ontology-terms.mjs` or `review-ontology-drift.mjs` — both keep reading the
  generated `.md`, which CI now guarantees reflects the `.ttl`.
- No OWL reasoning, no SHACL shapes, no reasoner invoked by the kit itself. The kit emits valid
  Turtle; what an adopter's own tooling does with it is out of scope.
- No attempt to encode real datatype ranges or precise OWL cardinality restrictions — the `.md`
  source carries no type information for properties, and cardinality text ("1 → 1", "1 → *")
  doesn't map cleanly onto exact/min/max OWL semantics. Both are preserved as string annotations
  instead of invented formal axioms.

## Design

### Source of truth flips: `.ttl` is authoritative, `.md` is generated

Going forward, an adopter edits `ontology.ttl` directly (by hand or via the `ontology-setup`
skill), then runs one command to regenerate `ontology.md`:

```
node scripts/build-ontology.mjs
```

Behaviour depends on what exists on disk:

- **No `.ttl`, a `.md` exists** (the shipped example content on a fresh install, or an adopter's
  pre-existing hand-written ontology) → **migrate**: parse the `.md` tables into an equivalent
  `.ttl`, write it. The `.md` is left untouched — it already matches, by construction, immediately
  after migration.
- **`.ttl` exists** → **render**: regenerate `.md` from the `.ttl` and overwrite it.
- **`--check`**: render in memory and diff against the file on disk instead of writing; exits
  non-zero and prints a unified diff if they differ. This is what CI runs.
- **`--force`**: explicit, documented alias for the render step — unconditionally regenerates
  `.md` from `.ttl` and overwrites it, even though the default (`.ttl`-exists) path already does
  exactly that with no caching or skip logic. It exists for intent, not behaviour: a script or an
  adopter typing "rebuild the doc now" (after hand-resolving a merge conflict in `.ttl`, for
  instance) gets an explicit, unambiguous command instead of relying on the implicit default —
  the same convention the installer already establishes with its own `--force`. Combining it with
  `--check` is rejected as contradictory (one forces a write, the other forbids one).

Rendering is idempotent: running `build-ontology.mjs` (with or without `--force`) twice in a row
with no intervening `.ttl` edit produces no further diff. The generated `.md` opens with a fixed
banner (mirroring `Narrative.md`'s own) stating it is generated from `ontology.ttl` and must not
be hand-edited.

The `.ttl` path is derived from `ontologyPath` in `ontology.config.json` by replacing the file
extension (`docs/ontology.md` → `docs/ontology.ttl`) — no new required config key for it.

### OWL vocabulary

A small, kit-owned namespace (prefix `kit:`, IRI `https://ontology-kit.dev/schema#`, a fixed
constant shipped in code, not per-repository config) gives every `.md` section a formal OWL type.
Adopter-defined concepts subclass or instantiate these:

| `.md` section | TTL shape |
|---|---|
| External Systems / Subsystems | `owl:Class rdfs:subClassOf kit:ExternalSystem` / `kit:Subsystem`; `rdfs:label`, `rdfs:comment` |
| Aggregate Roots / Entities / Value Objects | `owl:Class rdfs:subClassOf kit:AggregateRoot` / `kit:Entity` / `kit:ValueObject`; each listed property becomes a `kit:hasProperty "name"` string annotation (no type info exists to make these real `owl:DatatypeProperty` ranges) |
| Domain Events | `owl:Class rdfs:subClassOf kit:DomainEvent`; `kit:raisedBy` object property to the raising aggregate; payload properties via `kit:hasProperty` |
| Enums | `owl:Class rdfs:subClassOf kit:Enum`; each value is a named individual of that class (e.g. `:Pending a :ExampleStatus`) |
| Use Cases | `owl:Class rdfs:subClassOf kit:UseCase`; `kit:actor "Operator"` annotation |
| Relationships | `owl:ObjectProperty` with `rdfs:domain` / `rdfs:range`; cardinality kept as `kit:cardinality "1 → 1"` string annotation |
| Business Rules & Invariants | `kit:invariant "prose"` annotation on the constrained class |

Only sections present in `ontology.config.json`'s `sections` (required + optional, whichever are
kept) are parsed on migration or emitted on render — same section-filtering behaviour the `.md`
template already documents ("delete the sections that do not apply").

### Namespace configuration

Adopter terms live under a per-repository base IRI, not the kit's own `kit:` namespace. New
optional `namespaceUri` field in `ontology.config.json`, substituted at install time the same way
`ontologyPath` already is:

```json
"namespaceUri": "https://ontology.example/{{PROJECT_NAME}}#"
```

This is a placeholder, unpublished IRI used as a name, not a fetchable address — standard OWL
practice, and what lets an adopter later point real reasoner/SHACL tooling at the file without a
namespace collision against another adopter's ontology.

### Agent install runbook

The anticipated common case is a human pointing an AI agent at this repository with a short prompt
("add the ontology kit to this repo", "set up domain ontology tracking from ontology-kit") and
expecting the agent to carry the whole install-and-seed flow through with minimal back-and-forth.
`skills/ontology-setup` already covers the judgement-heavy seeding step, but it is a Claude Code
skill — invoked through Claude Code's own skill mechanism, not something a generic agent reading
this repository would discover or know how to invoke.

**New file: `docs/ai-agent-install.md`** — a self-contained, agent-agnostic runbook, written as
direct imperative steps rather than prose, covering the full path end to end:

1. Confirm the target is a git repository.
2. Run the installer (`bin/install-ontology.mjs`), choosing options sensibly by default
   (`--with-drift-review` only if the target has a model endpoint available; otherwise core-only).
3. Run `node scripts/build-ontology.mjs` once to seed `ontology.ttl` from whatever `ontology.md`
   is now on disk (the shipped example, migrated).
4. Draft the target repository's real ontology directly in `ontology.ttl`, cataloguing what the
   codebase already calls things — deferring to
   `skills/ontology-setup/references/seeding-an-ontology.md` for the method, since that judgement
   is unchanged by this feature and shouldn't be duplicated.
5. Run `node scripts/build-ontology.mjs` again to regenerate `ontology.md` from the real content.
6. Run `node scripts/check-ontology-terms.mjs`; fix genuine violations, allowlist genuine
   non-domain terms with a reason.
7. Commit `ontology.ttl`, the regenerated `ontology.md`, and the kit's installed files together.
8. Recommend Project Narrative (see Narrative suggestion below) and, only on explicit agreement,
   scaffold it from this repository's own files as the pattern.

It names the specific points where the agent should stop and ask rather than guess: the installer
refusing because of an existing unmarked "## Ontology protocol" section, domain content that is
genuinely ambiguous from the repository alone, and whether to adopt Narrative at all. Everything
else proceeds without a prompt back to the user.

`README.md` gets a link to this file, placed where a reader (human or agent) reaches it before the
manual install walkthrough — since an agent following a short prompt is the expected common path,
not the exception.

### Narrative suggestion

Project Narrative is a separate tool (not part of this kit — a reusable GitHub Action,
`jamiemitchellconsultants/Narrative`, plus a `.project-narrative.json`, `narrative/entries/`
fragments, and three required pull-request headings) that this repository already uses on itself
for a deterministic, review-first decision history. Domain vocabulary discipline and decision
history are complementary, adjacent disciplines, so both the human walkthrough and the agent
runbook make a firm recommendation to adopt it too — firm meaning a clear, reasoned suggestion, not
a silent default: nothing is written without an explicit yes, the same posture the installer
already takes toward every file it might write.

Both `README.md` and `docs/ai-agent-install.md` get a short section, placed right after ontology
kit installation completes, that:

- States the recommendation and the one-line reason (decision history alongside vocabulary
  discipline — the two together are what this repository's own AGENTS.md documents).
- Links to the Narrative project.
- Lists the concrete files to add on agreement, naming this repository's own copies as the worked
  example to follow: `.project-narrative.json`, `narrative/preamble.md`, an initially-empty
  `narrative/entries/`, `.github/workflows/maintain-narrative.yml`,
  `.github/workflows/validate-narrative.yml`, and the `## Narrative Context` / `## Narrative
  Decision` / `## Narrative Consequences` pull-request template headings plus the
  `narrative-required` label convention described in this repository's own `AGENTS.md`.

This is guidance only — no new templates, installer flag, or code ships with this feature. The
worked example already exists and is maintained (this repository's own files); duplicating it into
a second, kit-owned template set that could drift from the original is exactly the kind of
avoidable second copy the rest of this spec exists to eliminate for the ontology mechanism, and
there is no reason to accept it here for a tool this kit doesn't own.

### Repository layout additions

```
templates/
  scripts/
    build-ontology.mjs          CLI: migrate / render / --check
    owl-ontology.mjs            kit: vocabulary constants + TTL parse/serialize (testable in isolation)
```

No new template file for `.ttl` itself — the migration step derives the initial `.ttl` from
whatever `.md` is already on disk (the shipped example or an adopter's real content), so there is
never a second seed file that could drift from the first.

### Changes to existing files

- **`bin/install-ontology.mjs`** — no new plan entries (nothing new to *copy*); the printed
  post-install "Next:" hint gains a line about running `build-ontology.mjs`.
- **`templates/scripts/ontology-config.mjs`** — add optional `namespaceUri` to `KNOWN_KEYS`;
  default applied at install-substitution time, not at config-load time (an installed
  `ontology.config.json` always has the key explicitly, consistent with `ontologyPath`).
- **`templates/ontology.config.json`** — add `"namespaceUri": "{{NAMESPACE_URI}}"`.
- **`templates/github/workflows/ontology-lint.yml`** — add `node scripts/build-ontology.mjs
  --check` as a step before the existing term check, so a stale `.md` fails CI before the term
  checker even runs against it.
- **`templates/protocol/ontology-protocol.md`** — flip the editing instructions: read and edit
  `ontology.ttl`; after any change, run `node scripts/build-ontology.mjs` to regenerate
  `{{ONTOLOGY_PATH}}` and include both files in the same commit.
- **`skills/ontology-setup`** — its drafting step now produces `.ttl` content (directly, or by
  drafting the `.md` and running the one-time migration once), not `.md` directly.
- **`README.md`** — new link to `docs/ai-agent-install.md`, placed ahead of the manual
  "Install into a repository" walkthrough, and a new "Then, consider Narrative" section (see
  Narrative suggestion below) placed after "Then seed it".

### Error handling

- A hand-edit to the generated `.md` after `.ttl` already exists is silently overwritten on the
  next `render` — this is documented in the protocol and in the generated file's own banner, the
  same tradeoff `Narrative.md` already makes.
- Malformed Turtle is a hard parse error naming the offending line; the script never falls back to
  leaving a stale `.md` in place.
- Migration only ever fires when `.ttl` is absent. Once present, it is never regenerated from the
  `.md` — TTL is the one-way source from that point on.

### Testing

- `owl-ontology.mjs` parser: `.md` → TTL triples, per section, including the sections a given
  fixture doesn't have.
- `owl-ontology.mjs` renderer: TTL → `.md`, including a round-trip test —
  `render(migrate(exampleMd)) === exampleMd` — on the kit's own shipped example ontology content.
- `build-ontology.test.mjs`: fresh migrate, idempotent re-render, `--force` re-render, `--check`
  exit codes and diff output, `--force --check` rejected, section-filtering honours
  `ontology.config.json`.
- Extend `install-ontology.test.mjs` for the new `namespaceUri` substitution.

## Risks

- **Turtle is a less familiar editing surface than a Markdown table** for whoever (human or AI
  agent) maintains the ontology day to day. Mitigated by the `ontology-setup` skill doing the
  drafting, and by the fact the generated `.md` remains the primary *review* surface in a pull
  request diff — only the edit target moves.
- **The `kit:` vocabulary is a design commitment.** Because the `.md` is now derived from it,
  widening what the vocabulary can express later (e.g. real typed properties) is a breaking change
  to the parser/renderer pair, not a documentation update.
