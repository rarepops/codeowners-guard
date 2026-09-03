export interface CodeownersRule {
	line: number;
	pattern: string;
	owners: string[];
}

export interface DuplicatePattern {
	line: number;
	message: string;
}

export function parseCodeowners(source: string): CodeownersRule[] {
	const rules: CodeownersRule[] = [];

	for (const [index, rawLine] of source.split(/\r?\n/u).entries()) {
		const line = index + 1;
		const content = rawLine.trim();

		if (content === "" || content.startsWith("#")) {
			continue;
		}

		const fields = splitFields(content);
		const pattern = fields[0];

		if (pattern === undefined) {
			continue;
		}

		const owners = fields.slice(1);
		rules.push({ line, pattern, owners });
	}

	return rules;
}

export function* findDuplicatePatterns(
	rules: readonly CodeownersRule[],
): Generator<DuplicatePattern> {
	const firstLineByPattern = new Map<string, number>();

	for (const rule of rules) {
		const firstLine = firstLineByPattern.get(rule.pattern);
		if (firstLine === undefined) {
			firstLineByPattern.set(rule.pattern, rule.line);
			continue;
		}

		yield {
			line: rule.line,
			message: `Pattern ${JSON.stringify(rule.pattern)} duplicates line ${firstLine}`,
		};
	}
}

function splitFields(line: string): string[] {
	const fields: string[] = [];
	let field = "";
	let escaped = false;

	for (const character of line) {
		if (/\s/u.test(character) && !escaped) {
			if (field !== "") {
				fields.push(field);
				field = "";
			}
			continue;
		}

		field += character;
		escaped = character === "\\" && !escaped;
		if (character !== "\\") {
			escaped = false;
		}
	}

	if (field !== "") {
		fields.push(field);
	}

	return fields;
}
