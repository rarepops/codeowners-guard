# Troubleshooting

## GitHub Reports 404

Confirm that the repository uses `owner/name`, the selected ref exists, and that ref contains a CODEOWNERS file in `.github/`, the repository root, or `docs/`. For a private repository, ensure the token can read repository contents.

## GitHub Reports 401 or 403

Check that `GITHUB_TOKEN` or `GH_TOKEN` is valid and has read access. In Actions, grant `contents: read`. A `403` can also indicate rate limiting.

CODEOWNERS Guard retries `429`, `502`, `503`, and `504` responses up to three total attempts. It honors `Retry-After` up to 10 seconds. Other HTTP failures are not retried.

## Local and GitHub Results Differ

The syntax check targets the configured GitHub ref, while local checks inspect the checked-out Git index. Check out the same commit passed through `ref`, and stage newly added files before running local checks.

## A Rule Is Unexpectedly Dangling

Check pattern capitalization and exclusions. Matching is case-sensitive, and excluded files cannot satisfy a dangling rule. Use `git ls-files --cached` to inspect the exact local file set.

## A CODEOWNERS File Is Not Found

Without an explicit path, Guard searches `.github/CODEOWNERS`, `CODEOWNERS`, then `docs/CODEOWNERS`. File names are case-sensitive. Symbolic links are rejected to keep reads within the checked-out workspace.

## Too Many Findings Are Omitted

Increase the Action's `max-annotations` up to 100 or the CLI's `--max-issues` up to 10,000. Counts and failure status always include omitted findings.

## Exit Codes

| Code | Meaning |
| --- | --- |
| `0` | Validation passed at the selected `fail-on` threshold |
| `1` | Findings reached the selected failure threshold |
| `2` | Validation could not run because of configuration, repository, Git, filesystem, or API failure |