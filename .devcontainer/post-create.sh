#!/bin/bash
# Post-create setup script for the Git Tag Validate Version devcontainer.
# Runs once after the container is first created.
set -euo pipefail

echo "==> Installing dependencies..."
if grep -qs '"packageManager".*"yarn"' package.json || [ -f yarn.lock ]; then
  echo "    (detected yarn)"
  corepack enable
  yarn install
elif [ -f package-lock.json ]; then
  echo "    (detected npm)"
  npm ci
else
  npm install
fi

echo "==> Installing act CLI for local GitHub Actions testing..."
if ! command -v act &>/dev/null; then
  curl --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/nektos/act/master/install.sh \
    | sudo bash -s -- -b /usr/local/bin
fi

echo "==> Seeding local act config files (if not already present)..."
[ -f .act.env ]     || cp .act.env.sample .act.env
[ -f .act.secrets ] || cp .act.secrets.sample .act.secrets
[ -f .act.vars ]    || cp .act.vars.sample .act.vars

echo "==> Done. Dev environment is ready."
echo ""
echo "    Quick start:"
echo "      npm test          # unit + integration tests"
echo "      npm run build     # compile + bundle to dist/"
echo "      npm run lint      # ESLint"
echo "      npm run test:act  # run workflows locally via act (requires Docker)"
