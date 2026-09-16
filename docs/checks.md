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

## Shadowed

The `shadowed` check reports a rule that matches tracked files but never takes effect, because later rules also match every one of those files and GitHub applies the last matching rule.

```text
/tools/      @devex
/tools/*.sh  @shell
```

When every tracked file under `tools/` ends in `.sh`, the first rule is shadowed. Partially overridden rules are normal layering and are not reported. The catch-all patterns `*`, `**`, and `/**` are never reported, because they exist to cover files added later.

When `duplicates` is enabled, an earlier rule that a later rule repeats exactly is left to the `duplicates` check. Files excluded with `exclude` or `--exclude` do not count. Findings describe the current tracked files, so a rule kept for files that do not exist yet can be reported until they do. The check is available starting with version `0.2.0`.

## Unowned

The `unowned` check reports a tracked file when no rule matches it or when its final matching rule has no owners. Matching is case-sensitive on every platform and the last matching rule wins.

```text
* @platform
/generated/
```

In this example, tracked files under `generated/` are explicitly unowned.

## Matching

Local checks and `--explain` apply GitHub's last-match-wins rule using a gitignore-compatible matcher, with two exceptions verified against GitHub's own matcher:

- A pattern that contains a slash and ends in a lone `*` matches files at that depth only. As GitHub documents, `docs/*` matches `docs/getting-started.md` but not `docs/build-app/troubleshooting.md`. Use `docs/` when a rule should cover nested files.
- A pattern containing an unescaped `[` or `]` matches nothing, because GitHub rejects the whole line. Write `\[` and `\]` to match brackets literally.

Every other pattern keeps gitignore behavior, including folder patterns such as `/build/logs/` and `apps/`. The `exclude` option always uses plain gitignore patterns.

## Invalid Lines

When syntax and local checks run together, lines rejected by GitHub are omitted from local matching. This prevents an invalid rule from creating misleading local results. Local-only runs cannot ask GitHub, so they detect the invalid form verified against GitHub: a pattern with an unescaped `[` or `]`. Such a rule matches nothing, and the `dangling` check reports it with the code `invalid-pattern`. Local-only runs assume every other parsed line is valid.

## Exclusions

`exclude` and `--exclude` take gitignore patterns, including negation. To check only some folders, exclude everything and re-include them:

```yaml
exclude: |
  /*
  !/src/
```

A nested folder needs each parent folder re-included first, as in `.gitignore`:

```yaml
exclude: |
  /*
  !/packages/
  /packages/*
  !/packages/api/
```

Re-including only `!/packages/api/` has no effect, because its parent folder stays excluded.

## Result Limits

The Action's `max-annotations` and the CLI's `--max-issues` limit retained details, not validation. Total issue, error, and warning counts remain exact, and omitted findings still affect the exit status.
