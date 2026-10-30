# Steps every persona skill shares

Each persona skill names its phase id and its artefact. This page says how the shared steps run. Here `<n>` is the feature's parent issue number, `<slug>` is its folder under `docs/features/`, and `<phase>` is the persona's phase id.

## Finding the feature

If the user has not said which feature, run `node scripts/feature.mjs status` and ask which one. Then run `node scripts/feature.mjs status --feature <n>` to see its mode (full or lite) and its current phase.

## Gate check

Run `node scripts/feature.mjs gate --feature <n> --phase <phase>` before any work.

- Exit 0: the gate is open; carry on.
- Exit 2: the gate is closed. Show the printed reasons, say which skill or action meets each one, and stop. Do none of this phase's work. The only bypass is on GitHub: the gate-override label on the pull request, with the reason in its Narrative sections.
- Exit 1: GitHub could not be read. Show the message and stop. An error never counts as an open gate.

## Exit criteria

Show the user this phase's exit criteria: the checklist on its sub-issue in full mode, or its section of the parent issue in lite mode. As each one is met, tick it:

`node scripts/feature.mjs tick --feature <n> --phase <phase> --text "<the criterion, exactly as written>"`

## Staying on track

When something outside this phase's job comes up, park it with the feature-park skill and carry straight on here. Do not chase it.

## Opening the phase pull request

**Full mode.**
1. Work on a branch named `feature/<slug>/<phase>`.
2. Commit the artefact, following the repo's AGENTS.md (its ontology checks run before every commit).
3. Push, then open the pull request with `gh pr create --body-file <file>`. The body:
   - starts with `Closes #<sub-issue>`;
   - carries the three Narrative sections, and the pull request gets the narrative-required label, whenever the phase made a decision (the vision, behaviours, architecture and plan phases always do);
   - ends with the AI-Fingerprint footer, computed as AGENTS.md describes, and recomputed after every push.

**Lite mode.** Lite pull requests close nothing: the parent issue's checklist carries the status.
- The product owner, analyst and architect write their sections of `docs/features/<slug>/feature.md` on one branch, `feature/<slug>/design`. The architect opens the design pull request.
- The developer's plan step opens the plan pull request from `feature/<slug>/plan`. The plan criteria are ticked only after that pull request has been reviewed and merged.
- The developer's build step and the user share `feature/<slug>/build`. The user opens the build pull request.

## Handoff

Fill in `../feature/templates/handoff.md` (relative to the persona skill's folder), write it to a scratch file, and post it:

`node scripts/feature.mjs handoff --feature <n> --body-file <file>`

## Checkpoint

After the handoff, stop. Tell the user plainly that this is a checkpoint: the phase is handed over, and now is a good time to take a break. Name the next role and its skill, and say when it can start: once the pull request has been reviewed and merged in full mode, or once this phase's boxes are ticked in lite mode. Never start the next phase yourself.

## Review feedback

Reviewers write their comments as steering, not as changes to files. To apply them:
1. Read the pull request's review comments: `gh pr view <pr> --comments` for the review summaries and conversation, and `gh api repos/{owner}/{repo}/pulls/<pr>/comments` for the inline comments on lines.
2. Regenerate the affected parts of the artefact from them.
3. Commit and push to the same branch, and recompute the fingerprint.
4. Reply on the pull request saying what changed.

Nobody changes an artefact directly: every change comes from re-running a skill.

## Pushback

**Raising it.** When this phase finds a problem that belongs to an earlier phase, do not decide it here.
1. Fill in `../feature/templates/pushback.md` and write it to a scratch file.
2. Run `node scripts/feature.mjs pushback --feature <n> --from <this phase> --to <earlier phase> --body-file <file>`.

That reopens the earlier phase. Recording pushback is a checkpoint, so stop and suggest a break.

**Answering it (amendment mode).** When this phase has been reopened by pushback:
1. Read the pushback comment, which is on the sub-issue in full mode or on the parent issue in lite mode.
2. Regenerate only the affected parts of the artefact.
3. In full mode, open an amendment pull request from `feature/<slug>/<phase>-amend` that closes the reopened sub-issue. In lite mode, regenerate the section and tick its boxes again.
4. In the handoff, list the later artefacts' items that trace to what changed.
5. Once the amendment has merged, run `node scripts/feature.mjs clear-pushback --feature <n> --phase <phase>`.
6. Run `node scripts/feature.mjs status --feature <n>`, and tell the user which later items need regenerating.
