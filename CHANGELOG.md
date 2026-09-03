# Changelog

All notable changes to this project will be documented in this file.

## 0.1.0 - 2026-09-03

### Added

- Native Node.js 24 GitHub Action.
- GitHub-authoritative CODEOWNERS syntax diagnostics.
- Duplicate pattern, dangling pattern, and unowned file checks.
- Cross-platform CLI with text and JSON output.
- Security-hardened CI and release workflows with dependency review, signature verification, checksums, and artifact attestations.

### Changed

- Require Node.js 24 for both the CLI and Action development baseline.
- Match CODEOWNERS paths case-sensitively on every operating system.
- Stream tracked Git paths and evaluate local ownership checks in a single pass.

### Security

- Prevent API token redirects by trusting only the runner-provided Action API endpoint.
- Bound GitHub responses and request duration, reject unsafe workspace and CODEOWNERS symlinks, and sanitize displayed untrusted text.

### License

- Licensed under the PolyForm Perimeter License 1.0.1.
