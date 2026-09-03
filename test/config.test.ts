import { describe, expect, it } from "vitest";

import {
	parseChecks,
	parseNonNegativeInteger,
	parseSeverity,
} from "../src/config.js";
import type { CheckName } from "../src/model.js";

describe("configuration parsing", () => {
	it("uses defaults for an empty check list and accepts comma or whitespace separators", () => {
		const defaults: CheckName[] = ["duplicates", "unowned"];

		expect(parseChecks("", defaults)).toEqual(new Set(defaults));
		expect(parseChecks("syntax, duplicates unowned", defaults)).toEqual(
			new Set(["syntax", "duplicates", "unowned"]),
		);
	});

	it("rejects unknown checks", () => {
		expect(() => parseChecks("owners", [])).toThrow("Unknown check");
	});

	it("parses severity and annotation limits", () => {
		expect(parseSeverity("", "warning")).toBe("warning");
		expect(parseSeverity("ERROR", "warning")).toBe("error");
		expect(() => parseSeverity("notice", "warning")).toThrow("fail-on");

		expect(parseNonNegativeInteger("", 50, 100)).toBe(50);
		expect(parseNonNegativeInteger("0", 50, 100)).toBe(0);
		expect(() => parseNonNegativeInteger("-1", 50, 100)).toThrow(
			"max-annotations",
		);
		expect(() => parseNonNegativeInteger("1.5", 50, 100)).toThrow(
			"max-annotations",
		);
		expect(() => parseNonNegativeInteger("101", 50, 100)).toThrow("up to 100");
	});
});
