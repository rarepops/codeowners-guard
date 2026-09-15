export interface ShadowedRule {
	/** Index into the rules array passed to validateLocal's matching loop. */
	index: number;
	/** Exact number of considered files the rule matches. */
	matchedFiles: number;
	/** Distinct indices of the rules that win those files, ascending. */
	overridingIndices: number[];
}

export const shadowedRuleSuggestion =
	"Remove the rule, or move it below the rules that override it if it should take precedence.";

const catchAllPatterns: ReadonlySet<string> = new Set(["*", "**", "/**"]);

export function isCatchAllPattern(pattern: string): boolean {
	return catchAllPatterns.has(pattern);
}

export class ShadowTracker {
	private readonly effective: Uint8Array;
	private readonly matchedFiles: Uint32Array;
	private readonly overriders = new Map<number, Set<number>>();

	constructor(ruleCount: number) {
		this.effective = new Uint8Array(ruleCount);
		this.matchedFiles = new Uint32Array(ruleCount);
	}

	/** Records one file; `matched` lists every matching rule index in ascending order, and the last one wins. */
	observe(matched: readonly number[]): void {
		const owner = matched[matched.length - 1];
		if (owner === undefined) {
			return;
		}
		if (this.effective[owner] === 0) {
			this.effective[owner] = 1;
			this.overriders.delete(owner);
		}

		for (const index of matched) {
			if (index === owner || this.effective[index] === 1) {
				continue;
			}
			this.matchedFiles[index] = (this.matchedFiles[index] ?? 0) + 1;
			const overriders = this.overriders.get(index) ?? new Set<number>();
			overriders.add(owner);
			this.overriders.set(index, overriders);
		}
	}

	/** Rules that matched at least one file and never won one, ascending by index. */
	shadowedRules(): ShadowedRule[] {
		const shadowed: ShadowedRule[] = [];
		for (let index = 0; index < this.effective.length; index += 1) {
			const matchedFiles = this.matchedFiles[index] ?? 0;
			if (this.effective[index] === 0 && matchedFiles > 0) {
				shadowed.push({
					index,
					matchedFiles,
					overridingIndices: [...(this.overriders.get(index) ?? [])].sort(
						(left, right) => left - right,
					),
				});
			}
		}

		return shadowed;
	}
}

export function formatShadowedMessage(
	pattern: string,
	matchedFiles: number,
	overridingLines: readonly number[],
): string {
	const files =
		matchedFiles === 1
			? "its only matching file is"
			: `all ${matchedFiles} matching files are`;

	return `Pattern ${JSON.stringify(pattern)} never takes effect: ${files} overridden by ${formatLines(overridingLines)}`;
}

function formatLines(lines: readonly number[]): string {
	if (lines.length === 1) {
		return `line ${lines[0]}`;
	}

	const shown = lines.slice(0, 3);
	const remaining = lines.length - shown.length;
	if (remaining > 0) {
		return `lines ${shown.join(", ")} and ${remaining} more`;
	}

	return `lines ${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}
