# Source knowledge graph for AI agent grounding — behaviours

These behaviours describe `RefreshSourceKnowledgeGraph`, `CheckSourceKnowledgeGraph`, and
`GroundWithSourceKnowledgeGraph`. A `SourceKnowledgeGraph` contains reviewable `GraphAssertion`s,
their `GraphEvidence`, and explicit `GraphCoverage`. Assertions distinguish directly evidenced
relationships from clearly labeled inferences. The graph is broader than the `Ontology`; C4 is
one possible downstream view.

## Behaviours

### Outcome 1: Agents find relevant context

**B1 — Retrieve recorded relationships.** Given a `SourceKnowledgeGraph` has assertions linking a
canonical `Ontology` concept to implementation code, a test, and a declared dependency, when an
agent consults it for a task about that concept, then the agent can identify each recorded
relationship, its evidence, and whether it is directly evidenced or inferred at the graph's
recorded revision. A selected design or architecture document can supply evidence alongside
source and tests.

**B2 — Keep each step of a path visible.** Given the graph records A → B and B → C but no direct
A → C assertion, when an agent follows the relationship path from A to C, then it sees the two
recorded assertions, their separate evidence, and each one's basis; it does not report a direct
A → C relationship.

**B3 — Say when context is missing.** Given no `GraphAssertion` answers a task question, when the
agent consults the graph, then it reports the absence and the relevant `GraphCoverage` status. An
empty result is not evidence that no relationship exists in the repository.

### Outcome 2: Agents ground their claims

**B4 — Cite the underlying source.** Given an agent uses a `GraphAssertion` to describe a
relationship, when it presents the claim, then it identifies the assertion, its direct or inferred
basis, and its `GraphEvidence` with source path, location, and recorded revision. It describes an
inferred relationship as tentative. A graph-only citation without underlying source evidence does
not count as a grounded claim.

**B5 — Mark older evidence as stale.** Given the agent is working at a revision later than the
graph's recorded source revision, when it uses a graph assertion, then it identifies that the
evidence may be stale and verifies the relevant current source before presenting the relationship
as current. If current source is unavailable, it reports the relationship as unverified.

**B6 — Expose conflicting meaning.** Given a graph assertion or selected document uses a name or
meaning that conflicts with the canonical `Ontology`, when the agent encounters it, then it names
the conflict and uses the `Ontology` for canonical terminology. It does not silently rewrite the
evidence or treat the conflicting claim as settled.

**B7 — Label and explain inference.** Given source observations support a plausible relationship
that is not directly stated, when an agent publishes or uses that `GraphAssertion`, then the graph
labels it as inferred and cites the observations behind it. The agent states that the relationship
is an inference rather than presenting it as a directly observed fact. A guess without reviewable
source observations is not published as a `GraphAssertion`.

### Outcome 3: Graph changes are current and reviewable

**B8 — Review changed covered files before PR.** Given a pull request changes a source file or
selected document within declared `GraphCoverage`, when the authoring agent prepares the pull
request, then it refreshes affected assertions and coverage or records that review found no fact
change. The proposed graph makes that review visible on the pull request.

**B9 — Block an omitted refresh.** Given a pull request changes a file within declared
`GraphCoverage` and provides no corresponding graph review or update, when
`CheckSourceKnowledgeGraph` runs, then it fails the pull-request check and names the changed file.
New files in the declared scope are included. Files outside declared coverage do not trigger this
freshness failure.

**B10 — Reject invalid proposed facts.** Given a proposed graph has duplicate or dangling
assertion identities, missing required evidence, an assertion without a direct or inferred basis,
a source path or location that cannot be found at the reviewed revision, or malformed coverage,
when `CheckSourceKnowledgeGraph` runs, then it fails with the affected assertion or coverage item
and a specific reason.

**B11 — Keep semantic review human.** Given the proposed graph passes its deterministic check,
when the pull request is reviewed, then maintainers can inspect its added, changed, and removed
assertions with their evidence. A passing check states structural validity, not that every claim is
semantically true. The validation script does not call a model or require a secret or network
access after checkout.

### Outcome 4: The approach works across repositories

**B12 — Accept partial coverage.** Given a repository declares some areas covered and others
unknown or out of scope, when its graph is checked or made available to an agent, then valid
covered assertions remain usable, missing areas are visible, and the repository can participate
without supplying all C4 levels or every possible source fact.

**B13 — Apply the same behavior across languages.** Given representative C#, TypeScript, Java,
and Python repositories each publish equivalent assertions, evidence, and coverage, when agents
consult them and PR checks run, then B1–B12 have the same observable outcomes regardless of the
source language. The graph does not require one language's extractor or source syntax.

**B14 — Use the selected deployment source.** Given the JointBooking pilot has Terraform and
other deployment strategies, when its agent records deployment facts, then `GraphEvidence` for
those facts refers to Terraform. The presence of another deployment strategy does not make it
evidence for this pilot.

### Outcome 5: Available facts support additional views

**B15 — Publish facts with their gaps.** Given a consumer reads the reviewed graph at a recorded
source commit, when it requests facts for a downstream view, then it receives the available
`GraphAssertion`s and `GraphCoverage` for that commit. If the facts needed for a C4 level are
absent, the consumer can report that level as unavailable or incomplete without fabricating
elements. The Kit does not require the downstream view to be rendered during graph validation.

## Uncertainties

| ID | Question | Decision or deferral |
| --- | --- | --- |
| U1 | Do authored decisions and architecture documents count as evidence? | Yes, selected documents are in scope alongside code, tests, ontology terms, and eligible deployment files. Their contents remain claims to review, not automatic truth. |
| U2 | What happens if covered source changes without a graph update? | The pull-request check blocks until the graph records a review or refresh of that change (B8–B9), even when the agent concludes existing facts still hold. |
| U3 | Which changes trigger the blocking freshness rule? | Apply it to declared `GraphCoverage`, including newly added files within that scope. A repository can declare partial coverage; an out-of-scope change does not block. |
| U4 | Can an inferred relationship ground an answer? | Yes, if it is clearly labeled as inferred and cites the source observations behind it. The agent presents it as tentative, never as directly observed (B4, B7). A guess without reviewable observations is excluded. |
| U5 | How is the recorded source revision represented without a self-referential commit hash? | Defer representation to architecture. B4–B5 and B15 require the effective revision to be visible and testable. |
| U6 | What if graph evidence conflicts with the ontology? | The `Ontology` remains canonical for vocabulary; the agent flags the conflict for review rather than changing the source claim silently (B6). |
| U7 | Which C4 levels must a source provide? | None is mandatory for participation. Downstream C4 rendering and the graph schema are outside this Kit phase; B12 and B15 require visible gaps. |
| U8 | What numeric grounding threshold defines success? | Explicitly deferred by the vision until a representative baseline exists. Evaluation still compares retrieval, citation validity, and unsupported claims by language. |

## Terms

- `SourceKnowledgeGraph`: the versioned, reviewable graph of source-backed repository facts and
  declared coverage.
- `GraphAssertion`: one reviewable direct claim or clearly labeled inference in that graph.
- `GraphEvidence`: a source path, location, and revision supporting a direct assertion or recording
  the observations behind an inference.
- `GraphCoverage`: the declared covered, unknown, or excluded scope of a source graph.
- `RefreshSourceKnowledgeGraph`: the agent's pre-PR review and update of graph facts and coverage.
- `CheckSourceKnowledgeGraph`: the deterministic pull-request check of validity and freshness.
- `GroundWithSourceKnowledgeGraph`: an agent's use of source-backed graph facts to answer a task
  question while identifying stale or missing information.
