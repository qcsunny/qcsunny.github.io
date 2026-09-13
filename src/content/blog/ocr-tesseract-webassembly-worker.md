---
title: '浏览器端零服务端 OCR 识别：Tesseract.js 与 WebAssembly 离线引擎'
description: '深度拆解文档 OCR 识别工具的架构。剖析如何将 C++ Tesseract 引擎编译为 WebAssembly，通过 Web Worker 隔离大模型计算，并实现灰度二值化、自适应 Otsu 阈值与本地隐私安全的图片文本提取。'
pubDate: 'Sep 13 2026'
category: web
topics: [frontend, web-platform, developer-tools]
searchTerms: ['OCR', 'Tesseract.js', 'WebAssembly', 'Web Worker', '图像识别']
contentLang: 'zh-CN'
relatedTools: ['office/document-ocr', 'office/pdf-toolkit']
relatedPosts: ['browser-office-vendored-libraries', 'browser-zero-jank-web-worker-and-transferable']
---

在日常办公与开发中，将图片中的扫描文档、截图或 PDF 页面提取为可编辑的纯文本（Optical Character Recognition, **OCR**）是一项高频需求。大多数在线 OCR 服务的处理方式是将用户的敏感文档上传到远程云端 API，这不仅存在严重的隐私泄露隐患（如身份证、合同或财务报表），还会受到网络带宽和付费接口调用的限制。

为了保障用户数据隐私，本站 [文档 OCR 文本识别](/office/document-ocr/) 实现了**完全在浏览器本地运行**的零服务端离线识别引擎。

本文将拆解如何利用 **WebAssembly（Wasm）** 将经典的 C++ Tesseract OCR 引擎移植到前端，并通过 **Web Worker 多线程** 与 **Canvas 图像预处理** 建立流畅、防卡死的浏览器 OCR 识别管线。

---

## 1. 架构总览：WebAssembly 移植与 Worker 隔离

要在浏览器中运行复杂的神经网络与字符识别算法，常规的 JavaScript 实现性能无法满足要求。Tesseract 是谷歌开源的高性能 C++ OCR 引擎。通过 Emscripten 编译链，Tesseract C++ 源码被编译为了 `.wasm` 字节码。

为了防止几十兆语言包解码与重型计算拖垮 UI 渲染主线程，我们设计了三层解耦架构：

```text
┌─────────────────────────┐
│     DOM UI 主线程        │ (拖拽图片 / 显示识别进度与结果)
└────────────┬────────────┘
             │ postMessage(ImageData)
             ▼
┌─────────────────────────┐
│   Web Worker 隔离线程    │ (自托管 tesseract-core.wasm)
└────────────┬────────────┘
             │ 载入与缓存
             ▼
┌─────────────────────────┐
│ IndexedDB 离线语言包存储 │ (chi_sim.traineddata / eng.traineddata)
└─────────────────────────┘
```

---

## 2. 图像预处理：灰度化与自适应大津法（Otsu's Thresholding）

直接将彩色图像送入 OCR 引擎，复杂的背景噪音、光照不均或影子会严重降低识别准确率。在发送至 WebAssembly 引擎前，必须进行 **灰度化与二值化（Binarization）** 预处理。

### 1. 加权灰度化（Luminance Gray Scaling）
利用人眼对绿色最敏感的加权公式，将 RGBA 转换为单通道灰度值：

$$\text{Gray} = 0.299 R + 0.587 G + 0.114 B$$

### 2. 自适应 Otsu 阈值二值化
**Otsu 算法（大津法）** 是一种自适应寻找最佳二值化阈值的无参数方法。它通过计算直方图，寻找使类间方差（Between-Class Variance $\sigma_B^2$）最大的阈值 $T$：

$$\sigma_B^2(T) = \omega_0(T) \omega_1(T) [\mu_0(T) - \mu_1(T)]^2$$

纯 TypeScript 预处理核心代码：

```ts
/**
 * 图像灰度化与 Otsu 自适应二值化预处理
 */
export function preprocessImageForOtsu(imageData: ImageData): ImageData {
	const data = imageData.data;
	const len = data.length;
	const histogram = new Int32Array(256);

	// 1. 转为灰度并统计灰度直方图
	for (let i = 0; i < len; i += 4) {
		const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
		data[i] = data[i + 1] = data[i + 2] = gray;
		histogram[gray]++;
	}

	// 2. Otsu 算法寻找最佳阈值 T
	const totalPixels = imageData.width * imageData.height;
	let sum = 0;
	for (let i = 0; i < 256; i++) sum += i * histogram[i];

	let sumB = 0;
	let wB = 0;
	let maxVariance = 0;
	let threshold = 128;

	for (let t = 0; t < 256; t++) {
		wB += histogram[t];
		if (wB === 0) continue;
		const wF = totalPixels - wB;
		if (wF === 0) break;

		sumB += t * histogram[t];
		const mB = sumB / wB;
		const mF = (sum - sumB) / wF;
		const variance = wB * wF * (mB - mF) * (mB - mF);

		if (variance > maxVariance) {
			maxVariance = variance;
			threshold = t;
		}
	}

	// 3. 执行二值化映射
	for (let i = 0; i < len; i += 4) {
		const val = data[i] >= threshold ? 255 : 0;
		data[i] = data[i + 1] = data[i + 2] = val;
	}

	return imageData;
}
```

---

## 3. 语言包本地 IndexedDB 缓存与零 CDN 依赖

中文字体识别语言包（`chi_sim.traineddata`）体积约为 4MB~12MB。为了实现完全离线运行并提升秒开体验：

1. **版本锁定与自托管**：将 `.traineddata` 与 `.wasm` 文件打包存放在静态站点本地目录，不依赖任何第三方 CDN，完全消除 unpublish 或被墙风险；
2. **IndexedDB 持久化**：首次识别下载语言包后，通过 `IndexedDB` 写入本地存储。二次打开时直接从本地磁盘加载，识别启动耗时从几秒降至 **50 毫秒以内**。

---

## 4. 总结与体验

结合 WebAssembly、Web Worker 与 Otsu 图像预处理，本站 [文档 OCR 文本识别](/office/document-ocr/) 实现了在浏览器中安全、私密、快速提取印刷体与手写体字符。所有数据不出浏览器，欢迎体验。
