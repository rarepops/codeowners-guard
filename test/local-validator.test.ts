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
});
