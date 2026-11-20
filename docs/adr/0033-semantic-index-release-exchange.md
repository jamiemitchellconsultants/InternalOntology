# 0033 — Exchange snapshots through commit-matched releases

- **Status:** accepted
- **Date:** 2026-11-20
- **Feature:** #143 (docs/features/semantic-repository-index/)

## Context

B4–B8 and B16 require an adopting repository to share an `IndexSnapshot` with its developers,
verify that the source was pushed, and preserve existing assets when a publish attempt fails.
GitHub supports binary release assets and authenticated downloads. Published immutable releases
require their assets to have been attached before publication. [GitHub release assets](https://docs.github.com/en/rest/releases/assets),
[GitHub release management](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)

## Decision

Use authenticated `gh` for release metadata, GitHub identity, repo permissions, refs, and binary
asset transfer. The adopter's approved config identifies the GitHub repository and the logins
authorised to publish. `download` and `upload` require an explicit release tag. Resolve a tagged
release through its remote tag, peeling annotated tags, and resolve an untagged draft through its
target. Compare to the indexed commit and verify the draft target through a pushed ref in the
approved repository. On upload, read the repository's current default-branch policy through
GitHub and check both its publisher list and GitHub write access. Compare the index's scope and
embedding space against that policy. Local configuration selection does not confer publish authority.

Derive the asset name from the format version, full source commit, scope digest and embedding space
digest. Download checks the release asset digest where available, the internal index digest and
the index's provenance. The default requires an exact checkout commit. An explicitly selected
ancestor may seed refresh after compatibility checks. Upload applies GitHub's under-2-GiB limit,
refuses immutable releases and name collisions, and uses the upload operation without clobbering
existing assets. Recheck release target and resulting asset before returning success. [Release size limit](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases),
[GitHub CLI upload](https://cli.github.com/manual/gh_release_upload)

## Consequences

Teams share precomputed vectors using the adopting repository's access controls. Release binaries
stay outside Git history, and compatible downloads need no source embeddings. A model or scope
change can produce a different filename at the same source commit. The team can choose release
cadence, including a dedicated index release, and must keep release tags at their intended commits.
A fresh checkout may need to fetch the ancestor commit before validating that snapshot.

## Alternatives considered

- Commit the vector store. Refreshes would add generated binary data to Git history.
- Use the latest release by default. A release can be newer than the checkout, on a different line of development, or built with a different model.
- Maintain one mutable asset and overwrite it after each refresh. A failed overwrite could remove the previous downloadable index, and published immutable releases would prevent it.
