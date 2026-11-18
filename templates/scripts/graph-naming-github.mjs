// Read-only GitHub inputs for the graph naming review. Pull request Turtle and ontology text are data.
import { decodeBlob } from "./semantic-review-github.mjs";

export async function readPermission(client, login) {
  if (!login) return null;
  try {
    return (await client.get(`/collaborators/${encodeURIComponent(login)}/permission`)).role_name ?? null;
  } catch (error) {
    if (/returned 404/.test(String(error))) return null;
    throw error;
  }
}

async function snapshot(client, sha, config, { required }) {
  const root = config.sourceGraph.root;
  const markdownPath = config.ontologyPath, turtlePath = config.ontologyPath.replace(/\.md$/, ".ttl");
  const listing = await client.get(`/git/trees/${encodeURIComponent(sha)}?recursive=1`);
  if (listing?.truncated) throw new Error("graph tree listing is truncated");
  const blobs = new Map((listing?.tree ?? []).filter((entry) => entry.type === "blob").map((entry) => [entry.path, entry.sha]));
  const read = async (path) => decodeBlob(await client.get(`/git/blobs/${encodeURIComponent(blobs.get(path))}`));
  const graphPaths = [...blobs.keys()]
    .filter((path) => path.startsWith(`${root}/`) && path.endsWith(".ttl") && path !== `${root}/graph-schema.ttl`).sort();
  const hasOntology = blobs.has(markdownPath) && blobs.has(turtlePath);
  if (!hasOntology && required) throw new Error("proposed ontology is missing");
  const files = [];
  for (const path of graphPaths) files.push({ path, text: await read(path) });
  return { files, markdown: hasOntology ? await read(markdownPath) : null, turtle: hasOntology ? await read(turtlePath) : null };
}

export async function collectGraphNamingInput(client, pull, config) {
  const root = config.sourceGraph.root;
  const relevant = new Set([config.ontologyPath, config.ontologyPath.replace(/\.md$/, ".ttl")]);
  const listed = await client.getAll(`/pulls/${pull.number}/files?per_page=100`);
  const incomplete = listed.length !== pull.changed_files;
  const touched = listed.some(({ filename }) => typeof filename === "string" &&
    (relevant.has(filename) || (filename.startsWith(`${root}/`) && filename.endsWith(".ttl"))));
  if (!touched && !incomplete) return { changed: false, incomplete: false, base: null, head: null };
  return { changed: true, incomplete,
    base: await snapshot(client, pull.base.sha, config, { required: false }),
    head: await snapshot(client, pull.head.sha, config, { required: true }) };
}
