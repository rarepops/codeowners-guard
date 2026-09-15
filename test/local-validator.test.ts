import { describe, expect, it } from "vitest";

import { validateLocal } from "../src/local-validator.js";
import type { CheckName } from "../src/model.js";

const allLocalChecks = new Set<CheckName>([
	"duplicates",
	"dangling",
	"shadowed",
	"unowned",
]);

const shadowedSuggestion =
	"Remove the rule, or move it below the rules that override it if it should take precedence.";

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

	it("reports a lone-star rule that only matches nested files as dangling", () => {
		const result = validateLocal({
			source: ["* @default", "docs/* @docs"].join("\n"),
			codeownersPath: "CODEOWNERS",
			files: ["README.md", "docs/build-app/troubleshooting.md"],
			checks: new Set<CheckName>(["dangling"]),
		});

		expect(result.issues).toEqual([
			expect.objectContaining({
				check: "dangling",
				code: "dangling-pattern",
				line: 2,
			}),
		]);
	});

	it("reports files nested under a lone-star rule as unowned, as GitHub does", () => {
		const result = validateLocal({
			source: "docs/* @docs",
			codeownersPath: "CODEOWNERS",
			files: ["docs/getting-started.md", "docs/build-app/troubleshooting.md"],
			checks: new Set<CheckName>(["unowned"]),
		});

		expect(result.issues).toEqual([
			expect.objectContaining({
				check: "unowned",
				path: "docs/build-app/troubleshooting.md",
			}),
		]);
	});

	it("reports patterns GitHub rejects as invalid instead of dangling", () => {
		const result = validateLocal({
			source: ["* @default", "/c10/[ab].txt @docs", "/c30/a]b.txt @docs"].join(
				"\n",
			),
			codeownersPath: "CODEOWNERS",
			files: ["c10/a.txt", "c30/a]b.txt"],
			checks: new Set<CheckName>(["dangling"]),
		});

		expect(result.issues).toEqual([
			{
				check: "dangling",
				code: "invalid-pattern",
				severity: "warning",
				path: "CODEOWNERS",
				line: 2,
				message:
					'Pattern "/c10/[ab].txt" is rejected by GitHub: escape [ and ] with a backslash',
			},
			{
				check: "dangling",
				code: "invalid-pattern",
				severity: "warning",
				path: "CODEOWNERS",
				line: 3,
				message:
					'Pattern "/c30/a]b.txt" is rejected by GitHub: escape [ and ] with a backslash',
			},
		]);
	});

	it("leaves lines GitHub already rejected to the syntax check", () => {
		const result = validateLocal({
			source: ["* @default", "/c10/[ab].txt @docs"].join("\n"),
			codeownersPath: "CODEOWNERS",
			files: ["c10/a.txt"],
			checks: new Set<CheckName>(["dangling"]),
			skipLines: new Set([2]),
		});

		expect(result.issues).toEqual([]);
	});

	it("reports rules that match files but never win them", () => {
		const result = validateLocal({
			source: [
				"* @org/platform",
				"/docs/*.md @org/writers",
				"/docs/ @org/docs",
				"/tools/ @org/devex",
				"/tools/*.sh @org/shell",
			].join("\n"),
			codeownersPath: "CODEOWNERS",
			files: [
				"docs/index.md",
				"docs/guide/setup.md",
				"tools/build.sh",
				"tools/release.sh",
				"src/app.ts",
			],
			checks: new Set<CheckName>(["shadowed"]),
		});

		expect(result.issues).toEqual([
			{
				check: "shadowed",
				code: "shadowed-rule",
				severity: "warning",
				path: "CODEOWNERS",
				line: 2,
				message:
					'Pattern "/docs/*.md" never takes effect: its only matching file is overridden by line 3',
				suggestion: shadowedSuggestion,
			},
			{
				check: "shadowed",
				code: "shadowed-rule",
				severity: "warning",
				path: "CODEOWNERS",
				line: 4,
				message:
					'Pattern "/tools/" never takes effect: all 2 matching files are overridden by line 5',
				suggestion: shadowedSuggestion,
			},
		]);
	});

	it("ignores partial overrides and exempts catch-all rules but not /*", () => {
		const result = validateLocal({
			source: [
				"* @all",
				"** @all",
				"/** @all",
				"/* @root",
				"/src/ @app",
				"/src/lib/ @lib",
				"/README.md @docs",
			].join("\n"),
			codeownersPath: "CODEOWNERS",
			files: ["README.md", "src/app.ts", "src/lib/util.ts"],
			checks: new Set<CheckName>(["shadowed"]),
		});

		expect(result.issues).toEqual([
			{
				check: "shadowed",
				code: "shadowed-rule",
				severity: "warning",
				path: "CODEOWNERS",
				line: 4,
				message:
					'Pattern "/*" never takes effect: its only matching file is overridden by line 7',
				suggestion: shadowedSuggestion,
			},
		]);
	});

	it("leaves exact duplicates to the duplicates check unless it is disabled", () => {
		const source = ["/docs/ @docs", "/docs/ @writers"].join("\n");
		const files = ["docs/guide.md", "docs/api.md", "docs/faq.md"];

		const withDuplicates = validateLocal({
			source,
			codeownersPath: "CODEOWNERS",
			files,
			checks: new Set<CheckName>(["duplicates", "shadowed"]),
		});
		expect(withDuplicates.issues).toEqual([
			expect.objectContaining({ check: "duplicates", line: 2 }),
		]);

		const withoutDuplicates = validateLocal({
			source,
			codeownersPath: "CODEOWNERS",
			files,
			checks: new Set<CheckName>(["shadowed"]),
		});
		expect(withoutDuplicates.issues).toEqual([
			expect.objectContaining({
				check: "shadowed",
				line: 1,
				message:
					'Pattern "/docs/" never takes effect: all 3 matching files are overridden by line 2',
			}),
		]);
	});

	it("keeps shadowed findings separate from dangling and unowned findings", () => {
		const result = validateLocal({
			source: ["/generated/api/ @api", "/generated/", "/missing/ @nobody"].join(
				"\n",
			),
			codeownersPath: "CODEOWNERS",
			files: ["generated/api/client.ts", "generated/api/types.ts"],
			checks: new Set<CheckName>(["dangling", "shadowed", "unowned"]),
		});

		expect(result.issues).toEqual([
			expect.objectContaining({
				check: "shadowed",
				line: 1,
				message:
					'Pattern "/generated/api/" never takes effect: all 2 matching files are overridden by line 2',
			}),
			expect.objectContaining({ check: "dangling", line: 3 }),
			expect.objectContaining({
				check: "unowned",
				path: "generated/api/client.ts",
			}),
			expect.objectContaining({
				check: "unowned",
				path: "generated/api/types.ts",
			}),
		]);
	});

	it("ignores excluded files and syntax-rejected lines when finding shadowed rules", () => {
		const result = validateLocal({
			source: [
				"/src/ @app",
				"/src/legacy/ @legacy",
				"/src/legacy/ @unused",
			].join("\n"),
			codeownersPath: "CODEOWNERS",
			files: ["src/main.ts", "src/legacy/old.ts"],
			checks: new Set<CheckName>(["shadowed"]),
			exclude: ["src/main.ts"],
			skipLines: new Set([3]),
		});

		expect(result.issues).toEqual([
			expect.objectContaining({
				check: "shadowed",
				line: 1,
				message:
					'Pattern "/src/" never takes effect: its only matching file is overridden by line 2',
			}),
		]);
	});

	it("scopes local checks to chosen folders with negated exclusions", () => {
		const files = [
			"README.md",
			"src/app.ts",
			"packages/api/index.ts",
			"packages/web/index.ts",
			"test/app.test.ts",
		];
		const unownedPaths = (exclude: string[]) =>
			validateLocal({
				source: "",
				codeownersPath: "CODEOWNERS",
				files,
				checks: new Set<CheckName>(["unowned"]),
				exclude,
			}).issues.map((issue) => issue.path);

		expect(unownedPaths(["/*", "!/src/"])).toEqual(["src/app.ts"]);
		expect(
			unownedPaths(["/*", "!/packages/", "/packages/*", "!/packages/api/"]),
		).toEqual(["packages/api/index.ts"]);
		expect(unownedPaths(["/*", "!/packages/api/"])).toEqual([]);
	});
});
