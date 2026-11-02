# Source knowledge graph for AI agent grounding — vision

## Problem

The Ontology Kit gives an agent canonical domain names, but an unfamiliar repository's structure,
dependencies, tests, deployment facts, and evidence are scattered across source and documents. An
agent must rediscover those relationships for each task and can treat a plausible inference as a
fact. Development teams need a reviewable `SourceKnowledgeGraph` that helps their agents discover
what is known at a recorded revision, follow relationships, inspect evidence, and recognize gaps.
The graph is wider than the `Ontology`; C4 diagrams are one possible view of it.

## Users

- AI coding agents used by development teams in participating repositories.
- Engineers who use those agents to plan, change, review, and explain repository behavior.
- Repository maintainers who review graph changes in pull requests.
- Division-ontology consumers who assemble source facts into cross-repository views, including the
  [C4 diagrams feature](https://github.com/jamiemitchellconsultants/division-ontology/issues/7).

## Outcomes and measures

1. **Agents find relevant context.** On a reviewed set of real, issue-style tasks, an agent finds
   the implementation paths, tests, and declared dependencies relevant to the task. Compare
   retrieval precision and recall with and without graph access.
2. **Agents ground their claims.** An agent describing a relationship cites the graph assertion and
   underlying source file, location, and revision, or identifies the relationship as unknown.
   Review a sample of responses for unsupported claims and invalid citations.
3. **Graph changes are current and reviewable.** An agent updates the graph before a pull request;
   the pull-request workflow checks its structure and evidence, while maintainers judge whether its
   claims are true. Measure invalid graph changes caught by CI and the effort of reviewing valid
   changes.
4. **The approach works across repositories.** Evaluate representative C#, TypeScript, Java, and
   Python repositories. Report coverage and grounding results per repository and language. A
   participating repository may publish partial facts and identify what is missing.
5. **Available facts support additional views.** Downstream consumers can derive C4 diagrams and
   other views where the source graph has enough evidence. A view reports unavailable or incomplete
   coverage rather than inventing missing facts; no source must cover all four C4 levels to join.

Numeric targets will be set after a baseline on representative repositories. Success is judged
against reviewed agent tasks, not an anecdote from one person's work or the appearance of a diagram.

## Scope

- A source-owned, versioned knowledge graph of repository facts, connected to but broader than the
  canonical `Ontology`.
- Agent generation or update before a pull request, following the Kit's ontology workflow.
- Deterministic pull-request validation with no model call, secret, or network requirement. The
  installed checker remains byte-identical across adopting repositories; repository variation
  belongs in adopter-owned configuration.
- Recorded source revision, evidence, and visible gaps for published facts.
- Evaluation across C#, TypeScript, Java, and Python. For the JointBooking pilot, only Terraform
  counts as deployment evidence.
- A source artifact that division-ontology can consume at a recorded commit without blocking
  source onboarding on complete C4 coverage.

## Out of scope

- Requiring every repository to provide all four C4 levels.
- Making Graphify, its skill, its hosted service, or another unapproved external dependency part of
  the Kit or an adopter's CI.
- Generating the graph inside the pull-request workflow or claiming deterministic checks can prove
  the graph's semantic truth.
- Treating Docker Compose as deployment evidence in the JointBooking pilot.
- Choosing the graph schema, extraction method, query interface, or diagram renderer in this phase.

## Research

- [The current ontology discipline](../../how-it-works.md) separates an agent's judgement about
  repository concepts from the deterministic check. The [installed protocol](../../../templates/protocol/ontology-protocol.md)
  directs agents before commit, and the [installed workflow](../../../templates/github/workflows/ontology-lint.yml)
  checks a pull request without secrets. The graph should follow that division of responsibility.
- A local Graphify 0.9.100 code-only spike on JointBooking commit
  `6957928a6c9054372dda915b359f63b73969ebee` found 6,105 nodes and 23,377 edges across
  607 code files. It found useful file and line evidence, but one shortest path between application
  symbols crossed test helpers and inferred dispatch. Terraform required an optional parser. This
  supports using Graphify as research evidence, not adopting its output as a trusted contract or
  assuming this C#-heavy sample proves TypeScript, Java, or Python coverage. The
  [Graphify documentation](https://graphify.com/integrations/claude-code) describes its skill and
  provenance tags.
- [RepoBench](https://arxiv.org/abs/2306.03091) evaluates retrieval of cross-file code context.
  [Agent Retrieval Bench](https://arxiv.org/abs/2607.24882) evaluates code-to-test,
  trace-to-code, and change-impact retrieval, including cases where no evidence should be
  returned. Both inform the proposed grounding measures; neither selects a graph implementation.
- The [C4 model](https://c4model.com/diagrams) defines context, container, component, and code as
  distinct views. A wider source graph may support some of these for a repository and leave others
  unavailable.
