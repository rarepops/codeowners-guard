import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globalSetup: ["test/global-setup.ts"],
		coverage: {
			include: ["src/**/*.ts"],
			provider: "v8",
			thresholds: {
				branches: 65,
				functions: 80,
				lines: 80,
				statements: 80,
			},
		},
	},
});