#!/usr/bin/env bash
# Start the app: install (first run), generate the Prisma client, apply
# migrations, seed synthetic data, then start the dev server. Deterministic and
# safe to run twice — the install and seed steps no-op when already done.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

# Absolute DB path so migrate (cwd packages/db) and the app (cwd apps/shell) hit
# the same SQLite file regardless of where each command runs.
#
# Prisma needs a NATIVE path. Under Git Bash on Windows, `pwd` returns
# /c/Users/... which Prisma resolves literally against the drive root, silently
# creating a phantom C:\c\Users\... tree instead of using the repo's dev.db.
# `pwd -W` returns C:/Users/... there; on Linux and macOS it is unsupported, so
# fall back to $REPO. Matches what scripts/run.ps1 does on Windows.
REPO_NATIVE="$(pwd -W 2>/dev/null || printf '%s' "$REPO")"
export DATABASE_URL="${DATABASE_URL:-file:$REPO_NATIVE/dev.db}"

if [ ! -d node_modules ]; then
  echo "==> Installing dependencies (first run, this can take a minute)..."
  npm install
fi

echo "==> Generating Prisma client..."
npm run generate -w @ssa/db >/dev/null

echo "==> Applying database migrations..."
npm run migrate -w @ssa/db

echo "==> Seeding synthetic data (idempotent)..."
npm run prisma:seed -w @ssa/shell

echo ""
echo "==> Starting dev server on http://localhost:3000"
echo "    Press Ctrl-C to stop."
echo ""
npm run dev -w @ssa/shell
