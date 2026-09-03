import * as core from "@actions/core";

import {
	parseChecks,
	parseNonNegativeInteger,
	parseSeverity,
} from "./config.js";
import { escapeHtmlText, escapeTerminalText } from "./display.js";
import { checkNames, shouldFail } from "./model.js";
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
		"max-annotations",
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
		maxIssues: maxAnnotations,
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

	emitAnnotations(result);
	await writeJobSummary(result);
	setOutputs(result);

	if (shouldFail(result, failOn)) {
		core.setFailed(
			`CODEOWNERS validation found ${result.issueCount} issue${result.issueCount === 1 ? "" : "s"}`,
		);
	} else {
		core.info(
			`CODEOWNERS validation passed with ${result.warningCount} warning(s)`,
		);
	}
}

function emitAnnotations(result: RepositoryValidationResult): void {
	for (const issue of result.issues) {
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

	if (result.issueCount > result.issues.length) {
		const omitted = result.issueCount - result.issues.length;
		core.info(
			`${omitted}${result.issues.length === 0 ? "" : " additional"} issue${omitted === 1 ? "" : "s"} omitted from annotations`,
		);
	}
}

async function writeJobSummary(
	result: RepositoryValidationResult,
): Promise<void> {
	core.summary
		.addHeading("CODEOWNERS Guard", 2)
		.addRaw(
			`${result.issueCount} issue(s), ${result.stats.files} tracked file(s), ${result.stats.rules} rule(s).\n`,
		);

	if (result.issues.length > 0) {
		core.summary.addTable([
			[
				{ data: "Severity", header: true },
				{ data: "Check", header: true },
				{ data: "Location", header: true },
				{ data: "Message", header: true },
			],
			...result.issues.map((issue) => [
				issue.severity,
				issue.check,
				escapeHtmlText(
					`${issue.path}${issue.line === undefined ? "" : `:${issue.line}`}`,
				),
				escapeHtmlText(formatIssueMessage(issue)),
			]),
		]);
	} else if (result.issueCount === 0) {
		core.summary.addRaw("No issues found.\n");
	} else {
		core.summary.addRaw("Issue details were omitted by max-annotations.\n");
	}

	await core.summary.write();
}

function setOutputs(result: RepositoryValidationResult): void {
	core.setOutput("valid", result.issueCount === 0);
	core.setOutput("issue-count", result.issueCount);
	core.setOutput("error-count", result.errorCount);
	core.setOutput("warning-count", result.warningCount);
}
