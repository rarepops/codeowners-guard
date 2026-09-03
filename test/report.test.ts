import { describe, expect, it } from "vitest";

import { formatTextReport } from "../src/report.js";

describe("formatTextReport", () => {
	it("escapes terminal controls and includes GitHub suggestions", () => {
		const report = formatTextReport({
			codeownersPath: "CODEOWNERS\u001b\u202e",
			issues: [
				{
					check: "syntax",
					code: "InvalidPattern",
					severity: "error",
					path: "src/\u001b[31mfile.ts",
					message: "Invalid\npattern",
					suggestion: "Use /src/",
				},
			],
			issueCount: 1,
			errorCount: 1,
			warningCount: 0,
			stats: { files: 0, rules: 1, matchedRules: 0 },
		});

		expect(report).toContain("src/\\u001b[31mfile.ts");
		expect(report).toContain("in CODEOWNERS\\u001b\\u202e");
		expect(report).toContain("Invalid\\u000apattern Suggestion: Use /src/");
		expect(report).not.toContain("\u001b");
	});
});
