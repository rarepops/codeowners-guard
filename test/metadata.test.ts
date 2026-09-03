import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { parse, parseDocument } from "yaml";

interface ActionMetadata {
	inputs: Record<string, unknown>;
	outputs: Record<string, unknown>;
	runs: {
		using: string;
		main: string;
	};
}

describe("GitHub metadata", () => {
	it("defines the Node 24 Action contract", async () => {
		const source = await readFile(resolve("action.yml"), "utf8");
		const action = parse(source) as ActionMetadata;

		expect(action.runs).toEqual({ using: "node24", main: "dist/index.cjs" });
		expect(Object.keys(action.inputs).sort()).toEqual([
			"checks",
			"codeowners",
			"exclude",
			"fail-on",
			"github-api-url",
			"github-token",
			"max-annotations",
			"path",
			"ref",
			"repository",
		]);
		expect(Object.keys(action.outputs).sort()).toEqual([
			"error-count",
			"issue-count",
			"valid",
			"warning-count",
		]);
	});

	it("parses every workflow without YAML errors", async () => {
		const workflowDirectory = resolve(".github/workflows");
		const files = await readdir(workflowDirectory);

		for (const file of files) {
			const source = await readFile(resolve(workflowDirectory, file), "utf8");
			const document = parseDocument(source);
			expect(document.errors, file).toEqual([]);
		}
	});
});
