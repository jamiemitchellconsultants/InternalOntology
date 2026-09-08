# ADAPT THIS. Installed by the ontology kit as a worked example, not as working code.
#
# Locks every enum to the member list {{ONTOLOGY_PATH}} declares, in order. Changing an enum
# without changing the ontology fails here — the Markdown linter reads only Markdown, so this is
# the only check that sees drift in code.
#
# To adapt: replace the example below with this project's real enums, one fact per test, keeping
# the ontology's ordering.

from yourproject.domain import ExampleStatus


def test_example_status_matches_the_ontology() -> None:
    assert [member.name for member in ExampleStatus] == ["Pending", "Active", "Closed"]
