import ignore from "ignore";

import { compileRules } from "./matcher.js";
import {
	type CheckName,
	compareValidationIssues,
	type ValidationIssue,
	type ValidationResult,
} from "./model.js";
import type { CodeownersRule } from "./parser.js";
import { findDuplicatePatterns, parseCodeowners } from "./parser.js";
import { normalizeRepositoryPath } from "./path.js";

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
	const checksDangling = options.checks.has("dangling");
	const checksUnowned = options.checks.has("unowned");
	const checksFiles = checksDangling || checksUnowned;
	const compiledRules = checksFiles ? compileRules(rules) : [];
	const files = checksFiles
		? filterFiles(options.files, options.exclude ?? [])
		: [];
	const matchedRules = new Uint8Array(rules.length);
	let matchedRuleCount = 0;
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
		let owningRule: CodeownersRule | undefined;
		if (checksFiles) {
			for (let index = 0; index < compiledRules.length; index += 1) {
				const rule = compiledRules[index];
				if (rule?.matches(file)) {
					if (matchedRules[index] === 0) {
						matchedRules[index] = 1;
						matchedRuleCount += 1;
					}
					if (checksUnowned) {
						owningRule = rule.rule;
					}
				}
			}
		}

		if (checksUnowned) {
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

	if (checksDangling) {
		for (let index = 0; index < rules.length; index += 1) {
			const rule = rules[index];
			if (rule !== undefined && matchedRules[index] === 0) {
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
		issues: issues.sort(compareValidationIssues),
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
