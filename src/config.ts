import { type CheckName, checkNames, type Severity } from "./model.js";

export const localCheckNames: readonly CheckName[] = [
	"duplicates",
	"dangling",
	"unowned",
];

export function parseChecks(
	value: string,
	defaults: readonly CheckName[],
): Set<CheckName> {
	const requested = value
		.split(/[\s,]+/u)
		.map((check) => check.trim().toLowerCase())
		.filter(Boolean);

	if (requested.length === 0) {
		return new Set(defaults);
	}

	const checks = new Set<CheckName>();
	for (const requestedCheck of requested) {
		if (!checkNames.includes(requestedCheck as CheckName)) {
			throw new Error(
				`Unknown check ${JSON.stringify(requestedCheck)}. Expected one of: ${checkNames.join(", ")}`,
			);
		}
		checks.add(requestedCheck as CheckName);
	}
	return checks;
}

export function parseSeverity(value: string, fallback: Severity): Severity {
	const severity = value.trim().toLowerCase() || fallback;
	if (severity !== "error" && severity !== "warning") {
		throw new Error('fail-on must be either "error" or "warning"');
	}
	return severity;
}

export function parseNonNegativeInteger(
	value: string,
	fallback: number,
	maximum: number,
): number {
	if (value.trim() === "") {
		return fallback;
	}

	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maximum) {
		throw new Error(
			`max-annotations must be a non-negative integer up to ${maximum}`,
		);
	}
	return parsed;
}
