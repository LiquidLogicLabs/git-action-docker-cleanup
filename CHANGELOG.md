# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
