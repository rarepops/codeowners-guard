import * as core from "@actions/core";

import { runAction } from "./action.js";
import { escapeTerminalText } from "./display.js";

runAction().catch((error: unknown) => {
	core.setFailed(
		escapeTerminalText(error instanceof Error ? error.message : String(error)),
	);
});
