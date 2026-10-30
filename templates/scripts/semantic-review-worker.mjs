// Trusted default-branch entry point for optional semantic ontology matching.
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { loadConfig } from "./ontology-config.mjs";
import { createGitHubClient, resolvePulls, isEligiblePull, collectReviewInput } from "./semantic-review-github.mjs";
import { reviewFiles } from "./semantic-review-model.mjs";
import { publishPending, publishRun, readLatestRun, reconcileStatus } from "./semantic-review-ledger.mjs";
import { readDismissals, handleDismissal } from "./semantic-review-dismissal.mjs";

function newRun(pull, triggerRunId) {
  return { schema: 1, prNumber: pull.number, headSha: pull.head.sha, mergeSha: pull.merge_commit_sha ?? null,
    triggerRunId, outcome: "unavailable", eligible: [], reviewed: [], unreviewed: [], findings: [] };
}

function newerRun(left, right) {
  if (left == null) return false;
  const a = String(left).split(":").map(Number);
  const b = String(right).split(":").map(Number);
  return Number.isFinite(a[0]) && Number.isFinite(b[0]) &&
    (a[0] > b[0] || a[0] === b[0] && (a[1] ?? 0) > (b[1] ?? 0));
}

export async function runSemanticReview({ client, pull, config, modelFetch = fetch, secret, deps = {} }) {
  const api = { isEligiblePull, collectReviewInput, reviewFiles, publishPending, publishRun, readDismissals, ...deps };
  const run = newRun(pull, deps.triggerRunId ?? Number(process.env.ONTOLOGY_TRIGGER_RUN_ID ?? 0));
  if (!deps.skipPending) await api.publishPending(client, pull, run);
  const finish = async () => {
    let dismissals = [];
    if (run.findings.length) {
      try { dismissals = await api.readDismissals(client, pull, run); } catch { /* Keep findings active. */ }
    }
    await api.publishRun(client, pull, run, dismissals);
    return run;
  };
  if (pull.semanticAssociationAmbiguous) {
    run.unreviewed.push({ path: "<PR association>", reason: "workflow run matches multiple current pull requests" });
    return finish();
  }
  let eligible;
  try { eligible = await api.isEligiblePull(client, pull); } catch {
    run.unreviewed.push({ path: "<permission>", reason: "author permission could not be checked" });
    return finish();
  }
  if (!eligible) {
    run.outcome = "out-of-scope";
    return finish();
  }
  if (!config?.semanticReview) {
    run.unreviewed.push({ path: "<review>", reason: "trusted semantic configuration is unavailable" });
    return finish();
  }
  if (!config.semanticReview.enabled) {
    run.outcome = "disabled";
    return finish();
  }
  let input;
  try {
    input = await api.collectReviewInput(client, pull, config);
  } catch {
    run.unreviewed.push({ path: "<changed files>", reason: "PR files or proposed ontology could not be read" });
    return finish();
  }
  run.eligible = [...new Set([...input.files.map((item) => item.path),
    ...input.unreviewed.map((item) => item.path).filter((path) => !path.startsWith("<"))])];
  run.unreviewed = [...input.unreviewed];
  if (run.eligible.length === 0 && run.unreviewed.length === 0) {
    run.outcome = "no-eligible";
    return finish();
  }
  if (!secret) {
    run.unreviewed.push({ path: "<model>", reason: "semantic model credential is unavailable" });
    return finish();
  }
  let result;
  try {
    result = await api.reviewFiles({ files: input.files, ontologyText: input.ontologyText,
      sections: config.sections, model: config.semanticReview.model, baseUrl: config.semanticReview.baseUrl,
      apiKey: secret, headSha: pull.head.sha, fetchImpl: modelFetch });
  } catch {
    run.unreviewed.push({ path: "<model>", reason: "semantic model could not assess the selected files" });
    return finish();
  }
  run.reviewed = result.reviewed;
  run.unreviewed.push(...result.unreviewed);
  run.findings = result.findings;
  run.outcome = run.unreviewed.length === 0 ? "reviewed" :
    run.reviewed.length || run.findings.length ? "partial" : "unavailable";
  return finish();
}

export async function finalizeSemanticReview({ client, pull, triggerRunId, config, deps = {} }) {
  const latest = await readLatestRun(client, pull);
  if (latest && newerRun(latest.triggerRunId, triggerRunId)) return latest;
  if (latest?.triggerRunId === triggerRunId) {
    const dismissals = latest.findings.length ? await readDismissals(client, pull, latest) : [];
    await reconcileStatus(client, pull, latest, dismissals);
    return latest;
  }
  if (config !== undefined) {
    return runSemanticReview({ client, pull, config, secret: "", deps: { ...deps, triggerRunId } });
  }
  const run = newRun(pull, triggerRunId);
  run.unreviewed.push({ path: "<model job>", reason: "trusted model job did not publish a result" });
  await publishRun(client, pull, run);
  return run;
}

function expectedPull(client, number, expectedHead) {
  return client.get(`/pulls/${number}`).then((pull) => pull.head?.sha === expectedHead ? pull : null);
}

export async function planSemanticReviews({ client, pulls, loadTrustedConfig = loadConfig, deps = {} }) {
  const checkEligibility = deps.isEligiblePull ?? isEligiblePull;
  const collectInput = deps.collectReviewInput ?? collectReviewInput;
  const all = [];
  const review = [];
  for (const pull of pulls) {
    const entry = { number: pull.number, headSha: pull.head.sha };
    all.push(entry);
    if (pull.semanticAssociationAmbiguous) continue;
    let eligible;
    try { eligible = await checkEligibility(client, pull); } catch { continue; }
    if (!eligible) continue;
    let config;
    try { config = loadTrustedConfig(); } catch { continue; }
    if (!config?.semanticReview?.enabled) continue;
    let input;
    try { input = await collectInput(client, pull, config); } catch { continue; }
    if (input.files.length > 0) review.push(entry);
  }
  return { all, review };
}

async function main() {
  const mode = process.argv[2];
  const client = createGitHubClient({ token: process.env.GITHUB_TOKEN, repository: process.env.GITHUB_REPOSITORY });
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const triggerRunId = process.env.ONTOLOGY_TRIGGER_RUN_ID ?? "";
  if (mode === "identify") {
    const pulls = await resolvePulls(client, event.workflow_run);
    const { all, review } = await planSemanticReviews({ client, pulls });
    appendFileSync(process.env.GITHUB_OUTPUT, `all=${JSON.stringify({ include: all })}\n` +
      `review=${JSON.stringify({ include: review })}\nall_count=${all.length}\nreview_count=${review.length}\n`);
  } else if (mode === "review" || mode === "finalize") {
    const number = Number(process.env.ONTOLOGY_PR_NUMBER);
    const pull = await expectedPull(client, number, process.env.ONTOLOGY_EXPECTED_HEAD);
    if (!pull) return; // A newer PR revision has its own run.
    if (mode === "finalize") {
      let config = null;
      try { config = loadConfig(); } catch { /* Report unavailable for invalid trusted config. */ }
      await finalizeSemanticReview({ client, pull, triggerRunId, config });
    }
    else {
      const latest = await readLatestRun(client, pull);
      if (latest && newerRun(latest.triggerRunId, triggerRunId)) return;
      let config = null;
      try { config = loadConfig(); } catch { /* A visible unavailable run will be published. */ }
      await runSemanticReview({ client, pull, config, secret: process.env.ONTOLOGY_SEMANTIC_LLM_API_KEY,
        deps: { triggerRunId } });
    }
  } else if (mode === "dismiss") {
    await handleDismissal({ client, event });
  } else {
    throw new Error("Expected identify, review, finalize, or dismiss mode");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`semantic review worker failed: ${error.message}`); process.exitCode = 1; });
}
