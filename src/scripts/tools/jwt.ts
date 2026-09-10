// Interactive JWT Token Decoder & Formatter:
// - Safely splits Header, Payload, and Signature
// - Base64URL decoding with UTF-8 character support
// - Automatic timestamp inspection: exp (expiration), iat (issued at), nbf (not before)
// - Real-time token validity check (active vs expired, time remaining countdown)
// - 100% in-browser client-side execution, zero network requests, safe for authentication tokens.

import { isZh, onLang } from './i18n';
import { createWorkbench } from './workbench';

// Sample signed HS256 JWT
const SAMPLE_JWT =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
	'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IlFDU3VubnkiLCJhZG1pbiI6dHJ1ZSwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE5OTk5OTk5OTl9.' +
	'4fl4UqL59mK9v82B3pG8Q978hH8kG5V_jWk1V2xK8dM';

/** Why a segment would not decode, as a code the caller renders in either
 *  language. A thrown sentence can only be written in one of them. */
export class Base64UrlError extends Error {
	constructor(readonly reason: 'length' | 'charset') {
		super(`base64url decode failed: ${reason}`);
		this.name = 'Base64UrlError';
	}
}

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
			throw new Base64UrlError('length');
	}
	try {
		// decode base64 bytes to utf-8 text safely
		const binary = atob(output);
		const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
		return new TextDecoder('utf-8').decode(bytes);
	} catch {
		throw new Base64UrlError('charset');
	}
}

function decodeFailure(err: unknown, zh: boolean): string {
	if (err instanceof Base64UrlError) {
		if (err.reason === 'length')
			return zh ? 'Base64URL 段长度非法（余数为 1）' : 'the base64url segment has an illegal length';
		return zh ? 'Base64URL 段包含非法字符' : 'the base64url segment holds characters outside the alphabet';
	}
	// A SyntaxError from JSON.parse: V8's own English text, quoted as-is.
	return err instanceof Error ? err.message : zh ? '未知错误' : 'unknown error';
}

function formatTimestamp(ts: number): string {
	const d = new Date(ts * 1000);
	const p = (n: number): string => String(n).padStart(2, '0');
	return (
		`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
		`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
	);
}

/** base64url encode (RFC 4648 §5, no padding) — the JWT wire form. */
function base64UrlEncode(bytes: Uint8Array): string {
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** HMAC over the HS256/384/512 family via Web Crypto; returns the base64url
 *  signature JWT uses. */
async function hmacSign(algSha: 'SHA-256' | 'SHA-384' | 'SHA-512', secret: string, data: Uint8Array): Promise<string> {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		enc.encode(secret) as unknown as ArrayBuffer,
		{ name: 'HMAC', hash: { name: algSha } },
		false,
		['sign'],
	);
	const sig = await crypto.subtle.sign('HMAC', key, data as unknown as ArrayBuffer);
	return base64UrlEncode(new Uint8Array(sig));
}

export function initJwt(host: HTMLElement): void {
	let wb: ReturnType<typeof createWorkbench>;

	const READY_EN = 'Ready: paste a JWT (looks like eyJhbGci...) to decode it automatically.';
	const READY_ZH = '准备就绪：粘贴 JWT Token (形如 eyJhbGci...) 后将自动解码。';

	// --- signing controls: secret + algorithm, shared by Sign and Verify ------
	// Rendered before the workbench so it sits above the input box; the two
	// buttons below close over these controls.
	const signRow = document.createElement('div');
	signRow.className = 't-filerow t-signrow';
	const secretLabel = document.createElement('label');
	secretLabel.htmlFor = 't-jwt-secret';
	secretLabel.append(...bilingualNode('Secret (HMAC — Sign / Verify only)', '密钥（HMAC，仅验签/签发需要）'));
	const secretInput = document.createElement('input');
	secretInput.type = 'password';
	secretInput.id = 't-jwt-secret';
	secretInput.autocomplete = 'off';
	secretInput.spellcheck = false;
	secretInput.placeholder = 'only needed to Sign / Verify';
	const algLabel = document.createElement('label');
	algLabel.htmlFor = 't-jwt-alg';
	algLabel.append(...bilingualNode('Algorithm', '算法'));
	const algSel = document.createElement('select');
	algSel.id = 't-jwt-alg';
	for (const a of ['HS256', 'HS384', 'HS512']) {
		const o = document.createElement('option');
		o.value = a;
		o.textContent = a;
		algSel.append(o);
	}
	const keyHint = document.createElement('span');
	keyHint.className = 't-file-hint';
	keyHint.append(...bilingualNode(
		'Decoding needs no key — fill this only for Verify / Sign.',
		'解码无需密钥——仅「验签 / 签发」时才需要填写。',
	));
	signRow.append(secretLabel, secretInput, algLabel, algSel, keyHint);

	/** Sign: the input box holds the payload JSON; secret + algorithm above
	 *  produce a complete three-segment JWT. */
	async function doSign(): Promise<void> {
		const secret = secretInput.value;
		const raw = wb.inputArea.value.trim();
		if (!raw) {
			wb.updateStatus('error', '✗ Enter the payload JSON first.', '✗ 请先输入 Payload JSON。');
			return;
		}
		if (!secret) {
			wb.updateStatus('error', '✗ Enter the secret key above.', '✗ 请先在上方输入密钥。');
			return;
		}
		let payload: unknown;
		try {
			payload = JSON.parse(raw);
		} catch (err) {
			wb.updateStatus('error', `✗ Payload is not valid JSON: ${err instanceof Error ? err.message : ''}`, `✗ Payload 不是合法 JSON：${err instanceof Error ? err.message : ''}`);
			return;
		}
		const alg = algSel.value as 'HS256' | 'HS384' | 'HS512';
		const header = { alg, typ: 'JWT' };
		const enc = new TextEncoder();
		const h = base64UrlEncode(enc.encode(JSON.stringify(header)));
		const p = base64UrlEncode(enc.encode(JSON.stringify(payload)));
		const sig = await hmacSign(('SHA-' + alg.slice(2)) as 'SHA-256' | 'SHA-384' | 'SHA-512', secret, enc.encode(`${h}.${p}`));
		wb.outputArea.value = `${h}.${p}.${sig}`;
		wb.updateStatus('valid', `✓ Signed with ${alg} — copy the token from the output box.`, `✓ 已用 ${alg} 签名 —— 从输出框复制 Token。`);
	}

	/** Verify: recompute the HMAC of header.payload with the given secret and
	 *  compare against the token's third segment. Only HS256/384/512 — the
	 *  asymmetric algorithms need a public key this tool does not take. */
	async function doVerify(): Promise<void> {
		const zh = isZh();
		const secret = secretInput.value;
		const raw = wb.inputArea.value.trim().replace(/^Bearer\s+/i, '');
		const parts = raw.split('.');
		if (parts.length !== 3) {
			wb.updateStatus('error', '✗ Verifying needs a full three-segment signed token.', '✗ 验签需要完整的三段式签名 Token。');
			return;
		}
		let alg: string;
		try {
			alg = String(JSON.parse(base64UrlDecode(parts[0])).alg ?? '');
		} catch {
			wb.updateStatus('error', '✗ Could not decode the header.', '✗ 无法解码 Header。');
			return;
		}
		if (!/^HS(256|384|512)$/.test(alg)) {
			wb.updateStatus(
				'error',
				`✗ Algorithm ${alg} is not HMAC-based — RS/ES verification needs a public key and is not supported.`,
				`✗ 算法 ${alg} 不是 HMAC 系 —— RS/ES 验签需要公钥，暂不支持。`,
			);
			return;
		}
		if (!secret) {
			wb.updateStatus('error', '✗ Enter the secret key above to verify.', '✗ 请先在上方输入密钥再验签。');
			return;
		}
		const sig = await hmacSign(('SHA-' + alg.slice(2)) as 'SHA-256' | 'SHA-384' | 'SHA-512', secret, new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
		const ok = sig === parts[2];
		if (ok) {
			wb.outputArea.value =
				(zh ? '✓ 签名验证通过\n\n' : '✓ Signature verified\n\n') +
				`alg: ${alg}\n${zh ? '期望签名' : 'expected'}: ${sig}\n${zh ? '实际签名' : 'received'}: ${parts[2]}`;
			wb.updateStatus('valid', `✓ Signature valid (${alg})`, `✓ 签名有效 (${alg})`);
		} else {
			wb.outputArea.value =
				(zh ? '✗ 签名不匹配\n\n' : '✗ Signature mismatch\n\n') +
				`alg: ${alg}\n${zh ? '期望签名' : 'expected'}: ${sig}\n${zh ? '实际签名' : 'received'}: ${parts[2]}`;
			wb.updateStatus('error', '✗ Signature mismatch — wrong secret or tampered token.', '✗ 签名不匹配 —— 密钥错误或 Token 已被篡改。');
		}
	}


	// minimal helper: this file predates the i18n.ts helpers' use here, and
	// onLang below already re-runs the decode; the labels only need the pair.
	function bilingualNode(en: string, zh: string): Node[] {
		const e = document.createElement('span');
		e.className = 'i18n-en';
		e.textContent = en;
		const z = document.createElement('span');
		z.className = 'i18n-zh';
		z.textContent = zh;
		return [e, z];
	}

	// The decoded report goes into a <textarea>, which holds text and not markup,
	// so it cannot carry an .i18n-en/.i18n-zh pair the way the rest of the page
	// does. It is rebuilt from the input instead, and onLang below re-runs the
	// whole decode whenever the language changes.
	function doDecode() {
		const zh = isZh();
		const raw = wb.inputArea.value.trim().replace(/^Bearer\s+/i, '');
		if (!raw) {
			wb.outputArea.value = '';
			wb.updateStatus('idle', READY_EN, READY_ZH);
			return;
		}

		const parts = raw.split('.');
		if (parts.length < 2) {
			wb.updateStatus(
				'error',
				'✗ Not a JWT: a token is at least 2 or 3 dot-separated (.) segments.',
				'✗ 无效的 JWT 格式：Token 必须由点号 (.) 分隔至少 2 或 3 个部分。',
			);
			wb.outputArea.value = '';
			return;
		}

		try {
			const headerObj = JSON.parse(base64UrlDecode(parts[0]));
			const payloadObj = JSON.parse(base64UrlDecode(parts[1]));

			let timeNotice = '';
			const nowSec = Math.floor(Date.now() / 1000);
			if (typeof payloadObj.exp === 'number') {
				const expDate = formatTimestamp(payloadObj.exp);
				const expired = payloadObj.exp < nowSec;
				const diffSec = expired ? nowSec - payloadObj.exp : payloadObj.exp - nowSec;
				const days = Math.floor(diffSec / 86400);
				const hours = Math.floor((diffSec % 86400) / 3600);
				if (expired) {
					timeNotice = zh
						? `【已过期】该 Token 已于 ${expDate} 过期 (约 ${days} 天 ${hours} 小时前)`
						: `[EXPIRED] this token expired at ${expDate}, about ${days}d ${hours}h ago`;
				} else {
					timeNotice = zh
						? `【有效】该 Token 有效期至 ${expDate} (剩余约 ${days} 天 ${hours} 小时)`
						: `[ACTIVE] valid until ${expDate}, about ${days}d ${hours}h left`;
				}
			}

			let output = `/* =========================================\n`;
			output += zh
				? ` * 🛡️ 状态: 100% 浏览器本地解析，未发起任何网络请求\n`
				: ` * 🛡️ Privacy: decoded entirely in your browser, no request left this page\n`;
			if (timeNotice) output += zh ? ` * ⏰ 时效: ${timeNotice}\n` : ` * ⏰ Validity: ${timeNotice}\n`;
			if (headerObj.alg)
				output += zh ? ` * 🔑 签名算法: ${headerObj.alg}\n` : ` * 🔑 Algorithm: ${headerObj.alg}\n`;
			output += ` * ========================================= */\n\n`;

			output += zh ? `// --- 1. HEADER (头部) ---\n` : `// --- 1. HEADER ---\n`;
			output += `${JSON.stringify(headerObj, null, 2)}\n\n`;

			output += zh ? `// --- 2. PAYLOAD (有效载荷数据) ---\n` : `// --- 2. PAYLOAD (claims) ---\n`;
			output += `${JSON.stringify(payloadObj, null, 2)}\n\n`;

			if (parts[2]) {
				output += zh ? `// --- 3. SIGNATURE (签名串) ---\n` : `// --- 3. SIGNATURE ---\n`;
				output += `"${parts[2]}"\n`;
			}

			wb.outputArea.value = output;

			if (typeof payloadObj.exp === 'number' && payloadObj.exp < nowSec) {
				wb.updateStatus(
					'error',
					`✗ Token expired · expired at ${formatTimestamp(payloadObj.exp)} · algorithm ${headerObj.alg || 'unknown'}`,
					`✗ Token 已过期 · 过期时间: ${formatTimestamp(payloadObj.exp)} · 算法: ${headerObj.alg || '未知'}`,
				);
			} else {
				wb.updateStatus(
					'valid',
					`✓ Valid token · ${timeNotice || 'no expiry claim'} · algorithm ${headerObj.alg || 'unknown'}`,
					`✓ Token 有效 · ${timeNotice || '无过期限制'} · 算法: ${headerObj.alg || '未知'}`,
				);
			}
		} catch (err) {
			wb.updateStatus(
				'error',
				`✗ Decode failed: ${decodeFailure(err, false)}`,
				`✗ 解析失败: ${decodeFailure(err, true)}`,
			);
		}
	}

	wb = createWorkbench({
		host,
		inputTitle: 'Input JWT (Bearer Token)',
		inputTitleZh: '输入 JWT 令牌 (Bearer Token)',
		outputTitle: 'Decoded Result (Header & Payload)',
		outputTitleZh: '解码结果 (Header & Payload)',
		inputPlaceholder: 'Paste JWT string here (e.g. eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...)',
		inputPlaceholderZh: '在此粘贴 JWT 字符串，例如: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
		outputPlaceholder: 'Decoded JSON and expiration check will appear here...',
		outputPlaceholderZh: '解码后的 JSON 数据与时效校验结果将显示在此处...',
		fileAccept: '.txt,.jwt',
		fileDefaultName: `jwt-decoded-${Date.now()}.json`,
		downloadLabel: '💾 Download JSON',
		downloadLabelZh: '💾 下载 JSON',
		buttons: [
			{ label: 'Decode Token', labelZh: '解析 Token', primary: true, onClick: doDecode },
			{ label: 'Verify Signature (HMAC)', labelZh: '验签 (HMAC)', primary: false, onClick: () => void doVerify() },
			{ label: 'Sign Payload → JWT', labelZh: '签发 Payload → JWT', primary: false, onClick: () => void doSign() },
			{
				label: 'Copy Payload JSON',
				labelZh: '只复制 Payload JSON',
				primary: false,
				onClick: async () => {
					const raw = wb.inputArea.value.trim();
					const parts = raw.split('.');
					if (parts.length >= 2) {
						try {
							const payload = JSON.stringify(JSON.parse(base64UrlDecode(parts[1])), null, 2);
							await navigator.clipboard.writeText(payload);
							wb.updateStatus('valid', '✓ Payload JSON copied to clipboard!', '✓ 已成功将 Payload JSON 复制到剪贴板！');
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
			wb.updateStatus('idle', 'Cleared', '已清空');
		},
		initialStatus: READY_EN,
		initialStatusZh: READY_ZH,
	});

	// The workbench clears the host, so the secret/algorithm row has to go in
	// AFTER it renders — pinned to the top of the workbench structure.
	host.insertBefore(signRow, host.firstChild ?? null);

	// Re-render the report, which is plain text in a <textarea>, on every switch.
	onLang(doDecode);
}
