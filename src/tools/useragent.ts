// User-agent string parser, pure regex (no library, no lookup table download).
// Consumed by the devtools/user-agent-parser text tool; returns bilingual
// fields so the report can render both halves.

export interface UaInfo {
	browser: string;
	browserZh: string;
	version: string;
	os: string;
	osZh: string;
	device: string;
	deviceZh: string;
	engine: string;
	engineZh: string;
	bot: boolean;
}

export function parseUa(ua: string): UaInfo | null {
	if (!ua.trim()) return null;
	const s = ua;

	// --- bots first: they carry no honest browser fields ---
	const botPatterns: [RegExp, string, string][] = [
		[/Googlebot/i, 'Googlebot', '谷歌爬虫'],
		[/bingbot|BingPreview/i, 'Bing bot', '必应爬虫'],
		[/Baiduspider/i, 'Baidu spider', '百度爬虫'],
		[/YandexBot/i, 'Yandex bot', 'Yandex 爬虫'],
		[/DuckDuckBot/i, 'DuckDuckGo bot', 'DuckDuckGo 爬虫'],
		[/Slurp/i, 'Yahoo slurp', '雅虎爬虫'],
		[/facebookexternalhit/i, 'Facebook crawler', 'Facebook 分享抓取'],
		[/Twitterbot/i, 'Twitter bot', 'Twitter 卡片抓取'],
		[/LinkedInBot/i, 'LinkedIn bot', 'LinkedIn 抓取'],
		[/GPTBot|ClaudeBot|CCBot/i, 'AI crawler', 'AI 爬虫'],
		[/HeadlessChrome/i, 'Headless Chrome', '无头浏览器'],
		[/curl\//i, 'curl', 'curl 命令行'],
		[/Wget/i, 'Wget', 'Wget 命令行'],
		[/python-requests|aiohttp|httpx/i, 'HTTP client library', 'HTTP 客户端库'],
		[/bot|crawler|spider|slurp/i, 'Unknown bot', '未知爬虫'],
	];
	for (const [re, en, zh] of botPatterns) {
		if (re.test(s)) {
			const version = /\/([\d.]+)/.exec(s)?.[1] ?? '';
			return { browser: en, browserZh: zh, version, os: '—', osZh: '—', device: 'Server / bot', deviceZh: '服务器 / 爬虫', engine: '—', engineZh: '—', bot: true };
		}
	}

	// --- engine: the skeleton to hang browsers on ---
	let engine = 'Unknown';
	let engineZh = '未知';
	if (/Firefox\//.test(s)) {
		engine = 'Gecko';
		engineZh = 'Gecko 引擎';
	} else if (/AppleWebKit\//.test(s) && /Chrome|Chromium|Edg|OPR|SamsungBrowser/.test(s)) {
		engine = 'Blink';
		engineZh = 'Blink 引擎';
	} else if (/AppleWebKit\//.test(s)) {
		engine = 'WebKit';
		engineZh = 'WebKit 引擎';
	} else if (/Trident\//.test(s)) {
		engine = 'Trident';
		engineZh = 'Trident 引擎 (IE)';
	}

	// --- browser ---
	let browser = 'Unknown';
	let browserZh = '未知浏览器';
	let version = '';
	const tryBrowser = (re: RegExp, en: string, zh: string): boolean => {
		const m = re.exec(s);
		if (!m) return false;
		browser = en;
		browserZh = zh;
		version = m[1] ?? '';
		return true;
	};
	tryBrowser(/Edg(?:e|A|iOS)?\/([\d.]+)/, 'Microsoft Edge', '微软 Edge') ||
		tryBrowser(/OPR\/([\d.]+)/, 'Opera', '欧朋 Opera') ||
		tryBrowser(/SamsungBrowser\/([\d.]+)/, 'Samsung Internet', '三星浏览器') ||
		tryBrowser(/Firefox\/([\d.]+)/, 'Firefox', '火狐 Firefox') ||
		tryBrowser(/CriOS\/([\d.]+)/, 'Chrome (iOS)', 'Chrome（iOS 版）') ||
		tryBrowser(/FxiOS\/([\d.]+)/, 'Firefox (iOS)', 'Firefox（iOS 版）') ||
		tryBrowser(/Chrome\/([\d.]+)/, 'Chrome', '谷歌 Chrome') ||
		tryBrowser(/Version\/([\d.]+).*Safari/, 'Safari', 'Safari 浏览器') ||
		tryBrowser(/MSIE ([\d.]+)/, 'Internet Explorer', 'IE 浏览器') ||
		tryBrowser(/rv:([\d.]+)\).*Gecko/, 'Internet Explorer 11', 'IE 11');

	// --- OS ---
	let os = 'Unknown';
	let osZh = '未知系统';
	if (/Windows NT 10/.test(s)) {
		os = /Windows Phone/.test(s) ? 'Windows Phone' : 'Windows 10/11';
		osZh = /Windows Phone/.test(s) ? 'Windows Phone' : 'Windows 10/11';
	} else if (/Windows NT 6\.3/.test(s)) {
		os = 'Windows 8.1';
		osZh = 'Windows 8.1';
	} else if (/Windows NT 6\.1/.test(s)) {
		os = 'Windows 7';
		osZh = 'Windows 7';
	} else if (/Windows/.test(s)) {
		os = 'Windows (older)';
		osZh = 'Windows（旧版）';
	} else if (/iPhone/.test(s)) {
		const m = /iPhone OS ([\d_]+)/.exec(s);
		os = m ? `iOS ${m[1].replace(/_/g, '.')}` : 'iOS';
		osZh = os;
	} else if (/iPad/.test(s)) {
		const m = /CPU OS ([\d_]+)/.exec(s);
		os = m ? `iPadOS ${m[1].replace(/_/g, '.')}` : 'iPadOS';
		osZh = os;
	} else if (/Android ([\d.]+)/.test(s)) {
		const m = /Android ([\d.]+)/.exec(s) as RegExpExecArray;
		os = `Android ${m[1]}`;
		osZh = os;
	} else if (/Mac OS X ([\d_.]+)/.test(s)) {
		const m = /Mac OS X ([\d_.]+)/.exec(s) as RegExpExecArray;
		os = `macOS ${m[1].replace(/_/g, '.')}`;
		osZh = os;
	} else if (/CrOS/.test(s)) {
		os = 'ChromeOS';
		osZh = 'ChromeOS';
	} else if (/Linux/.test(s)) {
		os = 'Linux';
		osZh = 'Linux';
	}

	// --- device class ---
	let device = 'Desktop';
	let deviceZh = '桌面设备';
	if (/Mobile|iPhone|Android.*Mobile/.test(s)) {
		device = 'Mobile';
		deviceZh = '手机';
	} else if (/iPad|Tablet|Android(?!.*Mobile)/.test(s)) {
		device = 'Tablet';
		deviceZh = '平板';
	} else if (/TV|SmartTV|AppleTV/.test(s)) {
		device = 'TV';
		deviceZh = '电视';
	}

	return { browser, browserZh, version, os, osZh, device, deviceZh, engine, engineZh, bot: false };
}
