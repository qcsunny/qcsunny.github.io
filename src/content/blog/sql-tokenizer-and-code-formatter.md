---
title: '代码格式化器怎么写：SQL 词法分词器、缩进状态机，与一个冻结标签页的死循环'
description: '拆解手写 SQL 格式化器的六类 token 分词器与括号深度缩进状态机，剖析正则替换为何会静默改坏字符串字面量、格式化为何不需要完整 AST，以及 JSON 格式化为何应当复用宿主 JSON.parse 并把引擎报错反查成行列号。'
pubDate: 'Sep 05 2026'
---

本站有两个格式化工具：[JSON 格式化校验](/tools/json-formatter/)和 [SQL 格式化美化](/tools/sql-formatter/)。它们看起来是同一类东西，实现却几乎没有共同点——一个把活全交给宿主环境，另一个从字符开始手写。这篇文章讲清楚为什么，顺便记录一个把浏览器标签页直接冻结的死循环 bug。

---

## 1. JSON：宿主已经有一个符合规范的解析器

JSON 格式化的核心只有两行：

```ts
const parsed = JSON.parse(raw);
const formatted = JSON.stringify(parsed, null, indent);
```

`JSON.parse` 是引擎内置的、经过 RFC 8259 完整验证的 C++ 实现，`JSON.stringify` 的第三个参数就是缩进。自己写一个 JSON tokenizer 不会更快、不会更正确，只会多出一份需要维护的规范符合性风险。**能复用宿主的时候就别自己写**——这条原则和"不引入第三方依赖"并不冲突：宿主 API 不会被 unpublish，也不会挂在别人的 CDN 上。

那手写的部分是什么？是**引擎不提供的那些**。

### 错误定位：把引擎报错反查成行列号

`JSON.parse` 抛出的 `SyntaxError` 消息格式**各引擎不统一，而且同一引擎不同版本还会变**。V8 现在报的是 `Expected property name or '}' in JSON at position 1 (line 1 column 2)`，早期版本只有 `position`；SpiderMonkey 一直只给行列。所以定位逻辑写成两级降级：

```ts
function getErrorPosition(errorMsg: string, text: string): { line?: number; col?: number } {
	const posMatch = errorMsg.match(/position\s+(\d+)/i);
	if (posMatch) {
		const pos = parseInt(posMatch[1], 10);
		const lines = text.slice(0, pos).split('\n');
		return { line: lines.length, col: lines[lines.length - 1].length + 1 };
	}
	const lineColMatch = errorMsg.match(/line\s+(\d+)\s+column\s+(\d+)/i);
	if (lineColMatch) {
		return { line: parseInt(lineColMatch[1], 10), col: parseInt(lineColMatch[2], 10) };
	}
	return {};
}
```

两条正则各覆盖一族引擎，都不匹配就退化成"只报消息不报位置"——**引擎的报错文案不是 API，不能假定它永远长这样**，所以拿不到位置时工具仍要能正常给出错误提示。把字符偏移换算成行列号则是一行：切到出错位置、按换行分割，**段数就是行号，最后一段的长度 + 1 就是列号**。

### 代价：格式化不是"重排"，而是"解析后重新序列化"

复用宿主解析器有一个必须说清楚的语义边界。`JSON.parse` → `JSON.stringify` 走了一趟**值**，原文的写法在这一趟里被规范化了：

| 输入 | 输出 | 原因 |
| :--- | :--- | :--- |
| `1e3` | `1000` | 数字先变成 IEEE 754 double，再按最短往返形式打印 |
| `0.1e1` | `1` | 同上 |
| `{"a":1,"a":2}` | `{"a":2}` | 重复键只留最后一个，前面的值静默丢弃 |
| `"\u0041"`（Unicode 转义） | `"A"` | 转义序列在解析阶段已被解码，写法无法还原 |
| `12345678901234567890` | `12345678901234567000` | **超过 2⁵³ 的整数精度丢失** |

前四条只是形态变化，最后一条是**真实的数据损失**。处理区块链交易号、雪花 ID、Twitter/X 的 `id_str` 这类大整数 JSON 时，任何基于 `JSON.parse` 的格式化器都会静默改值——这也正是这些 API 都额外提供一个字符串版字段的原因。要保住原始字面量，就必须放弃宿主解析器、手写一个只做重排不做求值的 tokenizer。本站的 JSON 工具选择了前者，所以这条限制在文档里明说。

---

## 2. SQL：没有宿主解析器，也不需要 AST

SQL 这边没得选，只能手写。但"手写"有两个层次，选错了工程量差一个数量级：

- **完整 parser + AST**：需要覆盖方言。MySQL 的反引号、PostgreSQL 的 `::` 强制转换与 `$$` 函数体、T-SQL 的方括号、SQLite 的宽松语法、各家不同的窗口函数与 CTE 写法——真要做全，是几千行的工程，而且每个方言更新都得跟。
- **词法分词 + 局部规则**：格式化要回答的问题其实只有三个——这个 token 前面要不要换行、缩进几级、要不要大写。这些全是**局部**判断，看当前 token 的类别和括号深度就够了，不需要知道它在语法树上的位置。

格式化属于第二类。所以这个实现只做到分词，没有 AST：

```ts
type SqlToken = { type: 'str' | 'comment' | 'word' | 'punct' | 'op' | 'ws'; val: string };
```

六个类别就是全部的类型系统。反过来说，能力上限也就锁定在这里了：不能做列对齐、不能重排子句顺序、不能识别 CTE 的作用域——那些确实需要 AST。**明确知道自己不做什么，比假装什么都能做要有用。**

---

## 3. 分词器：六个分支，和一条铁律

铁律是：**字符串字面量和注释必须原样带出，后续任何一个 pass 都不许改写它们的内容。** 这一条决定了整个架构——它把"什么是代码、什么是用户数据"的判断集中到分词这一步做完，下游只看 token 类别，永远不会再面对原始字符。

```ts
// String literal '...', "..." or `...`
if (c === "'" || c === '"' || c === '`') {
	let j = i + 1;
	while (j < n && text[j] !== c) {
		if (text[j] === '\\') j++;
		j++;
	}
	j = Math.min(j + 1, n);
	tokens.push({ type: 'str', val: text.slice(i, j) });
	i = j;
	continue;
}
```

两个细节：

- `if (text[j] === '\\') j++` 处理反斜杠转义，让 `'it\'s'` 不会在中间被切断。
- `j = Math.min(j + 1, n)` 是**未闭合引号的兜底**。工具是边输入边格式化的（`onInput` 直接调 `doFormat(2)`），用户打到 `where name = 'ab` 时字符串必然没闭合。分词器这时候绝不能抛异常，把剩下的全部当成一个字符串 token 就是最合理的处理。

---

## 4. 那个把标签页冻结的死循环

分词器的最后一个分支是"扫一个词"：从当前位置往前走，直到撞上分隔符。

```ts
let j = i;
while (j < n && !/[\s(),;'"`\-/]/.test(text[j])) j++;
tokens.push({ type: 'word', val: text.slice(i, j) });
i = j;
```

分隔符集合里有 `-` 和 `/`。它们**本该**在上面的分支里被消费掉——`--` 是行注释，`/*` 是块注释。但只有成对出现时才会。单独一个 `-` 或 `/` 走到这里，`while` 的第一次判断就为假，`j` 停在 `i`，于是：

```text
j === i  →  val = ''  →  push 一个空 token  →  i = j 原地不动  →  下一轮完全一样
```

**无限循环，而且每轮往数组里 push 一个空对象。** 主线程被占满，标签页失去响应，内存持续上涨直到崩溃。

触发条件有多普通？

```sql
select price - discount as net from items   -- 减法
select a/b from t                           -- 除法
where qty > -1                              -- 负数字面量
```

任何一句带减法、除法或负数的 SQL 都会冻结页面。而示例 SQL 里恰好没有这三样，所以工具"看起来"一直是好的。

修复只有三行——零推进时把这个字符当成单字符运算符：

```ts
// Word. A lone delimiter that no branch above claimed — subtraction,
// division, a stray backtick — leaves j === i, which would spin this
// loop forever; emit it as a one-character operator instead.
let j = i;
while (j < n && !/[\s(),;'"`\-/]/.test(text[j])) j++;
if (j === i) {
	tokens.push({ type: 'op', val: c });
	i++;
	continue;
}
```

真正值得记住的是那条通用规则：**`while` 驱动的分词器里，每一条分支都必须保证至少消费一个字符。** 一个能"匹配零长度"的分支就是一个死循环。这比语法覆盖度重要得多——覆盖不全只是格式化得不够漂亮，零推进是整个页面挂掉。

---

## 5. 压缩为什么也必须走分词器

同一个文件里的"单行压缩"原本是四条链式正则，看着干净利落：

```ts
export function minifySql(sql: string): string {
	return sql
		.replace(/--.*$/gm, '')                  // remove line comments
		.replace(/\/\*[\s\S]*?\*\//g, '')        // remove block comments
		.replace(/\s+/g, ' ')                    // collapse whitespace
		.replace(/\s*([(),;=])\s*/g, '$1 ')      // clean around punctuation
		.trim();
}
```

它错在一个根本的地方：**正则不知道自己扫到的字符是代码还是数据。** 而"这个逗号是分隔符还是字符串里的一个字"恰恰是上下文问题。

```sql
select * from t where tag = 'a,b--c'
```

- 第一条规则看到 `--`，把 `--c'` 整段删掉，剩下 `tag = 'a,b`——引号都不闭合了，输出的 SQL **语法非法**。
- 第四条规则看到逗号，把它改写成 `, `，`'a,b'` 变成 `'a, b'`——**用户的数据被静默篡改**。

第二种更危险：不报错、不崩溃，输出看起来还挺整齐，拿去执行就查不到数据了，而且没人会怀疑格式化工具。

修好的办法不是给正则打补丁（不存在能"跳过字符串"的正则），而是让压缩复用格式化那套分词器——字符串和注释在分词阶段就已经被识别出来了：

```ts
for (const token of tokenizeSql(sql.trim())) {
	switch (token.type) {
		case 'comment':
			skipWs = false;
			break;                                 // 注释整个丢掉
		case 'ws':
			if (!skipWs && out && !out.endsWith(' ')) out += ' ';
			skipWs = false;
			break;
		case 'punct':
			// "(" 后不留空隙，")" 前去空白，"," 与 ";" 后补一个空格
			…
		default:
			out += token.val;                      // word / str / op 原样输出
			skipWs = false;
	}
}
```

`default` 分支那一行就是铁律的兑现：字符串字面量走的是"原样拼接"这条路，压缩过程根本没有能力碰它的内容。`'a,b--c'` 于是逐字节存活，而注释被删得干干净净。

**这就是写分词器的真正回报**——不是为了"更专业"，而是因为一旦把代码和数据分开了一次，后面每个 pass 都自动是安全的。

---

## 6. 缩进状态机：三档关键字 + 一个括号深度

分词之后的重排只有两个状态变量：当前缩进级数，和**括号深度**。关键字分三档，每档一种排版行为：

| 档位 | 成员（节选） | 行为 |
| :--- | :--- | :--- |
| MAJOR | SELECT / FROM / WHERE / GROUP BY / ORDER BY / HAVING / LIMIT / UNION ALL / INSERT INTO | 独占一行，之后的内容缩进一级 |
| SUB | LEFT JOIN / INNER JOIN / ON / AND / OR / WHEN / THEN / ELSE | 换行、缩进一级，内容跟在同一行 |
| OTHER | AS / DISTINCT / IN / LIKE / BETWEEN / COUNT / SUM / COALESCE | 只做大写，不影响排版 |

```ts
if (isMajor) {
	if (!atLineStart) newLine();
	currentIndent = parenDepth;
	append(wordUpper);
	currentIndent = parenDepth + 1;
	newLine();
} else if (isSub) {
	if (!atLineStart) newLine();
	currentIndent = parenDepth + 1;
	append(wordUpper);
	append(' ');
} else if (isOther) {
	append(wordUpper);
}
```

关键是缩进**全部相对于 `parenDepth`**，而不是写死的 0 和 1。子查询里的 `SELECT`/`FROM`/`WHERE` 因此会嵌在它自己的括号下面，而不是回到第 0 列——否则一个 `from (select … )` 读起来像是两条不相干的语句拼在一起。括号 token 只做两件事：

```ts
} else if (token.val === '(') {
	// no space of our own — the preceding ws token, if there was one,
	// already added it. Keeps `count(x)` tight and `from (select …)` open.
	append('(');
	parenDepth++;
	currentIndent = parenDepth;
} else if (token.val === ')') {
	parenDepth = Math.max(0, parenDepth - 1);
	currentIndent = parenDepth;
	append(')');
```

`append('(')` 而不是 `append(' (')` 是个小而重要的选择：左括号不自带空格，要不要空格完全由**前面那个 ws token 有没有出现**决定。于是 `count(o.id)` 保持紧凑，`from (select …)` 保留间隔——一个规则同时管对了函数调用和子查询，不需要判断"这是不是函数名"。`Math.max(0, …)` 则是防括号不配对：用户少打一个 `)`，缩进不会变成负数。

多词子句用一次前瞻处理：

```ts
const nextToken = tokens[idx + 1]?.type === 'ws' ? tokens[idx + 2] : null;
if (nextToken?.type === 'word') {
	const twoWords = `${token.val.toUpperCase()} ${nextToken.val.toUpperCase()}`;
	if (ALL_KEYWORDS_SORTED.includes(twoWords)) { … }
}
```

先拼两个词查一次表，命中就把两个 token 一起吃掉（`idx` 前进 2），没命中才按单词处理。**两词优先于一词**就是这里的最长匹配——`GROUP BY` 不会先被识别成 `GROUP`，`UNION ALL` 不会退化成 `UNION`。

### 实际效果

```sql
-- 输入
select * from (select id from users where id > 5) u where u.id < 10

-- 输出
SELECT
  *
FROM
  (
  SELECT
    id
  FROM
    users
  WHERE
    id > 5) u
WHERE
  u.id < 10
```

子查询的三个子句跟着括号一起缩进了一级，外层的 `WHERE` 回到第 0 列——这就是 `parenDepth` 在起作用。

---

## 7. 它做不到什么

一个格式化工具最容易失信的方式，是让人以为它能做它做不到的事。所以把边界列清楚：

- **不校验语法。** 它不是 linter，输入 `select from where` 照样输出排版好的 `select from where`。真正的语法检查需要 parser，而 parser 要绑方言。
- **不拆无空格的表达式。** `a=b` 因为 `=` 不在分隔符集合里，整体成为一个 word token，原样输出为 `a=b`，不会补成 `a = b`。写坏不会，但也美化不了。
- **列不各占一行。** `select a, b, c` 的三列排在同一行，逗号后只补一个空格。要做"每列一行 + 逗号前置"这类风格，得引入更多状态。
- **不做列对齐、不重排子句、不识别 CTE 作用域。** 这些是 AST 的活。
- **关键字表是固定的。** 表里没有的方言关键字（窗口函数的 `OVER`、`PARTITION BY`，PostgreSQL 的 `ILIKE` 等）会被当成普通标识符原样输出——不会被改坏，只是不参与排版和大写。
- **压缩不改大小写。** 压缩的目标是体积，不是风格，所以关键字保持原样。

JSON 侧对应的边界已经在第 1 节说了：数字与转义会被规范化，超过 2⁵³ 的整数会精度丢失。

这些限制里没有一条会**改坏**输入——这是分词器架构给的保证，也是划定边界时唯一真正重要的标准：做不到可以接受，静默改数据不行。

---

## 8. 在线试试

- **[SQL 格式化美化](/tools/sql-formatter/)**：本文拆解的这份实现，2/4 空格缩进、关键字自动大写、单行压缩；
- **[JSON 格式化校验](/tools/json-formatter/)**：复用宿主解析器 + 手写错误定位，报到具体行列；
- **[XML 格式化](/tools/xml-formatter/)** 与 **[CSS 格式化](/tools/css-formatter/)**：同一套分词思路在另外两种语法上的应用；
- **[JWT 解码](/tools/jwt-decoder/)**：解出的 header 与 payload 正是用 JSON 那条路径重新排版的。

所有工具 100% 在你的浏览器本地完成，没有任何数据会发送给外部服务器——格式化 SQL 时这一点尤其重要，生产库的表结构和查询条件不该经过第三方服务器。






