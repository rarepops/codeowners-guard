export const checkNames = [
	"syntax",
	"duplicates",
	"dangling",
	"unowned",
] as const;

export type CheckName = (typeof checkNames)[number];
export type Severity = "error" | "warning";

export interface ValidationIssue {
	check: CheckName;
	code: string;
	severity: Severity;
	path: string;
	line?: number;
	column?: number;
	message: string;
	suggestion?: string;
}

export interface ValidationStats {
	files: number;
	rules: number;
	matchedRules: number;
}

export interface ValidationResult {
	issues: ValidationIssue[];
	stats: ValidationStats;
}

export function shouldFail(
	issues: readonly ValidationIssue[],
	failOn: Severity,
): boolean {
	return issues.some(
		(issue) => failOn === "warning" || issue.severity === "error",
	);
}

export function compareValidationIssues(
	left: ValidationIssue,
	right: ValidationIssue,
): number {
	return (
		compareText(left.path, right.path) ||
		(left.line ?? 0) - (right.line ?? 0) ||
		compareText(left.check, right.check) ||
		compareText(left.code, right.code)
	);
}

function compareText(left: string, right: string): number {
	return left === right ? 0 : left < right ? -1 : 1;
}
