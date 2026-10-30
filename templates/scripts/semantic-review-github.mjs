// Read-only GitHub adapter for the privileged semantic reviewer. PR data is never executed.
import { TextDecoder } from "node:util";
import { globToRegExp } from "./check-ontology-terms.mjs";

const apiOrigin = "https://api.github.com";

export function createGitHubClient({ token, repository, fetchImpl = fetch }) {
  if (!token || !/^[^/]+\/[^/]+$/.test(repository ?? "")) {
    throw new Error("GitHub token and owner/repository are required");
  }
  const root = `${apiOrigin}/repos/${repository}`;
  async function request(path) {
    const url = new URL(path.startsWith("/") ? path.slice(1) : path, root + "/");
    if (url.origin !== apiOrigin || !url.pathname.startsWith(root.slice(apiOrigin.length) + "/")) {
      throw new Error("GitHub API page is outside this repository");
    }
    const response = await fetchImpl(url.href, {
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`GitHub API returned ${response.status} for ${url.pathname}`);
    return { data: await response.json(), next: /<([^>]+)>;\s*rel="next"/.exec(response.headers.get("link") ?? "")?.[1] };
  }
  return {
    async get(path) { return (await request(path)).data; },
    async getAll(path) {
      const result = [];
      let next = path;
      let pages = 0;
      while (next) {
        if (++pages > 100) throw new Error("GitHub API pagination exceeded 100 pages");
        const response = await request(next);
        if (!Array.isArray(response.data)) throw new Error("Expected a GitHub API list");
        result.push(...response.data);
        next = response.next;
      }
      return result;
    },
  };
}

export async function resolvePulls(client, workflowRun) {
  const numbers = new Set((workflowRun.pull_requests ?? []).map((item) => item.number).filter(Number.isInteger));
  if (numbers.size === 0 && workflowRun.head_repository?.owner?.login && workflowRun.head_branch) {
    const head = `${workflowRun.head_repository.owner.login}:${workflowRun.head_branch}`;
    const matches = await client.getAll(`/pulls?state=open&head=${encodeURIComponent(head)}&per_page=100`);
    for (const item of matches) {
      if (item.head?.repo?.id === workflowRun.head_repository.id && item.head?.ref === workflowRun.head_branch) {
        numbers.add(item.number);
      }
    }
  }
  const pulls = await Promise.all([...numbers].map((number) => client.get(`/pulls/${number}`)));
  return pulls.filter((item) => item.state === "open");
}

export async function isEligiblePull(client, pull) {
  if (!pull?.head?.repo?.id || pull.head.repo.id !== pull.base?.repo?.id || !pull.user?.login) return false;
  try {
    const permission = await client.get(`/collaborators/${encodeURIComponent(pull.user.login)}/permission`);
    return ["write", "maintain", "admin"].includes(permission.permission);
  } catch (error) {
    if (/returned 404/.test(String(error))) return false;
    throw error;
  }
}

function decodeBlob(data) {
  if (data?.encoding !== "base64" || typeof data.content !== "string") throw new Error("blob is not base64 text");
  const encoded = data.content.replace(/\s/g, "");
  if (!encoded || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new Error("blob has invalid base64 content");
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(encoded, "base64"));
}

export async function collectReviewInput(client, pull, config) {
  const headSha = pull.head.sha;
  const mergeSha = pull.merge_commit_sha;
  const ontologyPath = config.ontologyPath;
  const ontology = await client.get(`/contents/${ontologyPath.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(headSha)}`);
  const ontologyText = decodeBlob(ontology);
  let listed;
  try {
    listed = await client.getAll(`/pulls/${pull.number}/files?per_page=100`);
  } catch (error) {
    return { headSha, mergeSha, files: [], unreviewed: [{ path: "<changed files>", reason: `GitHub file listing is unavailable: ${error instanceof Error ? error.message : error}` }], ontologyText };
  }
  const unreviewed = [];
  if (listed.length !== pull.changed_files) {
    unreviewed.push({ path: "<changed files>", reason: "GitHub file listing is incomplete" });
  }
  const ignore = (config.ignorePaths ?? []).map(globToRegExp);
  const files = [];
  for (const item of listed) {
    const path = item.filename;
    if (typeof path !== "string" || !path.endsWith(".md") || item.status === "removed" || ignore.some((pattern) => pattern.test(path))) continue;
    try {
      if (!item.sha) throw new Error("missing blob SHA");
      const text = decodeBlob(await client.get(`/git/blobs/${encodeURIComponent(item.sha)}`));
      files.push({ path, text });
    } catch (error) {
      unreviewed.push({ path, reason: `Could not read changed Markdown file: ${error instanceof Error ? error.message : error}` });
    }
  }
  return { headSha, mergeSha, files, unreviewed, ontologyText };
}
