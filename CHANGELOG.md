# Changelog

All notable changes to this project will be documented in this file.

## 0.2.0 - 2026-09-16

### Added

- `shadowed` check reporting CODEOWNERS rules that match tracked files but never take effect, because later rules override every one of those files.
- GitHub App token guidance for the Action's `github-token` input.
- Documentation for running local checks on selected folders with negated `exclude` patterns.

### Changed

- Run the `shadowed` check by default in the Action and the CLI.

### Fixed

- Match patterns that end in a lone `*`, such as `docs/*`, only against files at that depth, as GitHub does. Files in subfolders are no longer treated as owned, so `unowned` and `dangling` can report new findings; use `docs/` when a rule should cover nested files.
- Treat patterns containing an unescaped `[` or `]` as matching nothing, as GitHub does, and report them as `invalid-pattern` in local-only runs.

## 0.1.3 - 2026-09-07

### Added

- Local CLI ownership explanations with matching rule lines, last-match-wins ownership, ownerless overrides, and text or JSON output.
- Read-only post-publication verification of artifact identity, checksums, release-bound provenance, npm signatures, and installed CLI behavior under Node.js 24.

## 0.1.2 - 2026-09-04

### Added

- Version-pinned feature comparison with other CODEOWNERS validation tools.

### Changed

- Reject extra CLI repository-path arguments instead of silently ignoring them.
- Document that the CLI defaults to local checks without `syntax`.

### Fixed

- Prevent GitHub syntax diagnostics from being combined with local checks for a different explicitly selected CODEOWNERS file.

## 0.1.1 - 2026-09-03

### Added

- Deterministic third-party notices generated from the packages embedded in release bundles.
- OIDC trusted publishing of validated release tarballs to npm.
- V8 coverage reporting with enforced global thresholds.
- Check semantics, troubleshooting guidance, and a least-privilege workflow example.
- Project branding in the README and npm package.

### Changed

- Bound retained issue details while preserving exact issue counts and failure behavior.
- Retry GitHub `429`, `502`, `503`, and `504` responses with capped backoff and `Retry-After` support.
- Add the CLI `--max-issues` option, with a default of 1,000 and maximum of 10,000.

### Fixed

- Align CLI help output and separate environment-variable guidance from option descriptions.
- Name `max-issues` correctly in CLI validation errors.

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
