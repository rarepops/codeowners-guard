import {
	fetchGitHubSyntaxIssues,
	type GitHubValidationOptions,
} from "./github-validator.js";
import { validateLocal } from "./local-validator.js";
import type { CheckName, ValidationIssue, ValidationStats } from "./model.js";
import { listTrackedFiles, loadCodeownersFile } from "./repository.js";

export interface RepositoryValidationOptions {
	repositoryPath: string;
	codeownersPath?: string;
	checks: ReadonlySet<CheckName>;
	exclude?: readonly string[];
	github?: GitHubValidationOptions;
}

export interface RepositoryValidationResult {
	codeownersPath: string;
	issues: ValidationIssue[];
	stats: ValidationStats;
}

export async function validateRepository(
	options: RepositoryValidationOptions,
): Promise<RepositoryValidationResult> {
	const localChecks = new Set(
		[...options.checks].filter((check) => check !== "syntax"),
	);
	const codeowners = await loadCodeownersFile(
		options.repositoryPath,
		options.codeownersPath,
	);
	const files =
		localChecks.size > 0 ? await listTrackedFiles(options.repositoryPath) : [];

	let syntaxIssues: ValidationIssue[] = [];
	if (options.checks.has("syntax")) {
		if (options.github === undefined) {
			throw new Error("The syntax check requires a GitHub repository");
		}
		syntaxIssues = await fetchGitHubSyntaxIssues(options.github);
	}

	const invalidLines = new Set(
		syntaxIssues
			.filter((issue) => normalizePath(issue.path) === codeowners.relativePath)
			.flatMap((issue) => (issue.line === undefined ? [] : [issue.line])),
	);
	const local = validateLocal({
		source: codeowners.source,
		codeownersPath: codeowners.relativePath,
		files,
		checks: localChecks,
		exclude: options.exclude ?? [],
		skipLines: invalidLines,
	});

	return {
		codeownersPath: codeowners.relativePath,
		issues: [...syntaxIssues, ...local.issues].sort(compareIssues),
		stats: local.stats,
	};
}

function normalizePath(path: string): string {
	return path.replaceAll("\\", "/").replace(/^\//u, "");
}

function compareIssues(left: ValidationIssue, right: ValidationIssue): number {
	return (
		left.path.localeCompare(right.path) ||
		(left.line ?? 0) - (right.line ?? 0) ||
		left.check.localeCompare(right.check) ||
		left.code.localeCompare(right.code)
	);
}
