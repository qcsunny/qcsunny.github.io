---
title: '浏览器里的 Office 三件套：为什么这里不手写 PDF、OCR 与 Excel'
description: '轻量工具可以手写，PDF 结构、OCR 推理和 XLSX 容器不能假装简单。拆解站内 Office 三件套的依赖边界：pdf-lib/pdf.js/Tesseract 全部自托管，JSZip 打包进分块；3 MB 类型定义为何撑爆 astro check；以及怎样让 30 MB OCR 资产只在用户真正上传文件后才下载。'
pubDate: 'Sep 12 2026'
category: engineering
topics: [frontend, performance, developer-tools]
searchTerms: ['PDF', 'OCR', 'Excel', 'WebAssembly', '本地处理']
contentLang: 'zh-CN'
relatedTools: ['office/pdf-toolkit', 'office/document-ocr', 'office/xlsx-analyzer']
relatedPosts: ['static-site-byte-ledger', 'zero-dependency-static-site-e2e-quality-gate']
---

本站大部分工具坚持原生实现：科学计算器手写 parser，二维码手写 Reed–Solomon，SQL 格式化器手写 tokenizer。但 Office 分类里的三个工具反过来——[PDF 工具箱](/office/pdf-toolkit/)用 pdf-lib + pdf.js，[文档 OCR](/office/document-ocr/)用 Tesseract.js + pdf.js，[Excel 分析器](/office/xlsx-analyzer/)用 JSZip。全部依赖都在本站自托管或打进构建产物，没有 CDN、没有上传。

这不是"后来偷懒了"，而是边界判断：**自己写能减少依赖的代码；不要自己写一个规范。** PDF 1.7 是上千页规范，OCR 是神经网络推理，XLSX 是一组互相引用的 XML 部件。手写它们不是工程勇气，是把几十年的上游测试换成一堆本站独有的 bug。这篇文章记录三条依赖是怎么接进一个静态站、怎么把类型与首屏成本隔离开，以及它们各自诚实的不支持什么。

---

## 1. 先摆资产账：不是首屏成本，是按需成本

Office 三件套的重资源全在 `public/` 或懒分块里：

| 组件 | 代表文件 | 原始体积 | 什么时候下载 |
| --- | --- | ---: | --- |
| pdf-lib | `pdf-lib.min.js` | 513 KB | PDF 工具第一次执行结构操作 |
| pdf.js | `pdf.min.mjs` + worker | 448 KB + 1.3 MB | 第一次渲染 PDF 页面 |
| Tesseract core | SIMD LSTM wasm | 2.8 MB | 第一次启动 OCR |
| Tesseract language | eng / chi_sim | 1.9 MB / 1.7 MB（gzip） | 用户选择语言并识别 |
| JSZip | 构建分块 | minified 约 96 KB（依赖源码 860 KB） | Excel 工具页交互分块加载 |

`public/tesseract` 整目录是 30 MB——包含不同 SIMD 能力的 wasm 变体、JS 胶水、压缩和未压缩语言包。这个数字放进首页当然荒唐；放在**用户选择 OCR 后，由 loader 挑其中一个 core + 一种语言**，就是合理的功能成本。两件事要分开：仓库/部署资产体积 ≠ 单次会话下载体积。

这条边界由动态加载守住：

```ts
const loadTesseract = (): Promise<TessModule> => {
	tessCache ??= (async () => {
		const mod = await import(/* @vite-ignore */ '/tesseract/tesseract.esm.min.js');
		return (mod.default ?? mod) as TessModule;
	})();
	return tessCache;
};
```

`@vite-ignore` 不是逃避打包器，是在声明：这是一个部署期已有的 URL，Vite 不要解析/复制/内联它。`tessCache ??=` 确保一次页面会话只下载和初始化一次模块；worker 本身每次任务结束 terminate，避免 wasm 堆在处理完文档后仍常驻。

---

## 2. PDF：结构操作与渲染必须分成两个库

PDF 工具箱做两类完全不同的事：

- 合并、拆分、旋转、水印、元数据——操作 PDF 的**对象结构**，交给 pdf-lib；
- 把页面显示成像素、图片转 PDF、为 OCR 提供 canvas——操作 PDF 的**渲染管线**，交给 pdf.js。

一个库不该硬扛两份工作。pdf-lib 能重写对象、嵌入字体和图片，但不是浏览器渲染器；pdf.js 是 Firefox 同源的渲染引擎，能把复杂页面画到 canvas，却不负责把改动重新序列化成 PDF。工具把两者在功能入口上分开，用户只旋转页面时不会下载渲染 worker。

pdf-lib 走传统 script loader，而不是静态 import：

```ts
const el = document.createElement('script');
el.src = '/pdfjs/lib/pdf-lib.min.js';
el.onload = () => {
	const w = window as { PDFLib?: PdfLib };
	if (w.PDFLib) resolve(w.PDFLib);
	else reject(new Error('pdf-lib failed to initialize'));
};
```

这样有两个好处：513 KB 不进入工具主分块；加载失败有一个明确的 promise rejection，而不是后面某处读 `window.PDFLib` 才报 undefined。

**诚实限制：不提供加密。** pdf-lib 能读取部分加密文件的元数据，但长期没有实现**写出加密 PDF**。工具遇到带密码输入时明确报错，不做一个看起来有"设置密码"按钮、实际产出损坏文件的伪功能。依赖边界也意味着能力边界：成熟上游做不到的事，一个 279 行的 glue layer 不该假装能做到。

---

## 3. 类型也有重量：3 MB 的 .d.ts 把 astro check 撑爆

pdf-lib 的运行时 513 KB，完整 TypeScript 类型定义约 3 MB。把它的 .d.ts 连同 pdf.js/Tesseract 类型一起塞进 Astro 的类型程序，`astro check` 曾越过 Node 默认 2 GB 堆上限 OOM——这不是浏览器性能问题，是**开发工具链的依赖成本**。

修法不是给 CI 加 heap limit（那只会把问题往后推），而是在使用点写**窄结构类型**：

```ts
interface PdfLibPage {
	getWidth(): number;
	getHeight(): number;
	getRotation(): { type: 'degrees'; angle: number };
	setRotation(angle: { type: 'degrees'; angle: number }): void;
	drawText(text: string, options: { x: number; y: number; size: number; opacity?: number }): void;
}
```

工具只调用 pdf-lib API 的一个小切片，TypeScript 的结构类型系统允许我们只描述这个切片。运行时仍加载原始 pdf-lib；checker 只看几十行接口，不加载几万行上游声明。`tsconfig.json` 进一步排除整个 `public/`——里面的 minified ESM 和 wasm 胶水是部署资产，不是项目源码，让 tsserver 扫它们没有任何类型收益。

这条经验比 Office 工具本身更通用：**依赖的运行时成本、网络成本、类型成本是三本不同的账。** 动态 import 只解决前两本，窄结构类型才解决第三本。

---

## 4. OCR：每一页都是 canvas，资源必须及时释放

PDF OCR 的管线是：pdf.js 解码 → 每页 2× scale 渲染到 canvas → Tesseract worker 识别 → 收集文字与置信度。

```ts
for (let i = 1; i <= doc.numPages; i++) {
	const page = await doc.getPage(i);
	const viewport = page.getViewport({ scale: 2 });
	const canvas = document.createElement('canvas');
	canvas.width = viewport.width;
	canvas.height = viewport.height;
	await page.render({ canvas, canvasContext: ctx, viewport }).promise;
	const r = await worker.recognize(canvas);
	out.push({ source: `page ${i}`, text: r.data.text.trim(), confidence: Math.round(r.data.confidence) });
}
```

为什么 scale=2？普通扫描 PDF 里的页面以 72-96 DPI CSS 尺寸呈现，放大 2× 后接近 Tesseract 对正文表现更稳的 150-200 DPI；继续放到 4×，像素数变四倍、识别时间与内存都暴涨，字形信息却不会凭空增加。

图片入口另有一个上限：最长边目标 2000px，`scale = min(2, max(1, 2000/max(width,height)))`。一张 4000px 手机照片不会被放到 8000px canvas——16 倍像素面积足够让移动端标签页崩掉。

worker 生命周期包在 try/finally 里：

```ts
const worker = await makeWorker(lang, onProgress, doc.numPages);
try {
	// render + recognize
} finally {
	await worker.terminate();
}
```

OCR 失败更需要 terminate：抛错路径如果跳过释放，wasm 线性内存继续占着，下次重试再起一个 worker，很快就把手机浏览器推到系统回收。**资源释放写在成功路径是愿望，写在 finally 才是保证。**

工具每页显示 confidence，不把 OCR 输出包装成"识别成功"。Tesseract wasm 擅长干净扫描，对透视畸变、阴影和复杂混排很弱；简体中文一页约 10-30 秒。这些不是 UI 文案里的免责声明，是模型能力边界，用户该据此决定哪页需要人工复核。

---

## 5. XLSX：它不是表格，是一个 ZIP 文件系统

`.xlsx` / `.xlsm` 本质是 ZIP，里面是 workbook.xml、worksheets/sheetN.xml、styles.xml、sharedStrings、media、pivot cache 和关系文件。分析器的第一层只有一行：

```ts
const zip = await JSZip.loadAsync(data);
```

之后的工作不需要完整 Excel 引擎：DOMParser/正则读取几个 XML 部件，就能回答工作表尺寸、使用的样式 ID、外部 defined names、媒体与 pivot cache 各占多少。工作簿越用越胖，通常不是单元格值变多，而是复制粘贴留下数千个未引用 cellXfs、旧宏留下 hidden name、早已删除的数据透视表仍挂着 cache。

清理器遵守一条保守规则：**只重写勾选项涉及的 XML，其余 ZIP 部件字节不动。** 最难的是未用样式：删掉 cellXfs 中间一项后，后面每个 style id 都移动，所有 sheet 的 `s="旧id"` 必须同步 remap。实现先扫描全表收集 used ids，保留 0 号默认样式和所有被引用样式，再生成 old→new 映射，最后逐 sheet 改引用。

```ts
const entries = [...remap.entries()].sort((a, b) => Number(b[0]) - Number(a[0]));
```

映射按旧 ID **数值降序**应用，避免先把 `s="10"` 改成 `s="8"`，后面处理旧 8 时又把它改第二次。这里如果写默认 `.sort()` 会变成词法序（"10" 排在 "2" 前），如果升序应用会发生二次重写——一个不起眼的 sort 比整个 ZIP 解包更容易写错。

**诚实限制同样存在**：不是完整 Excel 兼容层。清理外部链接时只移除 workbook.xml 的引用，孤立 externalLink part 留在 zip（无引用、无行为，只占少量体积）；移除 media 会让引用它的 drawing 出现空位，适合确认"这些图片不要了"的场景，不适合盲点一键清理。工具先分析、后让用户勾选清理项，默认不做破坏性决定。

---

## 6. 边界小结：什么时候手写，什么时候 vendored

| 问题 | 选择 | 理由 |
| --- | --- | --- |
| 数学表达式/SQL tokenizer/二维码 | 手写 | 规范切片小，核心算法可完整验证，依赖会比实现更重 |
| PDF 对象结构 | pdf-lib 自托管 | 完整规范巨大，错误会产出打不开的文件 |
| PDF 渲染 | pdf.js 自托管 | 字体、透明度、色彩空间、压缩流不是一个小工具该重写的 |
| OCR | Tesseract.js + wasm 自托管 | 模型与推理运行时无法用业务代码替代 |
| XLSX 容器 | JSZip 构建分块 | ZIP 的 CRC/压缩/目录结构已有成熟实现，本站只负责 XML 语义 |

"零依赖"不是目的，**可解释的依赖边界**才是。重库的四条纪律是：版本锁定、本站托管、交互后加载、能力边界明说；再补一条类型侧的纪律：只把调用到的 API 形状交给 checker。满足这些条件，30 MB 的 OCR 部署资产可以与一个首屏零第三方请求的静态站共存——用户不使用它，就不为它付一字节。

三个工具在此：[PDF 工具箱](/office/pdf-toolkit/)、[文档 OCR](/office/document-ocr/)、[Excel 分析器](/office/xlsx-analyzer/)。所有文件只在当前标签页内处理，不上传。
