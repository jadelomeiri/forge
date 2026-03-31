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

DEV_LOG="$TMP_DIR/dev.log"
set +e
timeout 5 node "$CLI_ENTRY" dev >"$DEV_LOG" 2>&1
DEV_EXIT_CODE=$?
set -e

if [[ "$DEV_EXIT_CODE" -ne 124 ]]; then
  cat "$DEV_LOG"
  echo "Expected forge dev to keep running until timeout."
  exit 1
fi

grep -q "Dev server running" "$DEV_LOG"

# Sanity-check key artifacts from the main Forge flow.
test -f app/models/post.model.ts
test -f app/controllers/posts.controller.ts
test -f app/views/posts/index.html
test -f .forge/manifest.json

popd >/dev/null
