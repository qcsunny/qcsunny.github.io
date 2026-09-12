---
title: 'Markdown 表格对齐器：显示宽度不是 .length，对齐标记不能丢'
description: '拆解站内 markdown-table-formatter 的实现：一个区间查表的 getVisualWidth 函数怎么数汉字的"占两列"、为什么 .length 和码点数都不能用、对齐标记 :---: 的解析与还原，以及列数以分隔行为准的规整规则。'
pubDate: 'Sep 12 2026'
category: web
topics: [developer-tools, frontend]
searchTerms: ['Markdown 表格', '对齐', '中文宽度', 'Unicode']
contentLang: 'zh-CN'
relatedTools: ['text/markdown-table-formatter']
relatedPosts: ['unicode-utf16-surrogates-and-grapheme-clusters']
---

GitHub README 里的表格，源码往往是每一列都手工对齐的。中文一进来这件事立刻变得不可救药：`张三` 在源码里只占 2 个字符，在等宽字体里却渲染成 4 列宽——用 `.length` 补空格，表格在编辑器里永远歪的。[Markdown 表格格式化工具](/text/markdown-table-formatter/)做的就是这件事：粘贴任意表格，按**显示宽度**对齐每一列。这篇文章拆它的核心——一个 30 行的宽度函数，和它背后"宽度"这个词的三层含义。

---

## 1. 为什么 `.length` 和码点数都不行

JavaScript 里"一个字符串多长"至少有三种答案：

| 口径 | `'张三'` | `'𝕊'`（代理对） | `'👨‍👩‍👧'`（ZWJ 序列） |
| --- | --- | --- | --- |
| `.length`（UTF-16 码元） | 2 | 2 | 8 |
| `[...str]`（码点） | 2 | 1 | 5 |
| **显示宽度**（等宽字体列数） | **4** | 1 | ≈2 |

表格对齐要的是最后一行。`.length` 在纯中文里恰好"看起来对"（汉字都是 BMP 单码元），但混进 emoji 或罕见字符就歪——这比纯英文表格还糟，因为它在**最常用的场景里是对的**，用户会以为工具可信。

实现里还有一个更早的坑：代码点迭代 `for (const ch of str)` 拿到的是**码点**不是码元，`ch.codePointAt(0)` 才是完整值。用 `str[i]` 下标取字符会把代理对劈成两半，`codePointAt` 返回的是半个代理项的码元值——落在下方宽度表的区间检查里恰好都不命中、按宽度 1 处理，结果就是 emoji 少算一列。

---

## 2. getVisualWidth：区间查表，不是查库

宽度函数是一个纯区间判断的循环：

```ts
function getVisualWidth(str: string): number {
	let len = 0;
	for (const ch of str) {
		const code = ch.codePointAt(0) || 0;
		if (
			(code >= 0x1100 && code <= 0x115f) ||   // Hangul Jamo
			(code >= 0x2e80 && code <= 0xa4cf) ||   // CJK 部首 ~ Yi 音节
			(code >= 0xac00 && code <= 0xd7a3) ||   // 谚文音节
			(code >= 0xf900 && code <= 0xfaff) ||   // CJK 兼容表意
			(code >= 0xfe30 && code <= 0xfe6f) ||   // CJK 兼容形式
			(code >= 0xff00 && code <= 0xff60) ||   // 全角形式
			(code >= 0x20000 && code <= 0x323af)    // CJK 扩展 B+
		) {
			len += 2;
		} else {
			len += 1;
		}
	}
	return len;
}
```

这是 Unicode East Asian Width（东亚宽度）属性的**粗粒化**：W（Wide）和 F（Fullwidth）两类合并成"占 2 列"，其余按 1。为什么不用完整的 EAW 表（像 `wcwidth` 库那样逐码位查）？因为完整的表要带几千个码位的数据，而 Markdown 表格里实际出现的字符——汉字、全角标点、ASCII——九个区间已经全覆盖。**A（Ambiguous）类字符**（`± × ÷ °` 这批在西方语境宽度 1、东亚字体里宽度 2 的字符）统一按 1 处理，这是一个"必须选边站"的决策：Ambiguous 的宽度取决于字体环境，任何静态选择都会错一半，选 1 至少与 GitHub 的渲染一致。

区间覆盖里有两个容易被漏的：`0xff00-0xff60` 是**全角 ASCII**（`Ａｌｉｃｅ` 每个字符占 2 列），`0x20000+` 是 CJK 扩展 B 以后的生僻字——后者在古籍、人名里不罕见，`码点 > 0xFFFF` 意味着必然是代理对，正好检验第 1 节说的码点迭代是否做对。

---

## 3. 对齐标记：解析与还原都不能丢

Markdown 表格的对齐方向写在**分隔行**里：`:---` 左对齐、`:---:` 居中、`---:` 右对齐。格式化器必须先解析、再还原：

```ts
const sepRow = parsedRows[1] || [];
const alignments: ('left' | 'right' | 'center')[] = [];
for (let c = 0; c < colCount; c++) {
	const cell = sepRow[c] || '';
	const starts = cell.startsWith(':');
	const ends = cell.endsWith(':');
	if (starts && ends) alignments.push('center');
	else if (ends) alignments.push('right');
	else alignments.push('left');
}
```

解析只看首尾有没有冒号。还原时不能照抄原文（`::---` 这种写法 CommonMark 会拒收），而是**从解析出的方向重新生成**规范形式——compact 模式里能看到这条路径的独立出口：

```ts
const seps = alignments.map((align) => {
	if (align === 'center') return ':---:';
	if (align === 'right') return '---:';
	return ':---';
});
```

补空格的 `padString` 按三个方向分派：右对齐先垫空格、居中对半分（`Math.floor` 给左半，余数归右半——两列奇偶差一格时固定偏一边，比"随机居中"可预测）。

---

## 4. 列数以分隔行为准，多余补空

数据行多写一个单元格并不会多出一列——CommonMark 的表以分隔行为准，多余部分被丢弃；少写的自动补空。格式化器的规整逻辑跟着规范走：

```ts
const colCount = Math.max(...parsedRows.map((r) => r.length));
const cells = Array.from({ length: colCount }, (_, c) => row[c] || '');
```

实现取了各行的**最大**列数而不是严格"以分隔行为准"——这是一个务实偏差：用户粘贴的表格如果数据行比分隔行多一格，按规范应截掉那一格，但截数据是破坏性操作，补一列空格保持全部信息更安全。工具做的是**格式化**（美化源码可读性）而不是**校验**（拒绝不规范输入），边界划在这里，规整行为就顺理成章。

另一个细节：宽度统计**跳过分隔行**（`if (rIdx === 1) return`）——分隔行是 `---` 填充，它的长度不该参与列宽计算，否则 `:---:` 里的冒号会把列撑宽两格。

---

## 5. 工程收获

- **"长度"有三个口径**：码元、码点、显示宽度，表格对齐要的是第三个，且必须配合码点迭代才拿得到正确输入；
- **区间查表是数据的免费午餐**：九个区间覆盖 Markdown 表格的实际字符集，完整 EAW 表的维护成本换不来可见的精度提升；
- **Ambiguous 必须选边**：静态工具里"取决于环境"等于"随便选一个并写进文档"，选与目标渲染环境一致的那边；
- **从解析结果重新生成，不照抄原文**：对齐标记的规范化比保留原写法更可靠；
- **格式化与校验分离**：补空格保留信息，截断丢弃信息，工具该选前者。

工具在此：[Markdown 表格格式化](/text/markdown-table-formatter/)，另有紧凑模式一键去多余空格。渲染结果与格式化前完全一致——美化只作用于源码可读性，全部本地运算。
