#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI_ENTRY="$REPO_ROOT/packages/cli/dist/index.js"

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

pushd "$TMP_DIR" >/dev/null

node "$CLI_ENTRY" new smoke-app
cd smoke-app

node "$CLI_ENTRY" generate model Post title:string body:text published:boolean
node "$CLI_ENTRY" generate scaffold Post
node "$CLI_ENTRY" explain model Post >/dev/null
node "$CLI_ENTRY" explain route /posts/1 >/dev/null

# Sanity-check key artifacts from the main Forge flow.
test -f app/models/post.model.ts
test -f app/controllers/posts.controller.ts
test -f app/views/posts/index.html
test -f .forge/manifest.json

popd >/dev/null
