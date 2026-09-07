import { posix, win32 } from "node:path";

import { escapeTerminalText } from "./display.js";
import { compileRules, findOwningRule } from "./matcher.js";
import { type CodeownersRule, parseCodeowners } from "./parser.js";
import { loadCodeownersFile } from "./repository.js";

export interface OwnershipExplanation {
	path: string;
	codeownersPath: string;
	matches: CodeownersRule[];
	winner: CodeownersRule | null;
	owners: string[];
	status: "owned" | "cleared" | "unmatched";
}

export async function explainOwnership(
	repositoryPath: string,
	requestedPath: string,
	codeownersPath?: string,
): Promise<OwnershipExplanation> {
	const path = posix.normalize(requestedPath.replaceAll("\\", "/"));
	if (
		win32.isAbsolute(requestedPath) ||
		/^[a-z]:/iu.test(requestedPath) ||
		path === "." ||
		path === ".." ||
		path.startsWith("../") ||
		path.endsWith("/") ||
		path.includes("\0")
	) {
		throw new Error("--explain requires a repository-relative file path");
	}
	const codeowners = await loadCodeownersFile(repositoryPath, codeownersPath);
	const rules = compileRules(parseCodeowners(codeowners.source));
	const matches = rules
		.filter((rule) => rule.matches(path))
		.map(({ rule }) => rule);
	const winner = findOwningRule(rules, path) ?? null;
	const owners = winner?.owners ?? [];
	return {
		path,
		codeownersPath: codeowners.relativePath,
		matches,
		winner,
		owners,
		status:
			winner === null ? "unmatched" : owners.length === 0 ? "cleared" : "owned",
	};
}

export function formatOwnershipExplanation(
	result: OwnershipExplanation,
): string {
	const lines = [
		`Ownership for ${result.path}`,
		`CODEOWNERS: ${result.codeownersPath}`,
		"Local rules only; syntax and owner validity are not checked.",
	];
	for (const rule of result.matches) {
		lines.push(
			`${result.codeownersPath}:${rule.line} ${rule.pattern} -> ${rule.owners.join(" ") || "(no owners)"}${rule.line === result.winner?.line ? " [winner]" : " [overridden]"}`,
		);
	}
	lines.push(
		result.status === "unmatched"
			? "Unowned: no matching rule."
			: result.status === "cleared"
				? "Unowned: the winning rule clears ownership."
				: `Effective owners: ${result.owners.join(" ")}`,
	);
	return lines.map(escapeTerminalText).join("\n");
}
