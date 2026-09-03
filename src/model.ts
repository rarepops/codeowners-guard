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
	issueCount: number;
	errorCount: number;
	warningCount: number;
	stats: ValidationStats;
}

export function shouldFail(
	result: Pick<ValidationResult, "errorCount" | "warningCount">,
	failOn: Severity,
): boolean {
	return (
		result.errorCount > 0 || (failOn === "warning" && result.warningCount > 0)
	);
}

export class IssueCollector {
	readonly issues: ValidationIssue[] = [];
	issueCount = 0;
	errorCount = 0;
	warningCount = 0;

	constructor(private readonly limit: number) {
		if (!Number.isSafeInteger(limit) || limit < 0) {
			throw new Error("Issue retention limit must be a non-negative integer");
		}
	}

	add(issue: ValidationIssue): void {
		this.issueCount += 1;
		if (issue.severity === "error") {
			this.errorCount += 1;
		} else {
			this.warningCount += 1;
		}
		this.insert(issue);
	}

	merge(
		result: Pick<
			ValidationResult,
			"issues" | "issueCount" | "errorCount" | "warningCount"
		>,
	): void {
		this.issueCount += result.issueCount;
		this.errorCount += result.errorCount;
		this.warningCount += result.warningCount;
		for (const issue of result.issues) {
			this.insert(issue);
		}
	}

	private insert(issue: ValidationIssue): void {
		if (this.limit === 0) {
			return;
		}

		let low = 0;
		let high = this.issues.length;
		while (low < high) {
			const middle = (low + high) >>> 1;
			const candidate = this.issues[middle];
			if (
				candidate !== undefined &&
				compareValidationIssues(candidate, issue) <= 0
			) {
				low = middle + 1;
			} else {
				high = middle;
			}
		}

		if (low < this.limit) {
			this.issues.splice(low, 0, issue);
			if (this.issues.length > this.limit) {
				this.issues.pop();
			}
		}
	}
}

export function compareValidationIssues(
	left: ValidationIssue,
	right: ValidationIssue,
): number {
	return (
		severityRank(left.severity) - severityRank(right.severity) ||
		compareText(left.path, right.path) ||
		(left.line ?? 0) - (right.line ?? 0) ||
		compareText(left.check, right.check) ||
		compareText(left.code, right.code)
	);
}

function severityRank(severity: Severity): number {
	return severity === "error" ? 0 : 1;
}

function compareText(left: string, right: string): number {
	return left === right ? 0 : left < right ? -1 : 1;
}
