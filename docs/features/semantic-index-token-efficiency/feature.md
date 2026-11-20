# Semantic index token efficiency

## [PO] Vision

### Problem

The semantic repository index helps agents and developers find code from a plain-English question, but it does not yet say what that costs in tokens. Each search returns passages that an agent reads in full, and a broad query can return far more text than the agent needs to choose where to look next. The people who pay are the agents, whose discovery work fills their context before the first edit, and the developers whose usage budget those sessions draw on. Nobody can currently see how many tokens a search returns, so nobody can tell whether a change makes the index cheaper or dearer.

### Users

- Coding agents that search the index to find files, tests and documentation before making a change.
- Developers who run those agents and carry the usage cost and the time spent waiting on long contexts.
- Repository owners who set the index's limits and want evidence that it earns its keep.

### Outcomes and measures

1. **See what a search costs.** Every search reports the number of tokens it returned, and a repository can read the recorded figures for a period. Check that the figures match an independent count on a reviewed set of queries. This creates the baseline that every later measure compares against.
2. **Return less text for the same leads.** On a reviewed set of real questions, compare tokens returned per query against the baseline. Check that the share with a relevant implementation, test or document in the first five results does not fall below the baseline.
3. **Bound the worst case.** A single search cannot return more than a size the repository owner sets. Check the largest response across the reviewed set against that limit, and that a response cut short says so.
4. **Spend fewer tokens finding the first file to change.** On a reviewed set of real tasks run with an agent, compare input tokens, files opened and search calls before the first edit against the baseline and against running without the index. Pair the figures with a short developer note on whether the results were still trusted enough to start from.

5. **Load less before any search.** The agent protocol for the index is as short as it can be while keeping every rule an agent needs. Check the tokens it adds to a session's starting context against its current size, and that a reviewed set of agent runs still follows each rule.
6. **Use the graph when it already answers.** Where a `SourceKnowledgeGraph` is available and covers the question, an agent is told to consult it before searching. On a reviewed set of questions that the graph covers, compare the searches run and tokens spent against the baseline, and check that the answers still cite evidence at the reported commit.

Set targets after the baseline exists. Outcomes 2 to 6 report a change from it; they do not promise a percentage in advance.

### Scope

- Recording the tokens each search returns, readable by the repository owner, with no source text or query text stored beyond what search already keeps.
- A compact form of search results that lets an agent choose where to look before it reads passage text, and a way to ask for the full text of a chosen result.
- An owner-configured cap on the size of a search response, and a clear indication when a response was cut short.
- A shorter agent protocol for the index, that keeps every rule agents need and drops restated or redundant text.
- Guidance telling agents to consult the `SourceKnowledgeGraph` first when an adopting repository has one that covers the question, and to search the index otherwise.
- Measurement of the outcomes above on representative adopting repositories.

### Out of scope

- Combining adjacent or overlapping passages into one result. Deferred until the baseline shows whether duplicates matter.
- Changing the source knowledge graph itself, or building any new way to query it.
- Changing the embedding model, ranking, chunking or the snapshot format.
- Billing, quotas or reporting of spend in currency, and token counts for anything other than index searches.
- A hosted service for collecting figures across repositories.

### Research

- GitHub's code search tool for agents was changed to trim each hit and return text-match snippets instead of the full repository object for every result, because the full objects bloated the context window. [github-mcp-server pull request 2476](https://github.com/github/github-mcp-server/pull/2476)
- Other code-search servers for agents commonly cap hits with a small default and a hard maximum, return snippets with path and line ranges, and offer a compact response mode. [opencodesearch](https://docs.rs/crate/opencodesearch/0.1.0/source/src/mcp.rs), [code context engine](https://mcpservers.org/ja/servers/elara-labs/code-context-engine)
- Vendors report large token savings from these designs, but the figures come from their own benchmarks on different codebases and are not comparable. This is why the vision sets the baseline and the comparison inside the adopting repository. [jCodeMunch](https://pypi.org/project/jcodemunch-mcp/1.26.0/)
- Anthropic's guidance on writing tools for agents names token efficiency as a design principle for tool responses; the specific advice on truncation and response format was not retrieved in this research and should be read at the source before the architect decides. [Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)

## [Analyst] Behaviours

The scenarios cover the six outcomes in the [PO] Vision above. Search already returns only the commit, path, line range and score of each hit, never passage text, and `--limit` already bounds hits from 1 to 100 with a default of 5. The cost an agent actually pays is therefore the reading it does after a search and the number of searches it runs. Outcomes 2 and 3 are read in that light, and the uncertainty log records the change (U1).

### Outcome 1 — See what a search costs

**B1 — Record each command's token estimate.** Given semantic index search or passage retrieval is enabled, when either command returns a response, then the Kit appends one `SearchTokenLog` record to the checkout's Git-ignored index storage holding the time, command, number of results or lines returned, and the `TokenEstimate` of the response. The record contains no query text and no source text. The same response always yields the same estimate.

**B2 — Report the estimate in every response.** Given a search or passage response, when it is returned in text or JSON, then it states its `TokenEstimate` and that the figure is an estimate. A response that was not logged because logging failed still states its estimate and reports the logging failure without failing the command.

**B3 — Summarise recorded use.** Given a `SearchTokenLog` with records, when a developer or owner requests a report, then the Kit prints the number of commands, total and mean estimated tokens per command, and the largest response, optionally limited to records after a given time. An empty or absent log reports that no baseline exists yet. The report reads only the local log.

**B4 — Validate the estimate.** Given a reviewed set of queries, when the estimates are compared with an independent count of the same responses, then the pilot records the difference. A systematic difference is reported with the figures and does not block the feature.

### Outcome 2 — Return less text for the same leads

**B5 — Return only the cited passage.** Given a `SemanticSearchResult` from the current index, when an agent requests that passage by commit, path and line range, then the Kit returns the text of those lines read from the indexed Git commit, not from the working tree, together with the commit, path, line range and its `TokenEstimate`. A request for a commit that is not the indexed commit, a path outside the effective `IndexSourceScope`, or a range outside the file is refused with the reason and returns no text.

**B6 — Keep search results to locations.** Given a search, when it returns results, then each carries the commit, path, line range and score and no passage text. In compact JSON output the commit appears once for the response rather than on every result. The standard output form is unchanged for existing callers.

**B7 — Hold relevance steady.** Given the reviewed question set from the original index pilot, when the same questions run with compact output and the passage command, then the share with a relevant location in the first five results equals the baseline for the same index. Compact output changes how results are presented and never which results are returned.

### Outcome 3 — Bound the worst case

**B8 — Apply the owner's response cap.** Given `semanticIndex` in `OntologyConfig` sets a `ResponseCap`, when a passage or search response would exceed it, then the Kit returns the leading part that fits, marks the response as truncated, and states what was returned and what remains: for a passage, the line range returned and the first line not returned; for a search, the number of results returned and omitted. A truncated response is a successful response. The estimate and the log record the size actually returned.

**B9 — Default and validate the cap.** Given no `ResponseCap` is set, when a command runs, then the Kit applies a documented default. A cap that is not a positive integer is a configuration error that names the setting and makes no model request. The cap is read from the trusted committed configuration, like other index settings, and a credential or environment value cannot raise it.

**B10 — Stay within the cap in the worst case.** Given the reviewed question set and a cap, when every search and passage response is measured, then the largest `TokenEstimate` does not exceed the cap by more than the size of the truncation notice.

### Outcome 4 — Spend fewer tokens finding the first file to change

**B11 — Measure discovery cost per task.** Given a reviewed set of real tasks and an agent session transcript for each, when a task is run with the index and without it, then the pilot records, up to the first edit, the input tokens, files opened, search calls and index commands used, and a short developer note on whether the results were trusted enough to start from. Counts come from the session's own usage record or transcript, not from the Kit.

**B12 — Compare against the baseline.** Given the recorded figures from B11 and the `SearchTokenLog` baseline, when the pilot reports, then it states the change in each figure against the baseline and against running without the index. It sets no target before the baseline exists.

### Outcome 5 — Load less before any search

**B13 — Shorten the agent protocol.** Given the agent protocol installed for the semantic index, when it is shortened, then every rule an agent needs remains: when to use the index, the status and refresh check, the single focused query, treating results as leads, reading the cited lines at the cited commit, the empty-result rule, and the prohibitions. Text that restates another rule or the vision is removed. The installed text stays identical in every adopting repository.

**B14 — Measure the protocol's cost and fidelity.** Given the previous and shortened protocol, when each is estimated in tokens and a reviewed set of agent runs follows each, then the pilot records the change in starting-context tokens and checks that no rule that was followed before is dropped.

### Outcome 6 — Use the graph when it already answers

**B15 — Consult the graph first.** Given `sourceGraph` is enabled and the graph reader is installed, when an agent has a repository question, then the protocol tells it to ask the graph reader first, and to run an index search only when the reader reports the relevant area as unknown, excluded or empty. When `sourceGraph` is not enabled the protocol tells the agent to search the index directly.

**B16 — Report graph-first savings.** Given a reviewed set of questions that the graph covers, when they run under the old and new protocols, then the pilot records searches run and tokens spent for each, and checks that each answer still cites evidence at the reported commit. The graph itself is not changed.

## Uncertainties

| ID | Question | Decision or deferral | Basis |
| --- | --- | --- | --- |
| U1 | The vision assumes bulky search results, but results already carry no passage text. What do outcomes 2 and 3 mean? | Read them as: return only the cited passage on request, present results compactly, and cap response size. The vision wording is not amended; this reading governs the behaviours (B5–B10). The remaining cost to reduce is post-search reading and repeated searches. | Owner chose to reinterpret rather than raise pushback to the product owner. |
| U2 | How are tokens counted? | A deterministic estimate from characters, always labelled as an estimate. A model tokenizer is not used (B1, B2, B4). | Owner decision. |
| U3 | Where is telemetry recorded and what does it hold? | A Git-ignored local log in the index storage with command, time, counts and estimates only. No query or source text (B1, B3). | Owner decision. |
| U4 | What does compact mean, and how does an agent get full text? | Search stays location-only with the commit stated once in compact JSON. A new passage command returns only the cited lines from the indexed commit (B5, B6). Excerpts in search results are rejected. | Owner decision. |
| U5 | What happens past the cap? | Cut at the cap, say so, and report what remains. Never fail on size (B8). | Owner decision. |
| U6 | How does an agent know the graph covers a question? | A protocol rule, with the existing graph reader's coverage reporting deciding. The index does not consult the graph (B15). | Owner decision. |
| U7 | What default cap applies when none is set? | Deferred to the architect, who chooses a documented default (B9). | Analyst: a number needs the measured baseline from B3. |
| U8 | How are agent tokens before the first edit counted for outcome 4? | From the agent session's own usage record or transcript. The Kit does not observe other tools' consumption (B11). | Analyst proposal, consistent with the vision's scope. |
| U9 | Does telemetry need a retention or size limit? | Deferred to the architect (B1). | Analyst proposal. |
| U10 | Passage merge, changes to model, ranking, chunking and snapshot format. | Out of scope, as in the vision. | Accepted vision. |

## Terms

New domain terms, added to `docs/ontology.md`: `SearchTokenLog`, `TokenEstimate`, `ResponseCap`, `PassageExtract`, `ShowIndexedPassage`, `ReportIndexTokenUse`. Existing terms used: `SemanticRepositoryIndex`, `SemanticSearchResult`, `IndexSourceScope`, `OntologyConfig`, `SourceKnowledgeGraph`, `GraphReader`, `GraphCoverage`.
