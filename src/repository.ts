import { spawn } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";

import {
	assertPathWithin,
	normalizeRepositoryPath,
	resolvePathWithin,
} from "./path.js";

const maxCodeownersBytes = 3 * 1024 * 1024;

const standardCodeownersPaths = [
	".github/CODEOWNERS",
	"CODEOWNERS",
	"docs/CODEOWNERS",
] as const;

export interface CodeownersFile {
	absolutePath: string;
	relativePath: string;
	source: string;
}

export async function loadCodeownersFile(
	repositoryPath: string,
	requestedPath?: string,
): Promise<CodeownersFile> {
	const root = resolve(repositoryPath);
	const realRoot = await realpath(root);
	const candidates =
		requestedPath === undefined ? standardCodeownersPaths : [requestedPath];

	for (const candidate of candidates) {
		const absolutePath = resolvePathWithin(root, candidate);
		const file = await getRegularFile(absolutePath, candidate);
		if (file !== undefined) {
			const realFile = await realpath(absolutePath);
			assertPathWithin(realRoot, realFile, candidate);
			if (file.size > maxCodeownersBytes) {
				throw new Error(
					`CODEOWNERS exceeds GitHub's 3 MiB limit: ${candidate}`,
				);
			}
			return {
				absolutePath: realFile,
				relativePath: normalizeRepositoryPath(relative(root, absolutePath)),
				source: await readFile(realFile, "utf8"),
			};
		}
	}

	const locations = candidates.map((path) => JSON.stringify(path)).join(", ");
	throw new Error(`No CODEOWNERS file found at ${locations}`);
}

export async function listTrackedFiles(
	repositoryPath: string,
): Promise<string[]> {
	const root = resolve(repositoryPath);
	return runGitFileList(root);
}

async function getRegularFile(
	path: string,
	displayPath: string,
): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
	try {
		const file = await lstat(path);
		if (file.isSymbolicLink()) {
			throw new Error(`CODEOWNERS must not be a symbolic link: ${displayPath}`);
		}
		return file.isFile() ? file : undefined;
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") {
			return undefined;
		}
		throw error;
	}
}

function runGitFileList(root: string): Promise<string[]> {
	return new Promise((resolvePromise, reject) => {
		const child = spawn("git", ["-C", root, "ls-files", "--cached", "-z"], {
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
		});
		const decoder = new StringDecoder("utf8");
		const files: string[] = [];
		let pending = "";
		let stderr = "";
		let settled = false;

		child.stdout.on("data", (chunk: Buffer) => {
			pending += decoder.write(chunk);
			let separator = pending.indexOf("\0");
			while (separator !== -1) {
				const path = pending.slice(0, separator);
				if (path !== "") {
					files.push(normalizeRepositoryPath(path));
				}
				pending = pending.slice(separator + 1);
				separator = pending.indexOf("\0");
			}
		});
		child.stderr.on("data", (chunk: Buffer) => {
			if (stderr.length < 8192) {
				stderr += chunk.toString("utf8", 0, 8192 - stderr.length);
			}
		});
		child.once("error", (error) => {
			settled = true;
			reject(
				new Error("Unable to start git while listing tracked files", {
					cause: error,
				}),
			);
		});
		child.once("close", (code, signal) => {
			if (settled) {
				return;
			}
			settled = true;
			pending += decoder.end();
			if (code === 0) {
				if (pending !== "") {
					files.push(normalizeRepositoryPath(pending));
				}
				resolvePromise(files.sort());
				return;
			}

			const detail = stderr.trim() || `git exited with ${code ?? signal}`;
			reject(new Error(`Unable to list tracked files: ${detail}`));
		});
	});
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}
