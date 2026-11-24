# Semantic index token efficiency — acceptance test review

This is the plain-language review of the one executable file added by the user phase for feature #178, `tests/semantic-index-token-efficiency-acceptance.test.mjs`, as AGENTS.md requires for a `.mjs` file a maintainer is asked to review.

The setup installs the Kit with the semantic index into two scratch Git repositories that share a local HTTP stand-in for the embedding model, reusing the existing acceptance fixture, so every command runs exactly as an adopter runs it: `node scripts/semantic-index.mjs <command> --json` in an installed checkout at a pinned commit.

The first test runs `usage` before any `search` or `show` and expects it to succeed, report zero commands, and say that no baseline exists yet, which covers the empty-log half of B3.

The second test refreshes the reader checkout, searches for "refund", expects the response to state an estimated token count flagged as an estimate with the matching refund file first and no passage text in any result, then reads the local token log and expects exactly one record whose only fields are time, command, count, tokens and truncated, with the same token figure as the response and no query text, source text or path anywhere in the file, and finally searches with `--compact` and expects the commit stated once for the response, the same locations as the full form, a smaller estimate, and a `usage` summary of two commands with positive totals, covering B1, B2, B3, B6 and B7.

The third test asks `show` for the first line of the cited refund file at the indexed commit and expects exactly that line back with an estimate and a `show` record in the log, then asks for a different commit, an unapproved path and a range past the end of the file and expects each to be refused with no text returned, covering B5.

The fourth test replaces the token log file with a directory of the same name and searches again, expecting the search to succeed, to state its estimate, and to report that the token log was not recorded, covering the logging-failure half of B2.

The fifth test reads the installed agent instructions in the scratch checkout and expects the graph-first direction, the compact search command and the `show` command to be present, covering the installed-text parts of B13 and B15.

The sixth test works in the publisher checkout: it sets `responseCap` to 30 in the trusted configuration, refreshes, expects a search to succeed with results omitted by truncation and an estimate stated, then sets the cap to 0 and expects a configuration error naming `semanticIndex.responseCap` with no further request reaching the model stand-in, covering B8, B9 and the truncation bound of B10.

The remaining behaviours are not re-implemented here because maintained tests already automate the same scenarios: B4, B7, B10, B11, B12, B14 and B16 are measured by `tests/semantic-index-pilot.test.mjs`, B13 to B15 by `tests/semantic-index-protocol.test.mjs`, and text output, cap fitting and log rotation by `tests/semantic-index-cli.test.mjs`, `tests/semantic-index-tokens.test.mjs` and `tests/semantic-index-token-log.test.mjs`.

What this file does not verify is a real embedding service, a real adopter repository, or the deployed environment: the model is a deterministic stand-in, the checkouts are scratch repositories, and the deployed layer runs only after the build pull request merges and an adopter upgrades, as the acceptance results in `feature.md` record.
