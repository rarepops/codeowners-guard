import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { listTrackedFiles, loadCodeownersFile } from "../src/repository.js";

describe("repository access", () => {
	it("uses GitHub's standard CODEOWNERS location priority", async () => {
		const root = await mkdtemp(join(tmpdir(), "codeowners-guard-"));
		await mkdir(join(root, ".github"));
		await mkdir(join(root, "docs"));
		await writeFile(join(root, "CODEOWNERS"), "* @root");
		await writeFile(join(root, "docs", "CODEOWNERS"), "* @docs");
		await writeFile(join(root, ".github", "CODEOWNERS"), "* @github");

		const codeowners = await loadCodeownersFile(root);

		expect(codeowners.relativePath).toBe(".github/CODEOWNERS");
		expect(codeowners.source).toBe("* @github");
	});

	it("rejects an explicit path outside the repository", async () => {
		const root = await mkdtemp(join(tmpdir(), "codeowners-guard-"));

		await expect(loadCodeownersFile(root, "../CODEOWNERS")).rejects.toThrow(
			"must stay within the repository",
		);
	});

	it("lists tracked files without including untracked files", async () => {
		const root = await mkdtemp(join(tmpdir(), "codeowners-guard-"));
		execFileSync("git", ["init", "--quiet", root]);
		await writeFile(join(root, "tracked.txt"), "tracked");
		await writeFile(join(root, "untracked.txt"), "untracked");
		execFileSync("git", ["-C", root, "add", "tracked.txt"]);

		await expect(listTrackedFiles(root)).resolves.toEqual(["tracked.txt"]);
	});
});
