import { describe, expect, it } from "vitest";

import { analyzePattern, compileExactPattern } from "../src/pattern.js";

describe("analyzePattern", () => {
	it.each(["/c10/[ab].txt", "/c30/a]b.txt", "[", "a\\\\[b"])(
		"treats %s as invalid because of an unescaped bracket",
		(pattern) => {
			expect(analyzePattern(pattern).invalid).toBe(true);
		},
	);

	it.each(["/c23/\\[ab\\].txt", "\\]", "/docs/"])(
		"treats %s as valid",
		(pattern) => {
			expect(analyzePattern(pattern).invalid).toBe(false);
		},
	);

	it.each(["/*", "c1/*", "/a/*/*", "**/x/*", "*/x/*", "dir/**/*"])(
		"detects that %s ends in a lone star",
		(pattern) => {
			expect(analyzePattern(pattern).endsWithLoneStar).toBe(true);
		},
	);

	it.each([
		"*",
		"**",
		"dir/*/",
		"/c19/x*",
		"dir/?",
		"*.d",
		"docs/\\*",
		"dir/**",
	])("does not treat %s as ending in a lone star", (pattern) => {
		expect(analyzePattern(pattern).endsWithLoneStar).toBe(false);
	});
});

describe("compileExactPattern", () => {
	it.each([
		["/*", "^[^/]*$"],
		["c1/*", "^c1/[^/]*$"],
		["/c21/*/*", "^c21/[^/]*/[^/]*$"],
		["c22/**/*", "^c22/(?:[^/]+/)*[^/]*$"],
		["**/c29/*", "^(?:[^/]+/)*c29/[^/]*$"],
		["*/c31/*", "^[^/]*/c31/[^/]*$"],
		["**/**/**/**/x/*", "^(?:[^/]+/)*x/[^/]*$"],
	])("translates %s to %s", (pattern, expected) => {
		const compiled = compileExactPattern(pattern);

		expect(compiled.source).toBe(new RegExp(expected, "u").source);
		expect(compiled.flags).toBe("u");
	});

	it("matches files at the pattern depth but not in deeper folders", () => {
		const docs = compileExactPattern("docs/*");
		expect(docs.test("docs/getting-started.md")).toBe(true);
		expect(docs.test("docs/build-app/troubleshooting.md")).toBe(false);
		expect(docs.test("packages/docs/getting-started.md")).toBe(false);

		const root = compileExactPattern("/*");
		expect(root.test("README.md")).toBe(true);
		expect(root.test("src/app.ts")).toBe(false);
	});

	it("keeps regex metacharacters and escaped characters literal", () => {
		const metacharacters = compileExactPattern("/a.b+(c)/*");
		expect(metacharacters.test("a.b+(c)/x")).toBe(true);
		expect(metacharacters.test("aXb+(c)/x")).toBe(false);

		expect(
			compileExactPattern("docs\\ and\\ guides/*").test("docs and guides/x.md"),
		).toBe(true);
		expect(compileExactPattern("\\#c11/*").test("#c11/x")).toBe(true);
	});

	it("matches a question mark as exactly one character", () => {
		const pattern = compileExactPattern("/c/?/*");

		expect(pattern.test("c/a/x")).toBe(true);
		expect(pattern.test("c/ab/x")).toBe(false);
	});

	it("stays fast when many ** segments meet a deep path", () => {
		const pattern = compileExactPattern(
			`${Array.from({ length: 12 }, () => "**").join("/")}/x/*`,
		);
		const folders = Array.from({ length: 60 }, (_, index) => `d${index}`).join(
			"/",
		);

		expect(pattern.test(`${folders}/file.txt`)).toBe(false);
		expect(pattern.test(`${folders}/x/file.txt`)).toBe(true);
	});
});
