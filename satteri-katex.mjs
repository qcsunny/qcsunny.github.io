import katex from 'katex';

/**
 * Renders `$…$` and `$$…$$` into finished KaTeX markup at build time.
 *
 * Sätteri (Astro 7's default Markdown processor) parses maths natively once
 * `features.math` is on, and gives mdast visitors for the two node types it
 * produces. Rendering here, in the mdast phase, means the browser is sent
 * ordinary HTML: no katex.min.js (272 KB), no runtime pass over the DOM, and
 * nothing loaded from a CDN — which is what this replaced. It also lands before
 * the hast phase, so the display-maths `<pre><code class="language-math">` never
 * reaches the Shiki highlighter.
 *
 * `hasMath` goes onto the frontmatter so pages/blog/[...slug].astro can gate the
 * KaTeX stylesheet on it; posts without formulas load none of it.
 *
 * A bad formula must not fail the deploy, so each one is caught and reported as
 * a build diagnostic naming the file, then rendered as its own source text in
 * red — visible to a reader, greppable in the log, and the rest of the page
 * builds.
 */
export default function satteriKatex() {
	return {
		name: 'katex',
		math: (node, ctx) => replace(node, ctx, true),
		inlineMath: (node, ctx) => replace(node, ctx, false),
	};
}

function replace(node, ctx, displayMode) {
	const frontmatter = ctx.data.astro?.frontmatter;
	if (frontmatter) frontmatter.hasMath = true;

	let html;
	try {
		html = katex.renderToString(node.value, {
			displayMode,
			// Caught below instead: KaTeX's own error markup carries no build-time
			// signal, and a formula that silently renders wrong is worse than one
			// that shows up in the log.
			throwOnError: true,
			// The site's formulas mix CJK into \text{…} (`\text{ 元}`), which the
			// default 'warn' level reports on every build for every occurrence.
			// It renders correctly; the warning is noise.
			strict: false,
		});
	} catch (err) {
		const where = ctx.fileURL ? ` (${ctx.fileURL.pathname.split('/').pop()})` : '';
		ctx.report({
			message: `KaTeX could not render ${JSON.stringify(node.value)}${where}: ${err.message}`,
			severity: 'warning',
		});
		const source = escapeHtml(displayMode ? `$$${node.value}$$` : `$${node.value}$`);
		html = `<span class="katex-failed" title="${escapeHtml(err.message)}">${source}</span>`;
	}
	ctx.replaceNode(node, { type: 'html', value: html });
}

function escapeHtml(text) {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
