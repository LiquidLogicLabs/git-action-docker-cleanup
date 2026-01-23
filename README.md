# Docker Registry Cleanup Action

[![CI](https://github.com/LiquidLogicLabs/actions/git-action-docker-cleanup/actions/workflows/ci.yml/badge.svg)](https://github.com/LiquidLogicLabs/actions/git-action-docker-cleanup/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)

A GitHub/Gitea action that deletes untagged/tagged images from container registries. Supports multiple registries including GHCR, Gitea, Docker Hub, and any OCI-compliant registry via Docker CLI.

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
    registry-type: ghcr
    package: my-package
    dry-run: true
```

### Gitea (Self-Hosted)

```yaml
- uses: LiquidLogicLabs/git-action-docker-cleanup@v1
  with:
    registry-type: gitea
    registry-url: https://gitea.example.com
    token: ${{ secrets.GITEA_TOKEN }}
    package: my-package
    dry-run: true
```

### Docker Hub

```yaml
- uses: LiquidLogicLabs/git-action-docker-cleanup@v1
  with:
    registry-type: docker-hub
    registry-username: ${{ secrets.DOCKER_USERNAME }}
    registry-password: ${{ secrets.DOCKER_PASSWORD }}
    package: my-org/my-package
    dry-run: true
```

### Generic OCI Registry (Harbor, Quay.io, ACR, etc.)

```yaml
- uses: LiquidLogicLabs/git-action-docker-cleanup@v1
  with:
    registry-type: oci
    registry-url: registry.example.com
    token: ${{ secrets.REGISTRY_TOKEN }}
    package: my-org/my-package
    dry-run: true
```

### Auto-Detection

```yaml
- uses: LiquidLogicLabs/git-action-docker-cleanup@v1
  with:
    registry-type: auto
    registry-url: ghcr.io
    package: my-package
    dry-run: true
```

### Keep N Latest Tagged Images

```yaml
- uses: LiquidLogicLabs/git-action-docker-cleanup@v1
  with:
    registry-type: ghcr
    package: my-package
    keep-n-tagged: 10
    exclude-tags: dev,latest
```

### Delete Untagged Images

```yaml
- uses: LiquidLogicLabs/git-action-docker-cleanup@v1
  with:
    registry-type: ghcr
    package: my-package
    delete-untagged: true
    keep-n-untagged: 5
```

## Inputs

### Registry Configuration

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `registry-type` | Registry type: `ghcr`, `gitea`, `docker-hub`, `docker`, or `auto` | Yes | - |
| `registry-url` | Registry base URL (required for gitea, docker, and auto) | No | - |
| `registry-username` | Registry username (for Docker Hub and docker CLI) | No | - |
| `registry-password` | Registry password (for Docker Hub and docker CLI) | No | - |
| `token` | Authentication token | No | `${{ github.token }}` |

### Package Configuration

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `owner` | Repository owner | No | Current repo owner |
| `repository` | Repository name | No | Current repo name |
| `package` | Package name to clean | No | - |
| `packages` | Comma-separated list of packages | No | - |
| `expand-packages` | Enable wildcard/regex support | No | `false` |
| `use-regex` | Use regex for package matching | No | `false` |

### Cleanup Options

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `dry-run` | Simulate cleanup without deleting | No | `false` |
| `keep-n-tagged` | Keep N latest tagged images | No | - |
| `keep-n-untagged` | Keep N latest untagged images | No | - |
| `delete-untagged` | Delete all untagged images | No | `false` |
| `delete-tags` | Delete specific tags (wildcard/regex) | No | - |
| `exclude-tags` | Exclude tags from deletion | No | - |
| `older-than` | Delete images older than (e.g., "30d", "2w", "1m") | No | - |
| `delete-ghost-images` | Delete ghost images | No | `false` |
| `delete-partial-images` | Delete partial multi-arch images | No | `false` |
| `delete-orphaned-images` | Delete orphaned images | No | `false` |
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
| `deleted-count` | Number of images/packages deleted |
| `kept-count` | Number of images/packages kept |
| `deleted-tags` | List of deleted tags (comma-separated) |
| `kept-tags` | List of kept tags (comma-separated) |

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

- **Tokens**: Use GitHub/Gitea secrets for authentication tokens
- **Permissions**: Ensure tokens have appropriate scopes (`write:packages`, `delete:packages`)
- **Dry-Run**: Always test with `dry-run: true` first
- **Exclude Tags**: Use `exclude-tags` to protect important images (e.g., `latest`, `dev`)

## Migration from ghcr-io-cleanup-action

To migrate from `ghcr-io-cleanup-action`:

1. Add `registry-type: ghcr` input (or use `auto` with `registry-url: ghcr.io`)
2. All other inputs remain the same
3. Behavior should be identical for GHCR

## License

MIT

## Credits

Based on the functionality of [ghcr-io-cleanup-action](https://github.com/marketplace/actions/ghcr-io-cleanup-action) by dataaxiom, extended to support multiple registries.
