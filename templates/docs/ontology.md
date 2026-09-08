# {{PROJECT_NAME}} — Application Ontology

<!-- GENERATED FROM ontology.ttl. Edit that file, not this one. -->

> **AI instructions:** Read this file in full before starting any task that touches domain
> concepts. To change it, edit `ontology.ttl` and run `node scripts/build-ontology.mjs`. This
> file must never lag behind the code. See the Ontology protocol section in this repository's
> agent-instruction file.

Every domain concept is named here exactly once, as a backticked PascalCase term. Code, specs,
plans and prose use those names; `ontology.ttl` is the source, this file and they are the
consumers. A term that appears in Markdown but not here fails the deterministic check in
`scripts/check-ontology-terms.mjs`.

**Delete the sections that do not apply to this repository from `ontology.ttl`**, and remove the
matching names from `sections` in `ontology.config.json`. An empty section is worse than an
absent one — the optional semantic reviewer treats an empty required section as a configuration
error.
---

## External Systems

| Name | What it is | Description |
| --- | --- | --- |
| `ExampleSystem` | The vendor platform this integrates with | Source of the `ExampleApproved` event. Replace this row. |

---

## Subsystems

| Name | What it is | Responsibility | Boundary |
| --- | --- | --- | --- |
| `ExampleEngine` | The transformation core | Turns one representation into another. Replace this row. | Receives `ExampleHandoff`. |

---

## Aggregate Roots

| Name | Description | Repository Interface |
| --- | --- | --- |
| `ExampleRoot` | The consistency boundary a transaction operates within. Replace this row. | _(TBD — pending persistence decision)_ |

---

## Entities

| Name | Properties | Description |
| --- | --- | --- |
| `ExampleEntity` | `id`, `status` | A thing with identity that persists across changes to its properties. Replace this row. |

---

## Value Objects

| Name | Properties | Description |
| --- | --- | --- |
| `ExampleWindow` | `date`, `startTime` | A thing defined entirely by its values, with no identity of its own. Replace this row. |

---

## Domain Events

| Name | Raising Aggregate | Payload Properties | Description |
| --- | --- | --- | --- |
| `ExampleApproved` | `ExampleRoot` | `id`, `approvedAt` | Something that happened, named in the past tense. Replace this row. |

---

## Enums

| Name | Values | Description |
| --- | --- | --- |
| `ExampleStatus` | `Pending`, `Active`, `Closed` | Lifecycle state. Replace this row. |

---

## Use Cases

| Name | Actor | Description |
| --- | --- | --- |
| `CreateExample` | Operator | Replace this row. |

---

## Relationships

| From | Relationship | To | Cardinality |
| --- | --- | --- | --- |
| `ExampleRoot` | raises | `ExampleApproved` | 1 → 1 |

---

## Business Rules & Invariants

- **`ExampleEntity`** — must not move to `Closed` before an `ExampleApproved` event is received for it. Replace this bullet.
