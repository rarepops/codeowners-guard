import { describe, expect, it } from "vitest";

import { validateLocal } from "../src/local-validator.js";
import type { CheckName } from "../src/model.js";

const allLocalChecks = new Set<CheckName>([
	"duplicates",
	"dangling",
	"unowned",
]);

describe("validateLocal", () => {
	it("reports duplicates, dangling patterns, and unowned files", () => {
		const result = validateLocal({
			source: [
				"* @default",
				"/src/ @engineering",
				"/private/",
				"/missing/ @nobody",
				"/src/ @platform",
			].join("\n"),
			codeownersPath: ".github/CODEOWNERS",
			files: ["README.md", "src/app.ts", "private/plan.md"],
			checks: allLocalChecks,
		});

		expect(result.issues).toEqual([
			expect.objectContaining({
				check: "dangling",
				line: 4,
				code: "dangling-pattern",
			}),
			expect.objectContaining({
				check: "duplicates",
				line: 5,
				code: "duplicate-pattern",
			}),
			expect.objectContaining({
				check: "unowned",
				path: "private/plan.md",
				code: "unowned-file",
			}),
		]);
		expect(result.stats).toEqual({ files: 3, rules: 5, matchedRules: 4 });
		expect(result).toMatchObject({
			issueCount: 3,
			errorCount: 0,
			warningCount: 3,
		});
	});

	it("respects disabled checks, exclusions, and skipped syntax lines", () => {
		const result = validateLocal({
			source: ["* @default", "/generated/", "/bad[ @invalid"].join("\n"),
			codeownersPath: "CODEOWNERS",
			files: ["src/app.ts", "generated/api.ts", "coverage/report.json"],
			checks: new Set<CheckName>(["unowned"]),
			exclude: ["coverage/"],
			skipLines: new Set([3]),
		});

		expect(result.issues).toEqual([
			expect.objectContaining({ check: "unowned", path: "generated/api.ts" }),
		]);
		expect(result.stats).toEqual({ files: 2, rules: 2, matchedRules: 2 });
	});

	it("does not inspect files when only duplicate rules are requested", () => {
		const result = validateLocal({
			source: ["*.md @docs", "*.md @writers"].join("\n"),
			codeownersPath: "CODEOWNERS",
			files: ["README.md", "src/app.ts"],
			checks: new Set<CheckName>(["duplicates"]),
		});

		expect(result.issues).toHaveLength(1);
		expect(result.stats).toEqual({ files: 0, rules: 2, matchedRules: 0 });
	});

	it("applies file exclusions case-sensitively", () => {
		const result = validateLocal({
			source: "* @owner",
			codeownersPath: "CODEOWNERS",
			files: ["generated/file.ts", "Generated/file.ts"],
			checks: new Set<CheckName>(["unowned"]),
			exclude: ["generated/"],
		});

		expect(result.stats.files).toBe(1);
	});

	it("counts every finding while retaining only the configured sample", () => {
		const result = validateLocal({
			source: "",
			codeownersPath: "CODEOWNERS",
			files: Array.from(
				{ length: 10_000 },
				(_, index) => `src/file-${index}.ts`,
			),
			checks: new Set<CheckName>(["unowned"]),
			maxIssues: 3,
		});

		expect(result.issues).toHaveLength(3);
		expect(result.issueCount).toBe(10_000);
		expect(result.warningCount).toBe(10_000);
		expect(result.errorCount).toBe(0);
	});
});
