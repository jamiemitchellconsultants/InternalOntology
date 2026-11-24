---
date: 2026-11-24
slug: feat-semantic-index-token-efficiency-estimate-cap-log-show-and-usage-178
title: "feat: semantic index token efficiency — estimate, cap, log, show and usage (#178)"
summary: "Ship the build with the user phase completed locally in the same pull request, as lite mode prescribes."
kind: product
status: accepted
sequence: 2026-11-24T15:12:07.000Z
evidence: "https://github.com/jamiemitchellconsultants/InternalOntology/pull/202; merge commit 6b43b03230064848036587a4e3103bf76fb6ecf4"
---

## Context

The design (PR #181, ADRs 0037 to 0040) and plan (PR #183) for #178 set out to make the cost of an index search visible, then reduce it: per-search token telemetry as the baseline, less text per query, an owner-set response cap, fewer tokens before the first edit, a shorter agent protocol, and graph-first guidance. The build implemented all ten tasks test-first. The remaining question for this pull request is whether the behaviours hold from outside, in an installed adopter, and what operators and owners need to run it.

## Decision

Ship the build with the user phase completed locally in the same pull request, as lite mode prescribes. Responses stay append-only: existing fields and lines are unchanged and only trailing `truncated`, `tokens` and `tokenLog` items are added. Acceptance is two-layered per behaviour — a scripted walkthrough plus an executable test — with the installed CLI exercised end to end in scratch adopters and the measurement behaviours (B4, B7, B10 to B12, B14, B16) automated by the pilot harness tests. The deployed layer is deliberately deferred until after merge, and the host-dependent CRLF test failure is recorded as a finding instead of being fixed in the user phase.

## Consequences

Adopters get `show`, `usage`, `--compact`, a documented 4000-token default cap and a counts-only local token log on upgrade; the shortened graph-first protocol reaches them through the existing install splice. Callers parsing default search output see only trailing additions. Two things remain open: deployed acceptance in a real upgraded adopter, and making the CRLF source test independent of the host's Git line-ending defaults, which belongs to the build.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
