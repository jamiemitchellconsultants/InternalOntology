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
