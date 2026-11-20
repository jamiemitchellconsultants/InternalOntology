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
