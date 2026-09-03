import { describe, test } from "vitest";

import { validateLocal } from "../src/local-validator.js";
import type { CheckName } from "../src/model.js";

const duplicateOnly = new Set<CheckName>(["duplicates"]);
const ownershipChecks = new Set<CheckName>(["dangling", "unowned"]);

const duplicateSource = Array.from(
	{ length: 10_000 },
	(_, index) => `/packages/package-${index % 5_000}/ @team-${index % 20}`,
).join("\n");

const files = Array.from(
	{ length: 10_000 },
	(_, index) => `packages/package-${index % 100}/src/file-${index}.ts`,
);
const ownershipSource = Array.from(
	{ length: 100 },
	(_, index) => `/packages/package-${index}/ @team-${index % 20}`,
).join("\n");

describe("local validation", () => {
	test("duplicate-only throughput", async ({ bench }) => {
		const result = await bench("10,000 rules, duplicate-only", () => {
			validateLocal({
				source: duplicateSource,
				codeownersPath: "CODEOWNERS",
				files: [],
				checks: duplicateOnly,
			});
		}).run({ iterations: 3, time: 100, warmupIterations: 1, warmupTime: 0 });
		printResult(result);
	});

	test("ownership throughput", async ({ bench }) => {
		const result = await bench("10,000 files x 100 ownership rules", () => {
			validateLocal({
				source: ownershipSource,
				codeownersPath: "CODEOWNERS",
				files,
				checks: ownershipChecks,
			});
		}).run({ iterations: 3, time: 100, warmupIterations: 1, warmupTime: 0 });
		printResult(result);
	});
});

function printResult(result: {
	name: string;
	latency: { mean: number };
	throughput: { mean: number };
}): void {
	console.log(
		`${result.name}: ${result.latency.mean.toFixed(2)} ms/op, ${result.throughput.mean.toFixed(2)} ops/s`,
	);
}
