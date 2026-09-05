---
title: '手写 Markdown 解析器：抬出-还原式占位符、行内代码的不透明性，与一个不该自己写的 LaTeX 排版器'
description: '拆解零依赖 Markdown 解析器的三层占位符抬出-还原机制，剖析行内代码为何会被斜体/加粗/自动链接规则钻进去改坏、占位符自身为何也必须对后续规则免疫、HTML 转义为何必须分段做，以及数学公式这一层为什么该用 KaTeX 而不是手写——附按需加载的逐字节成本、MathML 自包含导出，与一个被 Vite 内联进样式表的 3,624 字节字体。'
pubDate: 'Sep 05 2026'
---

[Markdown 实时预览](/tools/markdown-preview/)这个工具里有两套完全不同的东西：Markdown 解析是从零手写的，一行第三方代码都没有；数学公式排版则是把 KaTeX 打包进了自己的产物。这篇文章讲清楚这条界线划在哪里、为什么划在那里，以及手写解析器里最容易写错的那一类 bug——**规则之间互相钻进对方的领地**。写这篇文章的过程中又抓到一个同源的、已经上线的实例，也一并记在下面。

---

## 1. 解析的第一步不是解析，是先把东西拿走

一个正则驱动的 Markdown 解析器，最先要处理的是"哪些内容根本不该被解析"。围栏代码块里的 `# 标题` 不是标题，`**粗体**` 不是粗体，`$x$` 不是公式——它们是字面量。

处理办法是**抬出-还原**：在所有规则之前把它们摘出来，换成一个占位符，等全部规则跑完再放回去。

```ts
// 1. Extract fenced code blocks
src = src.replace(/```([a-zA-Z0-9_\-#+.]*)\n([\s\S]*?)```/g, (_, codeLang, code) => {
	const idx = codeBlocks.length;
	codeBlocks.push(/* 完整的 <pre><code> + 复制按钮 */);
	return `%%CODEBLOCK${idx}%%`;
});

// 2. Extract block math $$ ... $$
src = src.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
	const idx = mathBlocks.length;
	mathBlocks.push(
		`<div class="t-math t-math-display" data-tex="${escapeHtml(tex)}">${escapeHtml(tex)}</div>`,
	);
	return `%%MATHBLOCK${idx}%%`;
});
```

抬出的顺序不是随便排的：**围栏代码必须第一个走**。否则一段展示 LaTeX 用法的代码块里的 `$$…$$` 会先被数学规则吃掉，正文里就再也看不到那段示例了。同理，行首的块级判断能直接放行占位符行：

```ts
// Placeholder blocks (code blocks, math blocks)
if (trimmed.startsWith('%%CODEBLOCK') || trimmed.startsWith('%%MATHBLOCK')) {
	output.push(trimmed);
	continue;
}
```

到这一步为止，事情看着挺顺。真正的坑在下一层。

---

## 2. 行内规则全是整行正则，谁都看不见结构

`parseInline()` 是一串 `s.replace()`：行内数学、图片、链接、粗斜体、加粗、斜体、删除线、自动链接、`<kbd>`。**每一条都是对整行做正则替换，没有任何一条知道自己扫到的字符处在什么结构里。**

行内代码原本也是其中一条，位置在中间。于是它前后的规则就都伸手进去了：

| 输入 | 实际输出 | 谁干的 |
| :--- | :--- | :--- |
| `` `snake_case_name` `` | `snake<em>case</em>name` | 斜体规则匹配了 `_case_` |
| `` `**literal**` `` | `<strong>literal</strong>` | 加粗规则吃掉了星号 |
| `` `https://a.test` `` | `<code><a href=…>…</a></code>` | 自动链接器嵌了一个 `<a>` |
| `` 读 `$PATH`，再算 $x^2$ `` | 一个横跨 `</code>` 的畸形公式 | 数学规则把两个 `$` 配成了对 |

第一行最要命：`snake_case_name` 是代码里最普通的写法，而工具把它显示成了 `snake` + 斜体 `case` + `name`——用户复制走的就是错的标识符。这不是"渲染得不够漂亮"，是**静默改坏了用户的内容**。

修法和上一层一模一样，只是下降一级：行内代码第一个抬出，最后一个还原。

```ts
const codeSpans: string[] = [];
s = s.replace(/`([^`]+)`/g, (_, code: string) => {
	codeSpans.push(`<code class="t-inline-code">${escapeHtml(code)}</code>`);
	return `%%ICODE${codeSpans.length - 1}%%`;
});

// …这里是全部 9 条行内规则…

// Code spans back in, now that no rule can reach into them.
s = s.replace(/%%ICODE(\d+)%%/g, (_, idx) => codeSpans[Number(idx)] ?? '');
```

一旦抬出去了，**后面每条规则都自动安全**——不需要给斜体正则打"跳过 code 内部"的补丁（那种正则不存在），也不需要每加一条新规则就重新审一遍它会不会钻进代码里。这和 SQL 格式化器里[把字符串字面量在分词阶段一次性识别出来](/blog/sql-tokenizer-and-code-formatter/)是同一个思路：**代码与数据只分离一次，下游全部免疫。**

---

## 3. 占位符自己也得免疫——同一个 bug 犯了两次

抬出-还原有一条不那么显然的前提：**占位符本身必须对它要穿过的每一条规则免疫。**

第一版占位符是 `%%ICODE_0%%`。测试用例是一行里放四段行内代码，结果只剩两段。原因是斜体规则：

```ts
s = s.replace(/(\*|_)(.*?)\1/g, '<em>$2</em>');
```

`(.*?)` 会跨过中间的任何字符。两个相邻占位符 `%%ICODE_0%%, %%ICODE_1%%` 里，第一个的下划线和第二个的下划线正好配成一对，`_0%%, %%ICODE_` 整段变成 `<em>`——两段代码一起消失。改成纯数字 token `%%ICODE0%%` 就好了。

**写这篇文章的时候我发现块级占位符还是老写法**，也就是说同一个 bug 在上一层原封不动地活着。它需要一行里有两个块级公式才会触发：

```markdown
两个公式：$$a^2$$ 与 $$b^2$$ 都在这一行。
```

抬出后这一行变成 `两个公式：%%MATHBLOCK_0%% 与 %%MATHBLOCK_1%% 都在这一行。`，接着交给 `parseInline()`，斜体规则跨过中间的"` 与 `"把两个下划线配上对：

```html
<p>两个公式：%%MATHBLOCK<em>0%% 与 %%MATHBLOCK</em>1%% 都在这一行。</p>
```

两个公式全丢，而且读者看到的是**占位符本身**——比公式没渲染出来更糟，因为它暴露了实现细节，还看不出原文写了什么。`%%CODEBLOCK_n%%` 同理，只是要一行里塞两个围栏代码块才碰得到，更少见而已。三处引用（生成、行首判定、还原正则）一起改成纯数字，问题消失。

值得记下来的规则是：**占位符不是随便起个名字就行的，它是要穿过所有规则的"惰性载荷"。** 凡是后续规则的特殊字符——`_`、`*`、`~`、`$`、反引号——都不能出现在 token 里，只留字母和数字。

---

## 4. 转义只能做一次，而且必须分段做

HTML 转义（`&` `<` `>` `"` → 实体）在 `parseInline()` 里的位置很讲究。它不能在最前面，因为抬出的代码内容需要**单独**转义；也不能在最后，因为那会把规则自己产出的标记全部转义掉。

于是变成分段做：抬出时转义代码内容，抬出之后转义剩下的整行。

```ts
s = s.replace(/`([^`]+)`/g, (_, code) => {
	codeSpans.push(`<code class="t-inline-code">${escapeHtml(code)}</code>`);   // 这一段
	return `%%ICODE${codeSpans.length - 1}%%`;
});

s = escapeHtml(s);   // 剩下的那一段
```

这条顺序还有一个连带后果，一开始我写错了：`s` 在数学规则之前已经被转义过了，所以行内公式**不能再转义一次**。

```ts
// `s` was HTML-escaped just above, so `tex` is already safe to drop into an
// attribute and a text node — escaping it again would turn a `<` in the formula
// into a literal `&lt;`.
s = s.replace(/\$([^$]+)\$/g, (whole, tex: string) => …);
```

而块级公式的抬出发生在整篇转义之前，跑在**原始文本**上，所以那一边**必须**自己转义（`escapeHtml(tex)`，属性和文本节点各一次）。同一个值，两条路径，转义次数一次多一次少——`$a < b$` 会渲染成 `a &lt; b` 还是正常的 `a < b`，就取决于有没有把这件事想清楚。

---

## 5. `$5 或 $10`：这个美元号是钱还是数学

行内数学规则最朴素的写法是 `/\$([^$]+)\$/g`。它有一个立刻会被真实文档触发的问题：

```markdown
主机每月 $5 或 $10。
```

两个美元号配成一对，中间的 "5 或 " 被当成公式排版出来，后面的 `10。` 变成裸文本。这不是假想——本站一篇讲模型定价的文章里，`AkashML $1.17 / $3.96` 就曾经把 "1.17 / " 渲染成了公式，而且没人发现，因为它看上去只是"字体有点怪"。

判据是**空白**：没人会故意写 `$ x $`，而当美元号当货币符号用时，配对区间的两端几乎必然带空格。

```ts
s = s.replace(/\$([^$]+)\$/g, (whole, tex: string) =>
	tex !== tex.trim()
		? whole
		: `<span class="t-math t-math-inline" data-tex="${tex}">${tex}</span>`,
);
```

`tex !== tex.trim()` 为真就整段原样退回。这是个启发式，不是解析——它会漏掉 `$5或$10`（中间无空格，仍会被当成公式），也管不了跨段落的落单美元号。但它覆盖了绝大多数真实写法，代价只有一行，而且**失败方向是安全的**：判错时公式变成文本，读者还能读；反过来把货币判成公式，读者只会看到一团乱码。

同一条启发式也用在博客侧：`e2e/katex.spec.ts` 会扫过 `dist/` 里所有 HTML，把任何**首尾带空白**的已渲染公式报为可疑，防止再有一个 `$1.17 / $3.96` 溜进正文。

---

## 6. 数学排版这一层，我没有自己写

站内工具的通用原则是不引入外部依赖——[二维码](/blog/qr-code-reed-solomon-encoder/)的 Reed–Solomon 纠错、[SQL 分词器](/blog/sql-tokenizer-and-code-formatter/)、这个 Markdown 解析器，全是手写的。数学公式这里我停下了，用了 KaTeX。理由不是工作量，是**这件事的性质不一样**：

- Markdown 解析的输出是 HTML 结构，对不对是**离散**的：`# a` 要么是 `<h1>`，要么不是。写一个覆盖 GFM 常用子集的解析器，几百行能做到正确。
- LaTeX 数学排版的输出是**版面几何**：分数线多长、根号盖住哪一段、上下标缩到几号、`\sum` 的极限怎么居中、行内公式的基线落在哪。这些答案不在语法里，在**字体的度量数据**里。TeX 的排版算法要读每个字形的宽高深与 italic correction，还要一套专门的数学字体（KaTeX 为此带了 20 个字重）。手写一个"能看"的版本不难，手写一个**排得对**的版本，本质上是把 TeX 的数学模式重新实现一遍。

所以边界这样划：**结构自己写，度量交给别人。** 但"用 KaTeX"不等于"依赖第三方在线服务"。原来的实现是每篇带 `$` 的文章从 `cdn.jsdelivr.net` 拉三个文件，那才是真正的外部依赖——CDN 挂掉或被墙，全站公式一起变回 `$\frac{a}{b}$` 源码。现在 KaTeX 是打进产物的本地依赖：

```
package.json          "katex": "0.18.5"      版本锁死，不是 ^
src/styles/katex.css  22 KB                  由 scripts/build-katex-css.py 生成
src/assets/fonts/katex/*.woff2   20 个字重   连同 LICENSE 一起提交进仓库
```

`scripts/build-katex-css.py` 干的是三件事：把 `node_modules/katex/dist/katex.min.css` 里的 `url()` 重指到 `src/assets/fonts/katex/`（这样 Vite 会给字体加内容哈希、走不可变缓存）、删掉 woff/ttf 分支（现代浏览器只需要 woff2）、把 20 个 woff2 和 LICENSE 拷进仓库。生成物是提交进版本库的，所以**构建机上既不需要 Python 也不需要跑这个脚本**——它只在升级 KaTeX 版本时手动执行一次。

---

## 7. 同一批公式，三条渲染路径

有意思的是，`$…$` 在这个站上有三种完全不同的渲染时机与输出形态。

**博客文章：构建期渲染，浏览器一行 JS 都不跑。** Astro 7 的默认 Markdown 处理器 Sätteri 打开 `features.math` 后会原生解析数学节点，`satteri-katex.mjs` 在 mdast 阶段就把它换成成品 HTML：

```js
export default function satteriKatex() {
	return {
		name: 'katex',
		math: (node, ctx) => replace(node, ctx, true),
		inlineMath: (node, ctx) => replace(node, ctx, false),
	};
}
```

好处不止是省掉 272 KB 的 `katex.min.js`：它还发生在 hast 阶段**之前**，所以块级公式那个语言标记为 `math` 的 `<pre><code>` 根本不会走到 Shiki 高亮器手里。渲染失败也不会让部署挂掉——每个公式单独 try/catch，失败的报成构建诊断（带文件名，日志里可 grep），同时在页面上用红色显示自己的源码。另外 `hasMath` 会写进 frontmatter，于是**没有公式的文章连那 22 KB 样式表都不加载**。

**工具页：运行期按需渲染。** 这里做不到构建期——文档是用户边打边变的。解析器把公式留成源码，`renderMathIn()` 事后升级：

```ts
export async function renderMathIn(root: ParentNode, output: MathOutput = 'htmlAndMathml') {
	const pending = [...root.querySelectorAll<HTMLElement>('.t-math[data-tex]')];
	if (!pending.length) return;
	…
}
```

`.t-math[data-tex]` 这个选择器同时是三样东西：查询条件、"尚未排版"状态的 CSS 选择器（未排版时显示成琥珀色等宽小方块）、以及失败后的重试标记。渲染成功就 `removeAttribute('data-tex')`，于是"有这个属性"永远等价于"还没排版"。

`render()` 每次按键都会重建整个 `preview.innerHTML`，所以一篇十几个公式的文档，每敲一个字符就要重排十几次——包括那个正在打一半、必然抛异常的公式。加一层 memo 解决：

```ts
const typeset = new Map<string, { html: string } | { error: string }>();
…
const key = `${output}|${displayMode ? 'd' : 'i'}|${tex}`;
```

**错误也进缓存**，否则半成品公式每次按键都要重跑一遍解析再抛一次。key 里带 `output`，是因为第三条路径要的输出形态不一样。

**导出的 .html：MathML。** 导出的文件是要离开本站的，所以它不能依赖本站——不能有指向我们样式表的 `<link>`，不能有字体 URL，不能有脚本。KaTeX 的 HTML 树做不到这一点（那是一堆靠 `.katex` 样式和 20 个字体定位的 span），原样留 LaTeX 源码也不行（那等于没排版）。MathML 恰好两头都满足：它是**语义标记，现代浏览器用自己的数学字体原生排版**。

```ts
const body = document.createElement('div');
body.innerHTML = parseMarkdownToHtml(editor.value, currentLang);
await renderMathIn(body, 'mathml');
```

同一个函数，换一个参数。E2E 直接读下载下来的文件断言这件事：必须含 `<math` 和 `<mfrac`，不能含 `data-tex=`（说明公式还是源码）、不能含 `katex-html`（说明混进了需要 CSS 的 HTML 树）、不能匹配 `/<link|_astro|\.woff2/`，也不能有 `<script>`。

---

## 8. 按需加载的账，逐字节算

KaTeX 是 258,633 字节的 JavaScript。工具箱里有 49 个工具，**没有理由让另外 48 个为它买单**。所以代码和样式表都做成按需：

```ts
// A string, not a stylesheet: the `?url` suffix keeps KaTeX's CSS out of this
// chunk so a document with no formula never fetches it. See renderMathIn().
import katexCssHref from '../../styles/katex.css?url';

function loadKatex() {
	if (!katexLoad) {
		if (!document.querySelector('link[data-katex]')) {
			const link = document.createElement('link');
			link.rel = 'stylesheet';
			link.href = katexCssHref;
			link.dataset.katex = '';
			document.head.append(link);
		}
		katexLoad = import('katex');
	}
	return katexLoad;
}
```

`import('katex')` 让 Vite 切出独立 chunk；`?url` 后缀让样式表只是一个字符串，不建 `<link>` 就不会被下载。构建产物里的实测数字：

| 文件 | 字节 | 何时下载 |
| :--- | ---: | :--- |
| `markdown.*.js`（工具自身） | 25,225 | 打开工具页 |
| `katex.*.js` | 258,633 | 文档里出现第一个公式 |
| `katex.*.css` | 22,418 | 同上 |
| 单个 `KaTeX_*.woff2` | 3,624 ～ 28,076 | 公式里出现该字重的字形 |

Astro 生成的工具页 HTML（50,712 字节）里既没有 KaTeX 的 `<link>` 也没有它的 `<script>`。E2E 用 URL 属性而不是关键词来断言这件事——因为页面自己的 FAQ 里就写着 "KaTeX" 这个词：

```ts
const served = await (await page.request.get(TOOL)).text();
expect(served, 'the served page must not link or preload katex').not.toMatch(
	/(?:src|href)="[^"]*katex[^"]*"/i,
);
```

另一半断言是反向的：打开 `/tools/json-formatter/` 并交互，`katex` 相关请求数必须是 0；打开 Markdown 工具（示例文档里带公式），`katex.*.js` 必须被请求到。

---

## 9. 失败要降级成"还能看"

按需加载多了一个可能失败的环节：chunk 拉不下来（首次访问离线、请求被拦）。这时候读者应该看到什么？

答案是设计在数据结构里的——**公式源码从一开始就在元素里**，既在 `data-tex` 属性上，也作为元素的文本内容：

```ts
mathBlocks.push(
	`<div class="t-math t-math-display" data-tex="${escapeHtml(tex)}">${escapeHtml(tex)}</div>`,
);
```

于是 `loadKatex()` 抛异常时，`renderMathIn()` 直接 `return` 就是正确行为：读者看到的是 `\frac{a}{b}`，也就是**这个工具在接入 KaTeX 之前一直以来的样子**。没有空白、没有报错弹窗、没有半坏的页面。

单个公式解析失败是另一种情况，处理得更细一点：

```ts
if ('error' in result) {
	// Keep the source visible and say why it did not render. data-tex stays,
	// so a later pass retries — half-typed formulas fix themselves.
	el.classList.add('t-math-error');
	el.title = result.error;
	continue;
}
```

源码留着、KaTeX 的解析错误挂在 `title` 上（鼠标悬停能看到为什么）、`data-tex` **不删**——所以用户继续把 `$$\frac{a}{$$` 打完，下一趟就自动渲染出来了。边打边预览的工具里，"半成品输入必然报错"是常态而不是异常，重试机制不能靠用户手动触发。

---

## 10. 公式里的中文，与一个被内联的 3,624 字节字体

两个只有在真实站点上跑才会发现的细节。

**第一个：公式里的中文。** 本站金融类文章会写 `\text{ 元}`，而 KaTeX 的 20 个字重里没有任何一个有 CJK 字形。KaTeX 自己能检测到这件事，把这些字符包进 `<span class="mord cjk_fallback">`——然后**不为这个 class 提供任何规则**，字体选择留给宿主页面。没人补这条规则的话，公式里的中文就落到浏览器默认字体（Windows 上是宋体），跟旁边的无衬线正文并排显示。

```css
.katex .cjk_fallback {
	font-family: var(--font-cjk);
}
```

必须挂在 KaTeX 自己给的这个钩子上，**不能挂 `.mord`**。`.mord` 是"普通符号"，包括数学模式里的所有变量；在它上面设 `font-family` 会和 `.mord.mathnormal`（变量的斜体 KaTeX_Math）在同等 specificity 上打架，谁赢由样式表顺序决定——而两种结果都是错的：要么中文还是宋体，要么全站公式里的变量全部失去斜体。E2E 把这两件事一起钉住：`.cjk_fallback` 的 `font-family` 必须含 `PingFang SC`，同一个公式里的 `.katex` 必须还是 `KaTeX_Main`。

**第二个：一个被内联进样式表的字体。** Vite 默认把 4 KB 以下的资源内联成 base64 data URI。KaTeX 的 `KaTeX_Size3-Regular.woff2` 是 3,624 字节，正好在线下——于是它被塞进了 `katex.css`，变成 4,840 字节的 base64（编码本身 +33%，而 base64 几乎压不动）。

后果是：**每个带公式的页面，在首次绘制之前都要下载这 4,840 字节**，不管那个页面有没有用到三号大小的大括号。而"字体按需下载"本来就是 `@font-face` 的职责，也正是把 20 个字重 vendored 进仓库的全部理由。修法是函数形式的 `assetsInlineLimit`：

```js
vite: {
	build: {
		assetsInlineLimit: (filePath) => (/\.woff2?$/.test(filePath) ? false : undefined),
	},
},
```

`katex.css` 27,231 → 22,418 字节，20 个字重全部恢复成独立的哈希文件。返回 `undefined` 而不是数字，是为了让其他资源继续走 Vite 的默认判断——这条规则只想表达"webfont 永远不内联"这一件事。

这类问题的共同点是：**它们不在代码里，在构建产物里。** 所以对应的测试也直接读 `dist/`——产物 CSS 里不得出现 `data:font`，`@font-face` 仍须是 20 条。

---

## 11. 它做不到什么

- **不是 CommonMark 实现。** 覆盖的是 GFM 常用子集：标题（自动生成锚点 ID）、表格（含对齐）、任务列表、围栏代码、`> [!NOTE]` 系列提示块、引用、分隔线、图片、链接、粗斜体、删除线、自动链接、`<kbd>`。嵌套列表、引用里套代码块、引用参考式链接（`[a][1]`）、HTML 块直通这些没有做。
- **行内规则是整行正则，不是解析器。** 所以跨行的强调、嵌套强调的优先级这类 CommonMark 花了大量篇幅规定的边角，行为不保证和标准一致。
- **`$5或$10` 仍会被当成公式。** 第 5 节那条启发式看的是空白，中文里两个数字之间不带空格时它判不出来。写成 `\$5` 可以强制转义。
- **数学是 KaTeX 的能力边界。** KaTeX 不支持的宏、`\usepackage`、TikZ 图不会渲染，会以红色源码形式留在原地。
- **导出的 MathML 依赖浏览器的数学排版质量。** Chrome/Safari/Firefox 现在都原生支持，但排版结果和 KaTeX 的 HTML 树不会像素一致——这是为"文件自包含"付的价。

这些限制里没有一条会**改坏**输入。第 2、3 节那两个 bug 恰恰是会的，所以它们值得单独写一节，也值得各配一个 E2E：一行四段行内代码必须逐字存活、内部零注入标记；一行两个 `$$…$$` 必须各自成为一个公式，输出里不得出现占位符或多余的 `<em>`。

---

## 12. 在线试试

- **[Markdown 实时预览](/tools/markdown-preview/)**：本文拆解的这份实现，双栏实时预览、`$inline$` 与 `$$display$$` 公式、导出 .md 与自包含 .html；
- **[JSON 格式化校验](/tools/json-formatter/)** 与 **[SQL 格式化美化](/tools/sql-formatter/)**：[另一篇](/blog/sql-tokenizer-and-code-formatter/)讲的"代码与数据只分离一次"在别的语法上的样子；
- **[二维码生成器](/tools/qr-code-generator/)**：另一个[从零手写](/blog/qr-code-reed-solomon-encoder/)的例子，那边连纠错码都没有借外力。

文档全程留在你的浏览器里，不会上传到任何地方；KaTeX 也来自本站自己的产物，不经过任何第三方 CDN。
