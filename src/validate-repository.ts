import {
	fetchGitHubSyntaxIssues,
	type GitHubValidationOptions,
} from "./github-validator.js";
import { validateLocal } from "./local-validator.js";
import {
	type CheckName,
	IssueCollector,
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
	maxIssues?: number;
}

export interface RepositoryValidationResult {
	codeownersPath: string;
	issues: ValidationIssue[];
	issueCount: number;
	errorCount: number;
	warningCount: number;
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
	if (options.checks.has("syntax") && options.codeownersPath !== undefined) {
		const effectiveCodeowners = await loadCodeownersFile(
			options.repositoryPath,
		);
		if (codeowners.absolutePath !== effectiveCodeowners.absolutePath) {
			throw new Error(
				"The syntax check can only validate GitHub's effective CODEOWNERS file; remove the explicit CODEOWNERS path or disable the syntax check",
			);
		}
	}
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
		...(options.maxIssues === undefined
			? {}
			: { maxIssues: options.maxIssues }),
		skipLines: invalidLines,
	});
	const issues = new IssueCollector(options.maxIssues ?? 1_000);
	for (const issue of syntaxIssues) {
		issues.add(issue);
	}
	issues.merge(local);

	return {
		codeownersPath: codeowners.relativePath,
		issues: issues.issues,
		issueCount: issues.issueCount,
		errorCount: issues.errorCount,
		warningCount: issues.warningCount,
		stats: local.stats,
	};
}
