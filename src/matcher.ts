import ignore, { type Ignore } from "ignore";

import type { CodeownersRule } from "./parser.js";

export interface CompiledRule {
	rule: CodeownersRule;
	matches(path: string): boolean;
}

export function compileRules(rules: readonly CodeownersRule[]): CompiledRule[] {
	return rules.map((rule) => {
		const matcher = ignore().add(rule.pattern);

		return {
			rule,
			matches: (path: string) => matches(matcher, path),
		};
	});
}

export function findOwningRule(
	rules: readonly CompiledRule[],
	path: string,
): CodeownersRule | undefined {
	for (let index = rules.length - 1; index >= 0; index -= 1) {
		const rule = rules[index];
		if (rule?.matches(path)) {
			return rule.rule;
		}
	}

	return undefined;
}

function matches(matcher: Ignore, path: string): boolean {
	const normalizedPath = path.replaceAll("\\", "/").replace(/^\.\//u, "");
	return matcher.ignores(normalizedPath);
}
