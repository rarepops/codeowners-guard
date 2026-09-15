import { describe, expect, it } from "vitest";

import {
	formatShadowedMessage,
	isCatchAllPattern,
	ShadowTracker,
	shadowedRuleSuggestion,
} from "../src/shadowing.js";

describe("ShadowTracker", () => {
	it("reports rules that match files but never win one", () => {
		const tracker = new ShadowTracker(5);
		tracker.observe([0, 1, 2]);
		tracker.observe([0, 1, 3]);
		tracker.observe([0, 1, 2]);
		tracker.observe([0]);
		tracker.observe([]);

		expect(tracker.shadowedRules()).toEqual([
			{ index: 1, matchedFiles: 3, overridingIndices: [2, 3] },
		]);
	});

	it("does not report a rule that wins a file after being overridden", () => {
		const tracker = new ShadowTracker(2);
		tracker.observe([0, 1]);
		tracker.observe([0]);

		expect(tracker.shadowedRules()).toEqual([]);
	});

	it("does not report a rule that won a file before being overridden", () => {
		const tracker = new ShadowTracker(2);
		tracker.observe([0]);
		tracker.observe([0, 1]);

		expect(tracker.shadowedRules()).toEqual([]);
	});
});

describe("isCatchAllPattern", () => {
	it.each(["*", "**", "/**"])("exempts %s", (pattern) => {
		expect(isCatchAllPattern(pattern)).toBe(true);
	});

	it.each(["/*", "*.js", "/docs/", "**/docs"])(
		"does not exempt %s",
		(pattern) => {
			expect(isCatchAllPattern(pattern)).toBe(false);
		},
	);
});

describe("formatShadowedMessage", () => {
	const cases: Array<[number, number[], string]> = [
		[
			1,
			[5],
			'Pattern "/tools/" never takes effect: its only matching file is overridden by line 5',
		],
		[
			7,
			[5, 7],
			'Pattern "/tools/" never takes effect: all 7 matching files are overridden by lines 5 and 7',
		],
		[
			7,
			[5, 7, 9],
			'Pattern "/tools/" never takes effect: all 7 matching files are overridden by lines 5, 7 and 9',
		],
		[
			7,
			[5, 7, 9, 11],
			'Pattern "/tools/" never takes effect: all 7 matching files are overridden by lines 5, 7, 9 and 1 more',
		],
		[
			7,
			[5, 7, 9, 11, 13, 15],
			'Pattern "/tools/" never takes effect: all 7 matching files are overridden by lines 5, 7, 9 and 3 more',
		],
	];

	it.each(cases)(
		"formats %i files overridden by lines %j",
		(matchedFiles, lines, expected) => {
			expect(formatShadowedMessage("/tools/", matchedFiles, lines)).toBe(
				expected,
			);
		},
	);

	it("offers the documented suggestion", () => {
		expect(shadowedRuleSuggestion).toBe(
			"Remove the rule, or move it below the rules that override it if it should take precedence.",
		);
	});
});
