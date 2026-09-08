// ADAPT THIS. Installed by the ontology kit as a worked example, not as working code.
//
// Locks every union or enum to the member list {{ONTOLOGY_PATH}} declares, in order. Changing one
// without changing the ontology fails here — the Markdown linter reads only Markdown, so this is
// the only check that sees drift in code.
//
// To adapt: replace the example below with this project's real enums, one fact per test, keeping
// the ontology's ordering.

import { describe, expect, it } from "vitest";

import { EXAMPLE_STATUSES } from "../src/domain/example-status.js";

describe("ontology enums", () => {
  it("ExampleStatus matches the ontology", () => {
    expect([...EXAMPLE_STATUSES]).toEqual(["Pending", "Active", "Closed"]);
  });
});
