import { execFile } from "node:child_process";
import { chmodSync, readFileSync, symlinkSync } from "node:fs";
import { createServer } from "node:http";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { install } from "../../bin/install-ontology.mjs";
import { withTempRepo } from "./temp-repo.mjs";

const exec = promisify(execFile);
export const store = ".ontology-index/index-v1.jsonl";
export const fixtureToken = "acceptance-fixture-token";

export async function withSemanticIndexFixture(walk) {
  const requests = [];
  const model = { fail: false };
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const { model: requestedModel, input } = JSON.parse(Buffer.concat(chunks).toString());
    requests.push({ path: request.url, authorised: request.headers.authorization === `Bearer ${fixtureToken}`, model: requestedModel, input });
    if (model.fail) {
      response.writeHead(503).end(fixtureToken);
      return;
    }
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
      data: input.map((body, index) => ({ index, embedding: /refund|reimburse/i.test(body) ? [1, 0] : [0, 1] })),
    }));
  });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    await withTempRepo(async (publisher) => withTempRepo(async (reader) => {
      const { dir, git, write } = publisher;
      install({ target: dir, withSemanticIndex: true });
      const initialPolicy = JSON.parse(readFileSync(join(dir, "ontology.config.json"), "utf8"));
      const policy = { ...initialPolicy, semanticIndex: {
        enabled: true,
        scope: { include: ["src/", "tests/refund.txt", "docs/ontology.md"], exclude: ["src/internal/"] },
        embedding: { endpoint: `http://127.0.0.1:${server.address().port}/v1/embeddings`, model: "fixture", revision: "r1", dimensions: 2, documentPrefix: "doc:", queryPrefix: "query:" },
        release: { repository: "github.com/example/semantic-index-fixture", publishers: ["pilot-publisher"] },
      } };
      const savePolicy = (next) => write("ontology.config.json", JSON.stringify(next));
      const commit = (message) => {
        git("add", ".");
        git("commit", "-qm", message);
        return git("rev-parse", "HEAD").trim();
      };
      const disabled = commit("install the optional Kit");
      savePolicy(policy);
      write("docs/ontology.md", "# Store vocabulary\n");
      write("src/a-refund.txt", "Refund a payment on a cancelled order.\nReject settled orders.\n");
      write("src/dispatch.txt", "Dispatch packages.\n");
      write("src/stock.txt", "Reserve stock.\n");
      write("src/obsolete.txt", "Obsolete policy.\n");
      write("src/internal/excluded.txt", "Excluded text.\n");
      write("src/binary", "A\0B");
      symlinkSync("a-refund.txt", join(dir, "src/link"));
      write("src/ignored.txt", "Ignored text.\n");
      write(".gitignore", "/.ontology-index/\n/src/ignored.txt\n");
      write("unapproved.txt", "Unapproved text.\n");
      write("tests/refund.txt", "Refund test rejects a settled order.\n");
      const pinned = commit("configure committed source and model");
      reader.git("fetch", "-q", dir, "main");
      reader.git("switch", "-q", "--detach", "FETCH_HEAD");

      const scratch = join(dir, ".git");
      const ghState = join(scratch, "fixture-release.json");
      write(".git/fixture-release.json", JSON.stringify({ commit: pinned, policy }));
      write(".git/gh", '#!/bin/sh\nexec "$SEMANTIC_INDEX_FIXTURE_NODE" "$SEMANTIC_INDEX_FIXTURE_GH" "$@"\n');
      chmodSync(join(scratch, "gh"), 0o700);
      const env = {
        ...process.env,
        PATH: scratch + delimiter + process.env.PATH,
        ONTOLOGY_INDEX_EMBEDDING_TOKEN: fixtureToken,
        SEMANTIC_INDEX_GH_FIXTURE: ghState,
        SEMANTIC_INDEX_FIXTURE_NODE: process.execPath,
        SEMANTIC_INDEX_FIXTURE_GH: fileURLToPath(new URL("./semantic-index-release-fixture.mjs", import.meta.url)),
      };
      const run = async (repo, trusted, ...args) => {
        const invocation = ["scripts/semantic-index.mjs", ...args, "--json"];
        const options = { cwd: repo.dir, env: { ...env, ONTOLOGY_INDEX_CONFIG_REF: trusted } };
        try {
          const result = await exec(process.execPath, invocation, options);
          return { exit: 0, ...JSON.parse(result.stdout) };
        } catch (error) {
          if (!error.stdout || !Number.isInteger(error.code)) throw error;
          return { exit: error.code, ...JSON.parse(error.stdout) };
        }
      };
      await walk({ publisher, reader, policy, savePolicy, commit, disabled, pinned, requests, model, run, ghState });
    }));
  } finally {
    server.close();
  }
}
