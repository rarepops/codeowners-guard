import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const cliPath = resolve("dist/cli.js");

describe("packaged CLI", () => {
	it("renders aligned help with authentication settings separated", () => {
		const result = spawnSync(process.execPath, [cliPath, "--help"], {
			encoding: "utf8",
		});

		expect(result.status).toBe(0);
		expect(result.stdout).not.toContain("\t");
		expect(result.stdout).toContain(
			"-c, --checks <list>       Comma-separated checks (default: duplicates,dangling,unowned)",
		);
		expect(result.stdout).toContain(
			"      --max-issues <count>  Maximum retained issue details",
		);
		expect(result.stdout).toContain(
			"Environment:\n  GITHUB_TOKEN or GH_TOKEN  Token for authenticated GitHub API access",
		);
	});

	it("rejects command-line tokens without echoing the secret", () => {
		const result = spawnSync(
			process.execPath,
			[cliPath, "--token", "should-not-appear"],
			{ encoding: "utf8" },
		);

		expect(result.status).toBe(2);
		expect(result.stderr).toContain("Unknown option '--token'");
		expect(result.stderr).not.toContain("should-not-appear");
	});

	it("rejects extra repository paths", () => {
		const result = spawnSync(
			process.execPath,
			[cliPath, ".", "unexpected", "--checks", "duplicates"],
			{ encoding: "utf8" },
		);

		expect(result.status).toBe(2);
		expect(result.stderr).toContain("Expected at most one repository path");
	});

	it("names max-issues in validation errors", () => {
		const result = spawnSync(process.execPath, [cliPath, "--max-issues=-1"], {
			encoding: "utf8",
		});

		expect(result.status).toBe(2);
		expect(result.stderr).toContain("max-issues must be");
	});

	it("reports local issues as JSON and applies the failure threshold", async () => {
		const root = await mkdtemp(join(tmpdir(), "codeowners-guard-cli-"));
		await mkdir(join(root, ".github"));
		await mkdir(join(root, "src"));
		await writeFile(
			join(root, ".github", "CODEOWNERS"),
			["*.md @docs", "/missing/ @nobody", "*.md @writers"].join("\n"),
		);
		await writeFile(join(root, "README.md"), "# Test");
		await writeFile(join(root, "src", "app.ts"), "export {};");
		execFileSync("git", ["init", "--quiet", root]);
		execFileSync("git", ["-C", root, "-c", "core.autocrlf=false", "add", "."]);

		const failing = spawnSync(
			process.execPath,
			[
				cliPath,
				root,
				"--format",
				"json",
				"--checks",
				"duplicates,dangling,unowned",
			],
			{ encoding: "utf8" },
		);
		const warningOnly = spawnSync(
			process.execPath,
			[
				cliPath,
				root,
				"--checks",
				"duplicates,dangling,unowned",
				"--fail-on",
				"error",
			],
			{ encoding: "utf8" },
		);
		const bounded = spawnSync(
			process.execPath,
			[
				cliPath,
				root,
				"--format",
				"json",
				"--checks",
				"duplicates,dangling,unowned",
				"--max-issues",
				"1",
			],
			{ encoding: "utf8" },
		);

		expect(failing.status).toBe(1);
		expect(JSON.parse(failing.stdout)).toEqual(
			expect.objectContaining({
				valid: false,
				codeownersPath: ".github/CODEOWNERS",
				issues: expect.arrayContaining([
					expect.objectContaining({ check: "duplicates" }),
					expect.objectContaining({ check: "dangling" }),
					expect.objectContaining({ check: "unowned", path: "src/app.ts" }),
				]),
			}),
		);
		expect(warningOnly.status).toBe(0);
		expect(warningOnly.stdout).toContain("issue");
		expect(bounded.status).toBe(1);
		expect(JSON.parse(bounded.stdout)).toEqual(
			expect.objectContaining({
				valid: false,
				issueCount: 4,
				warningCount: 4,
				issues: [expect.anything()],
			}),
		);
	});
});
