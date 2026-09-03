import { escapeTerminalText } from "./display.js";
import type { ValidationIssue } from "./model.js";
import type { RepositoryValidationResult } from "./validate-repository.js";

export function formatTextReport(result: RepositoryValidationResult): string {
	const heading = `${result.issueCount} issue${result.issueCount === 1 ? "" : "s"} in ${escapeTerminalText(result.codeownersPath)}`;
	const details = result.issues.map((issue) => {
		const location = [escapeTerminalText(issue.path), issue.line, issue.column]
			.filter((part) => part !== undefined)
			.join(":");
		return `${issue.severity.toUpperCase()} [${issue.check}] ${location}: ${escapeTerminalText(formatIssueMessage(issue))}`;
	});
	const stats = `${result.stats.files} files, ${result.stats.rules} rules, ${result.stats.matchedRules} matched rules`;
	const omitted = result.issueCount - result.issues.length;

	return [
		heading,
		...details,
		...(omitted > 0
			? [`${omitted} additional issue${omitted === 1 ? "" : "s"} omitted`]
			: []),
		stats,
	].join("\n");
}

export function formatIssueMessage(issue: ValidationIssue): string {
	return issue.suggestion === undefined
		? issue.message
		: `${issue.message} Suggestion: ${issue.suggestion}`;
}
