import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export async function withScratchRepo(body) {
  const dir = mkdtempSync(join(tmpdir(), "source-graph-"));
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  const write = (rel, text) => {
    const path = join(dir, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  };
  const remove = (rel) => rmSync(join(dir, rel), { force: true });
  const commit = (message) => { git("add", "-A"); git("commit", "-q", "-m", message); return git("rev-parse", "HEAD").trim(); };
  try {
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Graph Test");
    git("config", "commit.gpgsign", "false");
    git("config", "core.hooksPath", join(dir, ".no-hooks"));
    await body({ dir, git, write, remove, commit });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function blobId(dir, rel) {
  return execFileSync("git", ["-C", dir, "hash-object", "--", rel], { encoding: "utf8" }).trim();
}

import { formatGraphTurtle } from "./source-graph-turtle.mjs";
export const NS = "https://ontology.example/widgets#";
export const S = (text) => ({ literal: text });                   // string value marker
export function block(subject, type, pairs) {                      // pairs: [predicate, value]
  return { subject, type, line: 0, pairs: pairs.map(([predicate, value]) =>
    typeof value === "number" ? { predicate, object: String(value), objectType: "integer" }
    : value?.literal !== undefined ? { predicate, object: value.literal, objectType: "string" }
    : { predicate, object: value, objectType: "iri" }) };
}
export const ttl = (blocks, namespace = NS) => formatGraphTurtle({ namespace, blocks });
