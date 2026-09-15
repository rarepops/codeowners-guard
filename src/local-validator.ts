import ignore from "ignore";

import { compileRules } from "./matcher.js";
import {
	type CheckName,
	IssueCollector,
	type ValidationResult,
} from "./model.js";
import {
	findDuplicatePatterns,
	findRulesRepeatedLater,
	parseCodeowners,
} from "./parser.js";
import { normalizeRepositoryPath } from "./path.js";
import { analyzePattern } from "./pattern.js";
import {
	formatShadowedMessage,
	isCatchAllPattern,
	ShadowTracker,
	shadowedRuleSuggestion,
} from "./shadowing.js";

export interface LocalValidationOptions {
	source: string;
	codeownersPath: string;
	files: readonly string[];
	checks: ReadonlySet<CheckName>;
	exclude?: readonly string[];
	maxIssues?: number;
	skipLines?: ReadonlySet<number>;
}

export function validateLocal(
	options: LocalValidationOptions,
): ValidationResult {
	const skipLines = options.skipLines ?? new Set<number>();
	const rules = parseCodeowners(options.source).filter(
		(rule) => !skipLines.has(rule.line),
	);
	const checksDuplicates = options.checks.has("duplicates");
	const checksDangling = options.checks.has("dangling");
	const checksShadowed = options.checks.has("shadowed");
	const checksUnowned = options.checks.has("unowned");
	const checksFiles = checksDangling || checksShadowed || checksUnowned;
	const compiledRules = checksFiles ? compileRules(rules) : [];
	const files = checksFiles
		? filterFiles(options.files, options.exclude ?? [])
		: [];
	const matchedRules = new Uint8Array(rules.length);
	let matchedRuleCount = 0;
	const shadowTracker = checksShadowed
		? new ShadowTracker(rules.length)
		: undefined;
	const matchedIndices: number[] = [];
	const issues = new IssueCollector(options.maxIssues ?? 1_000);

	if (checksDuplicates) {
		for (const duplicate of findDuplicatePatterns(rules)) {
			issues.add({
				check: "duplicates" as const,
				code: "duplicate-pattern",
				severity: "warning" as const,
				path: options.codeownersPath,
				line: duplicate.line,
				message: duplicate.message,
			});
		}
	}

	for (const file of files) {
		let owningIndex = -1;
		matchedIndices.length = 0;
		for (let index = 0; index < compiledRules.length; index += 1) {
			if (compiledRules[index]?.matches(file)) {
				if (matchedRules[index] === 0) {
					matchedRules[index] = 1;
					matchedRuleCount += 1;
				}
				owningIndex = index;
				if (shadowTracker !== undefined) {
					matchedIndices.push(index);
				}
			}
		}
		shadowTracker?.observe(matchedIndices);

		if (checksUnowned) {
			const owningRule = rules[owningIndex];
			if (owningRule === undefined || owningRule.owners.length === 0) {
				issues.add({
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

	if (checksDangling) {
		for (let index = 0; index < rules.length; index += 1) {
			const rule = rules[index];
			if (rule !== undefined && matchedRules[index] === 0) {
				const pattern = JSON.stringify(rule.pattern);
				const invalid = analyzePattern(rule.pattern).invalid;
				issues.add({
					check: "dangling",
					code: invalid ? "invalid-pattern" : "dangling-pattern",
					severity: "warning",
					path: options.codeownersPath,
					line: rule.line,
					message: invalid
						? `Pattern ${pattern} is rejected by GitHub: escape [ and ] with a backslash`
						: `Pattern ${pattern} does not match a tracked file`,
				});
			}
		}
	}

	if (shadowTracker !== undefined) {
		const repeatedLater = checksDuplicates
			? findRulesRepeatedLater(rules)
			: new Set<number>();
		for (const shadowed of shadowTracker.shadowedRules()) {
			const rule = rules[shadowed.index];
			if (
				rule === undefined ||
				isCatchAllPattern(rule.pattern) ||
				repeatedLater.has(shadowed.index)
			) {
				continue;
			}
			issues.add({
				check: "shadowed",
				code: "shadowed-rule",
				severity: "warning",
				path: options.codeownersPath,
				line: rule.line,
				message: formatShadowedMessage(
					rule.pattern,
					shadowed.matchedFiles,
					shadowed.overridingIndices.flatMap((index) => {
						const overriding = rules[index];
						return overriding === undefined ? [] : [overriding.line];
					}),
				),
				suggestion: shadowedRuleSuggestion,
			});
		}
	}

	return {
		issues: issues.issues,
		issueCount: issues.issueCount,
		errorCount: issues.errorCount,
		warningCount: issues.warningCount,
		stats: {
			files: files.length,
			rules: rules.length,
			matchedRules: matchedRuleCount,
		},
	};
}

function filterFiles(
	files: readonly string[],
	exclusions: readonly string[],
): string[] {
	const exclude =
		exclusions.length === 0
			? undefined
			: ignore({ ignorecase: false }).add(exclusions);
	const seen = new Set<string>();
	const filtered: string[] = [];

	for (const file of files) {
		const path = normalizeRepositoryPath(file);
		if (path === "" || seen.has(path) || exclude?.ignores(path)) {
			continue;
		}
		seen.add(path);
		filtered.push(path);
	}

	return filtered.sort();
}
