import type { ValidationIssue } from "./model.js";

const maxResponseBytes = 1024 * 1024;
const requestTimeoutMs = 15_000;
const maximumAttempts = 3;
const maximumRetryDelayMs = 10_000;
const retryableStatuses = new Set([429, 502, 503, 504]);

type Sleep = (milliseconds: number) => Promise<unknown>;

interface GitHubCodeownersError {
	line: number;
	column: number;
	kind: string;
	message: string;
	path: string;
	suggestion: string | null;
}

interface GitHubCodeownersResponse {
	errors: GitHubCodeownersError[];
}

export interface GitHubValidationOptions {
	apiUrl: string;
	repository: string;
	token?: string;
	ref?: string;
}

export async function fetchGitHubSyntaxIssues(
	options: GitHubValidationOptions,
	fetchImplementation: typeof fetch = fetch,
	sleepImplementation: Sleep = (milliseconds) =>
		new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<ValidationIssue[]> {
	const [owner, repository, extra] = options.repository.split("/");
	if (
		owner === undefined ||
		owner === "" ||
		repository === undefined ||
		repository === "" ||
		extra !== undefined
	) {
		throw new Error(
			`Repository must use the owner/name format: ${options.repository}`,
		);
	}

	const url = buildRequestUrl(options.apiUrl, owner, repository);
	const ref = options.ref?.trim();
	if (ref !== undefined && ref !== "") {
		url.searchParams.set("ref", ref);
	}

	const headers = new Headers({
		accept: "application/vnd.github+json",
		"user-agent": "codeowners-guard",
	});
	if (options.token !== undefined && options.token !== "") {
		headers.set("authorization", `Bearer ${options.token}`);
	}

	const response = await fetchWithRetries(
		url,
		headers,
		options.repository,
		fetchImplementation,
		sleepImplementation,
	);

	const body = await readJsonResponse(response);
	if (!isGitHubResponse(body)) {
		throw new Error("GitHub returned an invalid CODEOWNERS error response");
	}

	return body.errors.map((error) => {
		const issue: ValidationIssue = {
			check: "syntax",
			code: error.kind || "github-codeowners-error",
			severity: "error",
			path: error.path,
			line: error.line,
			column: error.column,
			message: error.message,
		};
		if (error.suggestion !== null && error.suggestion !== "") {
			issue.suggestion = error.suggestion;
		}
		return issue;
	});
}

async function fetchWithRetries(
	url: URL,
	headers: Headers,
	repository: string,
	fetchImplementation: typeof fetch,
	sleepImplementation: Sleep,
): Promise<Response> {
	for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
		let response: Response;
		try {
			response = await fetchImplementation(url, {
				headers,
				redirect: "error",
				signal: AbortSignal.timeout(requestTimeoutMs),
			});
		} catch (error) {
			if (
				error instanceof Error &&
				(error.name === "TimeoutError" || error.name === "AbortError")
			) {
				throw new Error(
					`GitHub CODEOWNERS validation timed out after ${requestTimeoutMs / 1000} seconds`,
					{ cause: error },
				);
			}
			throw new Error("GitHub CODEOWNERS validation request failed", {
				cause: error,
			});
		}

		if (response.ok) {
			return response;
		}
		if (
			!retryableStatuses.has(response.status) ||
			attempt === maximumAttempts
		) {
			await response.body?.cancel().catch(() => undefined);
			throw createHttpError(response.status, repository);
		}

		await response.body?.cancel().catch(() => undefined);
		await sleepImplementation(retryDelay(response, attempt));
	}

	throw new Error("GitHub CODEOWNERS validation exhausted its retry budget");
}

function retryDelay(response: Response, attempt: number): number {
	const retryAfter = response.headers.get("retry-after")?.trim();
	let milliseconds: number | undefined;
	if (retryAfter !== undefined && /^\d+$/u.test(retryAfter)) {
		milliseconds = Number(retryAfter) * 1_000;
	} else if (retryAfter !== undefined) {
		const retryAt = Date.parse(retryAfter);
		if (Number.isFinite(retryAt)) {
			milliseconds = Math.max(0, retryAt - Date.now());
		}
	}

	return Math.min(
		milliseconds ?? 250 * 2 ** (attempt - 1),
		maximumRetryDelayMs,
	);
}

function buildRequestUrl(
	apiUrl: string,
	owner: string,
	repository: string,
): URL {
	let url: URL;
	try {
		url = new URL(apiUrl);
	} catch (error) {
		throw new Error(`Invalid GitHub API URL: ${apiUrl}`, { cause: error });
	}

	if (url.protocol !== "https:") {
		throw new Error("GitHub API URL must use HTTPS");
	}
	if (url.username !== "" || url.password !== "") {
		throw new Error("GitHub API URL must not contain credentials");
	}
	if (url.search !== "" || url.hash !== "") {
		throw new Error("GitHub API URL must not contain a query or fragment");
	}

	const basePath = url.pathname.replace(/\/+$/u, "");
	url.pathname = `${basePath}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/codeowners/errors`;
	return url;
}

function createHttpError(status: number, repository: string): Error {
	if (status === 401) {
		return new Error("GitHub authentication failed; check the supplied token");
	}
	if (status === 403) {
		return new Error(
			"GitHub denied CODEOWNERS access; check token permissions and rate limits",
		);
	}
	if (status === 404) {
		return new Error(
			`GitHub could not find ${repository}, its ref, or its CODEOWNERS file`,
		);
	}
	if (status === 429) {
		return new Error("GitHub rate-limited the CODEOWNERS request; retry later");
	}
	if (status >= 500) {
		return new Error(
			`GitHub CODEOWNERS service failed with ${status}; retry later`,
		);
	}
	return new Error(`GitHub CODEOWNERS validation failed with ${status}`);
}

async function readJsonResponse(response: Response): Promise<unknown> {
	const contentLength = response.headers.get("content-length");
	if (
		contentLength !== null &&
		Number.isFinite(Number(contentLength)) &&
		Number(contentLength) > maxResponseBytes
	) {
		await response.body?.cancel();
		throw new Error("GitHub CODEOWNERS response exceeds the 1 MiB limit");
	}

	if (response.body === null) {
		throw new Error("GitHub returned an empty CODEOWNERS response");
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let body = "";
	let bytes = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}
		bytes += value.byteLength;
		if (bytes > maxResponseBytes) {
			await reader.cancel();
			throw new Error("GitHub CODEOWNERS response exceeds the 1 MiB limit");
		}
		body += decoder.decode(value, { stream: true });
	}
	body += decoder.decode();

	try {
		return JSON.parse(body) as unknown;
	} catch (error) {
		throw new Error("GitHub returned invalid JSON for CODEOWNERS validation", {
			cause: error,
		});
	}
}

function isGitHubResponse(value: unknown): value is GitHubCodeownersResponse {
	if (typeof value !== "object" || value === null || !("errors" in value)) {
		return false;
	}

	const { errors } = value;
	return (
		Array.isArray(errors) &&
		errors.every(
			(error) =>
				typeof error === "object" &&
				error !== null &&
				Number.isSafeInteger(error.line) &&
				error.line > 0 &&
				Number.isSafeInteger(error.column) &&
				error.column > 0 &&
				typeof error.kind === "string" &&
				typeof error.message === "string" &&
				typeof error.path === "string" &&
				(typeof error.suggestion === "string" || error.suggestion === null),
		)
	);
}
