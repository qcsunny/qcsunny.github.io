// The one place that knows how the site's language switch works, for the widgets
// that build their own DOM in the browser.
//
// Two mechanisms exist and both have to be honoured. Header.astro flips
// html[data-lang] *and* dispatches a site:lang-change event; the CSS pair in
// global.css keys off the attribute alone. Widgets that listened only for the
// event went stale whenever the attribute moved without one — which is what a
// second tab, a test, or the pre-paint bootstrap in BaseHead does. So the
// attribute is the source of truth here and the event is only a second trigger.
//
// Text inside an element can be a .i18n-en/.i18n-zh span pair and cost nothing
// at runtime. Text that cannot hold markup — <option> content, placeholder,
// title, aria-label — has to be rewritten, which is what register() is for.

export const isZh = (): boolean => document.documentElement.dataset.lang === 'zh';

const swaps = new Set<(zh: boolean) => void>();
let wired = false;

/** Run `apply` now and again on every language change. */
export function onLang(apply: (zh: boolean) => void): void {
	swaps.add(apply);
	apply(isZh());
	if (wired) return;
	wired = true;
	const fire = (): void => {
		const zh = isZh();
		for (const s of swaps) s(zh);
	};
	new MutationObserver(fire).observe(document.documentElement, {
		attributes: true,
		attributeFilter: ['data-lang'],
	});
	window.addEventListener('site:lang-change', fire);
}

/**
 * A .i18n-en/.i18n-zh span pair. Both languages ship in the DOM and CSS picks
 * one, so no script has to run for the right one to be visible.
 *
 * With no translation it returns a bare text node — the English then shows in
 * both views, which is a missing string in the registry, not a bug here.
 */
export function bilingual(en: string, zh?: string): Node {
	if (!zh || zh === en) return document.createTextNode(en);
	const frag = document.createDocumentFragment();
	const e = document.createElement('span');
	e.className = 'i18n-en';
	e.textContent = en;
	const z = document.createElement('span');
	z.className = 'i18n-zh';
	z.textContent = zh;
	frag.append(e, z);
	return frag;
}

/** Replace an element's children with a bilingual pair. */
export function setBilingual(el: Element, en: string, zh?: string): void {
	el.replaceChildren(bilingual(en, zh));
}

type Writable = Record<string, unknown>;

/** Keep a property that cannot hold markup in step with the language. */
export function langProp(el: object, prop: string, en: string, zh?: string): void {
	if (!zh || zh === en) {
		(el as Writable)[prop] = en;
		return;
	}
	onLang((z) => {
		(el as Writable)[prop] = z ? zh : en;
	});
}

/** Same, for an attribute (title, aria-label, …). */
export function langAttr(el: Element, attr: string, en: string, zh?: string): void {
	if (!zh || zh === en) {
		el.setAttribute(attr, en);
		return;
	}
	onLang((z) => el.setAttribute(attr, z ? zh : en));
}

/**
 * Wire a button that flips the site language, for the two pages that have no
 * Header.astro — the fullscreen clock and the calendar. Header's toggle is an
 * inline script and cannot import this module, so this is a third writer of the
 * same four things: localStorage, html[data-lang], html.lang and the
 * site:lang-change event. A choice made here is the one the rest of the site
 * then reads.
 */
export function wireLangToggle(btn: HTMLElement): void {
	const root = document.documentElement;
	btn.addEventListener('click', () => {
		const next = isZh() ? 'en' : 'zh';
		root.dataset.lang = next;
		root.lang = next === 'zh' ? 'zh-CN' : 'en';
		try {
			localStorage.setItem('site:lang', next);
		} catch {
			/* storage unavailable — the choice just won't persist */
		}
		window.dispatchEvent(new CustomEvent('site:lang-change', { detail: next }));
	});
	onLang((zh) => {
		btn.textContent = zh ? '中' : 'EN';
		btn.title = zh ? '当前：中文 (点击切换为 English)' : 'Current: English (click for Chinese)';
		btn.setAttribute('aria-label', zh ? '切换为 English' : 'Switch to Chinese');
	});
}
