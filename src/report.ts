import type { RepositoryValidationResult } from "./validate-repository.js";

export function formatTextReport(result: RepositoryValidationResult): string {
	const heading = `${result.issues.length} issue${result.issues.length === 1 ? "" : "s"} in ${result.codeownersPath}`;
	const details = result.issues.map((issue) => {
		const location = [issue.path, issue.line, issue.column].filter(
			(part) => part !== undefined,
		);
		return `${issue.severity.toUpperCase()} [${issue.check}] ${location.join(":")}: ${issue.message}`;
	});
	const stats = `${result.stats.files} files, ${result.stats.rules} rules, ${result.stats.matchedRules} matched rules`;

	return [heading, ...details, stats].join("\n");
}
