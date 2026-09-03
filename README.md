# CODEOWNERS Guard

[![CI](https://github.com/rarepops/codeowners-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/rarepops/codeowners-guard/actions/workflows/ci.yml)
[![CodeQL](https://github.com/rarepops/codeowners-guard/actions/workflows/codeql.yml/badge.svg)](https://github.com/rarepops/codeowners-guard/actions/workflows/codeql.yml)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: PolyForm Perimeter 1.0.0](https://img.shields.io/badge/license-PolyForm%20Perimeter%201.0.0-2f6f5e)](LICENSE)

Fast, GitHub-native validation for the CODEOWNERS file that GitHub will actually use.

CODEOWNERS Guard combines GitHub's own diagnostics with local repository checks. It runs as a native Node.js action, so it works on Linux, macOS, and Windows without pulling a container image.

## Checks

| Check | What it reports | Severity |
| --- | --- | --- |
| `syntax` | Errors returned by GitHub's CODEOWNERS API for the selected ref | Error |
| `duplicates` | A pattern that appears more than once | Warning |
| `dangling` | A pattern that matches no tracked file | Warning |
| `unowned` | A tracked file with no effective owner, including files cleared by an ownerless rule | Warning |

Rules use GitHub's last-match-wins behavior. CODEOWNERS Guard searches the standard locations in GitHub's order: `.github/CODEOWNERS`, `CODEOWNERS`, then `docs/CODEOWNERS`.

## GitHub Action

```yaml
name: CODEOWNERS

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: rarepops/codeowners-guard@v0.1.0
        with:
          checks: syntax,duplicates,dangling,unowned
          exclude: |
            dist/
            coverage/
```

For the strongest supply-chain pinning, replace `v0.1.0` with its full commit SHA.

The action adds file annotations and a job summary. Its default token is `${{ github.token }}`, and the workflow only needs `contents: read`.

### Inputs

| Input | Default | Description |
| --- | --- | --- |
| `github-token` | `${{ github.token }}` | Token used for GitHub diagnostics |
| `path` | `.` | Repository path relative to `GITHUB_WORKSPACE` |
| `codeowners` | auto-detect | Explicit CODEOWNERS path |
| `checks` | all checks | Comma-separated checks |
| `exclude` | none | Newline-separated gitignore patterns omitted from local checks |
| `repository` | `${{ github.repository }}` | Repository in `owner/name` form |
| `ref` | `${{ github.sha }}` | Branch, tag, or commit used by the syntax check |
| `github-api-url` | `${{ github.api_url }}` | GitHub API URL, including GitHub Enterprise Server |
| `fail-on` | `warning` | Failure threshold: `warning` or `error` |
| `max-annotations` | `50` | Maximum workflow annotations and summary rows |

### Outputs

The action returns `valid`, `issue-count`, `error-count`, and `warning-count`.

## CLI

Build and run the CLI locally:

```shell
npm ci
npm run build
node dist/cli.js .
```

Local checks require no network access:

```shell
node dist/cli.js . \
  --checks duplicates,dangling,unowned \
  --exclude dist/ \
  --format json
```

GitHub's syntax check validates a committed branch, tag, or SHA:

```shell
GITHUB_TOKEN=ghp_example node dist/cli.js . \
  --checks syntax,duplicates,dangling,unowned \
  --repository owner/repository \
  --ref main
```

Use `--fail-on error` to report local warnings without returning a failing exit status. Exit code `1` means validation failed, and exit code `2` means the command could not run.

## Design

GitHub remains the authority for syntax diagnostics. Local checks operate on files returned by `git ls-files`, use a maintained gitignore-compatible matcher, and do not make separate user or team lookup calls. This keeps the Action small and avoids maintaining a second copy of GitHub's owner-resolution behavior.

The syntax check targets `ref`, while local checks target the checked-out working tree. In normal Actions usage both refer to the same commit. For uncommitted local changes, run local checks only or push the change to a ref before requesting GitHub diagnostics.

## Development

Requires Node.js 22 or newer.

```shell
npm ci
npm run check
```

`dist/` is committed because GitHub executes JavaScript actions directly from the repository. CI rejects source changes that do not include a rebuilt bundle.

## License

CODEOWNERS Guard is source-available under the [PolyForm Perimeter License 1.0.0](LICENSE). The license permits use, modification, and redistribution, but does not permit using the software to provide a competing product. Review the license terms before adopting or redistributing the project.
