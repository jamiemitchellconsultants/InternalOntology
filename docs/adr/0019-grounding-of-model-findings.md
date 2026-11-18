# 0019 — Tolerant reply parsing and key-resolving grounding of model findings

- **Status:** accepted (for review on the correction pull request)
- **Date:** 2026-11-18
- **Feature:** none: a defect correction found in the live semantic trial (JEPA-Speech#208)

## Context

The live gateway answered the trial request correctly (HTTP 200, `finish_reason` stop), but the reply was
JSON inside a markdown code fence, and its evidence keys said `Enum:` where the configured section is
Enums. The reviewer parsed the fenced text with `JSON.parse`, which throws, and reported "model
assessment was unusable"; the run was `unavailable`, a success that permits merge, so the blocking
reviewer never reviewed anything. Replaying the unfenced reply with the `Enum:` key on the old code
fails the same way: a finding was grounded only if its key exactly equalled a catalog key, so a correct
finding with a slightly wrong section prefix was thrown away together with the whole chunk.

## Decision

1. **Parsing.** Strip one surrounding code fence (any language tag or none, with surrounding whitespace)
   and parse the rest as JSON. Nothing else is tolerated: prose around the fence, several fences or
   non-JSON content are still rejected, as is anything that does not have a `findings` array.
2. **Grounding.** The finding's quote must still be an exact substring of the chunk. The evidence key is
   resolved to the catalog key with the same item name: an exact key is used as is; otherwise the name
   (the part after the first colon, or the whole text when there is no colon) must match exactly one
   catalog entry, whatever its prefix, or, when the name occurs in several sections, the prefix must
   match exactly one of those sections after lower-casing and dropping punctuation and a trailing `s`.
   The finding then carries the canonical key, so its stable id and the displayed evidence do not depend
   on the model's spelling. An absent name is an unknown key; an unresolvable name is an ambiguous key.
3. **Prompt.** The projection ends with an "Evidence keys" list of every valid key, and the prompt says to
   copy a key exactly from it. The list is part of the projection, so the request budget counts it.
4. **Reasons.** Failures carry fixed reasons, never model content: "model reply was empty", "model
   reply was not valid JSON", "model reply had no findings list", "model finding was incomplete",
   "finding quote not found in the file", "finding cites an unknown evidence key", "finding cites an
   ambiguous evidence key". Timeouts, HTTP errors, credential failures and the too-large reasons are as
   before. The reasons appear in the pull request comment's "Not reviewed" lines; the status text is
   unchanged.
5. **JSON mode.** `response_format` is not requested. It was not verified that the gateway path to the
   `ontology-review` model accepts it without affecting other models, so it is deliberately left out.

## Consequences

A correct finding with a mis-spelled section prefix is accepted and grounded to the real catalog entry;
an invented name is still rejected. What counts as grounded is therefore "an exact quote plus a real item
name", slightly looser than "an exact key". The prompt grows by one line per catalog entry. A chunk with
one unusable finding is still unreviewed as a whole, as before, with a reason that says why.

## Alternatives considered

- Fix only the fence: leaves the singular-key failure, which the live model will repeat.
- Fix only the prompt: relies on the model obeying it every time.
- Reject unless the prefix is right: the status quo, which discarded a correct finding.
- Request JSON mode: unverified for this gateway, see above.
- Fuzzy name matching: rejected; it would ground findings on names that do not exist.
