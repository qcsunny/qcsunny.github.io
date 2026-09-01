import { CalcError, evaluate, formatNumber, tryAssign, type Scope } from './engine';
import {
	clearHistory,
	loadHistory,
	pushHistory,
	type HistoryEntry,
} from './history';

export interface BasicHooks {
	/** Called after user variables change (assignment or deletion). */
	onVarsChange?: () => void;
}

const PREVIEW_DEBOUNCE_MS = 150;

export function initBasic(scope: Scope, hooks: BasicHooks = {}): void {
	const display = document.querySelector<HTMLInputElement>('#calc-display');
	const preview = document.querySelector<HTMLElement>('#calc-preview');
	const varsHost = document.querySelector<HTMLElement>('#calc-vars');
	const historyList = document.querySelector<HTMLUListElement>('#calc-history-list');
	const historyEmpty = document.querySelector<HTMLElement>('#calc-history-empty');
	const historyClear = document.querySelector<HTMLButtonElement>('#calc-history-clear');
	const degButton = document.querySelector<HTMLButtonElement>('[data-action="deg"]');
	if (!display || !preview || !varsHost || !historyList || !historyEmpty || !historyClear) return;

	let previewTimer: ReturnType<typeof setTimeout> | undefined;

	function showPreview(text: string, isError = false): void {
		preview!.textContent = text;
		preview!.classList.toggle('err', isError);
	}

	function schedulePreview(): void {
		clearTimeout(previewTimer);
		previewTimer = setTimeout(updatePreview, PREVIEW_DEBOUNCE_MS);
	}

	function updatePreview(): void {
		const src = display!.value.trim();
		if (!src) {
			showPreview('');
			return;
		}
		try {
			showPreview(`= ${formatNumber(evaluate(src, scope))}`);
		} catch {
			// While typing, don't flash errors — just show nothing
			showPreview('');
		}
	}

	function insertAtCursor(text: string): void {
		const input = display!;
		const start = input.selectionStart ?? input.value.length;
		const end = input.selectionEnd ?? input.value.length;
		input.value = input.value.slice(0, start) + text + input.value.slice(end);
		const pos = start + text.length;
		input.focus();
		input.setSelectionRange(pos, pos);
		schedulePreview();
	}

	function commit(): void {
		clearTimeout(previewTimer); // don't let a stale preview overwrite the result
		const src = display!.value.trim();
		if (!src) return;
		try {
			const name = tryAssign(src, scope);
			if (name) {
				const value = scope.vars[name] as number;
				showPreview(`${name} = ${formatNumber(value)}`);
				pushHistory({ expr: src, result: formatNumber(value), ts: Date.now() });
				renderVars();
				renderHistory();
				hooks.onVarsChange?.();
			} else {
				const result = evaluate(src, scope);
				if (Number.isNaN(result)) throw new CalcError('Result is undefined');
				if (!Number.isFinite(result)) throw new CalcError('Result overflows');
				const text = formatNumber(result);
				scope.vars['ans'] = result;
				showPreview(`= ${text}`);
				pushHistory({ expr: src, result: text, ts: Date.now() });
				renderHistory();
			}
		} catch (err) {
			showPreview(err instanceof CalcError ? err.message : 'Invalid expression', true);
		}
	}

	function renderVars(): void {
		varsHost!.innerHTML = '';
		for (const [name, value] of Object.entries(scope.vars)) {
			if (name === 'ans') continue;
			const chip = document.createElement('span');
			chip.className = 'chip';
			const insert = document.createElement('button');
			insert.type = 'button';
			insert.title = `Insert ${name}`;
			insert.textContent = `${name} = ${formatNumber(value)}`;
			insert.addEventListener('click', () => insertAtCursor(name));
			const del = document.createElement('button');
			del.type = 'button';
			del.className = 'chip-del';
			del.title = `Delete variable ${name}`;
			del.setAttribute('aria-label', `Delete variable ${name}`);
			del.textContent = '×';
			del.addEventListener('click', () => {
				delete scope.vars[name];
				renderVars();
				hooks.onVarsChange?.();
				schedulePreview();
			});
			chip.append(insert, del);
			varsHost!.append(chip);
		}
	}

	function renderHistory(): void {
		const entries = loadHistory();
		historyList!.innerHTML = '';
		historyEmpty!.hidden = entries.length > 0;
		for (const entry of entries) {
			const li = document.createElement('li');
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.title = 'Use this expression';
			const expr = document.createElement('span');
			expr.className = 'h-expr';
			expr.textContent = entry.expr;
			const res = document.createElement('span');
			res.className = 'h-res';
			res.textContent = `= ${entry.result}`;
			btn.append(expr, res);
			btn.addEventListener('click', () => {
				display!.value = (entry as HistoryEntry).expr;
				display!.focus();
				schedulePreview();
			});
			li.append(btn);
			historyList!.append(li);
		}
	}

	// Keypad
	document.querySelectorAll<HTMLButtonElement>('#calc-panel-basic [data-ins]').forEach((btn) => {
		btn.addEventListener('click', () => insertAtCursor(btn.dataset.ins as string));
	});

	document.querySelectorAll<HTMLButtonElement>('#calc-panel-basic [data-action]').forEach((btn) => {
		btn.addEventListener('click', () => {
			switch (btn.dataset.action) {
				case 'clear':
					display!.value = '';
					showPreview('');
					display!.focus();
					break;
				case 'back': {
					const start = display!.selectionStart ?? display!.value.length;
					const end = display!.selectionEnd ?? display!.value.length;
					if (start === end && start > 0) {
						display!.value = display!.value.slice(0, start - 1) + display!.value.slice(end);
						display!.setSelectionRange(start - 1, start - 1);
					} else {
						display!.value = display!.value.slice(0, start) + display!.value.slice(end);
						display!.setSelectionRange(start, start);
					}
					display!.focus();
					schedulePreview();
					break;
				}
				case 'equals':
					commit();
					break;
				case 'sign':
					if (display!.value.startsWith('-')) display!.value = display!.value.slice(1);
					else display!.value = `-${display!.value}`;
					display!.focus();
					schedulePreview();
					break;
				case 'ans':
					insertAtCursor('ans');
					break;
				case 'deg':
					scope.deg = !scope.deg;
					if (degButton) degButton.textContent = scope.deg ? 'DEG' : 'RAD';
					schedulePreview();
					break;
			}
		});
	});

	// Keyboard: Enter commits, Escape clears
	display.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			commit();
		} else if (e.key === 'Escape') {
			display.value = '';
			showPreview('');
		}
	});
	display.addEventListener('input', schedulePreview);

	// Standard / Scientific keypad mode (persisted)
	const stdKeypad = document.querySelector<HTMLElement>('.calc-keypad-standard');
	const sciKeypad = document.querySelector<HTMLElement>('.calc-keypad-sci');
	const modeButtons = document.querySelectorAll<HTMLButtonElement>('[data-calc-mode]');
	if (stdKeypad && sciKeypad && modeButtons.length > 0) {
		function setMode(mode: 'standard' | 'scientific'): void {
			stdKeypad!.hidden = mode !== 'standard';
			sciKeypad!.hidden = mode !== 'scientific';
			modeButtons.forEach((btn) => {
				btn.setAttribute('aria-pressed', String(btn.dataset.calcMode === mode));
			});
			try {
				localStorage.setItem('calc:keypad-mode', mode);
			} catch {
				// ignore
			}
		}
		modeButtons.forEach((btn) => {
			btn.addEventListener('click', () => setMode(btn.dataset.calcMode as 'standard' | 'scientific'));
		});
		let saved: string | null = null;
		try {
			saved = localStorage.getItem('calc:keypad-mode');
		} catch {
			// ignore
		}
		setMode(saved === 'scientific' ? 'scientific' : 'standard');
	}

	historyClear.addEventListener('click', () => {
		clearHistory();
		renderHistory();
	});

	renderVars();
	renderHistory();
	updatePreview();
}
