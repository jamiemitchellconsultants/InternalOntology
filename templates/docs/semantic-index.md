# Semantic repository index setup

The optional semantic index searches approved source, tests, and documentation at a Git commit. It keeps a vector store in the Git-ignored `.ontology-index/` directory of each checkout. GitHub Releases can distribute a compressed copy of that store.

## Configure the adopter

Install the Kit with `--with-semantic-index` and add `--force` when upgrading existing Kit scripts. The installer adds the workspace ignore rule and preserves the adopter's existing configuration. Use Git and Node 20 or newer. Install and authenticate `gh` for release transfers.

Add this example section to `ontology.config.json` on the repository's trusted branch. Replace the model, revision, dimensions, source selectors, and release details with the owner's approved settings.

```json
{
  "semanticIndex": {
    "enabled": true,
    "scope": {
      "include": ["src/", "tests/", "docs/ontology.md"],
      "exclude": ["src/generated/"]
    },
    "embedding": {
      "endpoint": "http://127.0.0.1:11434/v1/embeddings",
      "model": "your-embedding-model",
      "revision": "owner-pinned-model-version",
      "dimensions": 768,
      "documentPrefix": "",
      "queryPrefix": ""
    },
    "release": {
      "repository": "github.com/owner/repository",
      "publishers": ["maintainer-login"]
    }
  }
}
```

The CLI reads committed settings at `refs/remotes/origin/HEAD` by default. Fetch the owner-approved default branch or set `ONTOLOGY_INDEX_CONFIG_REF` to a trusted full ref or full commit ID. The configured embedding endpoint must accept the OpenAI-compatible embeddings request. Use HTTPS for remote services or loopback HTTP for a local endpoint. Set `ONTOLOGY_INDEX_EMBEDDING_TOKEN` outside Git if the endpoint requires a bearer token. Advance the model revision when the underlying embedding space changes. Omit the release object for local-only use. Omit its publishers field for download-only use.

Scope selectors match exact repository-relative paths or directory prefixes ending in `/`. Exclusions take precedence. Builds read regular UTF-8 text at the current Git commit, including local commits. Search results cite committed lines and report staged or unstaged changes to approved paths.

## Build and search

```bash
node scripts/semantic-index.mjs status
node scripts/semantic-index.mjs refresh
node scripts/semantic-index.mjs search --query "where is a booking cancelled?" --limit 5
node scripts/semantic-index.mjs search --query "where is a booking cancelled?" --json
```

Run `refresh` for a missing or stale index. It reuses compatible vectors for unchanged files. A changed model requires a matching download or a rebuild. An unreadable store can be rebuilt or replaced by a validated download. The active file is `.ontology-index/index-v1.jsonl`. A failed refresh or import preserves the last complete file. If an interrupted process leaves `.ontology-index/writer.lock`, check the recorded PID and hostname before removing the lock. Quit or wait for any live writer first. A subsequent explicit refresh or download can resume work.

## Share a release snapshot

```bash
node scripts/semantic-index.mjs upload --release v1.2.3
node scripts/semantic-index.mjs download --release v1.2.3
node scripts/semantic-index.mjs download --release v1.2.2 --allow-ancestor
node scripts/semantic-index.mjs refresh
```

For upload, use the same commit as the selected release and push that commit to the adopting repository. The current default-branch policy must approve the authenticated publishing login, scope, and embedding space. GitHub write access is also required. Attach the asset to a draft before publishing when the repository uses immutable releases. A release asset uses a versioned name and existing assets are preserved.

An exact compatible download needs no source embeddings before search. Search still needs the configured model to embed the query. Explicit ancestor imports require local Git history for the ancestor and a refresh before search. The index file contains vectors and source provenance. Endpoint URLs, credentials, and source text stay outside the release asset.

Version one allows up to 128 KiB per index record and 2 GiB expanded. GitHub Release assets must be under 2 GiB compressed. Oversize files fail with an error and preserve the active index. Keep the release asset under the adopting repository's normal access controls.
