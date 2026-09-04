## [2.0.5](https://github.com/LiquidLogicLabs/git-action-docker-cleanup/compare/v2.0.4...v2.0.5) (2026-09-04)


### Bug Fixes

* encode every value interpolated into an API URL path ([eff7d29](https://github.com/LiquidLogicLabs/git-action-docker-cleanup/commit/eff7d297eb5888e895029a9059ef69178fcba1f1))



## [2.0.4](https://github.com/LiquidLogicLabs/git-action-docker-cleanup/compare/v2.0.3...v2.0.4) (2026-09-04)


### Bug Fixes

* **lint:** quote eslint glob so all of src/ is linted ([baa072a](https://github.com/LiquidLogicLabs/git-action-docker-cleanup/commit/baa072ab4cc24c4ed671f3d9b3b037ef78939aab))
* refuse action inputs that docker would read as options ([56eeadc](https://github.com/LiquidLogicLabs/git-action-docker-cleanup/commit/56eeadcda1839bcccc7dc8f5b907ce9c2c2b7ad4))



## [2.0.3](https://github.com/LiquidLogicLabs/git-action-docker-cleanup/compare/v2.0.2...v2.0.3) (2026-07-05)



## [2.0.2](https://github.com/LiquidLogicLabs/git-action-docker-cleanup/compare/v2.0.1...v2.0.2) (2026-04-21)


### Bug Fixes

* correct action runtime to node24 ([18a8af6](https://github.com/LiquidLogicLabs/git-action-docker-cleanup/commit/18a8af619c383750af3a2c01bfb4b3f415ec447b))



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
