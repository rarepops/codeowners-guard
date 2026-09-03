import { describe, expect, it } from "vitest";

import {
	compareValidationIssues,
	IssueCollector,
	shouldFail,
	type ValidationIssue,
} from "../src/model.js";

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

	it("retains the highest-priority issues while counting every severity", () => {
		const collector = new IssueCollector(2);
		collector.add(issue("z.ts"));
		collector.add(issue("a.ts"));
		collector.add({ ...issue("error.ts"), severity: "error", check: "syntax" });

		expect(collector.issues.map(({ path }) => path)).toEqual([
			"error.ts",
			"a.ts",
		]);
		expect(collector).toMatchObject({
			issueCount: 3,
			errorCount: 1,
			warningCount: 2,
		});
	});

	it("fails from exact counts even when no issue details are retained", () => {
		const collector = new IssueCollector(0);
		collector.add(issue("unowned.ts"));

		expect(collector.issues).toEqual([]);
		expect(shouldFail(collector, "warning")).toBe(true);
		expect(shouldFail(collector, "error")).toBe(false);
	});
});
