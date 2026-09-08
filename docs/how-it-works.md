# How the ontology discipline works

Extracted from two internal repositories that run it: one an integration, where it originated,
and one a single application, where it was ported by hand. This describes the mechanism, not
either repository's domain.

## The problem it solves

A codebase accumulates several names for the same thing. One document says "the billing platform",
another names the vendor; one spec says an invoice is "sent", another says "dispatched", the enum
says something else again. Each individual drift is small. Together they make the documents
unreliable, and an AI agent reading them will faithfully reproduce whichever variant it saw last.

The problem is worse with AI in the loop, not better: an agent generates plausible synonyms
effortlessly, and does so consistently enough that the result reads as deliberate.

## The mechanism

**One canonical file.** `docs/ontology.md` names every domain concept exactly once, as a backticked
PascalCase term, in Markdown tables under named sections. It is the source; code, specs, plans and
prose are consumers.

**A protocol binding agents to it.** A section in the repository's agent-instruction file requires
reading the ontology before writing anything domain-touching, using its exact names, adding missing
concepts there first, and updating it in the same commit as the code change. The protocol is the
part that makes the file stay current; without it the ontology becomes archaeology within a month.

**A deterministic check.** `scripts/check-ontology-terms.mjs` derives the canonical vocabulary from
the ontology itself, then scans the repository's Markdown for two things: a backticked PascalCase
term that is not canonical and not allowlisted, and — where the ontology names external systems —
prose that paraphrases one instead of naming it. It runs in CI on every pull request. Quoted
occurrences are exempt, so a document can quote a forbidden phrase in order to forbid it. The
script exits 0 clean, 1 on violations, and 2 if it could not run at all (a broken config, for
instance) — a build red for "the config is broken" is deliberately distinguishable from one red for
"the prose is wrong."

**An escape hatch with a price.** Not every capitalised term is a domain concept; framework types
and interface names are not. The allowlist admits them, and requires a written reason for each. The
reason is the price: it makes a lazy exemption visible to a reviewer.

## The two halves

The deterministic check reads backticked terms. That bounds what it can catch, precisely and
usefully:

| | Caught by the linter | Caught by the reviewer |
|---|---|---|
| `Bill` where the ontology says `Invoice` | yes | yes |
| "the billing platform" instead of the named system | yes, if configured | yes |
| "the invoice moves from approved to sent" | no | yes |
| An enum in code gaining a member | no | no |

The third row is why the optional semantic reviewer exists: unbackticked paraphrase is invisible to
a term scanner. The fourth is why the optional enum lock tests exist: no Markdown check can see
code.

The reviewer is advisory by design. A model that can be wrong must not hold a merge — the moment it
does, people learn to route around it, and the deterministic check loses credibility alongside it.
Its findings appear as one pull request comment, updated in place; only an infrastructure failure
turns its job red, which is deliberately distinguishable from "reviewed, found nothing."

## What it does not catch

- Drift in code, unless the enum lock tests are installed — and then only in enums.
- Unbackticked paraphrase, unless the semantic reviewer is installed.
- An ontology that is simply wrong. The check enforces consistency with the ontology, not the
  ontology's correctness. That remains a human judgement.
- Anything outside tracked Markdown — a pull request description, for instance, which is why the
  checker takes explicit paths with `--also`.
- An all-caps term such as `README` or `API` is never checked as a domain concept, backticked or
  not — the same regex that recognises a canonical term also gates what the check looks for, so an
  all-caps ontology term loses coverage rather than becoming a false positive. That trade is
  deliberate: a first run on an established repository is already noisy, and a wall of false
  positives on acronyms is exactly how a new control gets silenced before it earns trust.

## Why each repository is independent

Installing the kit copies files. It creates no dependency: no shared vocabulary, no registry, no
package resolved at runtime. Two repositories that both installed it have no relationship to each
other. Everything that varies lives in one file, `ontology.config.json`, inside each repository and
describing only that repository — which is also what lets the installed scripts stay identical, so
a later fix reaches a repository as a file copy rather than a hand merge.
