# E2E Testing Configuration

This document describes how to configure E2E tests for the Docker Registry Cleanup Action.

## Overview

The E2E tests use a matrix strategy to test multiple registries in parallel. Tests are configured using GitHub Actions **Variables** (for non-sensitive configuration) and **Secrets** (for tokens and credentials).

## Required Configuration

### GHCR (GitHub Container Registry)

**Always enabled** - Uses `GITHUB_TOKEN` automatically.

- **Variables**: Optional
  - `E2E_GHCR_USERNAME` - Override default username (defaults to `github.actor`)
- **Secrets**: None required (uses `GITHUB_TOKEN`)

### Gitea

**Optional** - Only runs if configured.

- **Variables**:
  - `E2E_GITEA_URL` - Gitea instance URL (e.g., `https://gitea.example.com`)
  - `E2E_GITEA_USERNAME` - Gitea username
  - `E2E_GITEA_OWNER` - Gitea organization/user for packages
- **Secrets**:
  - `E2E_GITEA_TOKEN` - Gitea personal access token with package read/write permissions

### Docker Hub

**Optional** - Only runs if configured.

- **Variables**:
  - `E2E_DOCKERHUB_USERNAME` - Docker Hub username
  - `E2E_DOCKERHUB_OWNER` - Docker Hub organization (defaults to username if not set)
- **Secrets**:
  - `E2E_DOCKERHUB_TOKEN` - Docker Hub access token or password

## Setting Up Variables and Secrets

### Using GitHub Web UI

1. Go to your repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Add variables under the **Variables** tab
4. Add secrets under the **Secrets** tab

### Using GitHub CLI

```bash
# Set variables
gh variable set E2E_GITEA_URL --body "https://gitea.example.com"
gh variable set E2E_GITEA_USERNAME --body "myuser"
gh variable set E2E_GITEA_OWNER --body "myorg"

# Set secrets
gh secret set E2E_GITEA_TOKEN --body "your-token-here"
gh secret set E2E_DOCKERHUB_TOKEN --body "your-token-here"
```

## Test Behavior

- **GHCR tests**: Always run (if not in a fork PR)
- **Gitea tests**: Only run if `E2E_GITEA_URL` and `E2E_GITEA_TOKEN` are configured
- **Docker Hub tests**: Only run if `E2E_DOCKERHUB_USERNAME` and `E2E_DOCKERHUB_TOKEN` are configured

Tests that are skipped due to missing configuration will show a "⏭️ Skipped" status in the workflow summary.

## Test Process

Each E2E test:

1. Creates test images using `alpine:latest` (~5MB)
2. Tags them as `test-tag-1`, `test-tag-2`, `test-tag-3`, and `keep-me`
3. Pushes all tags to the registry
4. Runs the cleanup action to delete `test-tag-*` tags (excluding `keep-me`)
5. Verifies that `test-tag-*` tags are deleted and `keep-me` is preserved

## Test Image Naming

Test images are named: `{package_prefix}/e2e-test-image`

- **GHCR**: `{owner}/e2e-test-image`
- **Gitea**: `{E2E_GITEA_OWNER}/e2e-test-image`
- **Docker Hub**: `{E2E_DOCKERHUB_OWNER}/e2e-test-image`

## Notes

- Test images remain in registries after tests complete (acceptable for E2E testing)
- Tests use `fail-fast: false` so one registry failure doesn't stop others
- Tests only run on pushes (not on PRs from forks) to avoid token issues
