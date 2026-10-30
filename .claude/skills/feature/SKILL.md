---
name: feature
description: Use when starting a new feature, asking where a feature is, resuming one after a break, recording pushback against an earlier phase, or promoting a lite feature to full mode. It is the entry point to the persona workflow of product owner, analyst, architect, developer and user.
---

# Feature

This skill runs the persona workflow for a feature from the outside. It starts features, says where they are, records pushback and promotes lite features. It never does a role's work itself. Each role has its own skill:

| Role | Skill | Phase ids | Artefact in docs/features/<slug>/ |
| --- | --- | --- | --- |
| Product owner | feature-po | po | 01-vision.md |
| Analyst | feature-analyst | analyst | 02-behaviours.md |
| Architect | feature-architect | architect | 03-architecture.md, and ADRs in docs/adr/ |
| Developer | feature-dev | dev-plan, then dev-build | plans under docs/superpowers/plans/<slug>/ and docs/detailed-implementations/<slug>/, then the code |
| User | feature-user | user | 05-runbook.md, 05-user-guide.md, 05-acceptance.md, and the acceptance tests |

All GitHub work goes through `node scripts/feature.mjs`. It exits 0 when all is well, 2 when a gate is closed, and 1 on an error. An error is never a reason to carry on as if a gate were open.

## Ground rules

- One phase at a time. A role finishes, hands off and stops before the next role starts.
- Every handoff is a checkpoint. Stop and suggest a break; never roll on into the next phase.
- Park side issues with the feature-park skill instead of working on them.
- Artefacts are generated. Review feedback and pushback are applied by re-running the role's skill, never by changing files directly.

## Starting a feature

1. Ask for the feature's name in a few words. Ask whether it is small enough for lite mode (one issue, one feature.md and three pull requests) or needs full mode (a sub-issue and pull request for every phase). Suggest lite for a change one person can review in one sitting.
2. Ask who owns it. Default to the current user, from `gh api user --jq .login`.
3. Run `node scripts/feature.mjs start --name "<name>" --owner <login>`. Add `--lite` for lite mode, and `--slug <slug>` if the user wants a particular folder name.
4. If it reports that the slug already exists, show the existing issue and ask whether to resume that feature instead.
5. Tell the user the parent issue number, the folder created, and that the next step is the feature-po skill. This is a natural place to stop.

## Where am I, and resuming after a break

1. Run `node scripts/feature.mjs status` to list the open features. Ask which one if there is more than one.
2. Run `node scripts/feature.mjs status --feature <n>`.
3. Read the latest handoff comment on the parent issue with `gh issue view <n> --comments`. Summarise it in three lines: what was decided, what was passed on, and what the next role should challenge.
4. Name the next skill. If the gate is closed, show the reasons and say what would meet each one.

## Recording pushback

Use this when someone finds that an earlier phase's artefact is wrong or incomplete.

1. Work out which earlier phase owns the problem and which phase found it.
2. Fill in `templates/pushback.md` with the problem, where it was found, what it affects and what it blocks. Write it to a scratch file.
3. Run `node scripts/feature.mjs pushback --feature <n> --from <finding phase> --to <earlier phase> --body-file <file>`.
4. This is a checkpoint. Stop, suggest a break, and say that the next step is the earlier role's skill in amendment mode.

## Promoting a lite feature to full mode

1. Run `node scripts/feature.mjs promote --feature <n>`. It creates the sub-issues, closes the ones whose sections are done, and lists the numbered files.
2. On a branch named `feature/<slug>/promote`, generate each numbered file from its section of `feature.md` and remove `feature.md`.
3. Open a pull request that explains the promotion, following the repo's AGENTS.md for the commit and the pull-request body.
4. Stop at the checkpoint and name the next skill.
