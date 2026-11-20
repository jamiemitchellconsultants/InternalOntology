#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

// A stand-in for gh at the process boundary. Fail on unexpected calls and keep assets on disk between invocations.
const statePath = process.env.SEMANTIC_INDEX_GH_FIXTURE;
const state = JSON.parse(readFileSync(statePath, "utf8"));
const args = process.argv.slice(2);
const [command, action, , repository] = args;
const assetPath = statePath + ".gz";
const tag = "v1";
const repositoryRoute = "repos/example/semantic-index-fixture";
const respond = (value) => console.log(JSON.stringify(value));

if (process.env.ONTOLOGY_INDEX_EMBEDDING_TOKEN !== undefined) throw new Error("GitHub CLI received the embedding token");
if (command === "release" && repository === "github.com/example/semantic-index-fixture") {
  const operands = args.slice(args.indexOf("--") + 1);
  if (operands[0] !== tag) throw new Error("Unexpected release tag");
  if (action === "view") {
    respond({ databaseId: 1, tagName: tag, isDraft: false, isImmutable: false, targetCommitish: "main" });
  } else if (action === "upload" && operands.length === 2 && !args.includes("--clobber") && !state.asset) {
    const bytes = readFileSync(operands[1]);
    writeFileSync(assetPath, bytes, { flag: "wx" });
    state.asset = { id: 2, name: basename(operands[1]), size: bytes.length, state: "uploaded", digest: "sha256:" + createHash("sha256").update(bytes).digest("hex") };
    writeFileSync(statePath, JSON.stringify(state));
    console.log("uploaded fixture asset");
  } else {
    throw new Error("Unexpected release operation");
  }
} else if (command === "api" && action === "--hostname" && args[2] === "github.com") {
  switch (repository) {
    case "user": respond({ login: "pilot-publisher" }); break;
    case repositoryRoute: respond({ default_branch: "main", permissions: { push: true } }); break;
    case repositoryRoute + "/git/ref/heads/main":
    case repositoryRoute + "/git/ref/tags/v1": respond({ object: { type: "commit", sha: state.commit } }); break;
    case repositoryRoute + "/contents/ontology.config.json?ref=" + state.commit:
      respond({ encoding: "base64", content: Buffer.from(JSON.stringify(state.policy)).toString("base64") });
      break;
    case repositoryRoute + "/releases/1/assets?per_page=100":
      if (!args.includes("--paginate") || !args.includes("--slurp")) throw new Error("Expected paged assets");
      respond([state.asset ? [state.asset] : []]);
      break;
    case repositoryRoute + "/releases/assets/2":
      if (!args.includes("Accept: application/octet-stream")) throw new Error("Expected binary asset request");
      process.stdout.write(readFileSync(assetPath));
      break;
    default: throw new Error("Unexpected GitHub API route");
  }
} else {
  throw new Error("Unexpected GitHub CLI command");
}
