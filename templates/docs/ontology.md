# {{PROJECT_NAME}} — Application Ontology

> **AI instructions:** Read this file in full before starting any task that touches domain
> concepts. Update it after any task that adds, modifies, or removes one. This file must never lag
> behind the code. See the Ontology protocol section in this repository's agent-instruction file.

Every domain concept is named here exactly once, as a backticked PascalCase term. Code, specs,
plans and prose use those names; this file is the source, they are the consumers. A term that
appears in Markdown but not here fails the deterministic check in
`scripts/check-ontology-terms.mjs`.

**Delete the sections that do not apply to this repository**, and remove the matching names from
`sections` in `ontology.config.json`. An empty section is worse than an absent one — the optional
semantic reviewer treats an empty required section as a configuration error.

---

## External Systems

Third-party or otherwise not-ours systems this repository integrates with. Naming them here is
what makes the banned-alias check meaningful: add each paraphrase people reach for to
`bannedAliases` in `ontology.config.json`.

Configure the **multi-word phrase people actually write** ("the billing platform"), not a bare
token. Matching is plain case-insensitive substring matching with no word-boundary check, so a
short token like `crm` would also match inside `scrmsystem`. The boundary check that would prevent
that is deliberately not applied, because it would also stop catching plurals — "the billing
platforms" is caught today, and a word boundary after `platform` would lose it.

| Name | What it is | Description |
|------|-----------|-------------|
| `ExampleSystem` | The vendor platform this integrates with | Source of the `ExampleApproved` event. Replace this row. |

---

## Subsystems

Internal components that are ours to build. Named so that specs can describe the boundaries
*between* them without designing their internals.

| Name | What it is | Responsibility | Boundary |
|------|-----------|----------------|----------|
| `ExampleEngine` | The transformation core | Turns one representation into another. Replace this row. | Receives `ExampleHandoff`. |

---

## Aggregate Roots

| Name | Description | Repository Interface |
|------|-------------|----------------------|
| `ExampleRoot` | The consistency boundary a transaction operates within. Replace this row. | _(TBD — pending persistence decision)_ |

---

## Entities

| Name | Properties | Description |
|------|------------|-------------|
| `ExampleEntity` | `id`, `status` | A thing with identity that persists across changes to its properties. Replace this row. |

---

## Value Objects

| Name | Properties | Description |
|------|------------|-------------|
| `ExampleWindow` | `date`, `startTime` | A thing defined entirely by its values, with no identity of its own. Replace this row. |

---

## Domain Events

| Name | Raising Aggregate | Payload Properties | Description |
|------|-------------------|--------------------|-------------|
| `ExampleApproved` | `ExampleRoot` | `id`, `approvedAt` | Something that happened, named in the past tense. Replace this row. |

---

## Enums

Every value is listed. A code enum whose members drift from this list is exactly what the optional
enum lock test catches.

| Name | Values | Description |
|------|--------|-------------|
| `ExampleStatus` | `Pending`, `Active`, `Closed` | Lifecycle state. Replace this row. |

---

## Use Cases

The named operations the system offers. Include this section where specs refer to operations by
name; omit it where they do not.

| Name | Actor | Description |
|------|-------|-------------|
| `CreateExample` | Operator | Replace this row. |

---

## Relationships

| From | Relationship | To | Cardinality |
|------|--------------|----|-------------|
| `ExampleRoot` | raises | `ExampleApproved` | 1 → 1 |

---

## Business Rules & Invariants

Statements that must always hold. Written as prose bullets, each opening with the bolded concept
it constrains, because the semantic reviewer keeps exactly this shape.

- **`ExampleEntity`** — must not move to `Closed` before an `ExampleApproved` event is received for
  it. Replace this bullet.
