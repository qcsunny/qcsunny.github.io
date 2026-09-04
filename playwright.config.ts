import { defineConfig } from '@playwright/test';

// Locally, browsers were installed by an older Playwright (chromium-1223 in
// ~/.cache/ms-playwright) while the current package expects another revision.
// Pin to the cached executable there; in CI (fresh runner) let Playwright use
// its own browser downloaded by `npx playwright install chromium`.
const cachedChromium = process.env.CI
	? undefined
	: (process.env.PW_CHROMIUM_EXECUTABLE ??
		`${process.env.HOME}/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome`);

export default defineConfig({
	testDir: './e2e',
	timeout: 30_000,
	retries: 0,
	use: {
		baseURL: 'http://localhost:4321',
	},
	webServer: {
		// Pin the port (astro preview defaults to 4321, or 4322 when 4321 is
		// taken locally). ASTRO_PREVIEW_BACKGROUND=1 opts out of Astro's agent
		// detection, which would otherwise daemonize the preview server in AI
		// shells and exit the foreground process Playwright expects to own.
		command: 'ASTRO_PREVIEW_BACKGROUND=1 npx astro preview --port 4321',
		url: 'http://localhost:4321',
		reuseExistingServer: true,
		timeout: 60_000,
	},
	projects: [
		{
			name: 'chromium',
			use: {
				browserName: 'chromium',
				...(cachedChromium && { launchOptions: { executablePath: cachedChromium } }),
			},
		},
	],
});
