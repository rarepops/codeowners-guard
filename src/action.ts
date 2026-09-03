import * as core from "@actions/core";

import {
	parseChecks,
	parseNonNegativeInteger,
	parseSeverity,
} from "./config.js";
import { escapeHtmlText, escapeTerminalText } from "./display.js";
import { checkNames, shouldFail, type ValidationIssue } from "./model.js";
import { resolveRealPathWithin } from "./path.js";
import { formatIssueMessage } from "./report.js";
import {
	type RepositoryValidationResult,
	validateRepository,
} from "./validate-repository.js";

export async function runAction(): Promise<void> {
	const workspace = process.env.GITHUB_WORKSPACE;
	if (workspace === undefined || workspace === "") {
		throw new Error(
			"GITHUB_WORKSPACE is not set. Check out the repository before running the action.",
		);
	}

	const checks = parseChecks(core.getInput("checks"), checkNames);
	const failOn = parseSeverity(core.getInput("fail-on"), "warning");
	const maxAnnotations = parseNonNegativeInteger(
		core.getInput("max-annotations"),
		50,
		100,
	);
	const repository =
		core.getInput("repository") || process.env.GITHUB_REPOSITORY || "";
	const ref = core.getInput("ref") || process.env.GITHUB_SHA || "";
	const apiUrl = process.env.GITHUB_API_URL || "https://api.github.com";
	const requestedCodeownersPath = core.getInput("codeowners");
	const token = core.getInput("github-token");
	if (token !== "") {
		core.setSecret(token);
	}
	const repositoryPath = await resolveRealPathWithin(
		workspace,
		core.getInput("path") || ".",
	);

	const result = await validateRepository({
		repositoryPath,
		checks,
		exclude: core.getMultilineInput("exclude"),
		...(requestedCodeownersPath === ""
			? {}
			: { codeownersPath: requestedCodeownersPath }),
		...(checks.has("syntax")
			? {
					github: {
						apiUrl,
						repository,
						token,
						ref,
					},
				}
			: {}),
	});

	emitAnnotations(result.issues, maxAnnotations);
	await writeJobSummary(result, maxAnnotations);
	setOutputs(result);

	if (shouldFail(result.issues, failOn)) {
		core.setFailed(
			`CODEOWNERS validation found ${result.issues.length} issue${result.issues.length === 1 ? "" : "s"}`,
		);
	} else {
		core.info(
			`CODEOWNERS validation passed with ${result.issues.length} warning(s)`,
		);
	}
}

function emitAnnotations(
	issues: readonly ValidationIssue[],
	maximum: number,
): void {
	for (const issue of issues.slice(0, maximum)) {
		const properties: core.AnnotationProperties = {
			title: `CODEOWNERS ${issue.check}`,
			file: escapeTerminalText(issue.path),
		};
		if (issue.line !== undefined) {
			properties.startLine = issue.line;
			properties.endLine = issue.line;
		}
		if (issue.column !== undefined) {
			properties.startColumn = issue.column;
			properties.endColumn = issue.column;
		}

		const message = escapeTerminalText(formatIssueMessage(issue));
		if (issue.severity === "error") {
			core.error(message, properties);
		} else {
			core.warning(message, properties);
		}
	}

	if (issues.length > maximum) {
		const omitted = issues.length - maximum;
		core.info(
			`${omitted}${maximum === 0 ? "" : " additional"} issue${omitted === 1 ? "" : "s"} omitted from annotations`,
		);
	}
}

async function writeJobSummary(
	result: RepositoryValidationResult,
	maximum: number,
): Promise<void> {
	core.summary
		.addHeading("CODEOWNERS Guard", 2)
		.addRaw(
			`${result.issues.length} issue(s), ${result.stats.files} tracked file(s), ${result.stats.rules} rule(s).\n`,
		);

	if (result.issues.length > 0) {
		core.summary.addTable([
			[
				{ data: "Severity", header: true },
				{ data: "Check", header: true },
				{ data: "Location", header: true },
				{ data: "Message", header: true },
			],
			...result.issues
				.slice(0, maximum)
				.map((issue) => [
					issue.severity,
					issue.check,
					escapeHtmlText(
						`${issue.path}${issue.line === undefined ? "" : `:${issue.line}`}`,
					),
					escapeHtmlText(formatIssueMessage(issue)),
				]),
		]);
	} else {
		core.summary.addRaw("No issues found.\n");
	}

	await core.summary.write();
}

function setOutputs(result: RepositoryValidationResult): void {
	const errorCount = result.issues.filter(
		(issue) => issue.severity === "error",
	).length;
	core.setOutput("valid", result.issues.length === 0);
	core.setOutput("issue-count", result.issues.length);
	core.setOutput("error-count", errorCount);
	core.setOutput("warning-count", result.issues.length - errorCount);
}
