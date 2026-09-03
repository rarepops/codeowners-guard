import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

export default function buildBundles(): void {
	execFileSync(process.execPath, [resolve("scripts/build.mjs")], {
		stdio: "ignore",
	});
}
