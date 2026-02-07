# Docker Registry Cleanup Action

[![CI](https://github.com/LiquidLogicLabs/actions/git-action-docker-cleanup/actions/workflows/ci.yml/badge.svg)](https://github.com/LiquidLogicLabs/actions/git-action-docker-cleanup/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)

A GitHub/Gitea action that deletes untagged/tagged images from container registries. Supports multiple registries including GHCR, Gitea, Docker Hub, and any OCI-compliant registry via Docker CLI.

## ⚠️ Important: Always Use Dry-Run First

**This action permanently deletes tags and images from your registry. Deletions cannot be undone.**

**Before running in production:**
1. **Always test with `dryRun: true` first** to preview what will be deleted
2. Review the output carefully to ensure only intended images/tags are marked for deletion
3. Use `excludeTags` to protect important tags (e.g., `latest`, `dev`, `main`)
4. Start with a small scope (single package) before cleaning up multiple packages
5. Verify your filters and patterns work as expected in dryRun mode

**Example workflow:**
```yaml
# Step 1: Test with dryRun
- uses: LiquidLogicLabs/git-action-docker-cleanup@v1
  with:
    registryType: ghcr
    package: my-package
    dryRun: true  # ← Always start here!

# Step 2: After reviewing dryRun output, remove dryRun for actual deletion
- uses: LiquidLogicLabs/git-action-docker-cleanup@v1
  with:
    registryType: ghcr
    package: my-package
    excludeTags: latest,dev  # Protect important tags
    # dryRun: false (default)
```

## Features

- **Multi-Registry Support**: Works with GHCR, Gitea, Docker Hub, and any OCI-compliant registry
- **Auto-Detection**: Automatically detects registry type based on URL
- **Multi-Architecture Support**: Handles multi-architecture images correctly
- **Referrers/Attestation Support**: Supports OCI referrers and attestations (where supported)
- **Flexible Filtering**: Filter by tags, age, keep N latest, exclude patterns
- **Dry-Run Mode**: Test cleanup without deleting
- **Retry & Throttle**: Built-in retry logic and rate limiting
- **Comprehensive Logging**: Verbose debug logging support

## Usage

### Basic Example - GHCR

```yaml
- uses: LiquidLogicLabs/git-action-docker-cleanup@v1
  with:
    registryType: ghcr
    package: my-package
    dryRun: true
```

### Gitea (Self-Hosted)

```yaml
- uses: LiquidLogicLabs/git-action-docker-cleanup@v1
  with:
    registryType: gitea
    registryUrl: https://gitea.example.com
    token: ${{ secrets.GITEA_TOKEN }}
    package: my-package
    dryRun: true
```

### Docker Hub

```yaml
- uses: LiquidLogicLabs/git-action-docker-cleanup@v1
  with:
    registryType: docker-hub
    registryUsername: ${{ secrets.DOCKER_USERNAME }}
    registryPassword: ${{ secrets.DOCKER_PASSWORD }}
    package: my-org/my-package
    dryRun: true
```

### Generic OCI Registry (Harbor, Quay.io, ACR, etc.)

```yaml
- uses: LiquidLogicLabs/git-action-docker-cleanup@v1
  with:
    registryType: oci
    registryUrl: registry.example.com
    token: ${{ secrets.REGISTRY_TOKEN }}
    package: my-org/my-package
    dryRun: true
```

### Auto-Detection

```yaml
- uses: LiquidLogicLabs/git-action-docker-cleanup@v1
  with:
    registryType: auto
    registryUrl: ghcr.io
    package: my-package
    dryRun: true
```

### Keep N Latest Tagged Images

```yaml
- uses: LiquidLogicLabs/git-action-docker-cleanup@v1
  with:
    registryType: ghcr
    package: my-package
    dryRun: true  # Test first!
    keepNTagged: 10
    excludeTags: dev,latest
```

### Delete Untagged Images

```yaml
- uses: LiquidLogicLabs/git-action-docker-cleanup@v1
  with:
    registryType: ghcr
    package: my-package
    dryRun: true  # Test first!
    deleteUntagged: true
    keepNUntagged: 5
```

## Inputs

### Registry Configuration

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `registryType` | Registry type: `ghcr`, `gitea`, `docker-hub`, `docker`, or `auto` | Yes | - |
| `registryUrl` | Registry base URL (required for gitea, docker, and auto) | No | - |
| `registryUsername` | Registry username (for Docker Hub and docker CLI) | No | - |
| `registryPassword` | Registry password (for Docker Hub and docker CLI) | No | - |
| `token` | Authentication token | No | `${{ github.token }}` |

### Package Configuration

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `owner` | Repository owner | No | Current repo owner |
| `repository` | Repository name | No | Current repo name |
| `package` | Package name to clean | No | - |
| `packages` | Comma-separated list of packages | No | - |
| `expandPackages` | Enable wildcard/regex support | No | `false` |
| `useRegex` | Use regex for package matching | No | `false` |

### Cleanup Options

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `dryRun` | Simulate cleanup without deleting | No | `false` |
| `keepNTagged` | Keep N latest tagged images | No | - |
| `keepNUntagged` | Keep N latest untagged images | No | - |
| `deleteUntagged` | Delete all untagged images | No | `false` |
| `deleteTags` | Delete specific tags (wildcard/regex) | No | - |
| `excludeTags` | Exclude tags from deletion | No | - |
| `olderThan` | Delete images older than (e.g., "30d", "2w", "1m") | No | - |
| `deleteGhostImages` | Delete ghost images | No | `false` |
| `deletePartialImages` | Delete partial multi-arch images | No | `false` |
| `deleteOrphanedImages` | Delete orphaned images | No | `false` |
| `validate` | Validate multi-arch images after cleanup | No | `false` |

### API Configuration

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `retry` | Retry count for API calls | No | `3` |
| `throttle` | Throttle delay between calls (ms) | No | `1000` |
| `verbose` | Enable verbose debug logging | No | `false` |

## Outputs

| Output | Description |
|--------|-------------|
| `deletedCount` | Number of images/packages deleted |
| `keptCount` | Number of images/packages kept |
| `deletedTags` | List of deleted tags (comma-separated) |
| `keptTags` | List of kept tags (comma-separated) |

## Registry Types

### GHCR (GitHub Container Registry)

- **Type**: `ghcr`
- **URL**: Automatically uses `ghcr.io`
- **Authentication**: GitHub token (defaults to `GITHUB_TOKEN`)
- **Features**: Full support (multi-arch, referrers, attestation, cosign)

### Gitea

- **Type**: `gitea`
- **URL**: Required (self-hosted instances)
- **Authentication**: Gitea token
- **Features**: Full support (multi-arch, referrers, attestation, cosign)
- **Note**: For self-hosted Gitea, explicitly use `gitea` type (not `auto`)

### Docker Hub

- **Type**: `docker-hub`
- **URL**: Automatically uses `docker.io`
- **Authentication**: Username/password or token
- **Features**: Multi-arch support, limited referrers/attestation

### Generic OCI Registry (Harbor, Quay.io, ACR, Artifactory, etc.)

- **Type**: `oci`
- **URL**: Required (any OCI-compliant registry)
- **Authentication**: Bearer token or username/password (Basic auth)
- **Features**: Full OCI V2 API support (multi-arch, referrers, attestation, cosign)
- **Limitations**:
  - Cannot list all packages (must provide package names explicitly)
  - Cannot delete individual tags (deletes entire manifest, which deletes all tags pointing to it)
  - Limited metadata (must fetch manifests to get creation dates)
- **Supported Registries**: Harbor, Quay.io, Azure Container Registry, Artifactory, and any OCI-compliant registry

### Docker CLI (Local Operations)

- **Type**: `docker`
- **URL**: Required (any OCI-compliant registry)
- **Authentication**: Username/password or token
- **Features**: Multi-arch support (via Docker CLI)
- **Requirements**: Docker must be installed in runner
- **Note**: Primarily for local image management, not remote registry operations

### Auto-Detection

- **Type**: `auto`
- **URL**: Required
- **Behavior**: Matches URL against known provider URLs, falls back to Generic OCI provider if no match
- **Known URLs**:
  - `ghcr.io` → GHCR provider
  - `docker.io`, `registry-1.docker.io`, `hub.docker.com` → Docker Hub provider
  - Other URLs → Generic OCI provider (fallback)

## Feature Compatibility Matrix

| Feature | GHCR | Gitea | Docker Hub | Generic OCI | Docker CLI |
|---------|------|-------|------------|-------------|------------|
| Multi-Arch | ✅ | ✅ | ✅ | ✅ | ✅ |
| Referrers | ✅ | ✅ | ⚠️ | ✅ | ❌ |
| Attestation | ✅ | ✅ | ⚠️ | ✅ | ❌ |
| Cosign | ✅ | ✅ | ⚠️ | ✅ | ❌ |
| List Packages | ✅ | ✅ | ❌ | ❌ | ✅ (local) |
| Delete Individual Tags | ⚠️ | ✅ | ❌ | ❌ | ✅ (local) |

**Legend:**
- ✅ Full support
- ⚠️ Limited support (may have restrictions)
- ❌ Not supported

**Notes:**
- **GHCR**: Cannot delete individual tags when multiple tags point to the same version (GitHub Package API limitation)
- **Docker Hub**: Limited referrers/attestation support
- **Generic OCI**: Cannot delete individual tags (deletes entire manifest), cannot list all packages
- **Docker CLI**: Only works with local images, not remote registries

## Security Considerations

- **⚠️ Always Use Dry-Run First**: This action **permanently deletes** tags and images. Always test with `dryRun: true` first to preview deletions before running in production.
- **Tokens**: Use GitHub/Gitea secrets for authentication tokens. Never commit tokens to your repository.
- **Permissions**: Ensure tokens have appropriate scopes (`write:packages`, `delete:packages`). Use the minimum required permissions.
- **Exclude Tags**: Use `excludeTags` to protect important images (e.g., `latest`, `dev`, `main`, `stable`).
- **Start Small**: Test with a single package before cleaning up multiple packages.
- **Review Output**: Carefully review dryRun output to ensure only intended images/tags are marked for deletion.

## Migration from ghcr-io-cleanup-action

To migrate from `ghcr-io-cleanup-action`:

1. Add `registryType: ghcr` input (or use `auto` with `registryUrl: ghcr.io`)
2. All other inputs remain the same
3. Behavior should be identical for GHCR

## License

MIT

## Credits

Based on the functionality of [ghcr-io-cleanup-action](https://github.com/marketplace/actions/ghcr-io-cleanup-action) by dataaxiom, extended to support multiple registries.
# Test
