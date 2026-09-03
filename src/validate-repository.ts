import {
	fetchGitHubSyntaxIssues,
	type GitHubValidationOptions,
} from "./github-validator.js";
import { validateLocal } from "./local-validator.js";
import {
	type CheckName,
	compareValidationIssues,
	type ValidationIssue,
	type ValidationStats,
} from "./model.js";
import { normalizeRepositoryPath } from "./path.js";
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
	const needsFiles = localChecks.has("dangling") || localChecks.has("unowned");
	let syntaxPromise: Promise<ValidationIssue[]> = Promise.resolve([]);
	if (options.checks.has("syntax")) {
		if (options.github === undefined) {
			throw new Error("The syntax check requires a GitHub repository");
		}
		syntaxPromise = fetchGitHubSyntaxIssues(options.github);
	}
	const filesPromise = needsFiles
		? listTrackedFiles(options.repositoryPath)
		: Promise.resolve([]);
	const [syntaxIssues, files] = await Promise.all([
		syntaxPromise,
		filesPromise,
	]);

	const invalidLines = new Set(
		syntaxIssues
			.filter(
				(issue) =>
					normalizeRepositoryPath(issue.path) === codeowners.relativePath,
			)
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
		issues: [...syntaxIssues, ...local.issues].sort(compareValidationIssues),
		stats: local.stats,
	};
}
