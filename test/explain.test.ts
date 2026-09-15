import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
	explainOwnership,
	formatOwnershipExplanation,
} from "../src/explain.js";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

async function fixture(source: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "codeowners-explain-"));
	roots.push(root);
	await writeFile(join(root, "CODEOWNERS"), source);
	return root;
}

describe("ownership explanations", () => {
	it("reports all matching lines and the last winner without requiring a tracked file", async () => {
		const root = await fixture(
			"# owners\n* @all\n/src/ @team\n/src/app.ts @app @backup\n",
		);
		const result = await explainOwnership(root, ".\\src\\app.ts");
		expect(result.path).toBe("src/app.ts");
		expect(result.matches.map((rule) => rule.line)).toEqual([2, 3, 4]);
		expect(result.winner).toEqual(result.matches[2]);
		expect(result.owners).toEqual(["@app", "@backup"]);
		expect(result.status).toBe("owned");
		expect(formatOwnershipExplanation(result)).toContain(
			"CODEOWNERS:4 /src/app.ts -> @app @backup [winner]",
		);
		expect(formatOwnershipExplanation(result)).toContain("[overridden]");
	});

	it("distinguishes ownerless overrides from no matching rule", async () => {
		const root = await fixture("/src/ @team\n/src/private/\n");
		const cleared = await explainOwnership(root, "src/private/key.ts");
		expect(cleared.status).toBe("cleared");
		expect(cleared.winner?.line).toBe(2);
		expect(cleared.owners).toEqual([]);
		expect(formatOwnershipExplanation(cleared)).toContain(
			"winning rule clears ownership",
		);
		const unmatched = await explainOwnership(root, "README.md");
		expect(unmatched).toMatchObject({
			status: "unmatched",
			winner: null,
			matches: [],
			owners: [],
		});
		expect(formatOwnershipExplanation(unmatched)).toContain("no matching rule");
	});

	it("supports explicit CODEOWNERS files and escapes terminal controls", async () => {
		const root = await fixture("* @default");
		await writeFile(join(root, "OWNERS"), "*.ts @custom\n");
		const result = await explainOwnership(root, "\u001b[31m.ts", "OWNERS");
		expect(result.codeownersPath).toBe("OWNERS");
		expect(result.owners).toEqual(["@custom"]);
		expect(formatOwnershipExplanation(result)).not.toContain("\u001b");
	});

	it("uses the effective file and preserves case-sensitive matching", async () => {
		const root = await fixture("*.ts @typescript\n");
		expect((await explainOwnership(root, "src/../app.ts")).owners).toEqual([
			"@typescript",
		]);
		expect((await explainOwnership(root, "APP.TS")).status).toBe("unmatched");
		await expect(
			explainOwnership(root, "app.ts", "../CODEOWNERS"),
		).rejects.toThrow("within the repository");
	});

	it("follows GitHub's documented docs/* example for nested files", async () => {
		const root = await fixture("* @a\ndocs/* @b\n");

		const nested = await explainOwnership(
			root,
			"docs/build-app/troubleshooting.md",
		);
		expect(nested.winner?.line).toBe(1);
		expect(nested.matches.map((rule) => rule.line)).toEqual([1]);

		const direct = await explainOwnership(root, "docs/getting-started.md");
		expect(direct.winner?.line).toBe(2);
		expect(direct.matches.map((rule) => rule.line)).toEqual([1, 2]);
	});

	it.each([
		"",
		".",
		"..",
		"../outside",
		"src/../../outside",
		"/absolute",
		"C:\\outside",
		"C:outside",
		"src/",
		"bad\0path",
	])("rejects invalid file path %j", async (path) => {
		await expect(explainOwnership(".", path)).rejects.toThrow(
			"repository-relative file path",
		);
	});
});
