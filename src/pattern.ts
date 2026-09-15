export interface PatternSyntax {
	/** An unescaped `[` or `]` is present, so GitHub rejects the line. */
	invalid: boolean;
	/** Contains a slash and its last segment is exactly one unescaped `*`. */
	endsWithLoneStar: boolean;
}

interface PatternToken {
	value: string;
	escaped: boolean;
}

const anyFolders = "(?:[^/]+/)*";

export function analyzePattern(pattern: string): PatternSyntax {
	const tokens = tokenize(pattern);
	const segments = splitSegments(tokens);
	const last = segments[segments.length - 1] ?? [];

	return {
		invalid: tokens.some(
			(token) => !token.escaped && (token.value === "[" || token.value === "]"),
		),
		endsWithLoneStar: segments.length > 1 && isExactly(last, "*"),
	};
}

/** Exact-path regex for a pattern ending in a lone `*`; no folder expansion. */
export function compileExactPattern(pattern: string): RegExp {
	const segments = splitSegments(tokenize(pattern));
	if (segments.length > 1 && segments[0]?.length === 0) {
		segments.shift();
	}

	let source = "^";
	let previousWasAnyFolders = false;
	for (const [index, segment] of segments.entries()) {
		const isLast = index === segments.length - 1;
		if (!isLast && isExactly(segment, "**")) {
			if (!previousWasAnyFolders) {
				source += anyFolders;
			}
			previousWasAnyFolders = true;
			continue;
		}

		source += translateSegment(segment);
		if (!isLast) {
			source += "/";
		}
		previousWasAnyFolders = false;
	}

	return new RegExp(`${source}$`, "u");
}

function tokenize(pattern: string): PatternToken[] {
	const tokens: PatternToken[] = [];
	let escaped = false;

	for (const character of pattern) {
		if (escaped) {
			tokens.push({ value: character, escaped: true });
			escaped = false;
		} else if (character === "\\") {
			escaped = true;
		} else {
			tokens.push({ value: character, escaped: false });
		}
	}
	if (escaped) {
		tokens.push({ value: "\\", escaped: true });
	}

	return tokens;
}

function splitSegments(tokens: readonly PatternToken[]): PatternToken[][] {
	let current: PatternToken[] = [];
	const segments = [current];

	for (const token of tokens) {
		if (token.value === "/" && !token.escaped) {
			current = [];
			segments.push(current);
		} else {
			current.push(token);
		}
	}

	return segments;
}

function isExactly(segment: readonly PatternToken[], value: string): boolean {
	return (
		segment.length === value.length &&
		segment.every(
			(token, index) => !token.escaped && token.value === value[index],
		)
	);
}

function translateSegment(segment: readonly PatternToken[]): string {
	let source = "";

	for (const token of segment) {
		if (!token.escaped && token.value === "*") {
			source += "[^/]*";
		} else if (!token.escaped && token.value === "?") {
			source += "[^/]";
		} else {
			source += token.value.replace(/[\\^$.*+?()[\]{}|/]/gu, "\\$&");
		}
	}

	return source;
}
