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
		return Array.isArray(list) ? (list as HistoryEntry[]) : [];
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
