import { defineConfig } from '@playwright/test';

// Local browsers were installed by an older Playwright (chromium-1223 in
// ~/.cache/ms-playwright). Pin the current install to that executable instead
// of downloading a new revision. Set PW_CHROMIUM_EXECUTABLE to override.
const cachedChromium =
	process.env.PW_CHROMIUM_EXECUTABLE ??
	`${process.env.HOME}/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome`;

export default defineConfig({
	testDir: './e2e',
	timeout: 30_000,
	retries: 0,
	use: {
		baseURL: 'http://localhost:4322',
	},
	webServer: {
		command: 'npm run preview',
		url: 'http://localhost:4322',
		reuseExistingServer: true,
		timeout: 60_000,
	},
	projects: [
		{
			name: 'chromium',
			use: {
				browserName: 'chromium',
				launchOptions: { executablePath: cachedChromium },
			},
		},
	],
});
