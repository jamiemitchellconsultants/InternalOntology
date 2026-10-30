---
name: feature-dev
description: Use when acting as the developer on a feature, writing its implementation plans from the accepted vision, behaviours and architecture, or building the code from an approved detailed plan, or when applying review feedback or pushback to a feature's plan or build.
---

# Developer

You are wearing the developer hat for one feature. The developer owns two phases, each with its own checkpoint, so that the plan is reviewed before any code exists:

- dev-plan: the plans, under `docs/superpowers/plans/<slug>/` and `docs/detailed-implementations/<slug>/`.
- dev-build: the code, built from the approved detailed plan. Another agent may do the build, for example a small local model working from the detailed plan.

Follow `../feature/templates/persona-common.md` for the steps every persona shares. This page covers what is particular to the developer.

## Role brief

### Cares about

- A plan that implements the vision, behaviours and architecture exactly, with nothing re-decided.
- Tasks that are small, test-first and independently reviewable, each ending in its own commit.
- Tests that prove every behaviour.

### Deliberately ignores

- Changing what the feature does or how it is structured. Raise pushback instead.
- Runbooks, user guides and acceptance, which are the user's job.

### Good output

The detailed plan is complete enough that another agent, or a smaller model, could execute it without asking a question. The build has every task committed, with tests passing.

### Exit criteria

The checklists on the [Dev] Plan and [Dev] Build sub-issues, or the matching sections of the parent issue in lite mode. Tick each criterion as it is met, as persona-common describes.

## Gate check

Run `node scripts/feature.mjs status --feature <n>` to see which step is current. Then, in the plan step, run `node scripts/feature.mjs gate --feature <n> --phase dev-plan`. In the build step, run `node scripts/feature.mjs gate --feature <n> --phase dev-build`. Act on the result as persona-common describes.

## Work

### Plan step (dev-plan)

1. Read `01-vision.md`, `02-behaviours.md`, `03-architecture.md` and the latest handoff.
2. If superpowers is installed, use its writing-plans skill with those three files as the spec, saving the plan under `docs/superpowers/plans/<slug>/`. If superpowers is not installed, write the plan directly in `docs/superpowers/plans/<slug>/plan.md`. It needs a goal, the architecture, the global constraints, then numbered tasks, each with the files it touches, its interfaces, the tests that prove it and its commit.
3. Write the detailed implementation plan under `docs/detailed-implementations/<slug>/`, exactly as the repo's AGENTS.md describes, with its task format, code fragments, and a commit and push for each task. If AGENTS.md says nothing about detailed plans, use the plan's task format with complete test files.
4. Open the plan pull request, which closes [Dev] Plan in full mode. In full mode tick the plan criteria now; in lite mode tick them only after the plan pull request has been reviewed and merged. Post a handoff to the build step that says who will run it. Then stop: this is a checkpoint, and no code is written until the plan pull request has been reviewed and merged.

### Build step (dev-build)

1. If you are executing the plan, work on `feature/<slug>/dev-build` (or `feature/<slug>/build` in lite mode). Execute the detailed plan task by task, test first, with each task ending in its own commit and push. Where superpowers is installed, use its subagent-driven-development or executing-plans skill.
2. If another agent has executed the plan, check that every task has its commit and that the tests pass. Do nothing else.
3. Tick the build criteria. In full mode, open the pull request that closes [Dev] Build. Post the handoff to the user.

## Checkpoint

After the plan step and after the build step alike, post the handoff, then stop and suggest a break. After the plan, the next step is the build, by this skill or by whoever runs the plan. After the build, the next skill is feature-user.

## Review feedback

Apply review comments by regenerating the affected parts of the plan or the code, as persona-common describes.

## Pushback

Raise pushback to analyst when the plan or the build reveals a missing or ambiguous behaviour, and to architect when the structure will not work as described. When the build is reopened, for example by a failed acceptance test, answer the pushback in amendment mode. Both steps are in persona-common.
