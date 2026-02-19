# Changelog

All notable changes to this project will be documented in this file. See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.0.0](https://github.com/LiquidLogicLabs/git-action-docker-cleanup/compare/v1.1.0...v2.0.0) (2026-02-09)

## [1.1.0](https://github.com/LiquidLogicLabs/git-action-docker-cleanup/compare/v1.0.5...v1.1.0) (2026-02-07)


### Features

* align inputs and add TLS bypass option ([c70f571](https://github.com/LiquidLogicLabs/git-action-docker-cleanup/commit/c70f5717201cb4dee1e4645bc32c9d139126f988))

### [1.0.5](https://github.com/LiquidLogicLabs/git-action-docker-cleanup/compare/v1.0.4...v1.0.5) (2026-01-30)

### [1.0.4](https://github.com/LiquidLogicLabs/git-action-docker-cleanup/compare/v1.0.3...v1.0.4) (2026-01-30)

### [1.0.3](https://github.com/LiquidLogicLabs/git-action-docker-cleanup/compare/v1.0.2...v1.0.3) (2026-01-30)


### Bug Fixes

* **release:** verify only runtime bundle (index.js), allow .d.ts.map drift ([62c1262](https://github.com/LiquidLogicLabs/git-action-docker-cleanup/commit/62c1262a1a1a5ddc454dbb23a58fd69e9a74659d))

## [1.0.0] - TBD

### Added
- Initial implementation
- Multi-registry support (GHCR, Gitea, Docker Hub, Docker CLI)
- Auto-detection of registry type based on URL
- Provider pattern architecture for extensibility
- Support for multi-architecture images
- Support for OCI referrers and attestations (where supported)
- Flexible filtering options (tags, age, keep N latest, exclude patterns)
- Dry-run mode for testing
- Retry and throttle support for API calls
- Comprehensive logging with verbose mode
- Unit tests for core functionality
- CI/CD workflows following best practices
