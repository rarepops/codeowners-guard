import { describe, expect, it } from "vitest";

import { compileRules, findOwningRule } from "../src/matcher.js";
import { type CodeownersRule, parseCodeowners } from "../src/parser.js";

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

	it("matches paths case-sensitively on every operating system", () => {
		const compiled = compileRules([rule(1, "/src/", ["@engineering"])]);

		expect(findOwningRule(compiled, "src/app.ts")?.owners).toEqual([
			"@engineering",
		]);
		expect(findOwningRule(compiled, "Src/app.ts")).toBeUndefined();
	});
});

// GitHub's real matcher, probed on 2026-09-15 through the conformance-matcher
// branch of rarepops/codeowners-guard-integration (commits ffc4f3b, dd2c2fc,
// 3b4531a). GitHub rejects lines 12 and 30 as invalid patterns.
const githubFixture = [
	"* @rarepops",
	"/* @rarepops",
	"c1/* @rarepops",
	"/c3/*.d @rarepops",
	"*.mdx @rarepops",
	"/c5/** @rarepops",
	"**/logs6 @rarepops",
	"/c7 @rarepops",
	"c8/ @rarepops",
	"/c9/ @rarepops",
	"!/c9/keep.txt @rarepops",
	"/c10/[ab].txt @rarepops",
	"\\#c11.txt @rarepops",
	"/c12/Readme.txt @rarepops",
	"/c13/**/deep.txt @rarepops",
	"c14/*/ @rarepops",
	"/c15/*/leaf.txt @rarepops",
	"/c16/file?.txt @rarepops",
	"c18name @rarepops",
	"/c19/x* @rarepops",
	"/c20/? @rarepops",
	"/c21/*/* @rarepops",
	"c22/**/* @rarepops",
	"/c23/\\[ab\\].txt @rarepops",
	"!c24bang.txt @rarepops",
	"/c25/* @rarepops",
	"/c27/*.d/ @rarepops",
	"c28/* @rarepops",
	"**/c29/* @rarepops",
	"/c30/a]b.txt @rarepops",
	"*/c31/* @rarepops",
].join("\n");

const githubWinners: Array<[number, string, number]> = [
	[1, "root.txt", 2],
	[1, "c2/nested.txt", 1],
	[1, "c1/direct.txt", 3],
	[1, "c1/sub/nested.txt", 1],
	[1, "c3/app.d", 4],
	[1, "c3/conf.d/inner.txt", 4],
	[1, "c4/readme.mdx", 5],
	[1, "c4/folder.mdx/inner.txt", 5],
	[1, "c5/a.txt", 6],
	[1, "c5/x/y/z.txt", 6],
	[1, "c6/deep/logs6/app.log", 7],
	[1, "c7/file.txt", 8],
	[1, "c7/sub/file.txt", 8],
	[1, "nest/c8/file.txt", 9],
	[1, "c9/keep.txt", 10],
	[1, "c9/other.txt", 10],
	[1, "c10/a.txt", 1],
	[1, "c10/[ab].txt", 1],
	[1, "#c11.txt", 13],
	[1, "c12/README.txt", 1],
	[1, "c13/deep.txt", 15],
	[1, "c13/a/b/deep.txt", 15],
	[1, "c14/x/file.txt", 16],
	[1, "c14/x/y/file.txt", 16],
	[1, "c15/a/leaf.txt", 17],
	[1, "c15/a/b/leaf.txt", 1],
	[1, "c16/file1.txt", 18],
	[1, "x/c18name/file.txt", 19],
	[1, "y/c18name", 19],
	[2, "c19/xfile.txt", 20],
	[2, "c19/xdir/inner.txt", 20],
	[2, "c20/b", 21],
	[2, "c20/a/inner.txt", 21],
	[2, "c21/a/file.txt", 22],
	[2, "c21/a/b/file.txt", 1],
	[2, "c22/a/b/file.txt", 23],
	[2, "c23/[ab].txt", 24],
	[2, "c23/a.txt", 1],
	[2, "!c24bang.txt", 2],
	[2, "c25/v1.2/inner.txt", 1],
	[2, "c27/conf.d/inner.txt", 27],
	[2, "c27/app.d", 1],
	[2, "z/c28/file.txt", 1],
	[2, "c28/file.txt", 28],
	[3, "a/c29/file.txt", 29],
	[3, "a/c29/sub/deep.txt", 1],
	[3, "c30/a]b.txt", 1],
	[3, "x/c31/file.txt", 31],
	[3, "x/c31/sub/deep.txt", 1],
	[3, "y/x/c31/file.txt", 1],
];

describe("GitHub CODEOWNERS conformance", () => {
	const rules = compileRules(parseCodeowners(githubFixture));

	it.each(githubWinners)(
		"probe round %i: %s resolves to line %i",
		(_round, path, line) => {
			expect(findOwningRule(rules, path)?.line).toBe(line);
		},
	);
});
