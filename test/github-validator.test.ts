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
		expect(init?.redirect).toBe("error");
		expect(init?.signal).toBeInstanceOf(AbortSignal);
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
		).rejects.toThrow("could not find owner/repo");

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

		await expect(
			fetchGitHubSyntaxIssues(
				{ apiUrl: "https://api.github.test", repository: "owner/repo" },
				vi.fn<typeof fetch>().mockResolvedValue(
					new Response(
						JSON.stringify({
							errors: [
								{
									line: -1,
									column: 0,
									kind: "InvalidPattern",
									message: "Invalid",
									path: "CODEOWNERS",
									suggestion: null,
								},
							],
						}),
						{ status: 200 },
					),
				),
			),
		).rejects.toThrow("invalid CODEOWNERS error response");
	});

	it("retries transient responses and respects Retry-After", async () => {
		const first = new Response("Unavailable", { status: 503 });
		const second = new Response("Rate limited", {
			status: 429,
			headers: { "retry-after": "2" },
		});
		const firstCancel = vi.spyOn(first.body as ReadableStream, "cancel");
		const secondCancel = vi.spyOn(second.body as ReadableStream, "cancel");
		const request = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(first)
			.mockResolvedValueOnce(second)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ errors: [] }), { status: 200 }),
			);
		const sleep = vi.fn<(milliseconds: number) => Promise<void>>(() =>
			Promise.resolve(),
		);

		await expect(
			fetchGitHubSyntaxIssues(
				{ apiUrl: "https://api.github.test", repository: "owner/repo" },
				request,
				sleep,
			),
		).resolves.toEqual([]);

		expect(request).toHaveBeenCalledTimes(3);
		expect(sleep.mock.calls).toEqual([[250], [2_000]]);
		expect(firstCancel).toHaveBeenCalledOnce();
		expect(secondCancel).toHaveBeenCalledOnce();
	});

	it("stops after three transient responses", async () => {
		const request = vi
			.fn<typeof fetch>()
			.mockImplementation(() =>
				Promise.resolve(new Response("Unavailable", { status: 503 })),
			);
		const sleep = vi.fn<(milliseconds: number) => Promise<void>>(() =>
			Promise.resolve(),
		);

		await expect(
			fetchGitHubSyntaxIssues(
				{ apiUrl: "https://api.github.test", repository: "owner/repo" },
				request,
				sleep,
			),
		).rejects.toThrow("service failed with 503");
		expect(request).toHaveBeenCalledTimes(3);
		expect(sleep.mock.calls).toEqual([[250], [500]]);
	});

	it("rejects insecure URLs and oversized responses", async () => {
		await expect(
			fetchGitHubSyntaxIssues(
				{ apiUrl: "http://api.github.test", repository: "owner/repo" },
				vi.fn<typeof fetch>(),
			),
		).rejects.toThrow("must use HTTPS");

		await expect(
			fetchGitHubSyntaxIssues(
				{ apiUrl: "https://api.github.test", repository: "owner/repo" },
				vi
					.fn<typeof fetch>()
					.mockResolvedValue(
						new Response("x".repeat(1024 * 1024 + 1), { status: 200 }),
					),
			),
		).rejects.toThrow("exceeds the 1 MiB limit");
	});

	it("does not expose an untrusted HTTP error body", async () => {
		const response = new Response("attacker-controlled detail", {
			status: 500,
		});
		const cancel = vi.spyOn(response.body as ReadableStream, "cancel");
		const request = vi.fn<typeof fetch>().mockResolvedValue(response);

		await expect(
			fetchGitHubSyntaxIssues(
				{ apiUrl: "https://api.github.test", repository: "owner/repo" },
				request,
			),
		).rejects.not.toThrow("attacker-controlled detail");
		expect(request).toHaveBeenCalledOnce();
		expect(cancel).toHaveBeenCalledOnce();
	});
});
