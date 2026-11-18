# Agent-maintained knowledge graph

## Product owner: vision

### Problem

In a repository with the Ontology Kit installed, developers are the only people who use the
repository. They read `docs/ontology.md` and the generated graph README. They ask their agent
about the repository, ask it to add or refine graph entries, and ask it for function and class
names that match concepts already in the `Ontology` or the `SourceKnowledgeGraph`. The installed
`OntologyProtocol` shapes design-time work: use the exact names, and define a missing concept
first, then write the code. The installed `GraphAgentProtocol` covers only finding things and
refreshing the graph before a pull request. Nothing tells an agent to check the graph before it
names code, to record the components and symbols it implements, or how to write a good entry when
asked. So in a pencils-down run, or a run through the feature skills and superpowers, the agent
keeps the ontology current but leaves the source graph behind it. The graph's labels, `kit:denotes`
links and evidence then drift from the names in the code and the ontology.

### Users

- Developers in repositories with the kit installed, who read the ontology and graph documents and
  direct their agents. JEPA-Speech's maintainer is the first.
- The agents those developers direct, in both modes: an autonomous pencils-down run, and a run
  through the claude-plugins persona skills plus superpowers. All of them follow the repository's
  `AGENTS.md`, which is where the kit installs its protocols.
- Division ontology repositories, made from the division-ontology template, which import each
  repository's ontology and source graph at a pinned commit. They depend on the quality of the
  source facts but are not changed by this feature.

### Outcomes and measures

Success is the owner's own judgement in a trial on JEPA-Speech, after reinstalling the kit there.
No numeric targets or retrieval baselines are set.

1. **Names match before code is written.** When an agent names a new function, class or component
   for a concept the ontology or graph already holds, it looks the concept up first and uses the
   matching name. Measure: in a trial run, the owner judges the new names against the ontology and
   the existing `GraphNode` labels.
2. **The graph is maintained with the code.** When an agent implements a component or symbol, it
   adds or updates the graph entries in the same change, as it already does for the ontology:
   label, `kit:denotes` where it names a concept, `kit:implements` to the concept it realises, and
   `GraphEvidence` pointing at the source. Where the code lands outside the graph's declared
   coverage, the agent proposes widening the coverage in the same change rather than leaving the
   work unrecorded. Measure: the owner reviews the trial pull request and judges whether the graph
   changes, including any widened coverage, are complete and well formed.
3. **Requests to add or refine an entry produce good entries.** Given authoring guidance, an agent
   asked to add or refine a graph entry chooses a label, kind, concept link and evidence that the
   owner accepts. Measure: the owner makes several such requests in JEPA-Speech and judges the
   results.
4. **"What implements this concept?" has an answer.** A developer or agent can start from an
   ontology concept and find the graph nodes that denote or implement it, rather than relying on a
   substring of a label or IRI. Measure: the owner asks for several concepts and checks the answers
   against source.
5. **Mismatched graph names are found by a model and settled by a human.** A model-assisted check
   compares graph labels, `kit:denotes` links and the names of linked code symbols with the
   ontology, and reports likely mismatches on the pull request. Its results take effect only when
   a human reviewer accepts them. The deterministic graph check stays offline and unchanged in what
   it proves. Measure: the owner judges the findings on trial pull requests as useful and not
   noisy.
6. **Model results reach a reviewer early and are easy to settle.** A human reviewer learns of the
   check's results as soon as they exist, not at merge time, and can settle each one in a step or
   two: accept it, reject it with a reason, or defer it by creating an issue that records the
   results for later review, for example after consulting stakeholders or subject-matter experts.
   Deferring lets the pull request proceed, and the issue keeps the open question visible.
   Measure: in the trial, the owner judges that results reached them promptly, that settling them
   took little effort, and that deferred results could be picked up again from their issue.

### Scope

- A stronger `GraphAgentProtocol`, installed into `AGENTS.md`, that tells the agent to check the
  ontology and graph before naming code, to record implemented components and symbols with their
  concept links, and to maintain the graph in the same change as the code. That includes code
  symbols linked to the concepts they realise, not only files, and proposing wider declared
  coverage, for the maintainer to review, when new code for a concept falls outside it.
- Authoring guidance for "add or refine this graph entry" requests.
- A concept-first lookup in the `GraphReader` that follows `kit:denotes` and `kit:implements` from
  an ontology concept.
- A model-assisted semantic match of graph names against the ontology: labels, `kit:denotes` links
  and the names of linked code symbols. It runs separately from the deterministic `GraphChecker`,
  in the way the `SemanticReviewWorker` runs separately from the term linter, and its results take
  effect only on human acceptance.
- A review path for those results that draws a human reviewer's attention as early as possible and
  lets them accept, reject with a reason, or defer a result to a newly created issue so the pull
  request can proceed.
- Widening [#35 B11](../source-knowledge-graph/02-behaviours.md) from "keep semantic review human"
  to "a model may produce semantic results about the graph, and they take effect only when a human
  accepts them". The deterministic validation script still makes no model call and needs no secret
  or network access. This reverses part of an accepted decision, so the design pull request's
  Narrative sections carry a `correction` entry citing `docs-feature-behaviours-for-source-knowledge-graph`.
- Implemented components and symbols only: every entry the agent writes is evidenced by source that
  exists.
- Changes ship in the kit's templates, byte-identical in every adopting repository, with variation
  in `ontology.config.json`.
- A trial on JEPA-Speech after reinstalling the kit.

### Out of scope

- Planned components: graph entries for parts an architecture designs before any code exists.
- Changes to the claude-plugins persona skills or to superpowers. Phase-specific hooks in the
  skills would be a separate change in claude-plugins; this feature reaches every workflow through
  `AGENTS.md`.
- Cross-repository search, embedding search, the runtime workspace, the SPA, the REST API, SPARQL
  and MCP. These belong to the division ontology repository.
- Any network call, model call or secret in the deterministic `GraphChecker`, the `GraphReader` or
  the renderer.
- A model check of whether each assertion is supported by its evidence. The widened B11 allows one,
  with human acceptance, but it is a follow-up; this feature's check covers naming only.
- Automatic judgement of semantic accuracy, as [#62](../human-readable-source-knowledge-graph/01-vision.md)
  accepted. A model result that a human must accept, reject or defer is not automatic, so #62
  stands unchanged.
- Installing a source graph in this repository.
- Numeric success targets and retrieval baselines.

### Research

- **The two protocols differ in reach.** The [installed ontology protocol](../../../templates/protocol/ontology-protocol.md)
  acts at design time: use the exact names, and define a missing concept before the code. The
  [installed source graph protocol](../../../templates/protocol/source-graph-protocol.md) covers
  reading the graph before a task, citing it, and refreshing it before a pull request. It says
  nothing about naming code against the graph, recording new components, or authoring entries.
- **`AGENTS.md` reaches every workflow.** The persona skills in `.claude/skills` (sourced from
  claude-plugins) and superpowers both follow the repository's `AGENTS.md`. Of the persona skills,
  only feature-analyst touches the ontology; feature-architect (components) and feature-dev (file
  and class names) touch neither the ontology nor the graph. A stronger protocol in `AGENTS.md`
  therefore reaches every workflow without a change in claude-plugins. (Previous session's review
  of the skills.)
- **The vocabulary already has the links.** The [graph vocabulary](../../../templates/source-graph/graph-schema.ttl)
  defines `kit:implements` ("a source element realizes the named concept or behaviour") and
  `kit:component`, `kit:source-symbol` and `kit:concept` kinds. The
  [graph checker](../../../templates/scripts/check-source-graph.mjs) requires `kit:denotes` on
  concept nodes and checks that the ontology holds the target.
- **Search is literal.** The [graph reader's search](../../../templates/scripts/query-source-graph.mjs)
  matches lower-cased substrings of a node's IRI and label. It does not follow `kit:denotes` or
  `kit:implements`, so it cannot answer "what implements this concept?".
- **There is a precedent for a model-assisted check.** The ontology semantic review runs in its own
  workflows (`ontology-semantic-review.yml`, `-request`, `-dismiss`), apart from the deterministic
  term linter. [#35 B11](../source-knowledge-graph/02-behaviours.md) keeps semantic review of the
  graph human and keeps the validation script free of model calls, secrets and network access; the
  [narrative entry](../../../narrative/entries/20261102-docs-feature-behaviours-for-source-knowledge-graph.md)
  that accepted it says maintainers remain responsible for claims.
  [#62](../human-readable-source-knowledge-graph/01-vision.md) keeps automatic accuracy judgement
  out of scope. The owner's widening keeps the offline validation script and keeps humans
  responsible, through acceptance of model results.
- **Settling a finding is hard today.** In the [ontology semantic review](../../../templates/docs/ontology-semantic-review.md)
  a finding blocks the merge until a maintainer posts a comment of exactly
  `/ontology-dismiss <64-hex-finding-id> <40-hex-head-sha> <reason>`, copying both identifiers from
  the run comment. One command settles one finding, the dismissal expires on the next push, and
  there is no way to defer a finding for later review. The graph review path should be easier
  than this.
- **The wider system.** Each business area's division ontology repository imports every app
  repository's ontology and source graph at pinned commits and runs the runtime workspace,
  including embedding search. This kit's job is the quality of the source facts those imports
  read. (Owner's brief.)
- **Trial ground.** JEPA-Speech is the live graph trial; this repository has no graph installed.
  Its graph at `main` commit `71f8a2b` (reviewed 2026-11-18) is still the adoption pilot:
  - Declared coverage is the console Domain and Application projects and their tests: 8 of the
    repository's 254 tracked C# source files. The graph holds 4 concept nodes; the ontology
    serialisation declares 110 classes and individuals.
  - Every `kit:implements` assertion links a source file to a concept. There are no
    `kit:source-symbol` nodes, so no class or function is linked to the concept it realises.
  - Two later feature commits, `47acd6c` (model download progress) and `a42010c` (download retry),
    added the concepts AssetDownloadProgress and AssetDownloadRetry to JEPA-Speech's ontology along with
    their code, in files outside declared coverage. Their graph changes only refreshed the evidence
    blob IDs for the ontology files. The agent maintained the ontology and the graph's refresh
    records, but added no graph facts for what it built.
  The graph check passed throughout, because it checks refresh records against declared coverage,
  not whether new code got graph entries.

## Analyst: behaviours

These behaviours extend `RefreshSourceKnowledgeGraph` and `GroundWithSourceKnowledgeGraph` through
a stronger `GraphAgentProtocol`, and add four use cases: `AuthorGraphEntry`,
`FindConceptImplementations`, `ReviewGraphNaming` and `SettleGraphNamingResult`. "The agent" is any
agent following the `AgentInstructionFile` of a `TargetRepository` with the source graph enabled,
in a pencils-down run or through the persona skills and superpowers. "A permitted reviewer" is a
person with write access to the repository (write, maintain, admin or owner role), as decided in
U5. The [#35
behaviours](../source-knowledge-graph/02-behaviours.md) B1–B15 still hold except where B25 below
widens B11.

### Outcome 1: names match before code is written

- **B1 Look up before naming.** Given the agent is about to name a new function, class, component
  or file for a concept, when it chooses the name, then it has first read the `Ontology` and run
  `FindConceptImplementations` (or the `GraphReader` search when it does not yet know the concept)
  for that concept, and it uses the ontology's exact name as the name or as the distinguishing part
  of the name (for example a symbol named after the concept plus a role suffix such as Service
  or Repository).
- **B2 Stay consistent with existing symbols.** Given the graph already holds a `kit:source-symbol`
  or `kit:component` node that implements the same concept, when the agent names a related new
  symbol, then it follows the existing node's naming and states in its reply which node it matched.
- **B3 Missing concept first.** Given the concept is in neither the `Ontology` nor the graph, when
  the agent needs a name for it, then it adds the concept to the `Ontology` first, as the
  `OntologyProtocol` requires, and only then names the code. It never links new code to an
  approximate existing concept.
- **B4 Ontology wins a conflict.** Given a graph label or existing symbol name conflicts with the
  `Ontology`, when the agent names new code, then it uses the ontology term, names the conflict in
  its reply and in the pull request body, and does not rename the existing code or graph entry
  unless the task asks for it (#35 B6).
- **B5 Reach through `AGENTS.md`.** Given the kit is installed or upgraded with the source graph,
  when any agent reads the `AgentInstructionFile`, then the spliced `GraphAgentProtocol` block
  carries B1–B4, B6–B11 and B26, with no change to the claude-plugins persona skills or superpowers.

### Outcome 2: the graph is maintained with the code

- **B6 Record what was built.** Given the agent implements a type, function or component that
  realises a concept named in the `Ontology`, and its source lies in declared covered
  `GraphCoverage`, when it prepares the change, then the same change adds or updates the graph
  entries: a `GraphNode` for the source element, a concept node with `kit:denotes` to the ontology
  IRI (created if absent), a `kit:implements` `GraphAssertion` from the source element to the
  concept node, and `GraphEvidence` citing the source lines, as well as the `GraphRefreshRecord`s
  the existing protocol already requires. `node scripts/check-source-graph.mjs --staged --base
  <merge-base>` passes.
- **B7 Symbol or file.** Given a named type or function in the change is the implementation of an
  ontology concept (for example a class, record or enum with the concept's name, or a function
  that carries out a use case), when the agent records it, then it records a `kit:source-symbol`
  node labelled with the symbol's exact name as written in source, with evidence covering its
  declaration, and links it by `kit:implements`. A file-level `kit:implements` is enough when no
  single symbol realises the concept (the concept is spread across several functions in the file).
  Where a `GraphNode` for the containing file exists, the agent also asserts `kit:contains` from the
  file to the symbol. Members that do not realise a concept on their own get no node.
- **B8 No retrofit.** Given existing file-level `kit:implements` assertions that the change does not
  touch, when the agent records new symbols, then it leaves them as they are. Converting old entries
  is an "add or refine" request (Outcome 3), not a side effect.
- **B9 Propose wider coverage for unknown areas.** Given the change adds code that realises an
  ontology concept in a path whose `GraphCoverage` status is `kit:unknown`, when the agent prepares
  the change, then in the same change it proposes widening coverage: a `kit:covered`
  `GraphCoverage` with the narrowest selector that holds the new code (the new files, or their own
  directory when the change creates it), the matching selector under the right role in
  `sourceGraph.evidence` in `OntologyConfig` where no existing selector matches, a
  `GraphRefreshRecord` for every existing file the new selector covers, and the B6 entries. The
  check passes on the result.
- **B10 Respect explicit exclusions.** Given the new code lies in a path whose `GraphCoverage`
  status is `kit:excluded`, when the agent prepares the change, then it proposes no widening and
  records no graph facts there, and says in the pull request body that the code is in excluded
  scope, quoting the exclusion's reason.
- **B11 Make the graph changes visible in the pull request.** Given the change adds, changes or
  removes graph entries or proposes wider coverage, when the agent opens or updates the pull
  request, then the body lists each added or changed concept link (source element, relationship,
  concept), each widened selector with the number of files it newly covers and why, and any code
  that realises a concept but stays unrecorded, with the reason. A maintainer who declines a
  widening asks for it to be dropped; the agent then removes the widened selector, its records and
  the entries that depended on it, and lists the code as unrecorded.
- **B12 Only implemented code.** Given a component or symbol is designed but not yet in source, when
  the agent maintains the graph, then it records nothing for it. Every entry it writes cites source
  that exists at the pull request's revision.

### Outcome 3: requests to add or refine an entry produce good entries

- **B13 Choose the label.** Given a request to add or refine a graph entry (`AuthorGraphEntry`),
  when the agent chooses the label, then it uses: for a concept node, the ontology term exactly;
  for a `kit:source-symbol`, the symbol's name exactly as in source; for a source file, test or
  document node, its repository-relative path; for a component or system, the name the source uses
  for it (project, package or assembly name).
- **B14 Choose the kind.** Given the same request, when the agent chooses the kind, then it picks a
  core `GraphVocabulary` kind, and declares a local kind in the manifest, with a definition, only
  when no core kind fits; it says in its reply why no core kind fitted.
- **B15 Choose the concept link.** Given the entry names or realises an ontology concept, when the
  agent links it, then a concept node carries `kit:denotes` to the ontology IRI and a source
  element links to that concept node by `kit:implements`; when the concept is missing from the
  `Ontology`, B3 applies.
- **B16 Choose the evidence.** Given the entry needs evidence, when the agent writes it, then it
  cites the narrowest line range that shows the fact (the declaration for a symbol), the role whose
  `sourceGraph.evidence` selector matches the path, and the staged blob ID; the basis is
  `kit:direct` unless the claim is an inference, which cites its observations (#35 B7). If the path
  is outside covered scope, B9 or B10 applies.
- **B17 Refine keeps identity.** Given a request to refine an existing entry, when the agent changes
  its label, kind, link or evidence, then the node or assertion IRI stays the same (`GraphNode`
  identity persists across relabelling), and the reply states what changed and why.
- **B18 Decline what cannot be evidenced.** Given a request for an entry about something with no
  source in the repository (for example a planned component), when the agent handles it, then it
  declines, says that only implemented source is recorded, and suggests the ontology for the
  vocabulary instead.
- **B19 Report the choices.** Given the agent has written the entry, when it replies, then it names
  the label, kind, concept link and evidence it chose, with one line of reasoning each, and the
  result of the graph check.

### Outcome 4: "what implements this concept?" has an answer

- **B20 Concept-first lookup.** Given an ontology term (by its exact name, its `:Name` form or its
  full IRI) and a graph whose nodes denote it, when a developer or agent runs
  `FindConceptImplementations` in the `GraphReader`, then it returns, at the graph revision: every
  `GraphNode` whose `kit:denotes` is that ontology IRI, and every `kit:implements` assertion whose
  object is one of those nodes, with its subject node (file, symbol or component), basis, evidence
  and evidence status, in the reader's existing text and `--json` forms. Inferred assertions are
  marked tentative, and a stale revision is marked `STALE`, as for the other reader commands.
- **B21 Both shapes.** Given the graph holds both shapes in use today (a concept node with
  `kit:denotes`, and file or symbol nodes linked to it by `kit:implements`), when the lookup runs,
  then both appear, grouped as "denotes" and "implements". It follows no further hops: a component
  that contains an implementing symbol is not listed unless it has its own `kit:implements`; `path`
  remains the way to follow longer chains (#35 B2).
- **B22 Term known, nothing linked.** Given the term is in the `Ontology` but no node denotes it,
  or no assertion implements it, when the lookup runs, then it says so and prints the coverage
  inventory; it does not say the concept is unimplemented (#35 B3).
- **B23 Not a term.** Given the input is not an ontology term, when the lookup runs, then it exits 2
  with a message naming the input as not found in the `Ontology`, and suggests `search`. It does no
  fuzzy matching.
- **B24 Offline.** Given the lookup runs, then it reads only local Git objects, the graph and the
  ontology serialisation; it makes no model call and needs no network or secret.

### Outcome 5: mismatched graph names are found by a model and settled by a human

- **B25 Widened #35 B11.** Given a pull request's proposed graph passes `GraphChecker`, then the
  deterministic check is unchanged in what it proves and still makes no model call and needs no
  secret or network access after checkout. Separately, a model may produce `GraphNamingResult`s
  about the graph's names in `ReviewGraphNaming`; a result takes effect only when a permitted
  reviewer accepts it.
- **B26 Agents never settle.** Given the agent works under any identity, including the maintainer's
  own token, when results exist, then it never accepts, rejects or defers one. It may correct the
  graph or code as an accepted result asks (B37) and may reply on the pull request with a proposed
  correction. Because a token cannot show whether a human or an agent used it, this rule is a
  protocol instruction, not a mechanical guarantee.
- **B27 What is compared.** Given a `GraphNamingRun`, then it compares only `GraphNode`s added or
  changed in the pull request (by IRI, against the base graph), and nodes whose denoted ontology
  item was renamed or removed by the pull request's proposed `Ontology`: for each, its label with
  the ontology name it denotes; its `kit:denotes` target with what its label names; and, for each
  `kit:implements` it is the subject of, its label (the symbol name for a `kit:source-symbol`) with
  the name of the concept it implements. Unlinked concept, component, system and symbol nodes are
  compared with the `Ontology` only for use of a synonym or alternative spelling of an ontology
  term. File, test and document paths are not compared.
- **B28 Containing the canonical term is not a mismatch.** Given a symbol or component label
  contains the canonical name of the concept it implements as a whole word sequence (for example
  SessionRemovalService implementing SessionRemoval), then no result is reported for that pair.
- **B29 Grounded results only.** Given the model returns a result, then it is reported only if it
  names a `GraphNode` in the proposed graph, quotes that node's current label or `kit:denotes`
  target exactly, and cites a real `Ontology` item; otherwise it is dropped and the run records the
  node as not reviewed with a fixed reason that contains no model output, as `SemanticFinding`
  grounding does (ADR 0019).
- **B30 Stable result identity.** Given a result, then its identity is derived from the node IRI,
  the compared values and the cited ontology item, not from the revision or the model's wording, so
  the same mismatch on a later revision is the same result.
- **B31 Eligible pull requests.** Given the naming review is enabled on the default branch, when a
  same-repository pull request opens or is pushed, then a `GraphNamingRun` runs. If neither the
  graph files nor the `Ontology` changed, the run makes no model call and reports no eligible
  changes. Fork pull requests are out of scope, as for `ReviewSemanticMatch`.
- **B32 Trusted settings.** Given a run, then it uses the model, endpoint, `RequestBudget` and
  `ModelAuthProvider` settings from the default branch, compares against the pull request's
  proposed graph and `Ontology`, treats both and the model's reply as data, and executes no pull
  request code.
- **B33 Not reviewed never blocks.** Given a run cannot review (disabled, credential or model
  unavailable, too large for the `RequestBudget`, or a partial review), then its status permits
  merge and says why, as ADR 0002 decides for `ReviewSemanticMatch`; only unsettled or
  accepted-and-uncorrected results hold the merge.
- **B34 Opt-in.** Given a repository that has not opted in, then the naming review posts nothing
  and holds nothing. Opting in is a setting in `OntologyConfig` on the default branch, with the
  installed files byte-identical across adopters.

### Outcome 6: results reach a reviewer early and are easy to settle

- **B35 Early and visible.** Given a run produces results, when it completes, then the pull request
  shows one summary comment in plain language listing each result with a short label (R1, R2 and so
  on), the node, the compared names, the ontology item, the reason and the suggested correction,
  each settled result with its decision, reviewer and reason, and the number of open deferral
  issues in the repository with a link to them. A fixed commit status on the head fails while any
  result is unsettled, and its description gives the counts. The summary is updated in place on
  later runs; a run that finds results not seen before on the pull request also posts a short new
  comment linking to the summary, so subscribers are notified; a run with nothing new posts none.
- **B36 Settle in one step.** Given a permitted reviewer sees the summary, when they settle a result,
  then one action records a `NamingSettlement` for one result or for all unsettled results: accept;
  reject, with a reason in the same action; or defer, with an optional note. No action needs a
  copied hash, finding ID or commit SHA. The summary and status reflect the settlement within one
  run of the settlement handler.
- **B37 Accept.** Given a permitted reviewer accepts a result, then the status keeps holding the
  merge, described as accepted and awaiting correction, until a revision on which the run no longer
  reports that result. The agent, seeing an accepted result, applies its correction to the graph or
  code.
- **B38 Reject.** Given a permitted reviewer rejects a result with a non-empty reason, then the
  result no longer holds the merge and the reason stays visible in the summary. A rejection without
  a reason is not recorded and the summary says why.
- **B39 Defer.** Given a permitted reviewer defers one or more results in one action, then exactly
  one new issue is created holding, for each deferred result: its node, compared names, ontology
  item, reason, suggested correction and links to the node's Turtle and evidence at the pull
  request's head commit; plus the pull request link, the reviewer, their note, and a fixed label for
  deferred graph naming results. The summary links to the issue; the deferred results no longer hold
  the merge.
- **B40 Settlements survive pushes.** Given a result was settled on the pull request, when a later
  revision produces the same result (B30), then its settlement still applies: a rejected or deferred
  result stays settled and points to its reason or issue, and no second deferral issue is created. A
  result whose compared values changed is a new result and is unsettled.
- **B41 Changing a settlement.** Given a result was settled, when a permitted reviewer settles it
  again on the open pull request, then the latest settlement applies. A deferral issue is never
  deleted; when its result is later accepted or rejected, the issue gets a comment saying so.
- **B42 Who may settle.** Given a person with write access to the repository, when they settle any
  result on any pull request, including their own, then the settlement is recorded. Given a person
  without write access (read or triage role, or no role) attempts to settle a result, then nothing
  is recorded and the status is unchanged.
- **B43 Settling a result that has gone.** Given a reviewer settles a result that the latest run no
  longer reports, then nothing is recorded for it and the summary says it is no longer current.
- **B44 Nothing in the graph.** Given results are accepted, rejected or deferred, then no settlement
  is written into the `SourceKnowledgeGraph` or its generated Markdown; only a correction committed
  in response to an accepted result changes the graph.

### Uncertainties

| # | Question (from the handoff unless noted) | Decision or deferral |
| --- | --- | --- |
| U1 | What is the review path's earliest point? | The moment a run finishes on the pull request's first eligible revision: one summary comment and a failing status (B35). The authoring agent does not run the model check locally, since it needs the maintainer's model credential; instead it lists its graph changes in the pull request body (B11), so the reviewer sees them before any run. Requesting code-owner review is GitHub's existing behaviour with `CODEOWNERS` and needs nothing new. |
| U2 | How does a reviewer accept, reject or defer in a step or two? | One action per result or for all unsettled results, with no copied identifier (B36). The GitHub mechanism (task-list checkboxes in the summary, a short command using R labels, or a review) is deferred to the architect within B36's constraints. GitHub suggestions for proposed fixes are not required by any behaviour; the architect may add them. |
| U3 | What does a deferral issue contain, how does it link back, and what happens on the next push? | B39 for the contents and links, B40 for later pushes: the settlement survives while the result's identity is unchanged, and no second issue is made. |
| U4 | Does a settled result leave a mark in the graph or its generated README? | No (B44). Settlements are review records on GitHub; the graph holds source-backed facts only, and the renderer stays deterministic. |
| U5 | Who may accept, reject or defer? | Anyone with write access, on any result and any pull request, including their own (B42); the owner's decision. This is wider than the maintainer-only rule for `FindingDismissal`. Agents never settle (B26). |
| U6 | What exactly does the naming check compare, and on which changes? | B27–B28, on added or changed nodes and nodes affected by an ontology rename or removal (B31). A sweep of the whole graph is deferred as a follow-up. |
| U7 | When does the agent record a `kit:source-symbol` node rather than a file-level `kit:implements`? | B7, with B8 for existing entries. |
| U8 | How does the concept-first lookup treat both link shapes? | B20–B21: both, grouped, one hop only. |
| U9 | What does proposing wider coverage involve? | Three places, all in the same change (B9): a `kit:covered` `GraphCoverage` selector in the manifest, a matching role selector in `sourceGraph.evidence`, and a `GraphRefreshRecord` for every existing file newly covered, which `GraphChecker` already requires. Narrow selectors keep the record count small. Excluded scope is never widened (B10). |
| U10 | What does the authoring guidance say? | B13–B19. Where the guidance lives (in the `GraphAgentProtocol` block, or in the installed `docs/source-knowledge-graph.md` with a pointer from the block) is deferred to the architect. |
| U11 | Does accepting a result settle it? (raised in analysis) | Accepting gives the result effect: it becomes a required correction and holds the merge until a revision no longer reports it (B37). Rejecting and deferring let the pull request proceed. This reading of "takes effect only on human acceptance" is the analyst's; the owner can steer it on the design pull request. |
| U12 | Do settlements carry across pull requests? (raised in analysis) | No: a settlement belongs to one pull request. A later pull request that changes the same node again gets the result again. Showing an earlier settlement of the same result on a later pull request is deferred as a follow-up. |
| U13 | Run outcomes, status context, configuration key and installer flag. (raised in analysis) | Deferred to the architect. Behaviour fixed here: the outcome values cover B31 and B33, whether by reusing `SemanticOutcome` or a new enum, and the status context is fixed and distinct from `ontology/semantic-match`. |
| U14 | Assumption: a stronger protocol in `AGENTS.md` reaches the persona skills and superpowers. | Accepted for this feature (B5); the trial tests it. If the trial shows a workflow ignoring it, that is parked as a claude-plugins issue, which stays out of scope. |
| U15 | Assumption: JEPA-Speech's small pilot graph is a fair trial ground for all six outcomes. | Accepted with a trial order for the user phase: first make "add or refine" requests (Outcome 3) for AssetDownloadProgress and AssetDownloadRetry, which exercise B9 because their code is in unknown scope; then run lookups (Outcome 4) against the larger graph; then open a trial pull request with a deliberate naming mismatch for Outcomes 5 and 6. JEPA-Speech already has the semantic review's model settings to reuse. |
| U16 | Assumption: planned components can stay out of the graph without losing design-time naming. | Accepted. B1–B4 apply at design time through the `Ontology` and the graph's existing entries, and the term check and semantic review still cover names in design documents. B12 and B18 keep planned components out. |
| U17 | Assumption: deferral to an issue does not let results pile up unnoticed. | Partly addressed: every summary shows the count of open deferral issues with a link (B35), and the issues share a fixed label. Any further reminder, such as the agent checking open deferrals for the concepts it works on, is deferred as a follow-up. |
| U18 | A model check of whether evidence supports each claim. | Out of scope (vision); a follow-up under the widened B11. |
| U19 | The `correction` narrative entry for the widening of #35 B11. | Not an analyst decision: the architect carries it in the design pull request's Narrative sections, citing `docs-feature-behaviours-for-source-knowledge-graph`. B25 states the widened behaviour. |

### Terms

Added to `docs/ontology.md` in this phase (this repository has no ontology serialisation to
regenerate):

- `GraphNamingRun`: one model-assisted comparison of a pull request revision's graph names with its
  proposed `Ontology`.
- `GraphNamingResult`: one likely naming mismatch a `GraphNamingRun` reports, with stable identity.
- `NamingSettlement`: a permitted reviewer's accept, reject or defer decision on one
  `GraphNamingResult` for one pull request.
- `SettlementDecision`: `accepted`, `rejected`, `deferred`.
- Use cases `AuthorGraphEntry`, `FindConceptImplementations`, `ReviewGraphNaming` and
  `SettleGraphNamingResult`.
- Updated: the `GraphAgentProtocol`, `GraphReader` and `RefreshSourceKnowledgeGraph` descriptions,
  for B1–B12 and B20.

Subsystems for the run, the summary and the settlement handler are the architect's to name.
