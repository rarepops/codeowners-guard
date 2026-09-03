import { mkdir, mkdtemp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
	normalizeRepositoryPath,
	resolvePathWithin,
	resolveRealPathWithin,
} from "../src/path.js";

describe("repository paths", () => {
	it("normalizes repository-relative paths consistently", () => {
		expect(normalizeRepositoryPath(".\\src\\file.ts")).toBe("src/file.ts");
		expect(normalizeRepositoryPath("/src/file.ts/")).toBe("src/file.ts");
	});

	it("rejects lexical traversal", () => {
		expect(() => resolvePathWithin("repo", "../outside")).toThrow(
			"must stay within the repository",
		);
	});

	it.runIf(process.platform !== "win32")(
		"rejects a symlink that resolves outside the workspace",
		async () => {
			const workspace = await mkdtemp(join(tmpdir(), "codeowners-workspace-"));
			const outside = await mkdtemp(join(tmpdir(), "codeowners-outside-"));
			await symlink(outside, join(workspace, "repository"));

			await expect(
				resolveRealPathWithin(workspace, "repository"),
			).rejects.toThrow("must stay within the repository");
		},
	);

	it("resolves an existing directory within the workspace", async () => {
		const workspace = await mkdtemp(join(tmpdir(), "codeowners-workspace-"));
		await mkdir(join(workspace, "repository"));

		await expect(resolveRealPathWithin(workspace, "repository")).resolves.toBe(
			resolve(workspace, "repository"),
		);
	});
});
