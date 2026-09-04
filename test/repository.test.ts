import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
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

	it("uses an explicitly requested CODEOWNERS file", async () => {
		const root = await mkdtemp(join(tmpdir(), "codeowners-guard-"));
		await mkdir(join(root, "config"));
		await writeFile(join(root, "CODEOWNERS"), "* @standard");
		await writeFile(join(root, "config", "OWNERS"), "* @explicit");

		const codeowners = await loadCodeownersFile(root, "config/OWNERS");

		expect(codeowners.relativePath).toBe("config/OWNERS");
		expect(codeowners.source).toBe("* @explicit");
	});

	it("lists every standard location when no CODEOWNERS file exists", async () => {
		const root = await mkdtemp(join(tmpdir(), "codeowners-guard-"));

		await expect(loadCodeownersFile(root)).rejects.toThrow(
			'No CODEOWNERS file found at ".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"',
		);
	});

	it("rejects an explicit path outside the repository", async () => {
		const root = await mkdtemp(join(tmpdir(), "codeowners-guard-"));

		await expect(loadCodeownersFile(root, "../CODEOWNERS")).rejects.toThrow(
			"must stay within the repository",
		);
	});

	it.runIf(process.platform !== "win32")(
		"rejects a symbolic-link CODEOWNERS file",
		async () => {
			const root = await mkdtemp(join(tmpdir(), "codeowners-guard-"));
			const outside = join(
				await mkdtemp(join(tmpdir(), "codeowners-outside-")),
				"rules",
			);
			await writeFile(outside, "* @outside");
			await symlink(outside, join(root, "CODEOWNERS"));

			await expect(loadCodeownersFile(root)).rejects.toThrow("symbolic link");
		},
	);

	it("rejects a CODEOWNERS file larger than GitHub's limit", async () => {
		const root = await mkdtemp(join(tmpdir(), "codeowners-guard-"));
		await writeFile(join(root, "CODEOWNERS"), "x".repeat(3 * 1024 * 1024 + 1));

		await expect(loadCodeownersFile(root)).rejects.toThrow("3 MiB limit");
	});

	it("lists tracked files without including untracked files", async () => {
		const root = await mkdtemp(join(tmpdir(), "codeowners-guard-"));
		execFileSync("git", ["init", "--quiet", root]);
		await writeFile(join(root, "tracked.txt"), "tracked");
		await writeFile(join(root, "space π.txt"), "tracked");
		await writeFile(join(root, "untracked.txt"), "untracked");
		execFileSync("git", ["-C", root, "add", "tracked.txt", "space π.txt"]);

		await expect(listTrackedFiles(root)).resolves.toEqual([
			"space π.txt",
			"tracked.txt",
		]);
	});

	it("reports when tracked files cannot be listed", async () => {
		const root = await mkdtemp(join(tmpdir(), "codeowners-guard-"));

		await expect(listTrackedFiles(root)).rejects.toThrow(
			"Unable to list tracked files",
		);
	});

	it.runIf(process.platform !== "win32")(
		"preserves newlines in NUL-delimited tracked filenames",
		async () => {
			const root = await mkdtemp(join(tmpdir(), "codeowners-guard-"));
			const filename = "line\nbreak.txt";
			execFileSync("git", ["init", "--quiet", root]);
			await writeFile(join(root, filename), "tracked");
			execFileSync("git", ["-C", root, "add", filename]);

			await expect(listTrackedFiles(root)).resolves.toEqual([filename]);
		},
	);
});
