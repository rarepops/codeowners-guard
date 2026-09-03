import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { validateRepository } from "../src/validate-repository.js";

describe("validateRepository", () => {
	it("runs duplicate-only validation without a Git repository", async () => {
		const root = await mkdtemp(join(tmpdir(), "codeowners-guard-"));
		await writeFile(
			join(root, "CODEOWNERS"),
			["*.md @docs", "*.md @writers"].join("\n"),
		);

		const result = await validateRepository({
			repositoryPath: root,
			checks: new Set(["duplicates"]),
		});

		expect(result.issues).toEqual([
			expect.objectContaining({ check: "duplicates", line: 2 }),
		]);
		expect(result.stats.files).toBe(0);
	});
});
