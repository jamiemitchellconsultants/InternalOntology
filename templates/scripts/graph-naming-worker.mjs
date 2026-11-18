// Trusted default-branch entry point for the opt-in graph naming review: GraphNamingWorker and GraphNamingSettlementHandler.
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { loadConfig } from "./ontology-config.mjs";
import { createGitHubClient, resolvePulls, isEligiblePull } from "./semantic-review-github.mjs";
import { createModelAuth, AuthConfigError } from "./llm-auth.mjs";
import { resolveRequestBudget } from "./request-budget.mjs";
import { loadGraph } from "./source-graph-model.mjs";
import { memoryTree, ontologySnapshot, selectComparedNodes, formPairs } from "./graph-naming-select.mjs";
import { reviewPairs } from "./graph-naming-model.mjs";
import { collectGraphNamingInput } from "./graph-naming-github.mjs";
import { publishPending, publishState, publishStatusOnly, loadLedger, isNewerTrigger, BOT_LOGIN } from "./graph-naming-ledger.mjs";
import { parseCommand } from "./graph-naming-commands.mjs";

const MAX_UNREVIEWED = 20;
const STATIC_KEY_VAR = "ONTOLOGY_SEMANTIC_LLM_API_KEY";
const emptyState = () => ({ outcome: "unavailable", compared: 0, reviewed: [], prefiltered: 0, unreviewed: [], results: [] });

function runRecord(pull, triggerRunId, state) {
  return { schema: 1, prNumber: pull.number, headSha: pull.head.sha, mergeSha: pull.merge_commit_sha ?? null, triggerRunId,
    outcome: state.outcome, compared: state.compared, reviewed: state.reviewed.length, prefiltered: state.prefiltered,
    unreviewedCount: state.unreviewed.length, unreviewed: state.unreviewed.slice(0, MAX_UNREVIEWED), results: state.results };
}

const emptySnapshot = (sections) => ontologySnapshot({ markdown: null, turtle: null, sections });

export async function runGraphNamingReview({ client, pull, config, auth, env = process.env, modelFetch = fetch, deps = {} }) {
  const api = { isEligiblePull, collectGraphNamingInput, reviewPairs, publishPending, publishState, publishStatusOnly, ...deps };
  const triggerRunId = deps.triggerRunId ?? process.env.ONTOLOGY_TRIGGER_RUN_ID ?? "";
  const state = emptyState();
  const skip = (node, reason) => state.unreviewed.push({ node, reason });
  if (!deps.skipPending) await api.publishPending(client, pull);
  const finish = async () => {
    const run = runRecord(pull, triggerRunId, state);
    if (run.outcome === "disabled") await api.publishStatusOnly(client, pull, run);
    else await api.publishState({ client, pull, run });
    return run;
  };
  if (pull.semanticAssociationAmbiguous) { skip("<PR association>", "workflow run matches multiple current pull requests"); return finish(); }
  let eligible;
  try { eligible = await api.isEligiblePull(client, pull); } catch { skip("<permission>", "author permission could not be checked"); return finish(); }
  if (!eligible) { state.outcome = "out-of-scope"; return finish(); }
  const naming = config?.sourceGraph?.namingReview;
  if (!naming) { skip("<review>", "trusted graph naming configuration is unavailable"); return finish(); }
  if (!config.sourceGraph.enabled || !naming.enabled) { state.outcome = "disabled"; return finish(); }
  let input;
  try { input = await api.collectGraphNamingInput(client, pull, config); } catch { skip("<pull request>", "PR graph or ontology could not be read"); return finish(); }
  if (!input.changed) { state.outcome = "no-eligible"; return finish(); }
  if (input.incomplete) skip("<changed files>", "GitHub file listing is incomplete");
  const headGraph = loadGraph(memoryTree(input.head.files), config);
  for (const file of new Set(headGraph.problems.filter((p) => p.rule === "turtle-syntax").map((p) => p.file))) {
    skip(file, "graph file could not be parsed; the source-graph check reports why");
  }
  const baseGraph = input.base ? loadGraph(memoryTree(input.base.files), config) : null;
  let headOntology, baseOntology;
  try { headOntology = ontologySnapshot({ markdown: input.head.markdown, turtle: input.head.turtle, sections: config.sections }); }
  catch { skip("<ontology>", "proposed ontology could not be catalogued"); return finish(); }
  try { baseOntology = input.base ? ontologySnapshot({ markdown: input.base.markdown, turtle: input.base.turtle, sections: config.sections }) : emptySnapshot(config.sections); }
  catch { baseOntology = emptySnapshot(config.sections); }
  const nodes = selectComparedNodes({ baseGraph, headGraph, baseOntology, headOntology });
  state.compared = nodes.length;
  if (!nodes.length) { state.outcome = state.unreviewed.length ? "unavailable" : "no-eligible"; return finish(); }
  const { pairs, prefiltered } = formPairs(nodes, headOntology);
  state.prefiltered = prefiltered;
  const paired = new Set(pairs.map((pair) => pair.node));
  const settledWithoutModel = nodes.map((node) => node.iri).filter((iri) => !paired.has(iri));
  if (!pairs.length) { state.reviewed = settledWithoutModel; state.outcome = state.unreviewed.length ? "partial" : "reviewed"; return finish(); }
  let mode;
  try { mode = auth.mode(); } catch (error) {
    if (!(error instanceof AuthConfigError)) throw error;
    skip("<model>", "graph naming model credential is misconfigured");
    return finish();
  }
  if (mode === "None") { skip("<model>", "graph naming model credential is unavailable"); return finish(); }
  let budget;
  try { budget = resolveRequestBudget(env); } catch (error) {
    // Publish the cause first so the pull request names the bad setting, then fail the job (ADR 0017).
    skip("<configuration>", error.message);
    await finish();
    throw error;
  }
  let result;
  try {
    result = await api.reviewPairs({ pairs, catalog: headOntology.catalog, model: naming.model, baseUrl: naming.baseUrl, auth,
      fetchImpl: modelFetch, timeoutMs: budget.modelTimeoutMs, maxRequestChars: budget.maxRequestChars });
  } catch { skip("<model>", "graph naming model could not assess the selected names"); return finish(); }
  state.reviewed = [...settledWithoutModel, ...result.reviewed];
  state.unreviewed.push(...result.unreviewed);
  state.results = result.results;
  const onlyTooLarge = state.unreviewed.length > 0 && state.unreviewed.every((item) => item.code === "too-large");
  // Names settled without the model do not make a budget failure partial: the status must name the setting to raise.
  const modelAssessed = result.reviewed.length > 0 || state.results.length > 0;
  state.outcome = !state.unreviewed.length ? "reviewed" : onlyTooLarge && !modelAssessed ? "too-large"
    : state.reviewed.length || state.results.length ? "partial" : "unavailable";
  return finish();
}

export async function planGraphNamingReviews({ client, pulls, loadTrustedConfig = loadConfig, deps = {} }) {
  const eligible = deps.isEligiblePull ?? isEligiblePull;
  const collect = deps.collectGraphNamingInput ?? collectGraphNamingInput;
  const all = [], review = [];
  for (const pull of pulls) {
    const entry = { number: pull.number, headSha: pull.head.sha };
    all.push(entry);
    if (pull.semanticAssociationAmbiguous) continue;
    try {
      if (!await eligible(client, pull)) continue;
      const config = loadTrustedConfig();
      if (!config?.sourceGraph?.enabled || !config.sourceGraph.namingReview?.enabled) continue;
      if ((await collect(client, pull, config)).changed) review.push(entry);
    } catch { /* The finalize job reports this pull request. */ }
  }
  return { all, review };
}

export async function finalizeGraphNamingReview({ client, pull, triggerRunId, config, deps = {} }) {
  const load = deps.loadLedger ?? loadLedger;
  const publish = deps.publishState ?? publishState;
  const latest = (await load(client, pull)).ledger.run;
  if (latest && isNewerTrigger(latest.triggerRunId, triggerRunId)) return latest;
  if (latest?.triggerRunId === triggerRunId && latest.headSha === pull.head.sha) {
    await publish({ client, pull });
    return latest;
  }
  if (config !== undefined) {
    return runGraphNamingReview({ client, pull, config, env: {}, auth: createModelAuth({ env: {}, staticKeyVar: STATIC_KEY_VAR }),
      deps: { ...deps, triggerRunId, skipPending: true } });
  }
  const state = emptyState();
  state.unreviewed.push({ node: "<model job>", reason: "trusted model job did not publish a result" });
  const run = runRecord(pull, triggerRunId, state);
  await publish({ client, pull, run });
  return run;
}

export async function handleSettlementEvent({ client, event, deps = {} }) {
  if (!event.issue?.pull_request || !Number.isInteger(event.issue.number)) return { handled: false, reason: "not a pull request comment" };
  if (event.comment?.user?.login === BOT_LOGIN) return { handled: false, reason: "comment by the workflow bot" };
  if (parseCommand(event.comment?.body) === null && parseCommand(event.changes?.body?.from) === null) {
    return { handled: false, reason: "not a graph naming command" };
  }
  const pull = await client.get(`/pulls/${event.issue.number}`);
  if (pull.state !== "open") return { handled: false, reason: "pull request is not open" };
  await (deps.publishState ?? publishState)({ client, pull });
  return { handled: true, reason: "state recomputed" };
}

function expectedPull(client, number, expectedHead) {
  return client.get(`/pulls/${number}`).then((pull) => (pull.head?.sha === expectedHead ? pull : null));
}

async function main() {
  const mode = process.argv[2];
  const client = createGitHubClient({ token: process.env.GITHUB_TOKEN, repository: process.env.GITHUB_REPOSITORY });
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const triggerRunId = process.env.ONTOLOGY_TRIGGER_RUN_ID ?? "";
  const trustedConfig = () => { try { return loadConfig(); } catch { return null; } };
  if (mode === "identify") {
    const pulls = await resolvePulls(client, event.workflow_run);
    const { all, review } = await planGraphNamingReviews({ client, pulls });
    appendFileSync(process.env.GITHUB_OUTPUT, `all=${JSON.stringify({ include: all })}\n` +
      `review=${JSON.stringify({ include: review })}\nall_count=${all.length}\nreview_count=${review.length}\n`);
  } else if (mode === "review" || mode === "finalize") {
    const pull = await expectedPull(client, Number(process.env.ONTOLOGY_PR_NUMBER), process.env.ONTOLOGY_EXPECTED_HEAD);
    if (!pull) return; // A newer PR revision has its own run.
    if (mode === "finalize") {
      await finalizeGraphNamingReview({ client, pull, triggerRunId, config: trustedConfig() });
    } else {
      const latest = (await loadLedger(client, pull)).ledger.run;
      if (latest && isNewerTrigger(latest.triggerRunId, triggerRunId)) return;
      await runGraphNamingReview({ client, pull, config: trustedConfig(),
        auth: createModelAuth({ env: process.env, staticKeyVar: STATIC_KEY_VAR }), deps: { triggerRunId } });
    }
  } else if (mode === "settle") {
    await handleSettlementEvent({ client, event });
  } else {
    throw new Error("Expected identify, review, finalize, or settle mode");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`graph naming worker failed: ${error.message}`); process.exitCode = 1; });
}
