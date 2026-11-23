# Source knowledge graph

Install explicitly with `--with-source-graph`; use `--source-graph-root <path>` to choose the graph root. On an older Markdown-only ontology, first run `node scripts/build-ontology.mjs` and commit the resulting Turtle source. Use `--force` to upgrade Kit-owned scripts, workflows and the schema; adopter-owned graph data, configuration and existing Markdown views remain in place.

Enable the `sourceGraph` section in `ontology.config.json` and set evidence selectors for each role. For a Terraform-only deployment, use `"deployment": ["**/*.tf"]`. Paths without an eligible role selector cannot serve as evidence for that role. For an existing config, apply the installer's printed config notice yourself.

## Read the current state

The generated view defaults to `<graph-root>/README.md`. Read its claims, their direct or inferred basis, coverage and declared gaps, then follow the evidence links to assess accuracy. Inferred claims are tentative. Missing knowledge does not establish that a relationship is absent. A structural pass does not establish that claims are true. The view describes the whole current graph, including isolated nodes; it does not report added, changed or removed claims.

Turtle files remain the canonical graph source. Each claim has a Turtle source link for detailed inspection; exact graph identifiers and snapshot information appear in secondary lookup details. This operating guide is separate from the generated view.

Set these rendering options inside `sourceGraph` in `ontology.config.json` before committing the source:

- `repositoryUrl`: this repository's HTTPS browser URL, such as `https://github.com/owner/repository` or `https://git.example.com/team/repository`. Use the owner/repository root without credentials, query or fragment. The renderer requires this setting; existing graph-only commands still work without it.
- `markdownPath`: optional output path, default `<graph-root>/README.md`. It must be a normalized `.md` path strictly inside the graph root, distinct from the ontology files. Choose another path if the default README contains authored content.

Evidence and Turtle links use the full source commit ID and line anchors. Links explicitly select the host's source view (`?plain=1`), so Markdown evidence opens with source lines rather than a rendered preview. After upgrading the renderer, regenerate and commit the view if the freshness check reports changed output. They continue to identify the same bytes when the branch advances, provided the Git host retains that source commit. Repeated generation reuses the existing source commit when its inputs still match, keeping the document byte-identical.

## Author and review in one PR

Coverage can be partial: declare selectors, priorities and covered, unknown or excluded status, with reasons for gaps. Unmatched paths are unknown. The graph root is excluded. Graph files use the canonical Turtle subset: fixed prefixes, named subjects, one predicate and object per line, sorted subjects and predicates, escaped strings and decimal integers. Blank nodes, collections, RDF-star, multiline literals and compact multi-object syntax are not accepted.

For each task, query the reader and inspect the cited source. After editing covered files, update the relevant assertions and evidence or record that no fact changed. Update refresh records with staged blob IDs. New covered files and deletions also need records.

1. Stage and review all canonical inputs: configuration, ontology Markdown and Turtle, graph files including the schema, and covered source. Run `node scripts/check-source-graph.mjs --staged --base <merge-base>` and `node scripts/check-ontology-terms.mjs`, then commit those inputs as the source commit.
2. Run `node scripts/render-source-graph.mjs`. It reads committed source, validates the complete graph and evidence, and checks that staged inputs match. Unstaged working-file edits are not rendered. It publishes atomically and preserves the previous output on validation or replacement failure. It refuses authored files and symlinked output paths.
3. Read the generated current state and assess claims against their evidence. Correct the canonical inputs and repeat the source commit and generation if needed. Never edit the generated Markdown manually.
4. Stage and review the generated document. Run `node scripts/render-source-graph.mjs --check --staged` and `node scripts/check-ontology-terms.mjs` before committing it. Include both source and generated-document commits in the same PR.

The source commit and document commit are separate because the document embeds the full source commit ID. Canonical inputs must not change between them. `--check` checks committed HEAD, `--check --rev <revision>` checks a historical commit, and `--check --staged` checks the candidate index tree. Checks are read-only and compare exact rendered bytes as well as the current and recorded source inputs. Exit 0 means current, 1 means missing or stale output, and 2 means invalid input, configuration, mode or an unavailable source snapshot.

## Authoring graph entries

Follow this section for every request to add or refine a graph entry. Every entry cites source that exists at the pull request's revision.

### Label

- A concept node's label is the ontology term exactly.
- A `kit:source-symbol` node's label is the symbol's name exactly as written in source.
- A source file, test or document node's label is its repository-relative path.
- A component or system node's label is the name the source uses for it: the project, package or assembly name.

### Kind

Pick a core kind from `{{GRAPH_ROOT}}/graph-schema.ttl`. Declare a local kind in the manifest, with a definition, only when no core kind fits, and say in your reply why none fitted.

### Concept link

When the entry names or realises an ontology concept, give the concept node `kit:denotes` to the ontology IRI and link the source element to that concept node by `kit:implements`. When the concept is missing from the ontology, add it to the ontology first. Record a `kit:source-symbol` when one named type or function realises the concept; use a file-level `kit:implements` only when the concept is spread across several functions in the file.

### Evidence

Cite the narrowest line range that shows the fact (for a symbol, its declaration), the role whose `sourceGraph.evidence` selector matches the path, and the staged blob ID from `git rev-parse :<path>`. Use `kit:direct` unless the claim is an inference; an inferred claim uses `kit:inferred` and cites the observations it rests on. If the path is in unknown scope, widen coverage as the second example shows; if it is in excluded scope, record nothing and say so, quoting the exclusion's reason.

### Refine without changing identity

When you refine an entry, keep its node or assertion IRI and change only its label, kind, link or evidence. Say in your reply what changed and why. Converting an existing file-level `kit:implements` into a symbol entry is a refinement, made only when asked.

### Decline what has no source

Decline a request for an entry about something with no source in the repository, such as a planned component. Say that the graph records only implemented source, and suggest adding the vocabulary to the ontology instead.

### Write, check, then render

Write every change in Turtle under `{{GRAPH_ROOT}}` and in `ontology.config.json`, inserting each block at its sorted position in its file. Stage the change and run `node scripts/check-source-graph.mjs --staged --base <merge-base>` until it passes. Then follow "Author and review in one PR": commit the source, run `node scripts/render-source-graph.mjs`, and check the output with `node scripts/render-source-graph.mjs --check --staged` before committing it. Never write or edit the generated Markdown by hand.

### Reply

Report each choice with one line of reasoning, then the check result:

```text
Label: SessionRemovalService, the class name as declared in source.
Kind: kit:source-symbol, because one class realises the concept.
Concept link: kit:implements to :node-session-removal, which denotes :SessionRemoval.
Evidence: src/Sessions/SessionRemovalService.cs lines 12-12, role implementation, the class declaration.
Check: node scripts/check-source-graph.mjs --staged --base <merge-base> passed.
```

### Example: a symbol that implements a concept

The class SessionRemovalService in `src/Sessions/SessionRemovalService.cs` realises the ontology concept SessionRemoval, and the file already has the node `:node-session-removal-file`. Add these blocks, with the staged blob ID in place of the example one, and reuse an existing concept node for the term if the graph has one:

```turtle
:assertion-session-removal-service-contained a kit:GraphAssertion ;
    kit:basis kit:direct ;
    kit:evidence :evidence-session-removal-service-declaration ;
    kit:object :node-session-removal-service ;
    kit:relationship kit:contains ;
    kit:subject :node-session-removal-file .

:assertion-session-removal-service-implements a kit:GraphAssertion ;
    kit:basis kit:direct ;
    kit:evidence :evidence-session-removal-service-declaration ;
    kit:object :node-session-removal ;
    kit:relationship kit:implements ;
    kit:subject :node-session-removal-service .

:evidence-session-removal-service-declaration a kit:GraphEvidence ;
    kit:blobId "0123456789abcdef0123456789abcdef01234567" ;
    kit:endLine 12 ;
    kit:path "src/Sessions/SessionRemovalService.cs" ;
    kit:role kit:role-implementation ;
    kit:startLine 12 .

:node-session-removal a kit:GraphNode ;
    kit:denotes :SessionRemoval ;
    kit:kind kit:concept ;
    rdfs:label "SessionRemoval" .

:node-session-removal-service a kit:GraphNode ;
    kit:kind kit:source-symbol ;
    rdfs:label "SessionRemovalService" .
```

Finish with the write, check and render order above.

### Example: widening coverage for new code

The change adds `src/Downloads/AssetDownloadRetryPolicy.cs` in a new directory that is in unknown scope, and the class AssetDownloadRetryPolicy realises the concept AssetDownloadRetry. Propose the narrowest widening, the new directory. In the manifest, add a covered coverage entry and the refresh record for the new file, and reference both from the graph resource with `kit:coverage :coverage-src-downloads` and `kit:refreshRecord :refresh-520189267322`:

```turtle
:coverage-src-downloads a kit:GraphCoverage ;
    kit:pathSelector "src/Downloads/**" ;
    kit:priority 10 ;
    kit:status kit:covered .

:refresh-520189267322 a kit:GraphRefreshRecord ;
    kit:blobId "0123456789abcdef0123456789abcdef01234567" ;
    kit:path "src/Downloads/AssetDownloadRetryPolicy.cs" ;
    kit:reviewOutcome kit:graph-updated .
```

A refresh record's IRI is `:refresh-` followed by the first 12 hexadecimal characters of the SHA-1 of its path, which `node -e 'console.log(require("crypto").createHash("sha1").update(process.argv[1]).digest("hex").slice(0, 12))' <path>` prints. Where no `sourceGraph.evidence` selector matches the path for its role, add one in `ontology.config.json`, for example `"implementation": ["src/Domain/**", "src/Downloads/**"]`. Then add the entries, as in the first example:

```turtle
:assertion-asset-download-retry-policy-implements a kit:GraphAssertion ;
    kit:basis kit:direct ;
    kit:evidence :evidence-asset-download-retry-policy-declaration ;
    kit:object :node-asset-download-retry ;
    kit:relationship kit:implements ;
    kit:subject :node-asset-download-retry-policy .

:evidence-asset-download-retry-policy-declaration a kit:GraphEvidence ;
    kit:blobId "0123456789abcdef0123456789abcdef01234567" ;
    kit:endLine 8 ;
    kit:path "src/Downloads/AssetDownloadRetryPolicy.cs" ;
    kit:role kit:role-implementation ;
    kit:startLine 8 .

:node-asset-download-retry a kit:GraphNode ;
    kit:denotes :AssetDownloadRetry ;
    kit:kind kit:concept ;
    rdfs:label "AssetDownloadRetry" .

:node-asset-download-retry-policy a kit:GraphNode ;
    kit:kind kit:source-symbol ;
    rdfs:label "AssetDownloadRetryPolicy" .
```

If the new selector also covers existing files, review each and add its refresh record. List the widened selector, the number of files it newly covers and why in the pull request's "Graph changes" section. Finish with the write, check and render order above.

## Link design documents

Behaviours and ADRs are graph nodes from schema version 2. A behaviour node is `:behaviour-<slug>-B<n>`, labelled `<slug>#B<n>` and its title, with `kit:designStatus` `kit:current` or `kit:retired` and one evidence item on its declaration in `02-behaviours.md`, or in the Analyst section of `feature.md` for a lite feature. A decision node is `:decision-<NNNN>`, labelled `ADR <NNNN>` and its title, with the first word of its Status line as its `kit:designStatus` and one evidence item from its title line to its Status line. The check fails a node whose id, label, status or evidence no longer matches its document, an id that is both current and retired, and a feature with both behaviours files. It reports, without failing, every link to a retired behaviour or to a superseded or deprecated decision; CI writes that list to the job summary.

The check reads a replacement from `replaced by B<n>` in the retired entry (`replaced by <slug>#B<n>` for another feature's behaviour) and a successor from `superseded by ADR <NNNN>` in the ADR's Status line, and records an ADR only when its Status word is proposed, accepted, superseded or deprecated. Behaviour and decision evidence uses the selected-document role.

Upgrading the kit replaces `graph-schema.ttl` with schema version 2, so the generated Markdown is stale until you regenerate it: run `node scripts/render-source-graph.mjs` after the upgrade and commit the result in the same pull request. A version 1 manifest stays valid; raise it to 2 only when you record the first behaviour or decision.

To see what a behaviour touches, run `node scripts/query-source-graph.mjs behaviour <slug>#B<n>`. To see why code exists, run `node scripts/query-source-graph.mjs code <node>`; it also shows the links of the component that contains the node.

## Recover a source snapshot

The renderer is offline. After squash or rebase, a fresh checkout may lack the recorded source commit even though the Git host retains it. The workflow reads only the bounded, validated SHA from `node scripts/render-source-graph.mjs --print-source-rev --rev HEAD`, then fetches a missing commit from fixed remote `origin` before the real check. Metadata is data and cannot supply Git options, a remote or executable commands.

For a local missing snapshot, use that inspection command and retrieve its full source SHA with `git fetch --no-tags origin <full-source-sha>`, then rerun the check. An unavailable snapshot is an explicit failure. If the host no longer retains it, or the generated metadata is damaged, commit the valid current canonical inputs and run `node scripts/render-source-graph.mjs --source-rev HEAD` to regenerate against the current commit. Review, stage, check and commit the replacement in the same PR. The explicit source must match all current rendering inputs; it cannot bypass validation. An unmarked authored file is preserved even in recovery mode, so configure another output path.

## Require the checks

The workflows publish `source-graph` and `source-graph-markdown` on pull requests and default-branch pushes. Configure branch protection to require both when adopting this workflow. The existing graph check validates structure and review records for covered changes. The Markdown check additionally validates the pinned source and exact current rendering. CI has read-only repository permission and never commits or publishes a generated document. Maintainers remain responsible for judging claims and evidence.
