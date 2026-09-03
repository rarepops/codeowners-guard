import type { ValidationIssue } from "./model.js";

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
): Promise<ValidationIssue[]> {
	const [owner, repository, extra] = options.repository.split("/");
	if (owner === undefined || repository === undefined || extra !== undefined) {
		throw new Error(
			`Repository must use the owner/name format: ${options.repository}`,
		);
	}

	const baseUrl = options.apiUrl.replace(/\/+$/u, "");
	const url = new URL(
		`${baseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/codeowners/errors`,
	);
	if (options.ref !== undefined && options.ref !== "") {
		url.searchParams.set("ref", options.ref);
	}

	const headers = new Headers({
		accept: "application/vnd.github+json",
		"user-agent": "codeowners-guard",
	});
	if (options.token !== undefined && options.token !== "") {
		headers.set("authorization", `Bearer ${options.token}`);
	}

	const response = await fetchImplementation(url, { headers });
	if (!response.ok) {
		const detail = await response.text();
		throw new Error(
			`GitHub CODEOWNERS validation failed with ${response.status}: ${detail || response.statusText}`,
		);
	}

	const body: unknown = await response.json();
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
				typeof error.line === "number" &&
				typeof error.column === "number" &&
				typeof error.kind === "string" &&
				typeof error.message === "string" &&
				typeof error.path === "string" &&
				(typeof error.suggestion === "string" || error.suggestion === null),
		)
	);
}
