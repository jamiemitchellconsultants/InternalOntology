# Enum lock tests

The Markdown linter reads Markdown. It cannot see an enum in code gaining a member, losing one, or
reordering. The enum lock test closes that gap, and it is the only installed piece that does.

## Install

```bash
node <kit>/bin/install-ontology.mjs --target <repo> --with-enum-tests csharp
```

Languages: `csharp` (xUnit), `typescript` (Vitest), `python` (pytest). The installed file carries a
`.example` suffix (e.g. `tests/OntologyEnumTests.cs.example`) precisely so it cannot be picked up by
a build or test runner before it is adapted — the file names example enums and has no working
imports, so left in place under its real extension it breaks the next build or test run. The
installer's closing output names the exact file it wrote and repeats this.

## Adapt it

1. Find every enum the ontology's Enums section declares.
2. Write one test per enum asserting the member names, **in the ontology's order**. Order matters:
   a reordering is a real change, and in a database-backed enum it can be a data corruption.
3. Keep one test per enum rather than one loop over all of them. A failure should name the enum
   that broke without the reader decoding a loop index.
4. Where the language persists enums as integers, keep the "no member uses the default zero value"
   test and extend it to every enum. A zero member is indistinguishable from an unset column, so a
   row that was never written reads as a real state.
5. Rename the file, dropping the `.example` suffix (`tests/OntologyEnumTests.cs.example` →
   `tests/OntologyEnumTests.cs`), so your build or test runner actually picks it up. Skipping this
   step is the most common way this test silently never runs.

## What to do when it fails

The test failing means code and ontology disagree. Decide which is right — usually the code, since
it is executable — and change the other in the same commit. Do not update the test alone; that is
just deleting the check.
