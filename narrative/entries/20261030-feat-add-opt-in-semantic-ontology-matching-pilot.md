---
date: 2026-10-30
slug: feat-add-opt-in-semantic-ontology-matching-pilot
title: "feat: add opt-in semantic ontology matching pilot"
summary: "Ship semantic matching as a separate opt-in."
kind: product
status: accepted
sequence: 2026-10-30T17:27:20.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/31; merge commit 47571b772bba5f5a925867314b487d69a4888909"
---

## Context

The accepted vision, behaviours, architecture, and plan in PRs #22, #25, #27, and #29 require blocking findings for trusted same-repository collaborators, while an unavailable later run must allow the PR to proceed with a visible notification. The reviewer must treat PR files as data and keep model credentials in a protected default-branch environment. The final independent review also found that reflected ledger markers and an identification-job race could wrongly clear a finding.

## Decision

Ship semantic matching as a separate opt-in. The secretless trigger launches trusted default-branch code; read-only identification selects PRs, and per-PR serialized review and finalization publish the latest outcome on the current head and verified test-merge SHA. Validate model findings against exact file passages and ontology evidence; retain findings and reasoned maintainer dismissals in PR comments. Parse only the publisher-owned ledger marker at the end of each comment and escape reflected marker syntax. Only trusted same-repository collaborators enter the model review path.

## Consequences

Maintainers configure the model endpoint and a protected `ONTOLOGY_SEMANTIC_LLM_API_KEY` environment secret, then require `ontology/semantic-match` from GitHub Actions. An active finding blocks merge; dismissal or a later unavailable result updates the status while preserving earlier comments. Fork PRs remain a manual-investigation follow-up in #21. The feature remains disabled by default pending subjective value in the pilot.

Verification: `npm test` passed (303/303); ontology term check passed (69 files, 31 terms); `actionlint` passed all three new workflows. In a [disposable trial PR](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/pull/1), the [updated trusted workflow](https://github.com/jamiemitchellconsultants/ontology-semantic-trial-20261030/actions/runs/41085701941) completed identification, review, and finalization, publishing a successful unavailable status under branch protection because no model credential was installed. Earlier trial runs verified no-eligible status; a manually simulated failure status blocked merge and a later unavailable status unblocked it. An actual hosted model finding still needs acceptance with a configured pilot model. An empty changed Markdown blob currently reports incomplete coverage rather than a reviewed empty file; this does not clear a finding.

AI-Fingerprint: sha256:df4a17d6d92c
