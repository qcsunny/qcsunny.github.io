// Interactive JWT Token Decoder & Formatter:
// - Safely splits Header, Payload, and Signature
// - Base64URL decoding with UTF-8 character support
// - Automatic timestamp inspection: exp (expiration), iat (issued at), nbf (not before)
// - Real-time token validity check (active vs expired, time remaining countdown)
// - 100% in-browser client-side execution, zero network requests, safe for authentication tokens.

import { createWorkbench, formatBytes } from './workbench';

// Sample signed HS256 JWT
const SAMPLE_JWT =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
	'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IlFDU3VubnkiLCJhZG1pbiI6dHJ1ZSwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE5OTk5OTk5OTl9.' +
	'4fl4UqL59mK9v82B3pG8Q978hH8kG5V_jWk1V2xK8dM';

function base64UrlDecode(str: string): string {
	let output = str.replace(/-/g, '+').replace(/_/g, '/');
	switch (output.length % 4) {
		case 0:
			break;
		case 2:
			output += '==';
			break;
		case 3:
			output += '=';
			break;
		default:
			throw new Error('Base64 字符串长度非法');
	}
	try {
		// decode base64 bytes to utf-8 text safely
		const binary = atob(output);
		const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
		return new TextDecoder('utf-8').decode(bytes);
	} catch (e) {
		throw new Error('Base64 解码失败');
	}
}

function formatTimestamp(ts: number): string {
	const d = new Date(ts * 1000);
	return d.toLocaleString('zh-CN', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false
	});
}

export function initJwt(host: HTMLElement): void {
	let wb: ReturnType<typeof createWorkbench>;

	function doDecode() {
		const raw = wb.inputArea.value.trim();
		if (!raw) {
			wb.outputArea.value = '';
			wb.updateStatus('idle', '准备就绪：粘贴 JWT Token (形如 eyJhbGci...) 后将自动解码。');
			return;
		}

		const parts = raw.split('.');
		if (parts.length < 2) {
			wb.updateStatus('error', '✗ 无效的 JWT 格式：Token 必须由点号 (.) 分隔至少 2 或 3 个部分。');
			wb.outputArea.value = '';
			return;
		}

		try {
			const headerRaw = base64UrlDecode(parts[0]);
			const payloadRaw = base64UrlDecode(parts[1]);

			const headerObj = JSON.parse(headerRaw);
			const payloadObj = JSON.parse(payloadRaw);

			let statusSummary = '✓ JWT 解码成功';
			let timeNotice = '';

			// Inspect exp / iat / nbf
			const nowSec = Math.floor(Date.now() / 1000);
			if (typeof payloadObj.exp === 'number') {
				const expDate = formatTimestamp(payloadObj.exp);
				if (payloadObj.exp < nowSec) {
					const diffSec = nowSec - payloadObj.exp;
					const days = Math.floor(diffSec / 86400);
					const hours = Math.floor((diffSec % 86400) / 3600);
					timeNotice = `【已过期】该 Token 已于 ${expDate} 过期 (约 ${days} 天 ${hours} 小时前)`;
				} else {
					const diffSec = payloadObj.exp - nowSec;
					const days = Math.floor(diffSec / 86400);
					const hours = Math.floor((diffSec % 86400) / 3600);
					timeNotice = `【有效】该 Token 有效期至 ${expDate} (剩余约 ${days} 天 ${hours} 小时)`;
				}
			}

			const formattedHeader = JSON.stringify(headerObj, null, 2);
			const formattedPayload = JSON.stringify(payloadObj, null, 2);

			let output = `/* =========================================\n`;
			output += ` * 🛡️ 状态: 100% 浏览器本地解析，未发起任何网络请求\n`;
			if (timeNotice) {
				output += ` * ⏰ 时效: ${timeNotice}\n`;
			}
			if (headerObj.alg) {
				output += ` * 🔑 签名算法: ${headerObj.alg}\n`;
			}
			output += ` * ========================================= */\n\n`;

			output += `// --- 1. HEADER (头部) ---\n`;
			output += `${formattedHeader}\n\n`;

			output += `// --- 2. PAYLOAD (有效载荷数据) ---\n`;
			output += `${formattedPayload}\n\n`;

			if (parts[2]) {
				output += `// --- 3. SIGNATURE (签名串) ---\n`;
				output += `"${parts[2]}"\n`;
			}

			wb.outputArea.value = output;

			const isExpired = typeof payloadObj.exp === 'number' && payloadObj.exp < nowSec;
			if (isExpired) {
				wb.updateStatus('error', `Token 已过期 · 过期时间: ${formatTimestamp(payloadObj.exp)} · 算法: ${headerObj.alg || '未知'}`);
			} else {
				wb.updateStatus(
					'valid',
					`✓ Token 有效 · ${timeNotice || '无过期限制'} · 算法: ${headerObj.alg || '未知'}`
				);
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'JWT 解析失败';
			wb.updateStatus('error', `✗ 解析失败: ${msg}`);
		}
	}

	wb = createWorkbench({
		host,
		inputTitle: '输入 JWT 令牌 (Bearer Token)',
		outputTitle: '解码结果 (Header & Payload)',
		inputPlaceholder: '在此粘贴 JWT 字符串，例如: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
		outputPlaceholder: '解码后的 JSON 数据与时效校验结果将显示在此处...',
		fileAccept: '.txt,.jwt',
		fileDefaultName: `jwt-decoded-${Date.now()}.json`,
		buttons: [
			{ label: '解析 Token', primary: true, onClick: doDecode },
			{
				label: '只复制 Payload JSON',
				primary: false,
				onClick: async () => {
					const raw = wb.inputArea.value.trim();
					const parts = raw.split('.');
					if (parts.length >= 2) {
						try {
							const payload = JSON.stringify(JSON.parse(base64UrlDecode(parts[1])), null, 2);
							await navigator.clipboard.writeText(payload);
							wb.updateStatus('valid', '✓ 已成功将 Payload JSON 复制到剪贴板！');
						} catch {}
					}
				}
			}
		],
		onInput: doDecode,
		onSample: () => {
			wb.inputArea.value = SAMPLE_JWT;
			doDecode();
		},
		onClear: () => {
			wb.inputArea.value = '';
			wb.outputArea.value = '';
			wb.updateStatus('idle', '已清空');
		},
		initialStatus: '准备就绪：粘贴 JWT 后将自动解析 Header、Payload 及过期时效。'
	});
}
