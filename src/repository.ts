import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

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
	const candidates =
		requestedPath === undefined ? standardCodeownersPaths : [requestedPath];

	for (const candidate of candidates) {
		const absolutePath = resolveWithin(root, candidate);
		if (await isFile(absolutePath)) {
			return {
				absolutePath,
				relativePath: normalizePath(relative(root, absolutePath)),
				source: await readFile(absolutePath, "utf8"),
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
	const output = await runGit(["-C", root, "ls-files", "--cached", "-z"]);

	return output.split("\0").filter(Boolean).map(normalizePath).sort();
}

function resolveWithin(root: string, candidate: string): string {
	const absolutePath = resolve(root, candidate);
	const relativePath = relative(root, absolutePath);

	if (
		relativePath === ".." ||
		relativePath.startsWith(`..${sep}`) ||
		isAbsolute(relativePath)
	) {
		throw new Error(
			`CODEOWNERS path must stay within the repository: ${candidate}`,
		);
	}

	return absolutePath;
}

async function isFile(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isFile();
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") {
			return false;
		}
		throw error;
	}
}

function runGit(arguments_: string[]): Promise<string> {
	return new Promise((resolvePromise, reject) => {
		execFile(
			"git",
			arguments_,
			{ encoding: "utf8", maxBuffer: 100 * 1024 * 1024 },
			(error, stdout, stderr) => {
				if (error === null) {
					resolvePromise(stdout);
					return;
				}

				const detail = stderr.trim() || error.message;
				reject(
					new Error(`Unable to list tracked files: ${detail}`, {
						cause: error,
					}),
				);
			},
		);
	});
}

function normalizePath(path: string): string {
	return path.replaceAll("\\", "/");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}
