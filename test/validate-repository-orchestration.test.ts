import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ValidationIssue } from "../src/model.js";

const githubValidator = vi.hoisted(() => ({
	fetchGitHubSyntaxIssues: vi.fn(),
}));
const localValidator = vi.hoisted(() => ({
	validateLocal: vi.fn(),
}));
const repository = vi.hoisted(() => ({
	listTrackedFiles: vi.fn(),
	loadCodeownersFile: vi.fn(),
}));

vi.mock("../src/github-validator.js", () => githubValidator);
vi.mock("../src/local-validator.js", () => localValidator);
vi.mock("../src/repository.js", () => repository);

import { validateRepository } from "../src/validate-repository.js";

const stats = { files: 0, rules: 1, matchedRules: 0 };

function issue(
	path: string,
	line: number | undefined,
	severity: ValidationIssue["severity"] = "error",
): ValidationIssue {
	return {
		check: "syntax",
		code: "InvalidPattern",
		severity,
		path,
		...(line === undefined ? {} : { line }),
		message: "Invalid pattern",
	};
}

describe("validateRepository orchestration", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		repository.loadCodeownersFile.mockResolvedValue({
			absolutePath: "/repo/.github/CODEOWNERS",
			relativePath: ".github/CODEOWNERS",
			source: "* @owner",
		});
		repository.listTrackedFiles.mockResolvedValue(["src/app.ts"]);
		githubValidator.fetchGitHubSyntaxIssues.mockResolvedValue([]);
		localValidator.validateLocal.mockReturnValue({
			issues: [],
			issueCount: 0,
			errorCount: 0,
			warningCount: 0,
			stats,
		});
	});

	it("requires GitHub settings before running the syntax check", async () => {
		await expect(
			validateRepository({
				repositoryPath: "/repo",
				checks: new Set(["syntax"]),
			}),
		).rejects.toThrow("syntax check requires a GitHub repository");

		expect(githubValidator.fetchGitHubSyntaxIssues).not.toHaveBeenCalled();
		expect(repository.listTrackedFiles).not.toHaveBeenCalled();
		expect(localValidator.validateLocal).not.toHaveBeenCalled();
	});

	it("does not enumerate files for checks that only inspect rules", async () => {
		await validateRepository({
			repositoryPath: "/repo",
			checks: new Set(["duplicates"]),
		});

		expect(repository.listTrackedFiles).not.toHaveBeenCalled();
		expect(githubValidator.fetchGitHubSyntaxIssues).not.toHaveBeenCalled();
		expect(localValidator.validateLocal).toHaveBeenCalledWith(
			expect.objectContaining({
				checks: new Set(["duplicates"]),
				files: [],
				skipLines: new Set(),
			}),
		);
	});

	it("rejects syntax checks for a non-effective explicit CODEOWNERS file", async () => {
		repository.loadCodeownersFile
			.mockResolvedValueOnce({
				absolutePath: "/repo/config/CODEOWNERS",
				relativePath: "config/CODEOWNERS",
				source: "* @custom",
			})
			.mockResolvedValueOnce({
				absolutePath: "/repo/.github/CODEOWNERS",
				relativePath: ".github/CODEOWNERS",
				source: "* @effective",
			});

		await expect(
			validateRepository({
				repositoryPath: "/repo",
				codeownersPath: "config/CODEOWNERS",
				checks: new Set(["syntax", "duplicates"]),
				github: {
					apiUrl: "https://api.github.test",
					repository: "owner/repo",
				},
			}),
		).rejects.toThrow("GitHub's effective CODEOWNERS file");

		expect(githubValidator.fetchGitHubSyntaxIssues).not.toHaveBeenCalled();
		expect(localValidator.validateLocal).not.toHaveBeenCalled();
	});

	it("allows syntax checks when an explicit path selects the effective file", async () => {
		const github = {
			apiUrl: "https://api.github.test",
			repository: "owner/repo",
		};

		await validateRepository({
			repositoryPath: "/repo",
			codeownersPath: ".github/CODEOWNERS",
			checks: new Set(["syntax"]),
			github,
		});

		expect(repository.loadCodeownersFile).toHaveBeenNthCalledWith(
			1,
			"/repo",
			".github/CODEOWNERS",
		);
		expect(repository.loadCodeownersFile).toHaveBeenNthCalledWith(2, "/repo");
		expect(githubValidator.fetchGitHubSyntaxIssues).toHaveBeenCalledWith(
			github,
		);
	});

	it("merges syntax and local findings while skipping invalid rule lines", async () => {
		const syntaxIssues = [
			issue(".github/CODEOWNERS", 2),
			issue(".github/CODEOWNERS", undefined),
			issue("docs/CODEOWNERS", 9),
		];
		const localIssue: ValidationIssue = {
			check: "unowned",
			code: "unowned-file",
			severity: "warning",
			path: "src/app.ts",
			message: "Unowned file",
		};
		githubValidator.fetchGitHubSyntaxIssues.mockResolvedValue(syntaxIssues);
		localValidator.validateLocal.mockReturnValue({
			issues: [localIssue],
			issueCount: 1,
			errorCount: 0,
			warningCount: 1,
			stats: { files: 1, rules: 1, matchedRules: 0 },
		});
		const github = {
			apiUrl: "https://api.github.test",
			repository: "owner/repo",
		};

		const result = await validateRepository({
			repositoryPath: "/repo",
			checks: new Set(["syntax", "dangling", "unowned"]),
			exclude: ["vendor/"],
			github,
			maxIssues: 2,
		});

		expect(githubValidator.fetchGitHubSyntaxIssues).toHaveBeenCalledWith(
			github,
		);
		expect(repository.listTrackedFiles).toHaveBeenCalledWith("/repo");
		expect(localValidator.validateLocal).toHaveBeenCalledWith({
			source: "* @owner",
			codeownersPath: ".github/CODEOWNERS",
			files: ["src/app.ts"],
			checks: new Set(["dangling", "unowned"]),
			exclude: ["vendor/"],
			maxIssues: 2,
			skipLines: new Set([2]),
		});
		expect(result).toEqual({
			codeownersPath: ".github/CODEOWNERS",
			issues: [syntaxIssues[1], syntaxIssues[0]],
			issueCount: 4,
			errorCount: 3,
			warningCount: 1,
			stats: { files: 1, rules: 1, matchedRules: 0 },
		});
	});
});
