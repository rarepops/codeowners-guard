import { describe, expect, it } from "vitest";

import { compileRules, findOwningRule } from "../src/matcher.js";
import type { CodeownersRule } from "../src/parser.js";

function rule(line: number, pattern: string, owners: string[]): CodeownersRule {
	return { line, pattern, owners };
}

describe("CODEOWNERS matching", () => {
	it.each([
		["*.md", "README.md"],
		["*.md", "docs/guide.md"],
		["/docs/", "docs/guide.md"],
		["/docs/", "docs/nested/guide.md"],
		["docs/**/generated.*", "docs/api/v2/generated.json"],
		["/docs\\ and\\ guides/", "docs and guides/start.md"],
	])("matches %s against %s", (pattern, path) => {
		const [compiled] = compileRules([rule(1, pattern, ["@owner"])]);

		expect(compiled?.matches(path)).toBe(true);
	});

	it.each([
		["/docs/", "packages/docs/guide.md"],
		["/src/*.ts", "src/nested/app.ts"],
		["*.md", "README.txt"],
	])("does not match %s against %s", (pattern, path) => {
		const [compiled] = compileRules([rule(1, pattern, ["@owner"])]);

		expect(compiled?.matches(path)).toBe(false);
	});

	it("uses the last matching rule, including ownerless rules", () => {
		const compiled = compileRules([
			rule(1, "*", ["@default"]),
			rule(2, "/docs/", ["@docs"]),
			rule(3, "/docs/private/", []),
		]);

		expect(findOwningRule(compiled, "src/app.ts")?.owners).toEqual([
			"@default",
		]);
		expect(findOwningRule(compiled, "docs/guide.md")?.owners).toEqual([
			"@docs",
		]);
		expect(findOwningRule(compiled, "docs/private/plan.md")?.owners).toEqual(
			[],
		);
	});

	it("normalizes Windows paths", () => {
		const compiled = compileRules([rule(1, "/src/", ["@engineering"])]);

		expect(findOwningRule(compiled, "src\\nested\\app.ts")?.owners).toEqual([
			"@engineering",
		]);
	});
});
