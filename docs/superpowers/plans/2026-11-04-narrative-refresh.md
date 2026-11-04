# Narrative Refresh Implementation Plan

**Goal:** Keep open narrative proposals current as new entries are accepted.

**Architecture:** Install Project Narrative's documented refresh workflow, using the existing maintenance workflow name and the public action. The action handles merges, recompilation and validation.

**Tech Stack:** GitHub Actions, Project Narrative.

**Spec:** The approved design in this conversation: refresh after narrative pushes and successful maintenance, permit manual recovery, and leave other conflicts for a human.

## Global Constraints

- Run from the trusted default branch with the minimum documented permissions.
- Preserve draft proposal review and never force-push.

## Review Focus

- Non-default branch pushes must not refresh proposals.
- Failed maintenance runs must not refresh proposals.
- A maintenance completion must cover proposals created after the preceding push.
- The refresh job must not execute pull-request code.
- Non-generated conflicts must remain for human resolution.

## Task 1: Install the documented workflow

**Files:** Create `.github/workflows/refresh-narrative.yml`.

- [x] Copy the documented Project Narrative workflow, referencing `jamiemitchellconsultants/Narrative@main`.
- [x] Check the triggers, condition, permissions, checkout ref, and action inputs against the upstream workflow.
- [x] Run the narrative and ontology checks and the repository test suite; review the proposed diff.
- [ ] Commit the change and prepare a decision-bearing pull request with the required narrative label and sections.
