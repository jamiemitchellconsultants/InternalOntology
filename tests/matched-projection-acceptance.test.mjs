// Acceptance tests for feature #135 (docs/features/matched-ontology-projection/): the INSTALLED
// semantic reviewer sends matched projections to a local stand-in for the model endpoint.
// Nothing here calls a real model, GitHub or the gateway. Set ONTOLOGY_ACCEPTANCE_SCRIPT_ROOT to run the
// reviewer cases against a deployed repository's scripts/ directory.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { install } from "../bin/install-ontology.mjs";
import { withTempRepo } from "./helpers/temp-repo.mjs";
import { contextEntities, everyContextText, LARGE_SECTIONS, largeOntology, oneContextText } from "./helpers/large-ontology.mjs";

const KIT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const head = "a".repeat(40);
const pull = { number: 7, head: { sha: head }, merge_commit_sha: "b".repeat(40), changed_files: 1 };
const sections = { required: ["Entities", "Enums", "Relationships"], optional: [] };
const ontology = [
  "## Entities", "",
  "| Name | Description |", "| --- | --- |",
  "| `AuditEvent` | One metadata record. |",
  "| `SessionRemoval` | Removes a `StudySession`. |",
  "| `StudySession` | One stored session. |",
  "| `Microphone` | Unrelated. |",
  "",
  "## Enums", "",
  "| Name | Values | Description |", "| --- | --- | --- |",
  "| `SessionRemovalState` | `Requested`, `Removing`, `Removed`, `Failed` | Where a `SessionRemoval` stands. |",
  "",
  "## Relationships", "",
  "| From | Relationship | To | Cardinality |", "| --- | --- | --- | --- |",
  "| `SessionRemoval` | removes | `StudySession` | 1 → 1 |",
  "",
].join("\n");
const passage = "the removal moves through the states pending, running, done and failed";

// findings: an array, or a function of the request body. reject: a function of the request body that
// returns true to answer 413 instead.
async function modelStandIn(findings = [], reject = () => false) {
  const state = { bodies: [], rejected: [] };
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      if (reject(body)) {
        state.rejected.push(body);
        res.statusCode = 413;
        res.end();
        return;
      }
      state.bodies.push(body);
      res.setHeader("Content-Type", "application/json");
      const found = typeof findings === "function" ? findings(body) : findings;
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ findings: found }) } }] }));
    });
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return { state, url: `http://127.0.0.1:${server.address().port}/v1`, close: () => server.close() };
}

function fakeClient(ontologyText, text, turtle) {
  const comments = [];
  const statuses = [];
  const reads = [];
  return { comments, statuses, reads,
    get: async (path) => {
      if (path === "/pulls/7") return pull;
      if (path === "/collaborators/maintainer/permission") return { role_name: "maintain" };
      assert.equal(path, "/git/blobs/fixture");
      return { encoding: "base64", content: Buffer.from(text).toString("base64") };
    },
    getContentText: async (path, ref) => {
      reads.push([path, ref]);
      assert.equal(ref, head);
      if (path === "docs/ontology.md") return ontologyText;
      assert.equal(path, "docs/ontology.ttl");
      if (turtle !== undefined) return turtle;
      throw Object.assign(new Error("source absent"), { status: 404 });
    },
    getAll: async (path) => {
      if (path === "/pulls/7/files?per_page=100") return [{ filename: "docs/a.md", status: "modified", sha: "fixture" }];
      assert.equal(path, "/issues/7/comments?per_page=100");
      return comments;
    },
    post: async (path, body) => {
      if (path === "/issues/7/comments") {
        const comment = { id: comments.length + 1, body: body.body, user: { login: "github-actions[bot]" },
          html_url: `https://github.example/c/${comments.length + 1}` };
        comments.push(comment);
        return comment;
      }
      statuses.push(body);
      return {};
    } };
}

// ONTOLOGY_ACCEPTANCE_SCRIPT_ROOT runs the reviewer cases against another repository's installed scripts,
// such as a deployed consumer's, instead of the scratch installation.
const SCRIPT_ROOT = process.env.ONTOLOGY_ACCEPTANCE_SCRIPT_ROOT;
const installed = async (repo, name) => import(pathToFileURL(join(SCRIPT_ROOT ? resolve(SCRIPT_ROOT) : join(repo.dir, "scripts"), name)).href);

async function load(repo) {
  const { createModelAuth } = await installed(repo, "llm-auth.mjs");
  return { model: await installed(repo, "semantic-review-model.mjs"), worker: await installed(repo, "semantic-review-worker.mjs"),
    config: await installed(repo, "ontology-config.mjs"), auth: createModelAuth({ env: { K: "k" }, staticKeyVar: "K" }) };
}

async function workerRun(modules, url, semanticReview, text = passage, env = {},
  { ontologyText = ontology, ontologySections = sections, bannedAliases = [], turtle, client = fakeClient(ontologyText, text, turtle) } = {}) {
  const config = { ontologyPath: "docs/ontology.md", ignorePaths: [], sections: ontologySections, bannedAliases,
    semanticReview: { enabled: true, model: "m", baseUrl: url, ...semanticReview } };
  const run = await modules.worker.runSemanticReview({ client, pull, config, auth: modules.auth, env,
    deps: { isEligiblePull: async () => true, triggerRunId: "81:1" } });
  return { run, client };
}

const system = (body) => JSON.parse(body).messages[0].content;
const user = (body) => JSON.parse(body).messages[1].content;
const fileText = (body) => user(body).slice(user(body).indexOf("\nText:\n") + "\nText:\n".length);
const sentRows = (body) => system(body).split("\n").filter((line) => line.startsWith("| `") || line.startsWith("- **"));

// Modelled on the JEPA-Speech ontology the ten recorded findings cite (B11), with an unrelated entry,
// an entry whose name words are all stopped, and three Relationships rows sharing one From.
const jepaOntology = [
  "# Ontology", "",
  "## Entities", "",
  "| Name | Fields | Description |", "| --- | --- | --- |",
  "| `AuditEvent` | `eventId`, `occurredAt` | One metadata record sent through the `AuditHook`. |",
  "| `StudySession` | `sessionId` | One stored recording session. |",
  "| `SessionRemoval` | `removalId`, `state` | Removes a `StudySession`; moves through `SessionRemovalState`. |",
  "| `Analysis` | `analysisId` | One scoring pass. |",
  "| `Speaker` | `speakerCode` | A person who records. |",
  "| `DataType` | `code` | A name whose words are all stopped. |",
  "| `Microphone` | `model` | Unrelated to removal or audit. A `Speaker` uses it. |",
  "",
  "## Enums", "",
  "| Name | Values | Description |", "| --- | --- | --- |",
  "| `RemovalReason` | `TesterWithdrew`, `TestRecording`, `BadRecording`, `Other` | Why a session was removed. |",
  "| `SessionRemovalState` | `Requested`, `Removing`, `Removed`, `Failed` | Where a `SessionRemoval` stands. |",
  "",
  "## Relationships", "",
  "| From | Relationship | To | Cardinality |", "| --- | --- | --- | --- |",
  "| `Analysis` | scores | `StudySession` | many → 1 |",
  "| `SessionRemoval` | removes | `StudySession` | 1 → 1 |",
  "| `Analysis` | credits | `Speaker` | many → many |",
  "| `Analysis` | writes | `AuditEvent` | 1 → many |",
  "",
].join("\n");
const jepa = { ontologyText: jepaOntology, ontologySections: sections };
const rowOf = (name) => jepaOntology.split("\n").find((line) => line.startsWith(`| \`${name}\` |`));

test("B1 B10 B15 B20 an unchanged config sends a matched projection and records it", async () => {
  const stand = await modelStandIn();
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
      const modules = await load(repo);
      const parsed = modules.config.validateConfig({ ontologyPath: "docs/ontology.md",
        semanticReview: { enabled: true, model: "m", baseUrl: stand.url } }, { ontologyExists: () => true });
      assert.equal(parsed.semanticReview.projection, "matched");
      const { run, client } = await workerRun(modules, stand.url, { projection: parsed.semanticReview.projection });
      const prompt = system(stand.state.bodies[0]);
      assert.match(prompt, /\| `SessionRemovalState` \|/);
      assert.match(prompt, /\| `SessionRemoval` \| Removes/);
      assert.doesNotMatch(prompt, /\| `Microphone` \|/);
      assert.match(prompt, /\nEntities: AuditEvent, SessionRemoval, StudySession, Microphone\n/);
      assert.equal(run.outcome, "reviewed");
      const catalog = modules.model.catalogOntology(ontology, sections);
      assert.deepEqual(run.projections.map(({ path, mode, entriesTotal, fullChars }) => ({ path, mode, entriesTotal, fullChars })),
        [{ path: "docs/a.md", mode: "matched", entriesTotal: catalog.evidenceKeys.size, fullChars: catalog.projection.length }]);
      assert.ok(run.projections[0].largestChars < catalog.projection.length);
      assert.match(client.comments.at(-1).body, /- Ontology projection for `docs\/a\.md`: matched, \d+ of 6 entries with full rows/);
      assert.equal(client.statuses.at(-1).description, "Semantic match reviewed 1 file(s); no active findings");
    });
  } finally { stand.close(); }
});

test("B21 projection full sends today's request byte for byte", async () => {
  const stand = await modelStandIn();
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
      const modules = await load(repo);
      const { run } = await workerRun(modules, stand.url, { projection: "full" });
      await modules.model.reviewFiles({ files: [{ path: "docs/a.md", text: passage }], ontologyText: ontology, sections,
        model: "m", baseUrl: stand.url, auth: modules.auth, headSha: head });
      assert.equal(stand.state.bodies.length, 2);
      assert.equal(stand.state.bodies[0], stand.state.bodies[1]);
      assert.equal(run.projections[0].mode, "full");
      assert.equal(run.projections[0].largestChars, run.projections[0].fullChars);
    });
  } finally { stand.close(); }
});

test("B9 B12 B14 a name-only citation is accepted with the same identity in both modes, and runs repeat exactly", async () => {
  const stand = await modelStandIn([{ quote: "pending, running, done and failed", evidenceKey: "Entities:Microphone", reason: "r", suggestion: "s" }]);
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
      const modules = await load(repo);
      const matched = await workerRun(modules, stand.url, {});
      const again = await workerRun(modules, stand.url, {});
      assert.doesNotMatch(system(stand.state.bodies[0]), /\| `Microphone` \|/);
      assert.equal(stand.state.bodies[0], stand.state.bodies[1]);
      assert.equal(matched.run.findings.length, 1);
      assert.equal(again.run.findings[0].id, matched.run.findings[0].id);
      assert.equal(matched.client.statuses.at(-1).state, "failure");
      const finding = matched.run.findings[0];
      const comment = { user: { login: "maintainer" }, body: `/ontology-dismiss ${finding.id} ${head} Acceptance fixture.` };
      matched.client.comments.push(comment);
      const { handleDismissal } = await installed(repo, "semantic-review-dismissal.mjs");
      assert.deepEqual(await handleDismissal({ client: matched.client, event: {
        action: "created", issue: { number: pull.number, pull_request: {} }, comment,
      } }), { handled: true, reason: "status reconciled" });
      assert.equal(matched.client.statuses.at(-1).state, "success");
      const full = await workerRun(modules, stand.url, { projection: "full" }, passage, {}, { client: matched.client });
      assert.equal(full.run.findings[0].id, finding.id);
      assert.equal(full.client.statuses.at(-1).state, "success");
    });
  } finally { stand.close(); }
});

test("B16 a key outside the name index is still rejected", async () => {
  const stand = await modelStandIn([{ quote: "pending", evidenceKey: "Entities:Nowhere", reason: "r", suggestion: "s" }]);
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
      const { run } = await workerRun(await load(repo), stand.url, {});
      assert.deepEqual(run.unreviewed, [{ path: "docs/a.md", reason: "finding cites an unknown evidence key" }]);
    });
  } finally { stand.close(); }
});

test("B13 B18 a budget below the name index is too-large; a matchless file is reviewed with the name index", async () => {
  const stand = await modelStandIn();
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
      const modules = await load(repo);
      const nothing = await workerRun(modules, stand.url, {}, "Plain words only.");
      assert.equal(nothing.run.outcome, "reviewed");
      assert.equal(nothing.run.projections[0].entriesSent, 0);
      assert.doesNotMatch(system(stand.state.bodies[0]), /\| `/);
      const tooLarge = await workerRun(modules, stand.url, {}, "Plain words only.", { ONTOLOGY_MAX_REQUEST_CHARS: "1100" });
      assert.equal(tooLarge.run.outcome, "too-large");
      assert.match(tooLarge.run.unreviewed[0].reason, /ontology name index too large.*ONTOLOGY_MAX_REQUEST_CHARS/);
      assert.equal(stand.state.bodies.length, 1);
    });
  } finally { stand.close(); }
});

test("B20 the projection module is installed with the semantic reviewer only", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets" });
    const configPath = join(repo.dir, "ontology.config.json");
    const config = readFileSync(configPath, "utf8");
    assert.equal(existsSync(join(repo.dir, "scripts", "ontology-projection.mjs")), false);
    install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true, force: true });
    assert.equal(readFileSync(configPath, "utf8"), config);
    for (const name of ["ontology-projection.mjs", "ontology-projection.test.mjs"]) {
      assert.equal(readFileSync(join(repo.dir, "scripts", name), "utf8"), readFileSync(join(KIT, "templates/scripts", name), "utf8"));
    }
  });
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withSourceGraph: true, withGraphNamingReview: true });
    assert.equal(existsSync(join(repo.dir, "scripts/ontology-projection.mjs")), false);
    await import(pathToFileURL(join(repo.dir, "scripts", "semantic-review-model.mjs")).href);
    await import(pathToFileURL(join(repo.dir, "scripts", "graph-naming-worker.mjs")).href);
  });
});

test("B23 the installed runbook describes the modes, the record line and the caveats", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
    const consumer = SCRIPT_ROOT ? resolve(SCRIPT_ROOT, "..") : repo.dir;
    const doc = readFileSync(join(consumer, "docs/ontology-semantic-review.md"), "utf8");
    for (const expected of ['"matched"', '"full"', "Ontology projection for", "paraphrase", "update the kit first",
      "ontology.ttl", "ontology.md", "other end", "Each key is a section name", "paragraph",
      "ontology name index too large for the configured budget", "selects too much of the ontology for the configured budget",
      "data, info, item, kind, list, name, type, value, values, state, status, record, result, config, event, events"]) {
      assert.ok(doc.includes(expected), `runbook lacks ${expected}`);
    }
  });
});

test("B2 B3 B4 B5 B6 B7 B8 the installed reviewer sends the rows the matching rules select", async () => {
  const stand = await modelStandIn();
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
      const modules = await load(repo);
      const aliases = [{ phrase: "deletion request", nameInstead: ["SessionRemoval"] }];
      const rows = async (text) => {
        await workerRun(modules, stand.url, {}, text, {}, { ...jepa, bannedAliases: aliases });
        return sentRows(stand.state.bodies.at(-1));
      };
      assert.deepEqual(await rows("A DataType row."), [rowOf("DataType")], "B2 exact name");
      assert.deepEqual(await rows("A datatype row, a data type, DataTypes."), [], "B2 case and whole word");
      assert.ok((await rows("two microphones")).includes(rowOf("Microphone")), "B3 name word with s");
      assert.ok((await rows("the speakers")).includes(rowOf("Speaker")), "B3 name word with s");
      assert.ok((await rows("the states requested, removing, removed and failed")).includes(rowOf("SessionRemovalState")), "B4");
      assert.deepEqual(await rows("the data type, its status and state, one event"), [], "B5");
      assert.ok((await rows("A Deletion\n\n  Request was filed.")).includes(rowOf("SessionRemoval")), "B6 alias in any case");
      assert.ok(!(await rows("a deletion requester")).includes(rowOf("SessionRemoval")), "B6 whole words only");
      assert.deepEqual(await rows("A microphone."), [rowOf("Microphone")], "B7 description references add no rows");
      const matched = await rows("An AuditEvent was written.");
      const analysisRows = jepaOntology.split("\n").filter((line) => line.startsWith("| `Analysis` | ") && !line.includes("analysisId"));
      assert.equal(analysisRows.length, 3);
      assert.deepEqual(matched, [rowOf("AuditEvent"), ...analysisRows], "B7 B8 the relationship key contributes its three rows");
      assert.deepEqual(await rows("An analysis."), [rowOf("Analysis"), ...analysisRows], "B7 domain match");
    });
  } finally { stand.close(); }
});

// B11: the quoted passages of the ten recorded JEPA-Speech findings (#210, #217) and the entries they cite.
const recorded = [
  ["RemovalStatus", "Enums:SessionRemovalState"],
  ["- AuditRecord (concept) — [View claims](#node-3cfce651e985363113811847e08b3b98)", "Entities:AuditEvent"],
  ["**AuditRecord** is documented by **docs/ontology.md**. **Direct**.", "Entities:AuditEvent"],
  ["**src/JepaSpeech.Console.Domain/AuditEvents.cs** implements **AuditRecord**. **Direct**.", "Entities:AuditEvent"],
  ["- RemovalStatus (concept)", "Enums:SessionRemovalState"],
  ["**src/JepaSpeech.Console.Domain/SessionRemoval.cs** implements **RemovalStatus**. **Direct**.", "Enums:SessionRemovalState"],
  ["the removal moves through the states pending, running, done and failed", "Enums:SessionRemovalState"],
  ["the removal moves through the states requested, removing, removed and failed", "Enums:SessionRemovalState"],
  ["the deletion moves through the states pending, running, done and failed", "Enums:SessionRemovalState"],
  ["the reason for it is one of: tester left, test run, bad take or miscellaneous", "Enums:RemovalReason"],
];

test("B11 each recorded finding is sent its cited entry's rows and is still found", async () => {
  const cites = new Map(recorded);
  const stand = await modelStandIn((body) => [{ quote: fileText(body), evidenceKey: cites.get(fileText(body)), reason: "r", suggestion: "s" }]);
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
      const modules = await load(repo);
      for (const [quote, cited] of recorded) {
        const { run, client } = await workerRun(modules, stand.url, {}, quote, {}, jepa);
        assert.ok(sentRows(stand.state.bodies.at(-1)).includes(rowOf(cited.split(":")[1])), `${quote} was not sent ${cited}`);
        assert.deepEqual(run.findings.map((finding) => finding.evidenceKey), [cited], quote);
        assert.equal(client.statuses.at(-1).state, "failure", quote);
      }
    });
  } finally { stand.close(); }
});

const twoParagraphs = ["Each microphone is checked.", "Each speaker is checked."];
const projectionOf = (body) => system(body).slice(system(body).indexOf("# Canonical ontology evidence"));

test("B17 paragraphs whose own projections fit are reviewed even when the whole file projection cannot fit", async () => {
  const stand = await modelStandIn();
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
      const modules = await load(repo);
      const { createProjector } = await installed(repo, "ontology-projection.mjs");
      const text = twoParagraphs.join("\n\n");
      const project = createProjector();
      const catalog = modules.model.catalogOntology(jepaOntology, sections);
      const fileProjection = project(catalog, text).text.length;
      const overhead = modules.model.REQUEST_OVERHEAD + "docs/a.md".length;
      const budget = overhead + Math.max(...[`${twoParagraphs[0]}\n\n`, twoParagraphs[1]]
        .map((part) => project(catalog, part).text.length + part.length));
      assert.ok(overhead + fileProjection > budget);
      const { run } = await workerRun(modules, stand.url, {}, text, { ONTOLOGY_MAX_REQUEST_CHARS: String(budget) }, jepa);
      assert.equal(run.outcome, "reviewed");
      assert.equal(stand.state.bodies.length, 2);
      const [first, second] = stand.state.bodies;
      assert.equal(fileText(first) + fileText(second), text);
      assert.match(user(second), new RegExp(`^File: docs/a\\.md\nOffset: ${fileText(first).length}\n`));
      assert.ok(sentRows(first).includes(rowOf("Microphone")) && !sentRows(first).includes(rowOf("Speaker")));
      assert.ok(sentRows(second).includes(rowOf("Speaker")) && !sentRows(second).includes(rowOf("Microphone")));
      for (const body of stand.state.bodies) {
        assert.ok(projectionOf(body).length <= fileProjection);
        assert.ok(modules.model.REQUEST_OVERHEAD + projectionOf(body).length + "docs/a.md".length + fileText(body).length <= budget);
      }
      assert.equal(run.projections[0].largestChars, Math.max(...stand.state.bodies.map((body) => projectionOf(body).length)));
    });
  } finally { stand.close(); }
});

test("B19 after a 413 each half is sent with the projection its own text selects", async () => {
  const text = twoParagraphs.join("\n\n");
  const stand = await modelStandIn([], (body) => fileText(body) === text);
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
      const { run } = await workerRun(await load(repo), stand.url, {}, text, {}, jepa);
      assert.equal(stand.state.rejected.length, 1);
      assert.ok(sentRows(stand.state.rejected[0]).includes(rowOf("Microphone")) && sentRows(stand.state.rejected[0]).includes(rowOf("Speaker")));
      const [first, second] = stand.state.bodies;
      assert.ok(sentRows(first).includes(rowOf("Microphone")) && !sentRows(first).includes(rowOf("Speaker")));
      assert.ok(sentRows(second).includes(rowOf("Speaker")) && !sentRows(second).includes(rowOf("Microphone")));
      assert.equal(run.outcome, "reviewed");
    });
  } finally { stand.close(); }
});

test("B18 a line that cannot fit reports its offset and sends none of the file", async () => {
  const stand = await modelStandIn();
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
      const modules = await load(repo);
      const { createProjector } = await installed(repo, "ontology-projection.mjs");
      const catalog = modules.model.catalogOntology(jepaOntology, sections);
      const fixed = modules.model.REQUEST_OVERHEAD + "docs/a.md".length;
      const cases = [
        { line: "An AuditEvent was written.", unitsLeft: 0 },
        { line: "😀", unitsLeft: 1 },
      ];
      for (const { line, unitsLeft } of cases) {
        const chars = createProjector()(catalog, line).text.length;
        const budget = fixed + chars + unitsLeft;
        const { run, client } = await workerRun(modules, stand.url, {}, `x\n\n${line}`,
          { ONTOLOGY_MAX_REQUEST_CHARS: String(budget) }, jepa);
        const reason = `line at offset 3 selects too much of the ontology for the configured budget (projection ${chars} characters, budget ${budget}; raise ONTOLOGY_MAX_REQUEST_CHARS)`;
        assert.equal(run.outcome, "too-large");
        assert.deepEqual(run.unreviewed, [{ path: "docs/a.md", code: "too-large", reason }]);
        assert.ok(client.comments.at(-1).body.includes(reason));
        assert.equal(client.statuses.at(-1).state, "success");
      }
      assert.equal(stand.state.bodies.length, 0);
    });
  } finally { stand.close(); }
});

test("B24 the grouped index lists all names by section and accepts a Section:Name citation", async () => {
  const text = "Plain words only.";
  const stand = await modelStandIn([{ quote: text, evidenceKey: "Entities:Microphone", reason: "r", suggestion: "s" }]);
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
      const { run } = await workerRun(await load(repo), stand.url, {}, text, {}, jepa);
      const index = projectionOf(stand.state.bodies[0]).split("\n").slice(-3);
      assert.deepEqual(index, [
        "Entities: AuditEvent, StudySession, SessionRemoval, Analysis, Speaker, DataType, Microphone",
        "Enums: RemovalReason, SessionRemovalState",
        "Relationships: Analysis, SessionRemoval",
      ]);
      assert.deepEqual(sentRows(stand.state.bodies[0]), []);
      assert.equal(run.projections[0].entriesSent, 0);
      assert.deepEqual(run.findings.map(({ evidenceKey }) => evidenceKey), ["Entities:Microphone"]);
    });
  } finally { stand.close(); }
});

test("B25 the installed reviewer prefers the pinned ontology source and preserves full request bytes and finding identity", async () => {
  const text = "An AuditEvent was written.";
  const stand = await modelStandIn([{ quote: text, evidenceKey: "Entities:AuditEvent", reason: "r", suggestion: "s" }]);
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
      const modules = await load(repo);
      const owl = await installed(repo, "owl-ontology.mjs");
      const document = jepaOntology.replace(/^## (?!Entities$)/gm, "---\n\n## ");
      const sourceModel = owl.parseOntologyMarkdown(document);
      const turtle = owl.serializeTurtle(owl.modelToTriples(sourceModel), { namespaceUri: "https://ontology.example/acceptance#" });
      const rendered = owl.renderOntologyMarkdown(owl.triplesToModel(owl.parseTurtle(turtle)));
      const source = await workerRun(modules, stand.url, { projection: "full" }, text, {},
        { ontologyText: "# stale generated Markdown", turtle });
      const fallback = await workerRun(modules, stand.url, { projection: "full" }, text, {}, { ontologyText: rendered });
      assert.deepEqual(source.client.reads, [["docs/ontology.ttl", head]]);
      assert.deepEqual(fallback.client.reads, [["docs/ontology.ttl", head], ["docs/ontology.md", head]]);
      assert.equal(stand.state.bodies.length, 2);
      assert.equal(stand.state.bodies[0], stand.state.bodies[1]);
      assert.equal(source.run.outcome, "reviewed");
      assert.equal(source.run.findings[0].evidenceKey, "Entities:AuditEvent");
      assert.deepEqual(source.run.findings, fallback.run.findings);
      assert.deepEqual(source.run.projections, fallback.run.projections);
    });
  } finally { stand.close(); }
});

test("B22 any projection other than matched or full is invalid, and naming review has no such key", async () => {
  await withTempRepo(async (repo) => {
    install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
    const { validateConfig } = await installed(repo, "ontology-config.mjs");
    const base = { ontologyPath: "docs/ontology.md" };
    const check = (value) => validateConfig({ ...base, semanticReview: { enabled: true, model: "m", baseUrl: "http://x/v1", projection: value } },
      { ontologyExists: () => true });
    assert.equal(check("full").semanticReview.projection, "full");
    for (const value of ["embedding", "Matched", null, 1, ""]) {
      assert.throws(() => check(value), new RegExp(`semanticReview\\.projection must be "matched" or "full", got ${JSON.stringify(JSON.stringify(value)).slice(1, -1)}`));
    }
    assert.throws(() => validateConfig({ ...base, sourceGraph: { enabled: false, namingReview: { enabled: false, projection: "full" } } },
      { ontologyExists: () => true }), /unknown key "sourceGraph\.namingReview\.projection"/);
  });
});

// The scaling property the feature exists for, on an ontology about six times JEPA-Speech's.
test("scaling: a large ontology stays inside the default budget when matched and is too-large when full", async () => {
  const stand = await modelStandIn();
  try {
    await withTempRepo(async (repo) => {
      install({ target: repo.dir, projectName: "Widgets", withSemanticReview: true });
      const modules = await load(repo);
      const large = { ontologyText: largeOntology(), ontologySections: LARGE_SECTIONS };
      const catalog = modules.model.catalogOntology(large.ontologyText, LARGE_SECTIONS);
      assert.ok(catalog.evidenceKeys.size >= 1800, `${catalog.evidenceKeys.size} entries`);
      assert.ok(catalog.projection.length > 300_000, `full projection ${catalog.projection.length}`);
      const text = oneContextText();
      const [a] = contextEntities(3);

      const matched = await workerRun(modules, stand.url, {}, text, {}, large);
      assert.equal(matched.run.outcome, "reviewed");
      assert.equal(stand.state.bodies.length, 1);
      const sent = projectionOf(stand.state.bodies[0]);
      assert.ok(sent.includes(`| \`${a}\` |`));
      const entityIndex = sent.split("\n").find((line) => line.startsWith("Entities: "));
      assert.ok(entityIndex.slice("Entities: ".length).split(", ").includes(contextEntities(59)[19]));
      assert.ok(modules.model.REQUEST_OVERHEAD + sent.length + "docs/a.md".length + text.length <= modules.model.MAX_REQUEST_CHARS);
      assert.ok(matched.run.projections[0].largestChars < catalog.projection.length / 2);
      assert.match(matched.client.comments.at(-1).body, new RegExp(`matched, \\d+ of ${catalog.evidenceKeys.size} entries with full rows`));

      const full = await workerRun(modules, stand.url, { projection: "full" }, text, {}, large);
      assert.equal(full.run.outcome, "too-large");
      assert.equal(stand.state.bodies.length, 1, "full mode made no model call");

      const broad = everyContextText();
      const { createProjector } = await installed(repo, "ontology-projection.mjs");
      const max = modules.model.MAX_REQUEST_CHARS;
      const fixed = modules.model.REQUEST_OVERHEAD + "docs/a.md".length;
      assert.ok(fixed + createProjector()(catalog, broad).text.length > max);
      const { run } = await workerRun(modules, stand.url, {}, broad, {}, large);
      assert.equal(run.outcome, "reviewed");
      const bodies = stand.state.bodies.slice(1);
      assert.equal(bodies.length, 4);
      assert.equal(bodies.map(fileText).join(""), broad);
      for (const body of bodies) {
        assert.ok(fixed + projectionOf(body).length + fileText(body).length <= max);
      }
    });
  } finally { stand.close(); }
});
