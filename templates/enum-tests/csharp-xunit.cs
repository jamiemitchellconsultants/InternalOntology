// ADAPT THIS. Installed by the ontology kit as a worked example, not as working code.
//
// Locks every enum to the member list {{ONTOLOGY_PATH}} declares, in order. Changing an enum
// without changing the ontology fails here, which is the point: the Markdown linter reads only
// Markdown, so this is the only check that sees drift in code.
//
// To adapt: replace the example enums below with this project's real ones, one fact per test, and
// keep the member lists in the same order the ontology's Enums table gives them.

namespace YourProject.Domain.Tests;

public class OntologyEnumTests
{
    [Fact]
    public void ExampleStatusMatchesTheOntology()
    {
        Assert.Equal(new[] { "Pending", "Active", "Closed" }, Enum.GetNames<ExampleStatus>());
    }

    [Fact]
    public void NoEnumMemberUsesTheDefaultZeroValue()
    {
        // A zero member is indistinguishable from an unset integer column, so a row that was never
        // written reads as a real state. Add every ontology enum to this list.
        Assert.DoesNotContain(0, Enum.GetValues<ExampleStatus>().Cast<int>());
    }
}
