import { beforeEach, describe, expect, it, vi } from "vitest";

const core = vi.hoisted(() => ({
	setFailed: vi.fn(),
}));
const runAction = vi.hoisted(() => vi.fn());

vi.mock("@actions/core", () => core);
vi.mock("../src/action.js", () => ({ runAction }));

describe("Action entrypoint", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	it("sanitizes rejected Error messages before failing the Action", async () => {
		runAction.mockRejectedValue(new Error("bad\n\u001b[31mmessage"));

		await import("../src/action-entry.js");

		await vi.waitFor(() => {
			expect(core.setFailed).toHaveBeenCalledWith(
				"bad\\u000a\\u001b[31mmessage",
			);
		});
	});

	it("reports non-Error rejections without leaking control characters", async () => {
		runAction.mockRejectedValue("failure\rnext");

		await import("../src/action-entry.js");

		await vi.waitFor(() => {
			expect(core.setFailed).toHaveBeenCalledWith("failure\\u000dnext");
		});
	});

	it("does not fail when the Action succeeds", async () => {
		runAction.mockResolvedValue(undefined);

		await import("../src/action-entry.js");
		await Promise.resolve();

		expect(core.setFailed).not.toHaveBeenCalled();
	});
});
