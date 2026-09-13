export interface HistoryEntry {
	expr: string;
	result: string;
	ts: number;
}

const KEY = 'calc:history';
const LIMIT = 50;

export function loadHistory(): HistoryEntry[] {
	try {
		const raw = localStorage.getItem(KEY);
		const list = raw ? JSON.parse(raw) : [];
		if (!Array.isArray(list)) return [];
		// user-editable storage: a blind cast used to let mangled entries flow
		// into the render path (undefined expr/result); keep only well-formed ones
		return list.filter(
			(e): e is HistoryEntry =>
				!!e &&
				typeof e === 'object' &&
				typeof (e as Record<string, unknown>).expr === 'string' &&
				typeof (e as Record<string, unknown>).result === 'string' &&
				typeof (e as Record<string, unknown>).ts === 'number',
		);
	} catch {
		return [];
	}
}

export function pushHistory(entry: HistoryEntry): void {
	const list = loadHistory();
	list.unshift(entry);
	try {
		localStorage.setItem(KEY, JSON.stringify(list.slice(0, LIMIT)));
	} catch {
		// storage unavailable — history just won't persist
	}
}

export function clearHistory(): void {
	try {
		localStorage.removeItem(KEY);
	} catch {
		// ignore
	}
}
