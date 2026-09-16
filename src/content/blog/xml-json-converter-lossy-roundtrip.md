---
title: 'XML 转了个来回，文字跑到元素前面去了'
description: 'XML 与 JSON 互相转换不是同一件事。XML→JSON 把交错文本压成一段 #text、丢掉注释与 CDATA；JSON→XML 要求根只有一个键、文本永远排在子元素前面。同一个 roundtrip 在两个方向各自丢一份信息，而转换报告成功。逐个给出实测输入输出，并说清为什么 JSON 的结构表达不了 XML 的顺序。'
pubDate: 'Sep 18 2026'
category: web
topics: [web-platform, developer-tools]
searchTerms: ['XML JSON 互转', 'xml2js', '@ 属性前缀', '#text', '混合内容 mixed content', 'roundtrip 有损', 'XML 实体', 'JSON Pointer', 'XML 子集解析器']
contentLang: 'zh-CN'
relatedTools: ['devtools/xml-json-converter', 'devtools/xml-formatter', 'devtools/json-formatter']
relatedPosts: ['json-to-typescript-and-json-schema-inference', 'yaml-toml-parser-silent-type-collapse', 'html-css-xml-formatting-is-not-sanitization']
---

`<root><p>lead <b>t</b> tail</p></root>` 转成 JSON，再转回 XML，得到 `<root> <p>lead  tail<t>b</t></p> </root>`。

文字还在，只是**顺序错了**：原来"文字—元素—文字"，回来变成"文字文字—元素"。转换两次都成功，没有报错，输出来格。

这份工具实现的是 xml2js 那套经典约定：属性加 `@` 前缀、文本叫 `#text`、重复的子元素变数组。约定本身设计得挺好，它解决的是"属性名和子元素名撞了怎么办"。但它有一个结构性的天花板：**JSON 的扁平键值装不下 XML 的交错顺序**。这个天花板不是实现缺陷，是实现原理决定的——所以它修不掉，只能知道它在哪。

这篇按两个方向讲。先看约定怎么设计的，再看交错文本为什么必然丢失，然后看 JSON→XML 那侧的单向限制，最后收一组解析器本身的边界行为。每条都有实测。

---

## 1. `@` 和 `#text`：一份约定解决一次命名冲突

先给出约定本身，因为后面所有讨论都建立在它上面。

```xml
<person id="1">hi</person>
```

```json
{ "person": { "@id": "1", "#text": "hi" } }
```

三个约定各管一件事：

**`@` 前缀标属性。** 因为 XML 里属性名和子元素名可以完全相同——`<a id="1"><id>2</id></a>` 在 XML 里合法。JSON 对象不允许重复键，所以必须给属性开一个命名空间。`@` 是任取的，xml2js 选了这个字符，`@id` 就不会和子元素 `id` 撞。

**`#text` 放文本。** 同理，文本内容和子元素也可能同名——`<a>hello</a>` 里如果有个子元素也叫 `hello` 就麻烦了。给它一个保留名。

**重复子元素变数组，单个子元素保持标量。** 这是最有意思的一条，实测：

| XML | JSON |
| --- | --- |
| `<a><b>1</b><b>2</b></a>` | `{ "a": { "b": [ "1", "2" ] } }` |
| `<a><b>1</b></a>` | `{ "a": { "b": "1" } }` |

两个 `<b>` 变成数组，一个 `<b>` 保持字符串。这个不对称是有代价的：**同样的 XML，加一个重复的子元素，下游拿到的类型就变了**。`b` 从 `string` 变成 `string[]`，TypeScript 会直接报类型错。这不是转换出错，是约定本身把"数量"编码进了"类型"。

想反推一下为什么这么设计：数组有个天然信号——长度大于 1。单个元素如果用 `[ "1" ]` 包起来，那"到底是一个元素还是列表里的一个"就分不清了。xml2js 选了"单数即标量"，代价是类型随数量漂移。这是个合理的取舍，但要意识到它。

---

## 2. 交错文本：JSON 的结构表达不了这个顺序

现在到这篇的核心。

输入：

```xml
<root><p>lead <b>t</b> tail</p></root>
```

`<p>` 的内容是"文字—元素—文字"三段交错。转成 JSON：

```json
{ "root": { "p": { "b": "t", "#text": "lead  tail" } } }
```

三段变两段：两段文字被 trim 之后**拼接成一段**，元素单独成为键。注意那个双空格——`lead` 和 `tail` 之间的空格是原文里 `<b>` 左右各一个空格，拼接后变成了两个。

再转回去：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<root>
  <p>lead  tail<b>t</b></p>
</root>
```

文字跑到了 `<b>` 前面。

问题出在哪一层？不是序列化 bug。看 `nodeValue` 怎么收集文本：

```ts
if (node.text.trim() || node.children.length === 0) out['#text'] = node.text.trim();
```

`node.text` 是把整个节点里所有文字片段累加出来的字符串——解析器读到一段文字就 `node.text += decodeEntities(...)`。所以到这一步，"文字在哪个元素后面"这个信息**已经不在了**：三段文字早就拼成了一串。

就算文本没被拼起来，也还是没救。转回去的时候 `emitValue` 是这样排的：

```ts
out.push(`${indent}<${tag}${attrStr}>${textStr}`);
for (const [k, v] of children) emitValue(k, v, `${indent}  `, out);
out.push(`${indent}</${tag}>`);
```

`#text` 永远打在开标签紧后面，然后才是子元素。这个位置是硬编码的——因为 JSON 对象里除了键和值，没有"它在第几个子元素之后"这种位置信息。

于是可以下结论了：**JSON 的对象结构装不下 XML 的交错顺序**。不是这个实现没做好，是任何"把 XML 装进 JSON 对象"的约定都有这道天花板。xml2js 有办法绕——它给混合内容生成 `[{ _: "lead" }, { b: "t" }, { _: "tail" }]` 这样的顺序数组。但那已经是另一个约定的事了。

顺带一提，`#text` 的写入条件还有个细节：`node.text.trim() || node.children.length === 0`。即使节点有子元素，只要还有非空文本就写 `#text`；而节点没有任何子元素且文本为空时（比如 `<e/>`），也写 `#text`——实测 `<doc><e/><f>t</f></doc>` 得到 `{ "doc": { "e": "", "f": "t" } }`，`e` 是空串而不是键缺失。这样"空元素"和"有内容的元素"在 JSON 里区分得开。

---

## 3. 实体：五个预定义 + 数字引用，未知实体原样保留

XML 的文本里有五种预定义实体，还有两种数字字符引用。实测解析器对它们的行为：

```ts
function decodeEntities(s: string): string {
	return s.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (whole, body: string) => {
		if (body === 'lt') return '<';
		if (body === 'gt') return '>';
		if (body === 'amp') return '&';
		if (body === 'quot') return '"';
		if (body === 'apos') return "'";
		if (body.startsWith('#x') || body.startsWith('#X')) return String.fromCodePoint(parseInt(body.slice(2), 16));
		if (body.startsWith('#')) return String.fromCodePoint(parseInt(body.slice(1), 10));
		return whole; // unknown entity: keep verbatim
	});
}
```

`&lt;` `&gt;` `&amp;` `&quot;` `&apos;` 五个预定义，`&#65;` 和 `&#x41;` 两种数字引用。

最后一行是**未知实体原样保留**：`&nbsp;` 转出来还是字符串 `&nbsp;`，不会报错，也不会变成空格。这个选择值得说清楚——因为它跟"报一条精确错误"是相反的哲学。

XML 的完整规范允许用 `<!DOCTYPE>` 声明自定义实体，而这份解析器**跳过** doctype（把声明内容直接扔掉，见第 5 节）。所以如果原文档声明了 `<!ENTITY nbsp "&#160;">`，解析器既没有读到声明，也没有报错，只是把 `&nbsp;` 当普通文本交出去。下游拿到的是字面字符串 `&nbsp;`，看起来像是"实体没解析"，实际上声明根本不在解析范围内。

这里的选择是有意识的：一个 170 行的子集解析器不可能支持 DTD 实体表，而"支持一半"比"不支持并报错"危险得多。所以选了保留原文并让它可见。但这条边界得知道——如果你的 XML 依赖外部实体，这个工具不会替你解析。

反过来，转回去那一侧是转义的，`escapeXml` 覆盖五个字符：

```ts
s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] ?? c)
```

五个转五个，对称。所以纯文本内容的 roundtrip 是稳的。

---

## 4. JSON → XML：只有三处结构性不兼容

这一侧的限制不像上面那么隐蔽，它们都会直接抛错。

**根必须只有一个键。** XML 文档有且只有一个根元素，JSON 对象可以有很多键：

```
{ "a": 1, "b": 2 }  →  ERR the JSON root must have exactly one key (got 2) — it becomes the XML root element
```

报错文案把原因也说了：那个唯一的键会变成 XML 根元素名。所以 JSON→XML 不是把整个对象当文档，是**把第一层的键名当根标签、值当内容**。`{ "person": { ... } }` 里的 `person` 是标签名，不是数据的一部分。

这意味着 JSON→XML 是"包了一层再转"：你的对象必须先有一个外层包裹键。这个不对称在两个方向上是镜像的——XML→JSON 会自动加上外层键（用根标签名），JSON→XML 要求你事先就有。

**标签名要合法。** JSON 的键可以是任意字符串，XML 的元素名不是：

```ts
const TAG_RE = /^[A-Za-z_:][A-Za-z0-9_.:-]*$/;
```

不匹配就抛 `"${tag}" is not a valid XML element name`。注意这个正则允许 `:`（命名空间前缀）和 `.`——前者是 XML 的命名空间语法，后者是部分方言的宽松写法。它**不**检查命名空间前缀是否声明过：`<a><x:b>1</x:b></a>` 会被接受，即使 `x:` 从没被声明。这是子集解析器的边界，和实体那一节同一个取舍。

**`@` 前缀是双向识别的。** 一个键以 `@` 开头就当成属性，`#text` 当成文本，其余当子元素：

```ts
const attrs = entries.filter(([k]) => k.startsWith('@'));
const text = entries.filter(([k]) => k === '#text');
const children = entries.filter(([k]) => !k.startsWith('@') && k !== '#text');
```

实测 `{ "a": { "@x": "1" } }` 得到 `<a x="1"/>`。反过来，如果一个**子元素**恰好叫 `@foo`，它会被当成属性处理——这是约定带来的歧义，无解，只能约定。

三处里前两处会报错，第三处是静默的。

---

## 5. 注释、CDATA、processing instruction：解析了，然后丢掉

解析器确实处理这三样东西——`parseElement` 里有专门分支：

```ts
if (ctx.src.startsWith('<!--', ctx.pos)) {
	const end = ctx.src.indexOf('-->', ctx.pos + 4);
	if (end === -1) throw new Error(`${ctx.where()}: comment is never closed`);
	ctx.advance(end + 3 - ctx.pos);
	continue;
}
```

但 `continue` 之后就没了——注释不写进 `node.children`，也不写进 `node.text`。CDATA 走的是 `node.text += ...`，所以 **CDATA 的内容会被当普通文本接进去**（`<a><![CDATA[x]]></a>` 得到 `{ "a": "x" }`），而注释被整段丢弃。

processing instruction 和 doctype 更简单：

```ts
if (ctx.src.startsWith('<?', ctx.pos) || ctx.src.startsWith('<!', ctx.pos)) {
	const end = ctx.src.indexOf('>', ctx.pos);
	if (end === -1) throw new Error(`${ctx.where()}: declaration is never closed`);
	ctx.advance(end + 1 - ctx.pos);
	continue;
}
```

也是 `continue`，整段跳过。

于是同一个文档，三类"非内容"标记的待遇不一样：

| 标记 | 解析行为 | 进入 JSON |
| --- | --- | --- |
| 注释 `<!-- -->` | 校验闭合 | 丢弃 |
| CDATA `<![CDATA[ ]]>` | 校验闭合 | 内容并入 `#text` |
| `<?php ?>` / `<!DOCTYPE>` | 校验闭合 | 丢弃 |

这个不一致是有道理的——CDATA 的语义就是"这段是文本"，所以并进文本是对的；注释和声明的语义是"这不是内容"，所以丢掉是对的。但它们都**不报错**，所以你没法从输出里看出原文档里有没有这些东西。注释被丢掉这件事，在 roundtrip 里是静默的：转来转去注释没了，工具报告成功。

对配置、feed、snippet 这些目标文档，丢注释是可接受的——注释本来就不该进数据。但如果你的用途是"保留原文档再改一点点"，这个工具不是给你用的。

---

## 6. 解析器本身：170 行，带行号

`parseXml` 加 `parseElement` 加上 `nodeValue`，大概 170 行，不依赖任何 XML 库。错误消息统一带行号：

```ts
class ParseContext {
	pos = 0;
	line = 1;
	constructor(readonly src: string) {}
	where(): string {
		return `line ${this.line}`;
	}
	advance(n: number): void {
		for (let i = 0; i < n && this.pos < this.src.length; i++) {
			if (this.src[this.pos] === '\n') this.line++;
			this.pos++;
		}
	}
}
```

`advance` 每往前走一个换行就加行号。所有错误都是 `${ctx.where()}: <原因>` 的形状，比如 `line 3: closing tag </b> does not match <a>`。这对一个 170 行的解析器来说是值得的投入——XML 的错误（嵌套不匹配、引号没闭、提前结束）本来就靠定位才能修，不带行号的话得用户自己在原文里数。

它校验的东西比它支持的还要多一些：

- 闭合标签不匹配：`line N: closing tag </X> does not match <Y>`
- 元素没闭合：`line N: element <X> is never closed`
- 属性缺值：`line N: attribute "X" has no value`
- 属性值缺闭引号：`line N: attribute value is missing its closing quote`
- 根之后还有内容：`line N: content after the document root element`
- 引号不合法：`line N: attribute value must be quoted`

最后一条比较容易被忽略。XML 允许**不写引号**的属性值（`<a x=1>`），这份解析器不接受——它会报"must be quoted"。这是有意识的收紧：不写引号的属性值边界靠空白界定，很容易在 `<a x=1 y=2>` 里被误切，而要求引号能让错误变成确定性的。

顺带一提，解析前会做两件事：`text.replace(/\r\n/g, '\n').trim()`——CRLF 归一化，两端空白去掉。前者是为了行号计算准确，后者是为了让前面那句"根之后还有内容"的校验不被尾部空白误触发。

---

## 7. roundtrip 到底丢什么：一份清单

把上面几节收拢成一张表。

| 丢失项 | 方向 | 静默？ |
| --- | --- | --- |
| 交错文本的相对位置 | XML→JSON→XML | 是 |
| 注释 | XML→JSON | 是 |
| processing instruction / doctype | XML→JSON | 是 |
| 文本片段之间的空白归一化 | XML→JSON | 是（双空格会留痕） |
| XML 声明 | JSON→XML 会重新生成 | 是（总是生成同一份） |
| 标签之间的排版空白 | XML→JSON→XML | 是 |
| 根有多个键 | JSON→XML | **否**，报错 |
| 非法标签名 | JSON→XML | **否**，报错 |

六个静默，两个显式。

静默的那六项里，真正改变数据语义的只有第一项——交错文本的相对位置。其余五项在"XML 是配置/数据、不是文档"的前提下都属于可接受的格式丢失：注释本来就不进数据，声明会被重新生成，排版空白本来就不承载意义。

但第一项不一样。`<p>lead <b>t</b> tail</b>` 这种 HTML 风格的混排内容，语义上"tail"是在 `<b>` 之后。转回来变成在之前，读法就变了。这不是排版问题，是内容顺序问题。

值得单独说清的是：这个丢失**在 JSON 那一侧就已经完成了**，不是 roundtrip 才发生的。第一步 XML→JSON 就把三段文字拼成了一段——`node.text +=` 那一步。之后 JSON→XML 只是忠实地把这个已经丢了的顺序输出出来。所以如果只用 XML→JSON 而从不回转，你同样丢了这个信息，只是不会有人告诉你。

---

## 8. 这份工具适合什么，不适合什么

适合的：配置 XML（ini、appconfig、Android XML 那种纯键值嵌套）、feed 的子集（RSS/Atom 的条目结构）、snippet 级别的临时转换。这些文档的共同点是**纯元素嵌套，没有交错文本**——只要遵守这个前提，roundtrip 除了排版空白外基本无损，实测 `<a><b>1</b><b>2</b></a>` 和 `<a id="1"/>` 两种都稳定。

不适合的：HTML 文档（`<p>` 里混着 `<span>` 几乎是常态，交错文本是主结构）、依赖 DTD 实体的文档、需要保留注释的文档、以及任何"要改一点点再写回去"的编辑型用途。

判断依据就一条：**你的文档里有没有文字和元素交错**。有，这个工具会静默重排你的内容。没有，它会做得挺干净。

交错文本这条天花板是约定级别的，不是 bug。xml2js 有它的顺序数组方案（`_` 键标记文本片段），代价是输出的 JSON 结构更难读、下游要理解另一种约定。选哪种是把"可读性"和"无损性"做一次显式取舍——而"看起来无损但实际重排了顺序"是第三种，也是最坏的一种。
