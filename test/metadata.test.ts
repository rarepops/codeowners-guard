import { execFileSync } from "node:child_process";
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

interface PackageMetadata {
	version: string;
	license: string;
	packageManager: string;
	engines: { node: string };
	devDependencies: Record<string, string>;
	files: string[];
}

interface SourceMap {
	sources: string[];
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

	it("publishes the validated tarball to npm through trusted publishing", async () => {
		const release = await readFile(
			resolve(".github/workflows/release.yml"),
			"utf8",
		);

		expect(release).toContain("if: github.ref_type == 'tag'");
		expect(release).toContain("id-token: write");
		expect(release).toContain("registry-url: https://registry.npmjs.org");
		expect(release).toContain('npm publish "$package" --access public');
		expect(release).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN/u);
	});

	it("stores the packaged CLI as executable", () => {
		const entry = execFileSync("git", ["ls-files", "--stage", "dist/cli.js"], {
			encoding: "utf8",
		});

		expect(entry).toMatch(/^100755 /u);
	});

	it("keeps release and license metadata aligned", async () => {
		const [packageSource, readme, license, nodeVersion] = await Promise.all([
			readFile(resolve("package.json"), "utf8"),
			readFile(resolve("README.md"), "utf8"),
			readFile(resolve("LICENSE.md"), "utf8"),
			readFile(resolve(".node-version"), "utf8"),
		]);
		const packageMetadata = JSON.parse(packageSource) as PackageMetadata;

		expect(readme).toContain(
			`rarepops/codeowners-guard@v${packageMetadata.version}`,
		);
		expect(packageMetadata.license).toBe("SEE LICENSE IN LICENSE.md");
		expect(license).toMatch(/^# PolyForm Perimeter License 1\.0\.1$/mu);
		expect(nodeVersion.trim()).toMatch(/^24\./u);
		expect(packageMetadata.engines.node).toBe(">=24");
		expect(packageMetadata.packageManager).toMatch(/^npm@11\./u);
		expect(packageMetadata.devDependencies["@types/node"]).toMatch(/^24\./u);
	});

	it("ships notices for every package embedded in the bundles", async () => {
		const [cliMapSource, actionMapSource, notices] = await Promise.all([
			readFile(resolve("dist/cli.js.map"), "utf8"),
			readFile(resolve("dist/index.cjs.map"), "utf8"),
			readFile(resolve("THIRD_PARTY_NOTICES.md"), "utf8"),
		]);
		const sources = [cliMapSource, actionMapSource].flatMap(
			(source) => (JSON.parse(source) as SourceMap).sources,
		);
		const packageNames = [
			...new Set(
				sources.flatMap((source) => {
					const parts = source.replaceAll("\\", "/").split("/");
					const index = parts.lastIndexOf("node_modules");
					const first = parts[index + 1];
					const second = parts[index + 2];
					if (index === -1 || first === undefined) {
						return [];
					}
					return [
						first.startsWith("@") && second !== undefined
							? `${first}/${second}`
							: first,
					];
				}),
			),
		].sort();
		const noticedPackages = [...notices.matchAll(/^## (\S+) \S+$/gmu)]
			.map((match) => match[1])
			.filter((name): name is string => name !== undefined)
			.sort();

		expect(packageNames).toEqual([
			"@actions/core",
			"@actions/exec",
			"@actions/http-client",
			"@actions/io",
			"ignore",
			"tunnel",
			"undici",
		]);
		expect(noticedPackages).toEqual(packageNames);
		expect(notices).toContain("## ignore 7.0.8");
	});

	it("includes the logo and notices in the npm package", async () => {
		const packageMetadata = JSON.parse(
			await readFile(resolve("package.json"), "utf8"),
		) as PackageMetadata;

		expect(packageMetadata.files).toEqual(
			expect.arrayContaining([
				"assets/codeowners-guard.png",
				"dist/cli.js",
				"THIRD_PARTY_NOTICES.md",
			]),
		);
		await expect(
			readFile(resolve("assets/codeowners-guard.png")),
		).resolves.not.toHaveLength(0);
	});
});
