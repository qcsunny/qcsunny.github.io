---
title: '写一个 cURL 转代码工具：shell 分词器、隐式 POST 与两版代码生成'
description: '拆解站内 curl-to-code 工具的实现：一个 40 行的 shell 引号分词器怎么处理 Copy as cURL 的鬼画符、-d 为什么隐式切成 POST、-u 怎么翻译成 Basic Auth，以及 Python 和 JS 两版代码生成器各自踩的转义坑。'
pubDate: 'Sep 12 2026'
category: engineering
topics: [developer-tools, web-platform]
searchTerms: ['curl', '转义', '分词器', 'API 调试']
contentLang: 'zh-CN'
relatedTools: ['devtools/curl-to-code', 'devtools/url-parser', 'devtools/json-formatter']
relatedPosts: ['url-unicode-utf8-base64url-boundaries', 'url-parser-native-api-query-cleaning-and-tracking-params']
---

API 文档贴的示例几乎都是 curl，浏览器 DevTools 里被复制最多的菜单项是 "Copy as cURL"。但把一条终端里跑通的命令粘进 Python/JS，401、400、参数丢失接踵而来——因为这条命令在到达服务器之前穿过了不止一层转义系统。[cURL 转代码工具](/devtools/curl-to-code/)做的是把这层翻译自动化：粘贴命令，输出 `requests` 和 `fetch` 两版等价代码。这篇文章拆它的实现——一个 40 行的 shell 分词器，比想象中难写对。

---

## 1. 第一关：shell 引号分词器

解析 curl 命令的第一步不是"读参数"，是**把字符串按 shell 的规则切成 token**——空格是分隔符，但引号里的空格不是。`src/tools/textTools.ts` 里的 `parseCurl` 用一个手写状态机：

```ts
if (inQuote) {
	if (ch === quoteChar && trimmed[i - 1] !== '\\') {
		inQuote = false;
	} else {
		current += ch;
	}
} else if (ch === "'" || ch === '"') {
	inQuote = true;
	quoteChar = ch;
} else if (/\s/.test(ch)) {
	if (current) { tokens.push(current); current = ''; }
} else {
	current += ch;
}
```

要点全在细节里：

- **引号在 token 化时剥掉、不保留**——Copy as cURL 输出的 `'it'\''s fine'` 鬼画符，是 shell 把 `it`、`'s fine` 拼回一个词的转义术；分词器只需要 `it's fine` 这个词本身。生成代码时目标语言会加回**自己那一层**引号；
- `trimmed[i - 1] !== '\\'`：引号前有反斜杠说明被转义，是字面引号不是包裹符；
- 开头的 `cmd.replace(/\\\r?\n/g, ' ')`：先处理 shell 的**行继续符**——Copy as cURL 的多行命令靠行尾 `\` 连成一行，不先合并，第二行会被当成第一条命令的输出文件名。

---

## 2. 第二关：选项语义，重点是隐式行为

token 切好后是一个直白的选项循环，但每个选项都藏着语义：

```ts
} else if (t === '-d' || t === '--data' || t === '--data-raw' || t === '--data-binary') {
	body = tokens[++i] || '';
	if (!method) method = 'POST';
} else if (t === '-u' || t === '--user') {
	const userPass = tokens[++i] || '';
	headers['Authorization'] = `Basic ${btoa(userPass)}`;
}
```

三个"翻译"决策：

**`-d` 隐式切 POST**。curl 默认 GET，带 `-d` 时静默切成 POST——终端用户未必意识到，但 SDK 不会替你做这个隐式切换，所以翻译时必须把 method 补成显式的 `POST`，否则生成的代码发的还是 GET。

**`-u` 展开成 Authorization 头**。`-u user:pass` 是 Basic Auth 的命令行糖，`btoa(userPass)` 直接完成 base64 编码。注意方向：**不是**把明文塞进 `auth=` 参数（Python requests 的 `auth=(user, pass)` 也行，但两版代码要保持同一翻译，头形式是交集）。

**`-X POST` 显式覆盖优先**。循环里 `-X` 先设 method，`-d` 的隐式赋值带 `if (!method)` 守卫——显式声明永远赢过隐式推断，与 curl 本身的优先级一致。

---

## 3. 第三关：两版代码生成，各有一个转义陷阱

### Python 版：让 JSON 库接管转义

```ts
if (parsed.body.startsWith('{')) {
	code += `json_data = ${parsed.body}\nresponse = requests.${method.toLowerCase()}(url, headers=headers, json=json_data)\n`;
} else {
	code += `data = '''${parsed.body}'''\nresponse = requests.${method.toLowerCase()}(url, headers=headers, data=data)\n`;
}
```

请求体以 `{` 开头就走 `json=` 参数——requests 库会调用 `json.dumps` 完成全部序列化转义，生成的代码里 body 是**裸 JSON**，一个转义都不用手写。非 JSON body 走 `data=`，用三引号字符串包裹（`'''`），避开单双引号嵌套问题。这是"**让 JSON 库生成 JSON**"原则的落地：手工拼 `\n` 双重转义，少一层就是服务器端的解析失败。

### JS 版：body 的类型分叉

```ts
opts.push(`body: JSON.stringify(${parsed.body.startsWith('{') ? parsed.body : JSON.stringify(parsed.body)})`);
```

同一行里有两个 `JSON.stringify`，干的不是同一件事：body 是 JSON 时 `stringify(裸对象字面量)`——字面量被 JS 当对象解析，stringify 重新序列化，语义上等价于 requests 的 `json=`；body 不是 JSON 时是 `stringify(stringify(...))`——内层先把任意文本变成一个合法的 JS 字符串字面量（处理引号、换行），外层再把它包成请求体。**同一份输入，两种 body 类型，四个 stringify 组合**——这一行是被 "text body 里的引号把生成的代码弄崩" 的 bug 逼出来的。

### 共同的坑：头值里的引号

头值直接内插进两版代码的单引号字符串。`Authorization: Bearer tok_en` 没问题，但 token 里混一个单引号，生成的 Python 代码当场语法错误——已知边界，工具的错误提示比静默生成坏代码好。这是这类"字符串拼代码"工具的共同天花板：**输入是任意的，目标语言的字符串字面量语法是有限的**，完全正确需要 AST 级的 emitter，40 行的模板内插换来了 95% 场景的正确，剩下的明说。

---

## 4. 边界与取舍清单

- `curl` 前缀之外的裸 token 当 URL，`-` 开头的未知选项静默跳过——Copy as cURL 的输出里有 `--compressed`、`--http2` 这类 SDK 不需要的选项，报错反而是错；
- 多个 `-H` 进同一个 headers 对象，后写覆盖先写——与 curl 的实际行为一致；
- `btoa` 是浏览器 API，正好工具跑在浏览器里；`atob`/`btoa` 对非 ASCII 的处理有坑，Basic Auth 的 user:pass 按 RFC 应该先 UTF-8 编码再 base64，纯 ASCII 凭证（绝大多数）无恙，非 ASCII 是已知的未覆盖边界。

---

## 5. 工程收获

- **分词在先、语义在后**：不按 shell 规则切开 token，后面所有解析都在错误的地基上；
- **隐式行为显式化**：`-d` → POST 的翻译是这类工具的核心价值，不是细节；
- **让库接管转义**：能走 `json=` / `stringify` 的绝不手拼字符串；
- **字符串拼代码的天花板要明说**：95% 场景正确 + 清晰的边界文档，胜过假装全覆盖。

工具在此：[cURL 转代码](/devtools/curl-to-code/)，配合 [URL 解析工具](/devtools/url-parser/)核对查询串编码、[JSON 格式化](/devtools/json-formatter/)核对请求体。命令里的 token 不会离开浏览器。
