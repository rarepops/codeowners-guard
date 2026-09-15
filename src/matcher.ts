import ignore from "ignore";
import type { CodeownersRule } from "./parser.js";
import { normalizeRepositoryPath } from "./path.js";
import { analyzePattern, compileExactPattern } from "./pattern.js";

export interface CompiledRule {
	rule: CodeownersRule;
	matches(path: string): boolean;
}

export function compileRules(rules: readonly CodeownersRule[]): CompiledRule[] {
	return rules.map((rule) => {
		const syntax = analyzePattern(rule.pattern);
		if (syntax.invalid) {
			return { rule, matches: () => false };
		}
		if (syntax.endsWithLoneStar) {
			const exact = compileExactPattern(rule.pattern);
			return { rule, matches: (path: string) => exact.test(path) };
		}

		const matcher = ignore({ ignorecase: false }).add(rule.pattern);

		return {
			rule,
			matches: (path: string) => matcher.ignores(path),
		};
	});
}

export function findOwningRule(
	rules: readonly CompiledRule[],
	path: string,
): CodeownersRule | undefined {
	const normalizedPath = normalizeRepositoryPath(path);
	for (let index = rules.length - 1; index >= 0; index -= 1) {
		const rule = rules[index];
		if (rule?.matches(normalizedPath)) {
			return rule.rule;
		}
	}

	return undefined;
}
