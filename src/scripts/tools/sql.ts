// Interactive SQL Formatter, Beautifier & Minifier:
// - Format with customizable 2 or 4 spaces indentation
// - Keywords auto-capitalization (SELECT, FROM, WHERE, JOIN, GROUP BY, etc.)
// - Minify SQL to single line (strips comments & redundant whitespace)
// - 100% in-browser, zero dependencies, zero tracking, safe for private queries.

import { createWorkbench, formatBytes } from './workbench';

const MAJOR_CLAUSES = [
	'SELECT',
	'FROM',
	'WHERE',
	'GROUP BY',
	'ORDER BY',
	'HAVING',
	'LIMIT',
	'OFFSET',
	'UNION ALL',
	'UNION',
	'INSERT INTO',
	'VALUES',
	'UPDATE',
	'SET',
	'DELETE FROM',
	'CREATE TABLE',
	'ALTER TABLE',
	'DROP TABLE'
];

const SUB_CLAUSES = [
	'LEFT JOIN',
	'RIGHT JOIN',
	'INNER JOIN',
	'OUTER JOIN',
	'CROSS JOIN',
	'JOIN',
	'ON',
	'AND',
	'OR',
	'WHEN',
	'THEN',
	'ELSE',
	'END',
	'RETURNING'
];

const OTHER_KEYWORDS = [
	'AS',
	'DISTINCT',
	'IN',
	'IS NULL',
	'IS NOT NULL',
	'LIKE',
	'BETWEEN',
	'EXISTS',
	'CASE',
	'ASC',
	'DESC',
	'COUNT',
	'SUM',
	'AVG',
	'MIN',
	'MAX',
	'COALESCE',
	'PRIMARY KEY',
	'FOREIGN KEY',
	'REFERENCES',
	'DEFAULT',
	'NOT NULL',
	'INDEX'
];

const ALL_KEYWORDS_SORTED = [...MAJOR_CLAUSES, ...SUB_CLAUSES, ...OTHER_KEYWORDS].sort(
	(a, b) => b.length - a.length
);

const SAMPLE_SQL = `select u.id, u.username, u.email, count(o.id) as order_count, sum(o.total_amount) as total_spent
from users u
left join orders o on u.id = o.user_id and o.status = 'completed'
where u.created_at >= '2026-01-01' and u.is_active = true
group by u.id, u.username, u.email
having count(o.id) > 0
order by total_spent desc, u.id asc
limit 50 offset 0;`;

type SqlToken = { type: 'str' | 'comment' | 'word' | 'punct' | 'op' | 'ws'; val: string };

/** Split SQL into tokens. String literals and comments come out verbatim, so no
 *  downstream pass can rewrite user data; everything else is classified, so the
 *  formatter and the minifier can make spacing decisions from structure alone. */
function tokenizeSql(text: string): SqlToken[] {
	const tokens: SqlToken[] = [];
	let i = 0;
	const n = text.length;

	while (i < n) {
		const c = text[i];

		// Single line comment
		if (c === '-' && text[i + 1] === '-') {
			const end = text.indexOf('\n', i);
			const val = end === -1 ? text.slice(i) : text.slice(i, end);
			tokens.push({ type: 'comment', val: val.trim() });
			i += val.length;
			continue;
		}

		// Multi-line comment
		if (c === '/' && text[i + 1] === '*') {
			const end = text.indexOf('*/', i);
			const val = end === -1 ? text.slice(i) : text.slice(i, end + 2);
			tokens.push({ type: 'comment', val });
			i += val.length;
			continue;
		}

		// String literal '...', "..." or `...`
		if (c === "'" || c === '"' || c === '`') {
			let j = i + 1;
			while (j < n && text[j] !== c) {
				if (text[j] === '\\') j++;
				j++;
			}
			j = Math.min(j + 1, n);
			tokens.push({ type: 'str', val: text.slice(i, j) });
			i = j;
			continue;
		}
		// Whitespace
		if (/\s/.test(c)) {
			while (i < n && /\s/.test(text[i])) i++;
			tokens.push({ type: 'ws', val: ' ' });
			continue;
		}

		// Punctuation
		if (/[(),;]/.test(c)) {
			tokens.push({ type: 'punct', val: c });
			i++;
			continue;
		}

		// Word. A lone delimiter that no branch above claimed — subtraction,
		// division, a stray backtick — leaves j === i, which would spin this
		// loop forever; emit it as a one-character operator instead.
		let j = i;
		while (j < n && !/[\s(),;'"`\-/]/.test(text[j])) j++;
		if (j === i) {
			tokens.push({ type: 'op', val: c });
			i++;
			continue;
		}
		tokens.push({ type: 'word', val: text.slice(i, j) });
		i = j;
	}

	return tokens;
}

export function formatSql(sql: string, indentSize = 2): string {
	const indentStr = ' '.repeat(indentSize);
	const text = sql.trim();
	if (!text) return '';

	const tokens = tokenizeSql(text);

	// Reconstruct and format
	let result = '';
	let currentIndent = 0;
	// Clause indentation is relative to how deep in parentheses we are, so a
	// subquery's SELECT/FROM/WHERE nest under their bracket instead of resetting
	// to column 0 and reading like a second, unrelated statement.
	let parenDepth = 0;
	let atLineStart = true;

	const append = (str: string) => {
		if (atLineStart && str.trim()) {
			result += indentStr.repeat(Math.max(0, currentIndent));
			atLineStart = false;
		}
		result += str;
	};

	const newLine = () => {
		result = result.trimEnd() + '\n';
		atLineStart = true;
	};

	for (let idx = 0; idx < tokens.length; idx++) {
		const token = tokens[idx];

		if (token.type === 'comment') {
			if (!atLineStart) newLine();
			append(token.val);
			newLine();
			continue;
		}

		if (token.type === 'str') {
			append(token.val);
			continue;
		}

		// Operators (=, >, -, /, *, …) keep whatever spacing the ws tokens gave
		// them; only their surroundings are normalised, never their content.
		if (token.type === 'op') {
			append(token.val);
			continue;
		}

		if (token.type === 'punct') {
			if (token.val === ',') {
				append(', ');
			} else if (token.val === '(') {
				// no space of our own — the preceding ws token, if there was one,
				// already added it. Keeps `count(x)` tight and `from (select …)` open.
				append('(');
				parenDepth++;
				currentIndent = parenDepth;
			} else if (token.val === ')') {
				parenDepth = Math.max(0, parenDepth - 1);
				currentIndent = parenDepth;
				append(')');
			} else if (token.val === ';') {
				append(';');
				newLine();
			}
			continue;
		}

		if (token.type === 'ws') {
			if (!atLineStart && !result.endsWith(' ') && !result.endsWith('(')) {
				append(' ');
			}
			continue;
		}

		if (token.type === 'word') {
			// Check multi-word clauses e.g. "LEFT JOIN", "GROUP BY", "ORDER BY", "UNION ALL"
			let matchedClause = '';
			const nextToken = tokens[idx + 1]?.type === 'ws' ? tokens[idx + 2] : null;
			if (nextToken?.type === 'word') {
				const twoWords = `${token.val.toUpperCase()} ${nextToken.val.toUpperCase()}`;
				if (ALL_KEYWORDS_SORTED.includes(twoWords)) {
					matchedClause = twoWords;
					idx = tokens[idx + 1]?.type === 'ws' ? idx + 2 : idx + 1;
				}
			}

			const wordUpper = matchedClause || token.val.toUpperCase();
			const isMajor = MAJOR_CLAUSES.includes(wordUpper);
			const isSub = SUB_CLAUSES.includes(wordUpper);
			const isOther = OTHER_KEYWORDS.includes(wordUpper);

			if (isMajor) {
				if (!atLineStart) newLine();
				currentIndent = parenDepth;
				append(wordUpper);
				currentIndent = parenDepth + 1;
				newLine();
			} else if (isSub) {
				if (!atLineStart) newLine();
				currentIndent = parenDepth + 1;
				append(wordUpper);
				append(' ');
			} else if (isOther) {
				append(wordUpper);
			} else {
				append(token.val);
			}
		}
	}

	return result.trim();
}

/** Collapse to one line through the same tokenizer the formatter uses. Regexes
 *  over raw SQL cannot tell code from data: `/--.*$/` truncates a literal that
 *  merely contains a double dash, and normalising spaces around `,` rewrites
 *  the inside of 'a,b'. Going through tokens keeps literals byte-for-byte. */
export function minifySql(sql: string): string {
	let out = '';
	let skipWs = false;

	for (const token of tokenizeSql(sql.trim())) {
		switch (token.type) {
			case 'comment':
				skipWs = false;
				break;
			case 'ws':
				if (!skipWs && out && !out.endsWith(' ')) out += ' ';
				skipWs = false;
				break;
			case 'punct':
				if (token.val === '(') {
					out += '(';
					skipWs = true; // no gap between "(" and what follows
				} else if (token.val === ')') {
					out = out.trimEnd() + ')';
					skipWs = false;
				} else {
					out = `${out.trimEnd()}${token.val} `; // "," and ";"
					skipWs = true;
				}
				break;
			default:
				out += token.val; // word / str / op verbatim
				skipWs = false;
		}
	}

	return out.trim();
}

export function initSql(host: HTMLElement): void {
	let wb: ReturnType<typeof createWorkbench>;

	function doFormat(indent: number) {
		const raw = wb.inputArea.value.trim();
		if (!raw) {
			wb.outputArea.value = '';
			wb.updateStatus('idle', '准备就绪：输入或粘贴 SQL 后将自动格式化。');
			return;
		}

		try {
			const formatted = formatSql(raw, indent);
			wb.outputArea.value = formatted;
			const originalBytes = new TextEncoder().encode(raw).length;
			const formattedBytes = new TextEncoder().encode(formatted).length;
			const lines = formatted.split('\n').length;
			wb.updateStatus(
				'valid',
				`✓ SQL formatted · ${lines} lines · Raw: ${formatBytes(originalBytes)} · Formatted: ${formatBytes(formattedBytes)}`,
				`✓ SQL 格式化完成 · 共 ${lines} 行 · 原始大小: ${formatBytes(originalBytes)} · 格式化后: ${formatBytes(formattedBytes)}`
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'SQL parse failed';
			wb.updateStatus('error', `✗ Formatting error: ${msg}`, `✗ 格式化出错: ${msg}`);
		}
	}

	function doMinify() {
		const raw = wb.inputArea.value.trim();
		if (!raw) return;
		try {
			const minified = minifySql(raw);
			wb.outputArea.value = minified;
			const orig = new TextEncoder().encode(raw).length;
			const mini = new TextEncoder().encode(minified).length;
			const saved = orig > 0 ? (((orig - mini) / orig) * 100).toFixed(1) : '0';
			wb.updateStatus(
				'valid',
				`✓ Minified to single-line SQL · Compressed from ${formatBytes(orig)} to ${formatBytes(mini)} (${saved}% saved)`,
				`✓ 已压缩为单行 SQL · 大小从 ${formatBytes(orig)} 压缩至 ${formatBytes(mini)} (减小 ${saved}%)`
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Minify failed';
			wb.updateStatus('error', `✗ Minify error: ${msg}`, `✗ 压缩出错: ${msg}`);
		}
	}

	wb = createWorkbench({
		host,
		inputTitle: 'Input SQL Query',
		inputTitleZh: '输入 SQL 查询语句',
		outputTitle: 'Formatted / Minified Output',
		outputTitleZh: '格式化 / 压缩结果',
		inputPlaceholder: 'Paste SQL statement here (e.g. SELECT * FROM users WHERE status = 1)...',
		inputPlaceholderZh: '在此粘贴 SQL 语句 (如 SELECT * FROM users WHERE status = 1...)',
		outputPlaceholder: 'Beautified SQL will appear here...',
		outputPlaceholderZh: '美化后的 SQL 将显示在此处...',
		fileAccept: '.sql,.txt,text/plain',
		fileDefaultName: `formatted-${Date.now()}.sql`,
		downloadLabel: '💾 Download .sql',
		downloadLabelZh: '💾 下载 .sql',
		buttons: [
			{ label: 'Format (2 spaces)', labelZh: '格式化 (2 空格)', primary: true, onClick: () => doFormat(2) },
			{ label: 'Format (4 spaces)', labelZh: '格式化 (4 空格)', primary: false, onClick: () => doFormat(4) },
			{ label: 'Minify', labelZh: '单行压缩', primary: false, onClick: doMinify }
		],
		onInput: () => doFormat(2),
		onSample: () => {
			wb.inputArea.value = SAMPLE_SQL;
			doFormat(2);
		},
		onClear: () => {
			wb.inputArea.value = '';
			wb.outputArea.value = '';
			wb.updateStatus('idle', 'Cleared', '已清空');
		},
		initialStatus: 'Ready: Paste or type SQL to tokenize and format automatically.',
		initialStatusZh: '准备就绪：输入或粘贴 SQL 语句后将自动进行语法分词与排版。'
	});
}
