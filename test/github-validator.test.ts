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

	it("omits empty optional values and supplies the fallback error code", async () => {
		const request = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify({
					errors: [
						{
							line: 1,
							column: 1,
							kind: "",
							message: "Invalid",
							path: "CODEOWNERS",
							suggestion: "",
						},
					],
				}),
				{ status: 200 },
			),
		);

		const issues = await fetchGitHubSyntaxIssues(
			{
				apiUrl: "https://api.github.test",
				repository: "owner/repo",
				ref: "  ",
				token: "",
			},
			request,
		);

		const [url, init] = request.mock.calls[0] ?? [];
		expect(String(url)).not.toContain("ref=");
		expect(new Headers(init?.headers).has("authorization")).toBe(false);
		expect(issues).toEqual([
			{
				check: "syntax",
				code: "github-codeowners-error",
				severity: "error",
				path: "CODEOWNERS",
				line: 1,
				column: 1,
				message: "Invalid",
			},
		]);
	});

	it("validates repository names and API URL structure before requesting", async () => {
		for (const repository of ["owner", "/repo", "owner/", "owner/repo/extra"]) {
			await expect(
				fetchGitHubSyntaxIssues(
					{ apiUrl: "https://api.github.test", repository },
					vi.fn<typeof fetch>(),
				),
			).rejects.toThrow("owner/name format");
		}

		for (const [apiUrl, message] of [
			["not a URL", "Invalid GitHub API URL"],
			["https://user:secret@api.github.test", "must not contain credentials"],
			["https://api.github.test?token=secret", "query or fragment"],
			["https://api.github.test#fragment", "query or fragment"],
		] as const) {
			await expect(
				fetchGitHubSyntaxIssues(
					{ apiUrl, repository: "owner/repo" },
					vi.fn<typeof fetch>(),
				),
			).rejects.toThrow(message);
		}
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

	it("caps an HTTP-date Retry-After value", async () => {
		const retryAt = new Date(Date.now() + 60_000).toUTCString();
		const request = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				new Response("Rate limited", {
					status: 429,
					headers: { "retry-after": retryAt },
				}),
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ errors: [] }), { status: 200 }),
			);
		const sleep = vi.fn<(milliseconds: number) => Promise<void>>(() =>
			Promise.resolve(),
		);

		await fetchGitHubSyntaxIssues(
			{ apiUrl: "https://api.github.test", repository: "owner/repo" },
			request,
			sleep,
		);

		expect(sleep).toHaveBeenCalledWith(10_000);
	});

	it("maps authentication, authorization, rate-limit, and other failures", async () => {
		for (const [status, message] of [
			[401, "authentication failed"],
			[403, "denied CODEOWNERS access"],
			[418, "validation failed with 418"],
		] as const) {
			await expect(
				fetchGitHubSyntaxIssues(
					{ apiUrl: "https://api.github.test", repository: "owner/repo" },
					vi
						.fn<typeof fetch>()
						.mockResolvedValue(new Response("untrusted", { status })),
				),
			).rejects.toThrow(message);
		}

		const rateLimited = vi
			.fn<typeof fetch>()
			.mockImplementation(() =>
				Promise.resolve(new Response("untrusted", { status: 429 })),
			);
		await expect(
			fetchGitHubSyntaxIssues(
				{ apiUrl: "https://api.github.test", repository: "owner/repo" },
				rateLimited,
				() => Promise.resolve(),
			),
		).rejects.toThrow("rate-limited");
		expect(rateLimited).toHaveBeenCalledTimes(3);
	});

	it("wraps request timeouts and transport failures", async () => {
		const timeout = new Error("timed out");
		timeout.name = "TimeoutError";
		await expect(
			fetchGitHubSyntaxIssues(
				{ apiUrl: "https://api.github.test", repository: "owner/repo" },
				vi.fn<typeof fetch>().mockRejectedValue(timeout),
			),
		).rejects.toThrow("timed out after 15 seconds");

		await expect(
			fetchGitHubSyntaxIssues(
				{ apiUrl: "https://api.github.test", repository: "owner/repo" },
				vi.fn<typeof fetch>().mockRejectedValue(new Error("socket failed")),
			),
		).rejects.toThrow("validation request failed");
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

	it("rejects empty, invalid JSON, and declared-oversized responses", async () => {
		await expect(
			fetchGitHubSyntaxIssues(
				{ apiUrl: "https://api.github.test", repository: "owner/repo" },
				vi
					.fn<typeof fetch>()
					.mockResolvedValue(new Response(null, { status: 200 })),
			),
		).rejects.toThrow("empty CODEOWNERS response");

		await expect(
			fetchGitHubSyntaxIssues(
				{ apiUrl: "https://api.github.test", repository: "owner/repo" },
				vi.fn<typeof fetch>().mockResolvedValue(new Response("{")),
			),
		).rejects.toThrow("invalid JSON");

		const declaredOversized = new Response("{}", {
			status: 200,
			headers: { "content-length": String(1024 * 1024 + 1) },
		});
		const cancel = vi.spyOn(declaredOversized.body as ReadableStream, "cancel");
		await expect(
			fetchGitHubSyntaxIssues(
				{ apiUrl: "https://api.github.test", repository: "owner/repo" },
				vi.fn<typeof fetch>().mockResolvedValue(declaredOversized),
			),
		).rejects.toThrow("exceeds the 1 MiB limit");
		expect(cancel).toHaveBeenCalledOnce();
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
