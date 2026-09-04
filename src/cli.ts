#!/usr/bin/env node

import { parseArgs } from "node:util";

import {
	localCheckNames,
	parseChecks,
	parseNonNegativeInteger,
	parseSeverity,
} from "./config.js";
import { escapeTerminalText } from "./display.js";
import { shouldFail } from "./model.js";
import { formatTextReport } from "./report.js";
import { validateRepository } from "./validate-repository.js";
import { version } from "./version.js";

async function main(): Promise<void> {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		strict: true,
		options: {
			"api-url": { type: "string" },
			checks: { type: "string", short: "c" },
			codeowners: { type: "string" },
			exclude: { type: "string", multiple: true },
			"fail-on": { type: "string" },
			format: { type: "string", short: "f" },
			help: { type: "boolean", short: "h" },
			"max-issues": { type: "string" },
			ref: { type: "string" },
			repository: { type: "string", short: "r" },
			version: { type: "boolean", short: "v" },
		},
	});
	if (positionals.length > 1) {
		throw new Error("Expected at most one repository path");
	}

	if (values.help === true) {
		console.log(helpText);
		return;
	}
	if (values.version === true) {
		console.log(version);
		return;
	}

	const checks = parseChecks(values.checks ?? "", localCheckNames);
	const failOn = parseSeverity(values["fail-on"] ?? "", "warning");
	const maxIssues = parseNonNegativeInteger(
		values["max-issues"] ?? "",
		1_000,
		10_000,
		"max-issues",
	);
	const format = values.format ?? "text";
	if (format !== "text" && format !== "json") {
		throw new Error('format must be either "text" or "json"');
	}

	const repository = values.repository ?? process.env.GITHUB_REPOSITORY;
	if (checks.has("syntax") && (repository === undefined || repository === "")) {
		throw new Error(
			"--repository is required when the syntax check is enabled",
		);
	}

	const result = await validateRepository({
		repositoryPath: positionals[0] ?? ".",
		checks,
		exclude: values.exclude ?? [],
		maxIssues,
		...(values.codeowners === undefined
			? {}
			: { codeownersPath: values.codeowners }),
		...(checks.has("syntax")
			? {
					github: {
						apiUrl:
							values["api-url"] ??
							process.env.GITHUB_API_URL ??
							"https://api.github.com",
						repository: repository ?? "",
						token: process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "",
						...(values.ref === undefined ? {} : { ref: values.ref }),
					},
				}
			: {}),
	});

	console.log(
		format === "json"
			? JSON.stringify({ valid: result.issueCount === 0, ...result }, null, 2)
			: formatTextReport(result),
	);
	process.exitCode = shouldFail(result, failOn) ? 1 : 0;
}

const helpText = `codeowners-guard [repository-path] [options]

Checks a repository's effective CODEOWNERS file.

Options:
\x20\x20-c, --checks <list>       Comma-separated checks (default: duplicates,dangling,unowned)
\x20\x20\x20\x20\x20\x20--codeowners <path>   Use a specific CODEOWNERS file for local checks
      --exclude <pattern>   Exclude files from local checks (repeatable)
      --fail-on <severity>  Failure threshold: warning or error (default: warning)
      --max-issues <count>  Maximum retained issue details (default: 1000, max: 10000)
  -f, --format <format>     Output format: text or json (default: text)
  -r, --repository <repo>   GitHub owner/name, required by the syntax check
      --ref <ref>           GitHub branch, tag, or commit to validate
      --api-url <url>       GitHub API URL (default: https://api.github.com)
  -v, --version             Print the version
  -h, --help                Show this help

Environment:
  GITHUB_TOKEN or GH_TOKEN  Token for authenticated GitHub API access`;

main().catch((error: unknown) => {
	console.error(
		escapeTerminalText(error instanceof Error ? error.message : String(error)),
	);
	process.exitCode = 2;
});
