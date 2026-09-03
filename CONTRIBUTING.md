# Contributing to CODEOWNERS Guard

Thanks for your interest in CODEOWNERS Guard. Bug reports, validation ideas, and pull requests are welcome.

## Ways to help

- **Report a bug**: include a minimal CODEOWNERS file, the tracked paths involved, the expected result, and the actual output.
- **Suggest a check**: explain the repository risk it catches and whether the finding should be an error or a warning.
- **Send a pull request**: open an issue first for behavior or public-interface changes so the contract can be agreed before implementation.

## Development setup

Install Node.js 22 or newer, then clone, install, and validate:

```shell
git clone git@github.com:rarepops/codeowners-guard.git
cd codeowners-guard
npm ci
npm run check
```

## Project layout

- `src/parser.ts` reads CODEOWNERS rules without attempting to replace GitHub's syntax authority.
- `src/matcher.ts` implements last-match-wins ownership over a gitignore-compatible matcher.
- `src/local-validator.ts` owns duplicate, dangling-pattern, and unowned-file checks.
- `src/github-validator.ts` maps GitHub's CODEOWNERS diagnostics into the shared issue model.
- `src/action.ts` and `src/cli.ts` expose the same core through GitHub Actions and the command line.
- `test/` contains unit, metadata, repository, Action-contract, and packaged-CLI tests.

## Pull requests

- Keep behavior changes covered by focused tests.
- Run `npm run format` before submitting a change.
- Run `npm run check` before submitting a change.
- Run `npm run build` and include changes under `dist/`.
- Keep Action inputs and outputs synchronized between `action.yml` and the README.
- Do not weaken workflow permissions or replace immutable action pins without explaining why.

## Validation semantics

GitHub's CODEOWNERS API is authoritative for syntax diagnostics. Local matching behavior should be backed by a conformance test before it is changed. New checks should have a stable code, a documented severity, and deterministic output ordering.

## Conventions

- **Core behavior is test-first.** Add the smallest failing test before changing parsing, matching, or issue classification.
- **Commits use Conventional Commits.** Use prefixes such as `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `build:`, or `ci:`.
- **Generated bundles are reviewed artifacts.** GitHub executes `dist/index.cjs` directly, so source changes and rebuilt bundles belong in the same commit.
- **Runtime compatibility is deliberate.** Node.js 22 is the CLI floor, while GitHub runs the Action bundle on Node.js 24.

## Releases

Releases are cut by the maintainer from `main`. Update the version and changelog, rebuild `dist/`, then push a `vX.Y.Z` tag that exactly matches `package.json`. The release workflow validates the project, creates an installable CLI tarball and checksum file, and publishes both to GitHub Releases.

Running the release workflow manually builds the same artifacts for inspection without publishing a release.

## License

CODEOWNERS Guard is source-available under [PolyForm Perimeter 1.0.1](LICENSE.md). By submitting a contribution, you agree that it is provided under that same license and may be included in the project.
