import { describe, expect, it, vi } from "vitest";

import { fetchGitHubSyntaxIssues } from "../src/github-validator.js";

describe("fetchGitHubSyntaxIssues", () => {
	it("requests the selected ref and maps GitHub errors", async () => {
		const request = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify({
					errors: [
						{
							line: 4,
							column: 2,
							kind: "InvalidPattern",
							message: "Invalid pattern",
							path: ".github/CODEOWNERS",
							suggestion: "Use /docs/",
						},
					],
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			),
		);

		const issues = await fetchGitHubSyntaxIssues(
			{
				apiUrl: "https://api.github.test/",
				repository: "owner/repo",
				ref: "abc123",
				token: "secret",
			},
			request,
		);

		expect(request).toHaveBeenCalledOnce();
		const [url, init] = request.mock.calls[0] ?? [];
		expect(String(url)).toBe(
			"https://api.github.test/repos/owner/repo/codeowners/errors?ref=abc123",
		);
		expect(new Headers(init?.headers).get("authorization")).toBe(
			"Bearer secret",
		);
		expect(issues).toEqual([
			{
				check: "syntax",
				code: "InvalidPattern",
				severity: "error",
				path: ".github/CODEOWNERS",
				line: 4,
				column: 2,
				message: "Invalid pattern",
				suggestion: "Use /docs/",
			},
		]);
	});

	it("rejects failed and malformed responses", async () => {
		await expect(
			fetchGitHubSyntaxIssues(
				{ apiUrl: "https://api.github.test", repository: "owner/repo" },
				vi
					.fn<typeof fetch>()
					.mockResolvedValue(new Response("Not found", { status: 404 })),
			),
		).rejects.toThrow("failed with 404");

		await expect(
			fetchGitHubSyntaxIssues(
				{ apiUrl: "https://api.github.test", repository: "owner/repo" },
				vi.fn<typeof fetch>().mockResolvedValue(
					new Response("{}", {
						status: 200,
						headers: { "content-type": "application/json" },
					}),
				),
			),
		).rejects.toThrow("invalid CODEOWNERS error response");
	});
});
