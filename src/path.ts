import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export function normalizeRepositoryPath(path: string): string {
	return path
		.replaceAll("\\", "/")
		.replace(/^(?:\.\/)+/u, "")
		.replace(/^\/+|\/+$/gu, "");
}

export function resolvePathWithin(root: string, candidate: string): string {
	const absoluteRoot = resolve(root);
	const absolutePath = resolve(absoluteRoot, candidate);
	assertPathWithin(absoluteRoot, absolutePath, candidate);
	return absolutePath;
}

export async function resolveRealPathWithin(
	root: string,
	candidate: string,
): Promise<string> {
	const absoluteRoot = await realpath(resolve(root));
	const absolutePath = resolvePathWithin(root, candidate);
	const realPath = await realpath(absolutePath);
	assertPathWithin(absoluteRoot, realPath, candidate);
	return realPath;
}

export function assertPathWithin(
	root: string,
	path: string,
	displayPath = path,
): void {
	const relativePath = relative(root, path);
	if (
		relativePath === ".." ||
		relativePath.startsWith(`..${sep}`) ||
		isAbsolute(relativePath)
	) {
		throw new Error(`Path must stay within the repository: ${displayPath}`);
	}
}
