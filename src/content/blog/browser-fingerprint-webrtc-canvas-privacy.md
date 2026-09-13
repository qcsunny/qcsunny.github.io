---
title: '浏览器指纹检测与 WebRTC 隐私泄露：Canvas、AudioContext 与 WebGL 追踪原理'
description: '深度拆解浏览器信息与安全检测工具原理。剖析 Canvas 渲染差异、AudioContext 频响哈希、WebGL 渲染器字符串及 WebRTC STUN 探测局域网/真实 IP 泄露的底层技术与防追踪策略。'
pubDate: 'Sep 13 2026'
category: security
topics: [security, web-platform, developer-tools]
searchTerms: ['浏览器指纹', 'WebRTC', 'Canvas指纹', 'AudioContext', '隐私保护']
contentLang: 'zh-CN'
relatedTools: ['security/browser-info', 'security/cidr-calculator']
relatedPosts: ['jwt-security-and-decoder-pitfalls', 'password-entropy-and-secure-random']
---

在互联网广告追踪、风控防刷与网络安全领域，网站在不需要用户登录、也不依赖 Cookie/LocalStorage 的情况下，是如何精确识别出“你就是你”的？答案是 **浏览器指纹（Browser Fingerprinting）** 与 **WebRTC 穿透探测**。

即便你开启了无痕浏览模式（Incognito Mode）或清空了全部本地缓存，你的操作系统、显卡型号、抗锯齿渲染算法、音频硬件浮点处理微小差异，依然在暴露着独一无二的设备特征。

本站 [浏览器信息与安全检测](/security/browser-info/) 整合了全面的浏览器环境诊断功能。本文将深入剖析 Canvas 指纹、AudioContext 声学指纹、WebGL 硬件泄露以及 WebRTC STUN 协议绕过代理泄露真实 IP 的底层实现原理。

---

## 1. Canvas 2D 指纹：硬件抗锯齿与字体渲染差异

Canvas 2D 指纹的核心逻辑在于：**相同的绘图指令在不同的硬件（GPU）、操作系统及字体渲染引擎下，生成的位图像素存在微小的差异**。

### 渲染测试原理
1. 在隐形 Canvas 上绘制一段包含多种字体、颜色的复杂文本，并开启抗锯齿、阴影与弧线；
2. 调用 `canvas.toDataURL()` 将画布导出为 Base64 编码数据；
3. 计算该数据的 SHA-256 / MurmurHash3 哈希值。

```ts
/**
 * 生成 Canvas 2D 设备唯一指纹
 */
export function getCanvasFingerprint(): string {
	const canvas = document.createElement('canvas');
	canvas.width = 200;
	canvas.height = 50;
	const ctx = canvas.getContext('2d');
	if (!ctx) return '';

	// 文本与图形混合绘制，最大化渲染差异
	ctx.textBaseline = 'top';
	ctx.font = "14px 'Arial', 'PingFang SC', sans-serif";
	ctx.fillStyle = '#f60';
	ctx.fillRect(125, 1, 62, 20);

	ctx.fillStyle = '#069';
	ctx.fillText('QCSunny Lab <canvas> 1.0', 2, 15);
	ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
	ctx.fillText('QCSunny Lab <canvas> 1.0', 4, 17);

	const dataUrl = canvas.toDataURL();
	return simpleHash(dataUrl);
}

function simpleHash(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = (hash << 5) - hash + str.charCodeAt(i);
		hash |= 0;
	}
	return (hash >>> 0).toString(16);
}
```

操作系统背后的 DirectWrite (Windows)、Core Text (macOS) 或 FreeType (Linux) 字体渲染引擎，以及 GPU 的抗锯齿算法，会导致末尾若干像素点的 RGB 值有微弱偏差，导出的哈希值因而具备极高的唯一性。

---

## 2. AudioContext 指纹：音频处理器的浮点数数差

除了图像，音频硬件处理也是绝佳的指纹来源。不同设备音频芯片在处理三角波（Triangle Wave）和动态压缩器（DynamicsCompressor）时，浮点数计算的尾数存在芯片级差异。

### 测试步骤：
1. 创建 `OfflineAudioContext`；
2. 挂载一个频率为 $1000\,\text{Hz}$ 的振荡器（Oscillator）与动态压缩器（DynamicsCompressor）；
3. 将输出采样导出为 `AudioBuffer`；
4. 累加计算 `AudioBuffer` 采样数组前 500 个浮点数的绝对值之和：

```ts
/**
 * 生成 AudioContext 声学指纹
 */
export async function getAudioFingerprint(): Promise<string> {
	try {
		const offlineCtx = new OfflineAudioContext(1, 44100, 44100);
		const osc = offlineCtx.createOscillator();
		osc.type = 'triangle';
		osc.frequency.value = 1000;

		const compressor = offlineCtx.createDynamicsCompressor();
		compressor.threshold.value = -50;
		compressor.knee.value = 40;
		compressor.ratio.value = 12;

		osc.connect(compressor);
		compressor.connect(offlineCtx.destination);
		osc.start(0);

		const renderedBuffer = await offlineCtx.startRendering();
		const channelData = renderedBuffer.getChannelData(0);

		let sum = 0;
		for (let i = 4500; i < 5000; i++) {
			sum += Math.abs(channelData[i]);
		}
		return sum.toString();
	} catch {
		return 'unsupported';
	}
}
```

---

## 3. WebRTC 穿透：绕过 HTTP 代理泄露真实 IP

很多用户在开启 HTTP / SOCKS5 代理后，以为自己的真实 IP 已经被完全隐藏。然而，**WebRTC (Web Real-Time Communication)** 协议为了实现 P2P 直连，内置了 **STUN (Session Traversal Utilities for NAT)** 机制。

STUN 允许浏览器向 STUN 服务器发送 UDP 探测包，以获取设备在 NAT 路由器后面的内网 IP（如 `192.168.x.x`）以及公网出口 IP。因为这个过程走的直接是原生 UDP 探包，绝大多数普通的 HTTP 浏览器代理插件**无法拦截 WebRTC 的 UDP 探测**：

```ts
/**
 * 利用 WebRTC 探测本机内网与公网真实 IP
 */
export function detectWebRTCIPs(onIPFound: (ip: string) => void): void {
	const rtc = new RTCPeerConnection({
		iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
	});

	rtc.createDataChannel('');
	rtc.createOffer().then((offer) => rtc.setLocalDescription(offer));

	rtc.onicecandidate = (evt) => {
		if (!evt.candidate) return;
		const candidate = evt.candidate.candidate;
		const match = /([0-9]{1,3}(\.[0-9]{1,3}){3})/.exec(candidate);
		if (match) {
			onIPFound(match[1]);
		}
	};
}
```

---

## 4. 总结与防御建议

通过整合 Canvas 2D、AudioContext、WebGL Unmasked Vendor/Renderer 以及 WebRTC 探测，网站能够以超过 99% 的准确率跟踪设备。

**防御建议**：
1. **防止 WebRTC 泄露**：在 Firefox (`media.peerconnection.enabled = false`) 或 Chrome 隐私设置中关闭 WebRTC 的非 proxied UDP 通讯；
2. **抵抗 Canvas / Audio 指纹**：使用 Brave 浏览器或 Firefox `privacy.resistFingerprinting` 选项，它们会在导出的像素和音频数据中注入微量的伪随机噪声，使得每次访问导出的哈希值随机化，从而破坏指纹连续性。

欢迎前往本站 [浏览器信息与安全检测](/security/browser-info/) 查看你当前设备的指纹与隐私保护评分。
