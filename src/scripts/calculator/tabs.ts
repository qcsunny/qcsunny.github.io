export function initTabs(): void {
	const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-calc-tab]'));
	if (tabs.length === 0) return;

	const panels = tabs.map((tab) => document.getElementById(`calc-panel-${tab.dataset.calcTab}`));

	function activate(name: string, focus = false): void {
		tabs.forEach((tab, i) => {
			const active = tab.dataset.calcTab === name;
			tab.setAttribute('aria-selected', String(active));
			tab.tabIndex = active ? 0 : -1;
			if (panels[i]) (panels[i] as HTMLElement).hidden = !active;
			if (active && focus) tab.focus();
		});
	}

	tabs.forEach((tab) => {
		tab.addEventListener('click', () => activate(tab.dataset.calcTab as string));
	});

	// Arrow-key navigation across the tablist
	const tablist = tabs[0]?.parentElement;
	tablist?.addEventListener('keydown', (e) => {
		const idx = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
		let next = -1;
		if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
		else if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length;
		else if (e.key === 'Home') next = 0;
		else if (e.key === 'End') next = tabs.length - 1;
		if (next >= 0) {
			e.preventDefault();
			activate(tabs[next]?.dataset.calcTab as string, true);
		}
	});

	// Deep links: #graph / #units / #stats
	function fromHash(): string {
		const name = location.hash.replace('#', '');
		return tabs.some((t) => t.dataset.calcTab === name) ? name : 'basic';
	}
	window.addEventListener('hashchange', () => activate(fromHash()));
	activate(fromHash());
}
