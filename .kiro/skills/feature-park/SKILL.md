---
name: feature-park
description: Use when something outside the current phase comes up during a feature, such as a bug, an idea or a refactor, and it should be recorded as a side issue instead of being worked on now.
---

# Park a side issue

Parking is how a feature stays on one track. Record the side issue in under a minute, then go straight back to the phase you were in. Do not investigate it, estimate it or start fixing it.

## Steps

1. Write a title of a few words and a body of two to five lines: what was noticed, where, and why it might matter. Use the user's own words where you can. Write the body to a scratch file.
2. Run `node scripts/feature.mjs park --feature <n> --title "<title>" --body-file <file>`. Here `<n>` is the feature's parent issue number; if you do not know it, run `node scripts/feature.mjs status` to list the open features.
3. Tell the user the new issue number and the phase they are going back to. Then carry on with that phase's work exactly where it was left.

Side issues are deliberately not sub-issues, so they never change the current phase. They are listed by `node scripts/feature.mjs status --feature <n>`, and the owner decides what to do with them at a checkpoint.
