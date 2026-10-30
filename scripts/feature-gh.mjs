// The only code in the lifecycle kit that talks to GitHub. Everything goes through the gh CLI
// (never an MCP server) so it runs the same in every agent and in Actions.

import { execFileSync } from "node:child_process";
import { parseParent, parseSubIssue } from "./feature-lib.mjs";

export const AUTH_HINT = "Check that gh is installed and authenticated: run gh auth status.";

export function runGh(args, exec = execFileSync) {
  try {
    return exec("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const detail = (error.stderr?.toString() || error.message).trim();
    throw new Error(`gh ${args.slice(0, 2).join(" ")} failed: ${detail}. ${AUTH_HINT}`);
  }
}

const labelNames = (labels) => (labels ?? []).map((l) => (typeof l === "string" ? l : l.name));
const lower = (value) => String(value).toLowerCase();

export function makeGh(runner = runGh) {
  const json = (args) => JSON.parse(runner(args));

  function viewIssue(number) {
    const issue = json(["issue", "view", String(number), "--json", "number,title,body,state,labels"]);
    return { number: issue.number, title: issue.title, body: issue.body ?? "", state: lower(issue.state), labels: labelNames(issue.labels) };
  }

  return {
    createIssue({ title, body, labels = [], assignee }) {
      const out = runner([
        "issue", "create", "--title", title, "--body", body,
        ...labels.flatMap((l) => ["--label", l]),
        ...(assignee ? ["--assignee", assignee] : []),
      ]);
      const m = out.match(/\/issues\/(\d+)/);
      if (!m) throw new Error(`could not read the new issue number from: ${out.trim()}`);
      return Number(m[1]);
    },

    addSubIssue(parentNumber, childNumber) {
      // The sub-issues API takes the child's database id, not its number.
      const id = runner(["api", `repos/{owner}/{repo}/issues/${childNumber}`, "--jq", ".id"]).trim();
      runner(["api", "-X", "POST", `repos/{owner}/{repo}/issues/${parentNumber}/sub_issues`, "-F", `sub_issue_id=${id}`]);
    },

    listFeatures() {
      return json(["issue", "list", "--label", "feature", "--state", "open", "--limit", "200", "--json", "number,title,body"]);
    },

    listSideIssues(featureNumber) {
      const marker = `Side issue of #${featureNumber},`;
      return json(["issue", "list", "--label", "side-issue", "--state", "open", "--limit", "200", "--json", "number,title,body"])
        .filter((i) => (i.body ?? "").includes(marker))
        .map(({ number, title }) => ({ number, title }));
    },

    linkedPullRequests(issueNumber) {
      const issue = json(["issue", "view", String(issueNumber), "--json", "closedByPullRequestsReferences"]);
      // closedByPullRequestsReferences carries no state, so each PR is looked up by URL (which also covers other repos).
      return (issue.closedByPullRequestsReferences ?? []).map((ref) => {
        const pr = json(["pr", "view", ref.url ?? String(ref.number), "--json", "state"]);
        return { number: ref.number, state: lower(pr.state) };
      });
    },

    viewIssue,

    viewPr(number) {
      const pr = json(["pr", "view", String(number), "--json", "body,files,labels,headRefName"]);
      return { body: pr.body ?? "", files: (pr.files ?? []).map((f) => f.path), labels: labelNames(pr.labels), head: pr.headRefName ?? "" };
    },

    loadFeature(number) {
      const parent = viewIssue(number);
      const marker = parseParent(parent.body);
      if (!marker) throw new Error(`#${number} is not a feature issue: its body has no feature marker`);
      if (marker.mode === "lite") return { number, slug: marker.slug, mode: "lite", body: parent.body, labels: parent.labels };
      const pages = json(["api", `repos/{owner}/{repo}/issues/${number}/sub_issues`, "--paginate", "--slurp"]);
      const subIssues = pages.flat().flatMap((issue) => {
        const sub = parseSubIssue(issue.body ?? "");
        return sub
          ? [{ phaseId: sub.phaseId, number: issue.number, state: lower(issue.state), labels: labelNames(issue.labels), body: issue.body ?? "" }]
          : [];
      });
      if (subIssues.length === 0) throw new Error(`feature #${number} has no readable sub-issues, so its gates cannot be evaluated`);
      return { number, slug: marker.slug, mode: "full", subIssues };
    },

    comment(number, body) {
      runner(["issue", "comment", String(number), "--body", body]);
    },
    reopen(number) {
      runner(["issue", "reopen", String(number)]);
    },
    close(number) {
      runner(["issue", "close", String(number)]);
    },
    addLabels(number, labels) {
      runner(["issue", "edit", String(number), "--add-label", labels.join(",")]);
    },
    removeLabels(number, labels) {
      runner(["issue", "edit", String(number), "--remove-label", labels.join(",")]);
    },
    editBody(number, body) {
      runner(["issue", "edit", String(number), "--body", body]);
    },
  };
}
