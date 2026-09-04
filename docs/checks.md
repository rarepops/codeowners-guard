# Check Reference

CODEOWNERS Guard separates GitHub diagnostics from checks against the local Git index. This distinction matters when the checked-out files and the selected GitHub ref differ.

## Syntax

The `syntax` check calls GitHub's CODEOWNERS errors endpoint for the configured repository and ref. GitHub decides whether patterns and owners are valid. A token is normally required for private repositories.

GitHub's endpoint validates the effective CODEOWNERS file from its standard locations and does not accept an arbitrary file path. When an explicit `codeowners` or `--codeowners` path is combined with `syntax`, it must resolve to the same effective file in the checkout. Use local checks without `syntax` to validate an alternate file.

The Action validates `${{ github.sha }}` by default. The CLI requires `--repository owner/name` and reads a token from `GITHUB_TOKEN` or `GH_TOKEN`. It does not accept tokens as command-line arguments.

## Duplicates

The `duplicates` check reports each repeated pattern after its first occurrence. Owner lists are not considered, so these rules are duplicates:

```text
/docs/ @docs
/docs/ @writers
```

GitHub uses the last matching rule, which can make an earlier duplicate misleading even when ownership is unchanged.

## Dangling

The `dangling` check reports rules that match no tracked file. Files excluded with `exclude` or `--exclude` do not satisfy a rule, so a rule that only matches excluded files is reported as dangling.

Only paths returned by `git ls-files --cached` are considered. Untracked files are intentionally ignored.

## Unowned

The `unowned` check reports a tracked file when no rule matches it or when its final matching rule has no owners. Matching is case-sensitive on every platform and the last matching rule wins.

```text
* @platform
/generated/
```

In this example, tracked files under `generated/` are explicitly unowned.

## Invalid Lines

When syntax and local checks run together, lines rejected by GitHub are omitted from local matching. This prevents an invalid rule from creating misleading local results. Local-only runs assume every parsed line is valid.

## Result Limits

The Action's `max-annotations` and the CLI's `--max-issues` limit retained details, not validation. Total issue, error, and warning counts remain exact, and omitted findings still affect the exit status.
