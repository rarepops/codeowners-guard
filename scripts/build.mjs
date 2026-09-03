import { chmod, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const packageMetadata = JSON.parse(
	await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const shared = {
	bundle: true,
	define: { __VERSION__: JSON.stringify(packageMetadata.version) },
	legalComments: "eof",
	logLevel: "info",
	metafile: true,
	minify: true,
	platform: "node",
	sourcemap: true,
};

await rm(new URL("../dist", import.meta.url), { recursive: true, force: true });
const buildResults = await Promise.all([
	build({
		...shared,
		entryPoints: ["src/action-entry.ts"],
		format: "cjs",
		outfile: "dist/index.cjs",
		target: "node24",
	}),
	build({
		...shared,
		entryPoints: ["src/cli.ts"],
		format: "esm",
		outfile: "dist/cli.js",
		target: "node24",
	}),
]);

await chmod(new URL("../dist/cli.js", import.meta.url), 0o755);
await writeThirdPartyNotices(
	buildResults.flatMap(({ metafile }) => Object.keys(metafile.inputs)),
);

async function writeThirdPartyNotices(inputs) {
	const packageNames = new Set();
	for (const input of inputs) {
		const parts = input.replaceAll("\\", "/").split("/");
		const nodeModulesIndex = parts.lastIndexOf("node_modules");
		if (nodeModulesIndex === -1) {
			continue;
		}
		const first = parts[nodeModulesIndex + 1];
		const second = parts[nodeModulesIndex + 2];
		if (first !== undefined) {
			packageNames.add(
				first.startsWith("@") && second !== undefined
					? `${first}/${second}`
					: first,
			);
		}
	}

	const repositoryRoot = dirname(
		fileURLToPath(new URL("../package.json", import.meta.url)),
	);
	const sections = [];
	for (const packageName of [...packageNames].sort()) {
		const packageRoot = join(repositoryRoot, "node_modules", packageName);
		const metadata = JSON.parse(
			await readFile(join(packageRoot, "package.json"), "utf8"),
		);
		const licenseFile = (await readdir(packageRoot))
			.sort()
			.find((name) => /^(?:LICEN[CS]E|COPYING|NOTICE)(?:[-.]|$)/iu.test(name));
		if (licenseFile === undefined) {
			throw new Error(
				`No license file found for bundled package ${packageName}`,
			);
		}
		const repository =
			typeof metadata.repository === "string"
				? metadata.repository
				: metadata.repository?.url;
		const source =
			metadata.homepage ??
			repository ??
			`https://www.npmjs.com/package/${packageName}`;
		const license = (
			await readFile(join(packageRoot, licenseFile), "utf8")
		).trim();
		sections.push(
			`## ${packageName} ${metadata.version}\n\nSource: ${source}\n\nLicense: ${metadata.license ?? "See package license"}\n\n\`\`\`text\n${license}\n\`\`\``,
		);
	}

	const notice = [
		"# Third-Party Notices",
		"",
		"This file is generated from the packages embedded in the distributed bundles. Do not edit it manually.",
		"",
		...sections.flatMap((section, index) =>
			index === 0 ? [section] : ["---", "", section],
		),
		"",
	].join("\n");
	await writeFile(
		join(repositoryRoot, "THIRD_PARTY_NOTICES.md"),
		notice,
		"utf8",
	);
}
