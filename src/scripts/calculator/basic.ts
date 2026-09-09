import { CalcError, errorText, evaluate, formatExpressionToMathML, formatNumber, toFraction, tryAssign, type Scope } from './engine';
import { isZh, langProp, onLang, setBilingual } from '../tools/i18n';
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
	const formula = document.querySelector<HTMLElement>('#calc-formula');
	const preview = document.querySelector<HTMLElement>('#calc-preview');
	const varsHost = document.querySelector<HTMLElement>('#calc-vars');
	const historyList = document.querySelector<HTMLUListElement>('#calc-history-list');
	const historyEmpty = document.querySelector<HTMLElement>('#calc-history-empty');
	const historyClear = document.querySelector<HTMLButtonElement>('#calc-history-clear');
	const degButton = document.querySelector<HTMLButtonElement>('[data-action="deg"]');
	if (!display || !preview || !varsHost || !historyList || !historyEmpty || !historyClear) return;

	let previewTimer: ReturnType<typeof setTimeout> | undefined;

	/** True while the display holds what `=` just computed rather than something
	 *  the user typed. The next keystroke decides what that value was for:
	 *
	 *   - an operator chains from it — 6−3= then ×6 is 3×6 = 18, which is what
	 *     every pocket calculator does and what this one got wrong. The result
	 *     only ever reached the preview line, so ×6 landed on the *expression*
	 *     still sitting in the box and answered 6−3×6 = −12.
	 *   - a digit, `.`, `(`, a function or a variable starts a new expression
	 *     instead of gluing itself onto the result: 6−3= then 7 is 7, not 37.
	 *
	 *  Anything that edits the box by hand — C, ⌫, ±, typing, picking a history
	 *  entry — drops the flag, because from then on the contents are the user's. */
	let justEvaluated = false;

	/** Does `text` begin a new operand? Infix operators, the closing paren and
	 *  the postfix `!` continue from the result; everything else replaces it. */
	function startsNewOperand(text: string): boolean {
		return !/^[+\-*/^%!)]/.test(text);
	}

	/** Hand the freshly computed value to the display, where the next keypress
	 *  can build on it. The cursor goes to the end: wherever the caret was when
	 *  `=` was pressed has nothing to do with where this value ends. */
	function takeResult(text: string): void {
		display!.value = text;
		display!.setSelectionRange(text.length, text.length);
		justEvaluated = true;
	}

	function showPreview(text: string, isError = false): void {
		preview!.textContent = text;
		preview!.classList.toggle('err', isError);
	}

	/** The error line is the one thing on this display that is prose, so it ships
	 *  as a span pair and follows the language switch without recomputing. It is
	 *  built from DOM nodes rather than innerHTML on purpose: most engine messages
	 *  quote a character or name the user just typed. */
	function showError(en: string, zh: string): void {
		setBilingual(preview!, en, zh);
		preview!.classList.add('err');
	}

	function schedulePreview(): void {
		clearTimeout(previewTimer);
		previewTimer = setTimeout(updatePreview, PREVIEW_DEBOUNCE_MS);
	}

	function updatePreview(): void {
		const src = display!.value.trim();
		if (!src) {
			showPreview('');
			if (formula) formula.innerHTML = '';
			return;
		}
		if (formula) {
			const mathml = formatExpressionToMathML(src);
			formula.innerHTML = mathml ?? '';
		}
		try {
			const res = evaluate(src, scope);
			const numText = formatNumber(res);
			const frac = toFraction(res);
			showPreview(frac ? `= ${numText}  [${frac.num}/${frac.den}]` : `= ${numText}`);
		} catch {
			// While typing, don't flash errors — just show nothing
			showPreview('');
		}
	}

	function insertAtCursor(text: string): void {
		const input = display!;
		if (justEvaluated) {
			justEvaluated = false;
			if (startsNewOperand(text)) input.value = '';
			input.setSelectionRange(input.value.length, input.value.length);
		}
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
				if (formula) {
					const mathml = formatExpressionToMathML(src, formatNumber(value));
					formula.innerHTML = mathml ?? '';
				}
				showPreview(`${name} = ${formatNumber(value)}`);
				takeResult(formatNumber(value));
				pushHistory({ expr: src, result: formatNumber(value), ts: Date.now() });
				renderVars();
				renderHistory();
				hooks.onVarsChange?.();
			} else {
				const result = evaluate(src, scope);
				if (Number.isNaN(result)) throw new CalcError('Result is undefined', '结果未定义');
				if (!Number.isFinite(result)) throw new CalcError('Result overflows', '结果超出可表示范围');
				const text = formatNumber(result);
				const frac = toFraction(result);
				scope.vars['ans'] = result;
				if (formula) {
					const mathml = formatExpressionToMathML(src, text);
					formula.innerHTML = mathml ?? '';
				}
				// The expression moves to the preview line as the box takes the
				// result — otherwise pressing = would erase what was computed.
				// If the decimal has a neat simple fraction (e.g. 0.375 = 3/8), show both.
				const previewStr = frac ? `${src} = ${text} [${frac.num}/${frac.den}]` : `${src} = ${text}`;
				showPreview(previewStr);
				takeResult(text);
				pushHistory({ expr: src, result: frac ? `${text} (${frac.num}/${frac.den})` : text, ts: Date.now() });
				renderHistory();
			}
		} catch (err) {
			if (formula) formula.innerHTML = '';
			const { en, zh } = errorText(err);
			showError(en, zh);
		}
	}

	// renderVars and renderHistory rebuild their whole list, so they read the
	// language once per render and are re-run on a switch (see onLang below).
	// The alternative — langAttr on every button — would register a closure per
	// element in a set that never forgets, and these lists are rebuilt on every
	// keystroke that assigns a variable.
	function renderVars(): void {
		const zh = isZh();
		varsHost!.innerHTML = '';
		for (const [name, value] of Object.entries(scope.vars)) {
			if (name === 'ans') continue;
			const chip = document.createElement('span');
			chip.className = 'chip';
			const insert = document.createElement('button');
			insert.type = 'button';
			insert.title = zh ? `插入 ${name}` : `Insert ${name}`;
			insert.textContent = `${name} = ${formatNumber(value)}`;
			insert.addEventListener('click', () => insertAtCursor(name));
			const del = document.createElement('button');
			del.type = 'button';
			del.className = 'chip-del';
			const delLabel = zh ? `删除变量 ${name}` : `Delete variable ${name}`;
			del.title = delLabel;
			del.setAttribute('aria-label', delLabel);
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
		const zh = isZh();
		const entries = loadHistory();
		historyList!.innerHTML = '';
		historyEmpty!.hidden = entries.length > 0;
		for (const entry of entries) {
			const li = document.createElement('li');
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.title = zh ? '重新使用该表达式' : 'Use this expression';
			const expr = document.createElement('span');
			expr.className = 'h-expr';
			expr.textContent = entry.expr;
			const res = document.createElement('span');
			res.className = 'h-res';
			res.textContent = `= ${entry.result}`;
			btn.append(expr, res);
			btn.addEventListener('click', () => {
				display!.value = (entry as HistoryEntry).expr;
				justEvaluated = false;
				display!.focus();
				schedulePreview();
			});
			li.append(btn);
			historyList!.append(li);
		}
	}

	// Keypad (`.calc-basic` is the root of BasicTab.astro's markup)
	document.querySelectorAll<HTMLButtonElement>('.calc-basic [data-ins]').forEach((btn) => {
		btn.addEventListener('click', () => insertAtCursor(btn.dataset.ins as string));
	});

	document.querySelectorAll<HTMLButtonElement>('.calc-basic [data-action]').forEach((btn) => {
		btn.addEventListener('click', () => {
			switch (btn.dataset.action) {
				case 'clear':
					display!.value = '';
					showPreview('');
					if (formula) formula.innerHTML = '';
					justEvaluated = false;
					display!.focus();
					break;
				case 'back': {
					justEvaluated = false;
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
					justEvaluated = false;
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
				case 'frac': {
					const cur = display!.value.trim();
					if (!cur) break;
					// If it's a simple fraction like "a/b", evaluate to decimal
					const fracMatch = /^(-?\d+)\s*\/\s*(\d+)$/.exec(cur);
					if (fracMatch) {
						const n = Number(fracMatch[1]);
						const d = Number(fracMatch[2]);
						if (d !== 0) {
							display!.value = formatNumber(n / d);
							display!.setSelectionRange(display!.value.length, display!.value.length);
							schedulePreview();
						}
						break;
					}
					// Otherwise try converting decimal to exact fraction
					const num = Number(cur);
					if (Number.isFinite(num) && !Number.isInteger(num)) {
						const f = toFraction(num);
						if (f) {
							display!.value = `${f.num}/${f.den}`;
							display!.setSelectionRange(display!.value.length, display!.value.length);
							schedulePreview();
						}
					}
					break;
				}
			}
		});
	});

	// Keyboard: Enter commits, Escape clears
	display.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			commit();
			return;
		}
		if (e.key === 'Escape') {
			display.value = '';
			showPreview('');
			justEvaluated = false;
			return;
		}
		// A typed character gets the same treatment as the keypad button that
		// inserts it, so both ways of using the calculator chain identically.
		// Printable keys only: Backspace, arrows and Tab are names, not glyphs,
		// and a shortcut like Ctrl+A must keep its selection.
		if (justEvaluated && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
			justEvaluated = false;
			if (startsNewOperand(e.key)) display.value = '';
			else display.setSelectionRange(display.value.length, display.value.length);
		}
	});
	display.addEventListener('input', () => {
		// paste, drag-and-drop or an IME commit — the box is the user's again
		justEvaluated = false;
		schedulePreview();
	});

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

	// keep the keypad's DEG/RAD label in sync with the engine's initial mode
	if (degButton) degButton.textContent = scope.deg ? 'DEG' : 'RAD';

	historyClear.addEventListener('click', () => {
		clearHistory();
		renderHistory();
	});

	langProp(
		display,
		'placeholder',
		'Type an expression, e.g. 2+3*4 or a=2',
		'输入表达式，例如 2+3*4 或 a=2',
	);

	// each also runs once right here — onLang applies immediately
	onLang(renderVars);
	onLang(renderHistory);
	updatePreview();
}
