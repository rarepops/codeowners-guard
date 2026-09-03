import { describe, expect, it } from "vitest";

import { findDuplicatePatterns, parseCodeowners } from "../src/parser.js";

describe("parseCodeowners", () => {
	it("parses rules while ignoring comments and blank lines", () => {
		const result = parseCodeowners(
			[
				"# Documentation owners",
				"",
				"*.md @docs @writer",
				"/src/ @engineering",
				"",
			].join("\r\n"),
		);

		expect(result).toEqual([
			{ line: 3, pattern: "*.md", owners: ["@docs", "@writer"] },
			{ line: 4, pattern: "/src/", owners: ["@engineering"] },
		]);
	});

	it("keeps escaped whitespace inside a pattern", () => {
		const result = parseCodeowners("/docs\\ and\\ guides/ @docs");

		expect(result).toEqual([
			{ line: 1, pattern: "/docs\\ and\\ guides/", owners: ["@docs"] },
		]);
	});

	it("keeps ownerless rules and reports exact duplicate patterns", () => {
		const rules = parseCodeowners(
			["*.ts @frontend", "*.md", "*.ts @platform"].join("\n"),
		);

		expect(rules[1]).toEqual({ line: 2, pattern: "*.md", owners: [] });
		expect([...findDuplicatePatterns(rules)]).toEqual([
			{
				line: 3,
				message: 'Pattern "*.ts" duplicates line 1',
			},
		]);
	});
});
