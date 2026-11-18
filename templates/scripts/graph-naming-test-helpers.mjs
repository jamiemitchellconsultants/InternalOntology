import { resultKey } from "./graph-naming-model.mjs";

export const HEAD = "a".repeat(40), HEAD2 = "d".repeat(40), MERGE = "b".repeat(40), BASE = "c".repeat(40);
export const REPO_URL = "https://github.example/owner/widgets";
export const SUMMARY_MARK = "<!-- ontology-graph-naming v1 ";

export function pullFixture(extra = {}) {
  return { number: 7, state: "open", changed_files: 1, user: { login: "author" }, merge_commit_sha: MERGE,
    head: { sha: HEAD, repo: { id: 1 } }, base: { sha: BASE, repo: { id: 1, html_url: REPO_URL } }, ...extra };
}

export function namingResult(n, extra = {}) {
  const fields = { node: `:node-r${n}`, type: "implements", label: `Label${n}`, value: ":SessionRemoval", ontologyKey: "Entities:SessionRemoval", ...extra };
  return { key: resultKey(fields), ...fields, reason: `reason ${n}`, suggestion: `Suggestion${n}`, file: "g/nodes.ttl", evidence: [`src/R${n}.cs`] };
}

export function namingRun(results = [], extra = {}) {
  return { schema: 1, prNumber: 7, headSha: HEAD, mergeSha: MERGE, triggerRunId: "81:1", outcome: "reviewed",
    compared: results.length, reviewed: results.length, prefiltered: 0, unreviewedCount: 0, unreviewed: [], results, ...extra };
}

export function fakeGitHub({ pull = pullFixture(), roles = {}, labels = [] } = {}) {
  const state = { pull, comments: [], issues: [], issueComments: [], statuses: [], labels: [...labels], writes: [] };
  let id = 100;
  const notFound = (path) => new Error(`GitHub API GET returned 404 for ${path}`);
  const addComment = (body, login) => {
    id += 1;
    const comment = { id, body, user: { login }, created_at: new Date(Date.UTC(2026, 10, 18, 0, 0, id)).toISOString(),
      html_url: `${REPO_URL}/pull/7#issuecomment-${id}` };
    state.comments.push(comment);
    return comment;
  };
  return {
    state,
    comment: (body, login = "reviewer") => addComment(body, login),
    async get(path) {
      if (path === `/pulls/${state.pull.number}`) return state.pull;
      const role = /^\/collaborators\/([^/]+)\/permission$/.exec(path);
      if (role) { const name = roles[decodeURIComponent(role[1])]; if (!name) throw notFound(path); return { role_name: name }; }
      if (path === "/labels/graph-naming-deferred") { if (!state.labels.includes("graph-naming-deferred")) throw notFound(path); return { name: "graph-naming-deferred" }; }
      throw new Error(`unexpected GET ${path}`);
    },
    async getAll(path) {
      if (path.startsWith(`/issues/${state.pull.number}/comments`)) return state.comments.map((c) => ({ ...c }));
      if (path.startsWith("/issues?")) return state.issues.filter((i) => i.state === "open" && i.labels.some((l) => l.name === "graph-naming-deferred"));
      throw new Error(`unexpected list ${path}`);
    },
    async post(path, body) {
      state.writes.push(["POST", path]);
      if (path === `/issues/${state.pull.number}/comments`) return addComment(body.body, "github-actions[bot]");
      const status = /^\/statuses\/([0-9a-f]{40})$/.exec(path);
      if (status) { state.statuses.push({ sha: status[1], ...body }); return {}; }
      if (path === "/labels") { state.labels.push(body.name); return { name: body.name }; }
      if (path === "/issues") {
        const number = 501 + state.issues.length;
        const issue = { number, state: "open", title: body.title, body: body.body, labels: body.labels.map((name) => ({ name })), html_url: `${REPO_URL}/issues/${number}` };
        state.issues.push(issue);
        return issue;
      }
      const onIssue = /^\/issues\/(\d+)\/comments$/.exec(path);
      if (onIssue) { state.issueComments.push({ issue: Number(onIssue[1]), body: body.body }); return {}; }
      throw new Error(`unexpected POST ${path}`);
    },
    async patch(path, body) {
      state.writes.push(["PATCH", path]);
      const target = /^\/issues\/comments\/(\d+)$/.exec(path);
      if (!target) throw new Error(`unexpected PATCH ${path}`);
      const comment = state.comments.find((c) => c.id === Number(target[1]));
      comment.body = body.body;
      return { ...comment };
    },
  };
}

export const summaryOf = (client) => client.state.comments.find((c) => c.user.login === "github-actions[bot]" && c.body.includes(SUMMARY_MARK));
export const lastStatus = (client, sha = HEAD) => client.state.statuses.filter((s) => s.sha === sha).at(-1);
