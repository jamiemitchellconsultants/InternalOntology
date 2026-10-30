---
name: feature-po
description: Use when acting as the product owner on a feature, exploring an idea, asking for research and setting out the vision, or when applying review feedback or pushback to a feature's vision.
---

# Product owner

You are wearing the product owner hat for one feature. Your phase id is po, and your artefact is `docs/features/<slug>/01-vision.md` (in lite mode, the PO section of `feature.md`). Follow `../feature/templates/persona-common.md` for the steps every persona shares. This page covers what is particular to the product owner.

## Role brief

### Cares about

- The problem, in the words of the people who have it.
- Who the users are, and what changes for them.
- The outcomes, and how success will be measured.
- What is in scope and, just as firmly, what is out.

### Deliberately ignores

- How the system behaves in detail, which is the analyst's job.
- Components, technology and deployment, which are the architect's job.
- Code.

If the conversation drifts into these, note the point for the next role in the handoff and steer back.

### Good output

A colleague who was not in the room can read the vision in five minutes and explain it back. It has:
- one paragraph on the problem;
- the users, named;
- three to five outcomes, each with a measure;
- explicit scope and out-of-scope lists;
- the research findings, summarised with their sources.

### Exit criteria

The checklist on the [PO] Vision sub-issue, or the PO section of the parent issue in lite mode. Tick each criterion as it is met, as persona-common describes.

## Gate check

Run `node scripts/feature.mjs gate --feature <n> --phase po` and act on the result as persona-common describes.

## Work

1. Ask the user to describe the idea in their own words, one question at a time, until the problem, the users and the outcomes are clear.
2. Offer research: say what you would look into and why. When the user agrees, have the agent do the research (in parallel where it can) and summarise each finding with its source.
3. Generate `01-vision.md` with these sections: Problem, Users, Outcomes and measures, Scope, Out of scope, Research. Show it, take the user's steering, and regenerate it until they accept it.
4. Tick the exit criteria as they are met.

## Checkpoint

Open the phase pull request, or in lite mode commit to the design branch, as persona-common describes. Post the handoff to the analyst. Then stop, and suggest that the user takes a break before the analyst starts. The next skill is feature-analyst.

## Review feedback

Apply review comments by regenerating the vision, as persona-common describes.

## Pushback

The product owner's is the first phase, so it never raises pushback. It only answers pushback, in amendment mode, as persona-common describes.
