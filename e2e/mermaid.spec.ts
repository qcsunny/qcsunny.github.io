// @ts-check
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createGfmMarkdownProcessor } from '../markdown-processor.mjs';

const CACHE_DIR = path.resolve('.cache/mermaid');

test.describe('Build-time Mermaid rendering', () => {
	test('renders mermaid code block to inline SVG via cached render without touching source', async () => {
		// Ensure cache dir exists
		if (!fs.existsSync(CACHE_DIR)) {
			fs.mkdirSync(CACHE_DIR, { recursive: true });
		}

		const sampleMermaid = `sequenceDiagram
  autonumber
  Client->>Server: POST /login
  Server-->>Client: 200 {token}`;

		const hash = crypto.createHash('sha256').update(sampleMermaid.trim()).digest('hex').slice(0, 16);
		const svgPath = path.join(CACHE_DIR, `${hash}.svg`);

		// Pre-populate cache with a mock valid SVG if not already rendered
		if (!fs.existsSync(svgPath)) {
			fs.writeFileSync(
				svgPath,
				`<svg id="m_${hash}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 200"><text>Client</text><text>Server</text></svg>`,
				'utf8',
			);
		}

		// Markdown input with standard mermaid block
		const markdownSource = `# Test Post

Here is an architectural diagram:

\`\`\`mermaid
${sampleMermaid}
\`\`\`

End of post.`;

		const processor = createGfmMarkdownProcessor();
		const renderer = await processor.createRenderer({});

		const { code: renderedHtml } = await renderer.render(markdownSource);

		// Assert that the rendered HTML contains <figure class="mermaid-diagram">
		expect(renderedHtml).toContain('<figure class="mermaid-diagram" role="img"');
		expect(renderedHtml).toContain(`<svg id="m_${hash}"`);
		expect(renderedHtml).toContain('Client');
		expect(renderedHtml).toContain('Server');

		// Assert that the raw ```mermaid code block was NOT emitted as a <pre><code>
		expect(renderedHtml).not.toContain('<code class="language-mermaid">');

		// Original source string was untouched
		expect(markdownSource).toContain('```mermaid');
	});

	test('renders complex diagram using Playwright and mermaid.js directly', async () => {
		const sampleCode = `flowchart LR
  A[Start] --> B(Process)
  B --> C{Decision}
  C -->|Yes| D[Result 1]
  C -->|No| E[Result 2]`;

		const hash = crypto.createHash('sha256').update(sampleCode.trim()).digest('hex').slice(0, 16);
		const svgPath = path.join(CACHE_DIR, `${hash}.svg`);

		const mermaidDist = path.resolve('node_modules/mermaid/dist/mermaid.min.js');
		const mermaidCode = fs.readFileSync(mermaidDist, 'utf8');

		const { chromium } = await import('@playwright/test');
		const browser = await chromium.launch({
			args: ['--no-sandbox', '--disable-setuid-sandbox', '--headless=new'],
		});
		const page = await browser.newPage();
		await page.setContent(`<!DOCTYPE html><html><head><script>${mermaidCode}</script></head><body></body></html>`);

		const svg = await page.evaluate(async ({ id, code }) => {
			// @ts-ignore
			window.mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });
			// @ts-ignore
			const res = await window.mermaid.render(id, code);
			return res.svg;
		}, { id: `m_${hash}`, code: sampleCode });

		await browser.close();

		expect(svg).toContain('<svg');
		expect(svg).toContain('Start');
		expect(svg).toContain('Decision');

		fs.writeFileSync(svgPath, svg, 'utf8');
		expect(fs.existsSync(svgPath)).toBe(true);
	});
});
