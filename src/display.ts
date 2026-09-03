export function escapeTerminalText(value: string): string {
	let escaped = "";
	for (const character of value) {
		const codePoint = character.codePointAt(0) ?? 0;
		escaped += isUnsafeDisplayCodePoint(codePoint)
			? `\\u${codePoint.toString(16).padStart(4, "0")}`
			: character;
	}
	return escaped;
}

export function escapeHtmlText(value: string): string {
	return escapeTerminalText(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function isUnsafeDisplayCodePoint(codePoint: number): boolean {
	return (
		codePoint <= 0x1f ||
		(codePoint >= 0x7f && codePoint <= 0x9f) ||
		codePoint === 0x061c ||
		codePoint === 0x200e ||
		codePoint === 0x200f ||
		(codePoint >= 0x202a && codePoint <= 0x202e) ||
		(codePoint >= 0x2066 && codePoint <= 0x2069)
	);
}
