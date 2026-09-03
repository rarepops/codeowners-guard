import { chmod, readFile, rm } from "node:fs/promises";

import { build } from "esbuild";

const packageMetadata = JSON.parse(
	await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const shared = {
	bundle: true,
	define: { __VERSION__: JSON.stringify(packageMetadata.version) },
	legalComments: "eof",
	logLevel: "info",
	minify: true,
	platform: "node",
	sourcemap: true,
};

await rm(new URL("../dist", import.meta.url), { recursive: true, force: true });
await Promise.all([
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
