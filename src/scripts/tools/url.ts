// Interactive URL Parser, Query String Formatter & Cleaner:
// - Parses URL into Protocol, Hostname, Port, Pathname, Hash
// - Decodes and formats Query Parameters into readable list or JSON
// - URL Encode & Decode with full UTF-8 support
// - One-click remove tracking parameters (utm_*, spm, fbclid, gclid)
// - Alphabetical sorting of query keys (essential for API signatures)
// - 100% in-browser, native URL & URLSearchParams APIs, zero dependencies.

import { isZh, onLang } from './i18n';
import { createWorkbench, formatBytes } from './workbench';

const SAMPLE_URL =
	'https://qcsunny.org/blog/guide?utm_source=google&utm_medium=cpc&utm_campaign=summer_promo&category=%E6%8A%80%E6%9C%AF%E5%8D%9A%E5%AE%A2&sort=desc&page=1&ref=developer_tools#section-faq';

const TRACKING_PARAMS = [
	'utm_source',
	'utm_medium',
	'utm_campaign',
	'utm_term',
	'utm_content',
	'fbclid',
	'gclid',
	'spm',
	'from',
	'_hsenc',
	'_hsmi'
];

function tryParseUrl(input: string): URL | null {
	const raw = input.trim();
	if (!raw) return null;
	try {
		return new URL(raw);
	} catch {
		// If input has no protocol, try adding https://
		try {
			return new URL('https://' + raw);
		} catch {
			return null;
		}
	}
}

export function initUrl(host: HTMLElement): void {
	let wb: ReturnType<typeof createWorkbench>;

	const READY_EN =
		'Ready: paste a URL to inspect its components, decode parameters and strip tracking tokens.';
	const READY_ZH = '准备就绪：输入 URL 后将自动解析组件、拆解参数并提供清洗导出功能。';

	// The breakdown is plain text in a <textarea> and cannot hold an
	// .i18n-en/.i18n-zh pair, so it is rebuilt from the input; onLang at the
	// bottom of this function re-runs the parse on every language change.
	function doParse() {
		const zh = isZh();
		const raw = wb.inputArea.value.trim();
		if (!raw) {
			wb.outputArea.value = '';
			wb.updateStatus('idle', READY_EN, READY_ZH);
			return;
		}

		const parsed = tryParseUrl(raw);
		if (!parsed) {
			wb.updateStatus(
				'error',
				'✗ Not a URL — enter a full web address.',
				'✗ 无效的 URL 格式，请输入合法的网络地址。',
			);
			wb.outputArea.value = '';
			return;
		}

		const paramsObj: Record<string, string> = {};
		parsed.searchParams.forEach((val, key) => {
			paramsObj[key] = val;
		});

		const paramCount = Object.keys(paramsObj).length;

		// One label column, padded to the same width in both languages so the
		// values still line up.
		const row = (en: string, zhLabel: string, val: string): string =>
			`${(zh ? zhLabel : en).padEnd(zh ? 10 : 18, ' ')} ${val}\n`;

		let out = `/* =========================================\n`;
		out += zh ? ` * 🌐 URL 结构化拆解\n` : ` * 🌐 URL breakdown\n`;
		out += ` * ========================================= */\n`;
		out += row('Protocol:', '协议:', parsed.protocol);
		out += row('Hostname:', '域名:', parsed.hostname);
		if (parsed.port) out += row('Port:', '端口:', parsed.port);
		out += row('Origin:', '根路径:', parsed.origin);
		out += row('Path:', '路由路径:', parsed.pathname);
		if (parsed.hash) out += row('Hash:', '锚点:', parsed.hash);
		out += row('Query params:', '查询参数数量:', zh ? `${paramCount} 个` : String(paramCount));
		out += `\n`;

		out += `/* =========================================\n`;
		out += zh ? ` * 📋 查询参数明细\n` : ` * 📋 Query parameters\n`;
		out += ` * ========================================= */\n`;

		if (paramCount === 0) {
			out += zh ? `(该 URL 无任何查询参数)\n` : `(this URL carries no query parameters)\n`;
		} else {
			let i = 1;
			parsed.searchParams.forEach((val, key) => {
				out += `${i++}. ${key} = ${decodeURIComponent(val)}\n`;
			});
		}

		wb.outputArea.value = out;
		wb.updateStatus(
			'valid',
			`✓ Parsed successfully · Hostname: ${parsed.hostname} · ${paramCount} query parameter(s)`,
			`✓ 解析完成 · 域名: ${parsed.hostname} · 包含 ${paramCount} 个查询参数`
		);
	}

	function doExportJson() {
		const raw = wb.inputArea.value.trim();
		const parsed = tryParseUrl(raw);
		if (!parsed) return;

		const paramsObj: Record<string, string> = {};
		parsed.searchParams.forEach((val, key) => {
			try {
				paramsObj[key] = decodeURIComponent(val);
			} catch {
				paramsObj[key] = val;
			}
		});

		wb.outputArea.value = JSON.stringify(paramsObj, null, 2);
		wb.updateStatus('valid', '✓ Converted all query parameters to JSON', '✓ 已成功将所有 Query 参数转换为 JSON 对象');
	}

	function doStripTracking() {
		const raw = wb.inputArea.value.trim();
		const parsed = tryParseUrl(raw);
		if (!parsed) return;

		const cleaned = new URL(parsed.toString());
		let removedCount = 0;
		for (const p of TRACKING_PARAMS) {
			if (cleaned.searchParams.has(p)) {
				cleaned.searchParams.delete(p);
				removedCount++;
			}
		}

		wb.outputArea.value = cleaned.toString();
		wb.updateStatus(
			'valid',
			`✓ Removed ${removedCount} tracking parameter(s) (utm / spm / gclid etc.)`,
			`✓ 已去除 ${removedCount} 个营销与埋点跟踪参数 (utm / spm / gclid 等)`
		);
	}

	function doSortParams() {
		const raw = wb.inputArea.value.trim();
		const parsed = tryParseUrl(raw);
		if (!parsed) return;

		parsed.searchParams.sort();
		wb.outputArea.value = parsed.toString();
		wb.updateStatus('valid', '✓ Sorted query parameters ascending (A-Z)', '✓ 已按参数键名 (A-Z) 升序重排 Query 参数');
	}

	function doDecodeUri() {
		const raw = wb.inputArea.value.trim();
		try {
			wb.outputArea.value = decodeURIComponent(raw);
			wb.updateStatus('valid', '✓ URL Decode (decodeURIComponent) complete', '✓ URL 解码 (DecodeURIComponent) 完成');
		} catch (e) {
			wb.updateStatus('error', '✗ Decode failed: invalid escape sequence', '✗ 解码失败：包含不合法的转义序列');
		}
	}

	function doEncodeUri() {
		const raw = wb.inputArea.value.trim();
		try {
			wb.outputArea.value = encodeURIComponent(raw);
			wb.updateStatus('valid', '✓ URL Encode (encodeURIComponent) complete', '✓ URL 编码 (EncodeURIComponent) 完成');
		} catch (e) {
			wb.updateStatus('error', '✗ Encode failed', '✗ 编码失败');
		}
	}

	wb = createWorkbench({
		host,
		inputTitle: 'Input URL / Query String',
		inputTitleZh: '输入 URL 网址 / Query 参数',
		outputTitle: 'Parsed Result & Parameters',
		outputTitleZh: '解析排版 / 清洗导出结果',
		inputPlaceholder: 'Paste complete URL here (e.g. https://example.com/api?a=1&b=2)...',
		inputPlaceholderZh: '在此粘贴完整 URL，例如 https://example.com/api?a=1&b=2...',
		outputPlaceholder: 'Parsed URL components and parameters will appear here...',
		outputPlaceholderZh: 'URL 拆解及格式化参数将显示在此处...',
		fileAccept: '.txt,.url',
		fileDefaultName: `url-params-${Date.now()}.json`,
		downloadLabel: '💾 Download JSON',
		downloadLabelZh: '💾 下载 JSON',
		buttons: [
			{ label: 'Parse URL', labelZh: '结构化解析', primary: true, onClick: doParse },
			{ label: 'Export JSON', labelZh: '转为 JSON', primary: false, onClick: doExportJson },
			{ label: 'Strip Tracking', labelZh: '去除追踪参数', primary: false, onClick: doStripTracking },
			{ label: 'Sort Params (A-Z)', labelZh: '参数排序 (A-Z)', primary: false, onClick: doSortParams },
			{ label: 'URL Decode', labelZh: 'URL 解码', primary: false, onClick: doDecodeUri },
			{ label: 'URL Encode', labelZh: 'URL 编码', primary: false, onClick: doEncodeUri }
		],
		onInput: doParse,
		onSample: () => {
			wb.inputArea.value = SAMPLE_URL;
			doParse();
		},
		onClear: () => {
			wb.inputArea.value = '';
			wb.outputArea.value = '';
			wb.updateStatus('idle', 'Cleared', '已清空');
		},
		initialStatus: READY_EN,
		initialStatusZh: READY_ZH,
	});

	// The breakdown above is plain text, so redo it when the language flips.
	onLang(doParse);
}
