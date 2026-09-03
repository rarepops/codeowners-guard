import ignore from "ignore";

import { compileRules, findOwningRule } from "./matcher.js";
import type { CheckName, ValidationIssue, ValidationResult } from "./model.js";
import { findDuplicatePatterns, parseCodeowners } from "./parser.js";

export interface LocalValidationOptions {
	source: string;
	codeownersPath: string;
	files: readonly string[];
	checks: ReadonlySet<CheckName>;
	exclude?: readonly string[];
	skipLines?: ReadonlySet<number>;
}

export function validateLocal(
	options: LocalValidationOptions,
): ValidationResult {
	const skipLines = options.skipLines ?? new Set<number>();
	const rules = parseCodeowners(options.source).filter(
		(rule) => !skipLines.has(rule.line),
	);
	const compiledRules = compileRules(rules);
	const files = filterFiles(options.files, options.exclude ?? []);
	const matchedRuleIndexes = new Set<number>();
	const issues: ValidationIssue[] = [];

	if (options.checks.has("duplicates")) {
		issues.push(
			...findDuplicatePatterns(rules).map((duplicate) => ({
				check: "duplicates" as const,
				code: "duplicate-pattern",
				severity: "warning" as const,
				path: options.codeownersPath,
				line: duplicate.line,
				message: duplicate.message,
			})),
		);
	}

	for (const file of files) {
		for (const [index, rule] of compiledRules.entries()) {
			if (rule.matches(file)) {
				matchedRuleIndexes.add(index);
			}
		}

		if (options.checks.has("unowned")) {
			const owningRule = findOwningRule(compiledRules, file);
			if (owningRule === undefined || owningRule.owners.length === 0) {
				issues.push({
					check: "unowned",
					code: "unowned-file",
					severity: "warning",
					path: file,
					message:
						owningRule === undefined
							? "File is not matched by any CODEOWNERS rule"
							: `File is explicitly unowned by the rule on line ${owningRule.line}`,
				});
			}
		}
	}

	if (options.checks.has("dangling")) {
		for (const [index, rule] of rules.entries()) {
			if (!matchedRuleIndexes.has(index)) {
				issues.push({
					check: "dangling",
					code: "dangling-pattern",
					severity: "warning",
					path: options.codeownersPath,
					line: rule.line,
					message: `Pattern ${JSON.stringify(rule.pattern)} does not match a tracked file`,
				});
			}
		}
	}

	return {
		issues: issues.sort(compareIssues),
		stats: {
			files: files.length,
			rules: rules.length,
			matchedRules: matchedRuleIndexes.size,
		},
	};
}

function filterFiles(
	files: readonly string[],
	exclusions: readonly string[],
): string[] {
	const exclude = ignore().add(exclusions);

	return [...new Set(files.map(normalizePath))]
		.filter((path) => path !== "" && !exclude.ignores(path))
		.sort();
}

function normalizePath(path: string): string {
	return path.replaceAll("\\", "/").replace(/^\.\//u, "");
}

function compareIssues(left: ValidationIssue, right: ValidationIssue): number {
	return (
		left.path.localeCompare(right.path) ||
		(left.line ?? 0) - (right.line ?? 0) ||
		left.code.localeCompare(right.code)
	);
}
