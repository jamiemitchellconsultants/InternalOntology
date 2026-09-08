---
name: ontology-setup
description: Use when adding the ontology discipline to a repository - installs the canonical vocabulary file, agent protocol, and deterministic CI linter, then seeds the repository's real ontology from its existing docs and code and triages the first lint run.
---

# Installing the ontology discipline into a repository

An ontology is a repository's canonical domain vocabulary: every concept named exactly once, so
code, specs, plans and prose all use the same word for the same thing. The kit installs the
mechanism. Your job is the judgement the mechanism cannot supply — what this repository's concepts
actually are, and which of the first run's violations are real drift.

**Announce at start:** "Using ontology-setup to install and seed the ontology discipline."

## Before you start

Confirm two things with the user, because both are hard to reverse quietly:

1. **Which repository.** The installer writes into a target directory and splices a section into
   that repository's agent-instruction file.
2. **Which optional pieces.** The semantic drift reviewer needs an OpenAI-compatible model endpoint
   the repository can reach; the enum lock tests need a test project to live in. Default to
   neither unless the user asks.

## Step 1 — Install the mechanism

```bash
node <kit>/bin/install-ontology.mjs --target <repo> --dry-run
```

Show the plan, then run it for real without `--dry-run`. Add `--with-drift-review` or
`--with-enum-tests <language>` only if the user asked for them.

Existing files are skipped rather than overwritten. If the target already has a `docs/ontology.md`,
that is a signal to read it and extend it, not to replace it.

Then run `node scripts/build-ontology.mjs` once, to create `ontology.ttl` from whatever
`docs/ontology.md` is now on disk. From this point on, `ontology.ttl` is what you edit —
`docs/ontology.md` is generated from it and must never be hand-edited.

## Step 2 — Decide which sections apply

The installed ontology template offers every section the kit knows about. Most repositories need
four or five. Read the repository first — its specs, plans, design documents, domain code — then
propose a section set and say why each one earns its place.

- **External Systems** only if this repository integrates with systems it does not own. If you keep
  it, add the paraphrases people actually reach for to `bannedAliases` in `ontology.config.json`.
- **Subsystems** only if specs need to describe boundaries between internal components.
- **Aggregate Roots**, **Domain Events**, **Value Objects** only if the repository genuinely models
  in those terms. Adding them to a repository that does not is how an ontology becomes decoration.
- **Use Cases** only if specs refer to operations by name.
- **Entities**, **Enums**, **Relationships** and **Business Rules & Invariants** are the working
  minimum.

Delete the sections you drop from the ontology file *and* from `sections` in
`ontology.config.json`. An empty section left in place is a configuration error for the reviewer.

## Step 3 — Seed the real ontology

This is the substantial part. Read `references/seeding-an-ontology.md` before starting.

Draft the ontology directly in `ontology.ttl`, following the same section-by-section shape
`references/seeding-an-ontology.md` describes — it is written in terms of ontology *concepts*, not
Markdown syntax, so its guidance applies unchanged now that the file you edit is Turtle rather than
Markdown. Do not invent concepts to fill placeholder rows — remove what you cannot justify from the
repository's own material. After each round of edits, run `node scripts/build-ontology.mjs` to
regenerate `docs/ontology.md` and review it — that generated file remains the easiest surface to
read the whole ontology on, even though it is no longer what you edit.

## Step 4 — Run the checker and triage

```bash
node scripts/check-ontology-terms.mjs
```

The first run on an established repository will produce many violations. Read
`references/allowlist-discipline.md` and sort every one into exactly two piles:

- **Real drift** — prose using a wrong or invented name for a concept that exists. Fix the prose,
  or add the missing concept to the ontology.
- **Not a domain concept** — a framework type, an interface name, a config key, another project's
  name. These become allowlist entries with a written reason.

**Never auto-apply allowlist entries.** Present the proposed entries with their reasons and get
approval. An agent that allowlists its way to a green build has removed the control while leaving
its appearance, which is worse than not installing it.

Repeat until the run is clean.

## Step 5 — Optional pieces

- Semantic drift reviewer: `references/llm-drift-review.md`
- Enum lock tests: `references/enum-lock-tests.md`

## Step 6 — Commit

One commit containing the installed files, the seeded ontology, the config, and the spliced
protocol section. Say in the message which optional pieces were installed and which were not.

## What good looks like

- Every section in the ontology has real rows drawn from this repository.
- `node scripts/check-ontology-terms.mjs` exits 0.
- Every allowlist entry has a reason a reviewer would accept.
- The protocol section appears once in the agent-instruction file, between its markers.
