import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const core = vi.hoisted(() => {
	const summary = {
		addHeading: vi.fn(),
		addRaw: vi.fn(),
		addTable: vi.fn(),
		write: vi.fn().mockResolvedValue(undefined),
	};
	summary.addHeading.mockReturnValue(summary);
	summary.addRaw.mockReturnValue(summary);
	summary.addTable.mockReturnValue(summary);

	return {
		inputs: new Map<string, string>(),
		multilineInputs: new Map<string, string[]>(),
		summary,
		getInput: vi.fn((name: string) => core.inputs.get(name) ?? ""),
		getMultilineInput: vi.fn(
			(name: string) => core.multilineInputs.get(name) ?? [],
		),
		error: vi.fn(),
		warning: vi.fn(),
		info: vi.fn(),
		setFailed: vi.fn(),
		setOutput: vi.fn(),
	};
});

const validateRepository = vi.hoisted(() => vi.fn());

vi.mock("@actions/core", () => core);
vi.mock("../src/validate-repository.js", () => ({ validateRepository }));

import { runAction } from "../src/action.js";

describe("runAction", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		core.inputs.clear();
		core.multilineInputs.clear();
		vi.stubEnv("GITHUB_WORKSPACE", process.cwd());
		vi.stubEnv("GITHUB_REPOSITORY", "owner/repository");
		vi.stubEnv("GITHUB_SHA", "abc123");
		vi.stubEnv("GITHUB_API_URL", "https://api.github.test");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("limits annotations, writes outputs, and allows warnings at the error threshold", async () => {
		core.inputs.set("checks", "duplicates,unowned");
		core.inputs.set("fail-on", "error");
		core.inputs.set("max-annotations", "1");
		core.multilineInputs.set("exclude", ["dist/"]);
		validateRepository.mockResolvedValue({
			codeownersPath: ".github/CODEOWNERS",
			issues: [
				{
					check: "duplicates",
					code: "duplicate-pattern",
					severity: "warning",
					path: ".github/CODEOWNERS",
					line: 4,
					message: "Duplicate pattern",
				},
				{
					check: "unowned",
					code: "unowned-file",
					severity: "warning",
					path: "src/app.ts",
					message: "Unowned file",
				},
			],
			stats: { files: 5, rules: 3, matchedRules: 2 },
		});

		await runAction();

		expect(validateRepository).toHaveBeenCalledWith(
			expect.objectContaining({
				checks: new Set(["duplicates", "unowned"]),
				exclude: ["dist/"],
			}),
		);
		expect(core.warning).toHaveBeenCalledOnce();
		expect(core.info).toHaveBeenCalledWith(
			"1 additional issues omitted from annotations",
		);
		expect(core.setFailed).not.toHaveBeenCalled();
		expect(core.setOutput).toHaveBeenCalledWith("valid", false);
		expect(core.setOutput).toHaveBeenCalledWith("issue-count", 2);
		expect(core.setOutput).toHaveBeenCalledWith("error-count", 0);
		expect(core.setOutput).toHaveBeenCalledWith("warning-count", 2);
		expect(core.summary.write).toHaveBeenCalledOnce();
	});

	it("passes GitHub settings to syntax validation and fails on errors", async () => {
		core.inputs.set("checks", "syntax");
		core.inputs.set("github-token", "secret");
		core.inputs.set("repository", "alternate/repository");
		core.inputs.set("ref", "feature-ref");
		core.inputs.set("github-api-url", "https://enterprise.example/api/v3");
		validateRepository.mockResolvedValue({
			codeownersPath: "CODEOWNERS",
			issues: [
				{
					check: "syntax",
					code: "InvalidPattern",
					severity: "error",
					path: "CODEOWNERS",
					line: 2,
					column: 1,
					message: "Invalid pattern",
					suggestion: "Use /docs/",
				},
			],
			stats: { files: 0, rules: 1, matchedRules: 0 },
		});

		await runAction();

		expect(validateRepository).toHaveBeenCalledWith(
			expect.objectContaining({
				github: {
					apiUrl: "https://enterprise.example/api/v3",
					repository: "alternate/repository",
					token: "secret",
					ref: "feature-ref",
				},
			}),
		);
		expect(core.error).toHaveBeenCalledWith(
			"Invalid pattern Suggestion: Use /docs/",
			expect.objectContaining({
				file: "CODEOWNERS",
				startLine: 2,
				startColumn: 1,
			}),
		);
		expect(core.setFailed).toHaveBeenCalledWith(
			"CODEOWNERS validation found 1 issue",
		);
	});
});
