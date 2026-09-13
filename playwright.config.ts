import { defineConfig } from '@playwright/test';

// Let Playwright find its installed browser revision naturally; allow overriding via PW_CHROMIUM_EXECUTABLE if needed.
const cachedChromium = process.env.PW_CHROMIUM_EXECUTABLE;

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
