import { describe, expect, it } from "vitest";

import { compareValidationIssues, type ValidationIssue } from "../src/model.js";

function issue(path: string, line = 1): ValidationIssue {
	return {
		check: "unowned",
		code: "unowned-file",
		severity: "warning",
		path,
		line,
		message: "Unowned",
	};
}

describe("compareValidationIssues", () => {
	it("uses locale-independent code-unit ordering", () => {
		const issues = [
			issue("ä.ts"),
			issue("a.ts", 2),
			issue("A.ts"),
			issue("a.ts"),
		];

		expect(
			issues
				.sort(compareValidationIssues)
				.map(({ path, line }) => [path, line]),
		).toEqual([
			["A.ts", 1],
			["a.ts", 1],
			["a.ts", 2],
			["ä.ts", 1],
		]);
	});
});
