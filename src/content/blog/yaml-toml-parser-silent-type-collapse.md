---
title: 'text: | 解析成功了，答案是竖线字符'
description: 'YAML 的块标量被当字符串吐出、TOML 的 1__000 被算成 1000，两个解析器都静默通过。更糟的是 2^63 和 2^63−1 折叠成同一个错答案。逐个值打掉这些静默失败，把「猜一个值」换成「报一条精确错误」。'
pubDate: 'Sep 15 2026'
category: algorithms
topics: [algorithms, developer-tools]
searchTerms: ['YAML 解析器', 'TOML 解析器', '块标量', 'block scalar', 'TOML 下划线', '64 位整数', 'Number.isSafeInteger', '解析器设计', '报错优于猜测']
contentLang: 'zh-CN'
relatedTools: ['devtools/yaml-formatter', 'devtools/toml-formatter', 'devtools/json-formatter']
relatedPosts: ['cny-uppercase-differential-test-and-comma-misread', 'html-css-xml-formatting-is-not-sanitization', 'markdown-parser-and-katex-math']
---

`text: |` 解析成功了。答案是一个竖线字符。

YAML 里 `|` 叫块标量指示符，它的整个存在理由就是「接下来的内容**不要**当成普通字符串读」——按原样保留换行与缩进。旧解析器读到它，走完全正常的标量分支，返回字符串 `"|"`，退出码零，输出格式完美。如果这段 YAML 是文档的最后一行，那整段后续内容就凭空消失了：解析器没有报错，也没有截断提示，它只是把管道字符当答案交了回来。

TOML 那边是同一类毛病。`1__000` 被算成 `1000`，`100_` 被算成 `100`，`007` 被算成 `7`。三个都不合法，全部静默通过。TOML 规定下划线只能出现在**两位数字之间**；这半句话用正则写不出来，于是原来的实现干脆把它删掉。

更糟的是数字上界：`9223372036854775808`（2⁶³，非法 TOML）和 `9223372036854775807`（2⁶³−1，合法 TOML）被映射到同一个数——`9223372036854776000`。一个合法文件和一个非法文件收敛到同一个错答案，这不是解析器。

这篇按「两种静默」讲：先是 YAML 把整类构造降级成字符串，然后 TOML 把四类语法违规算成数，最后两层上界墙挡在同一条数字路上。每一条都有确切输入和确切输出，都是实测。

---

## 1. 两种静默：降类型 和 算错值

先说清楚「静默」指的是什么。不是抛错然后被上层吞掉，而是**返回了一个看起来合法的值**。

YAML 那一类：输入里的 `|` 本来是一个**结构标记**，输出里它变成了一个**值**。类型降级了，但整个解析链路报告成功。这类失败的可怕之处在于它是可移植的——下游拿到 `"|"` 这个字符串，会去做字符串该做的事（拼接、比较、渲染），一路都走通，到某个业务判断上才炸，而那时离真实原因已经隔了十层。

TOML 那一类：输入 `1__000` 是一个语法错误的数字字面量，输出 `1000` 是一个**正确的、但来源非法**的数。这个数本身在别的语境里完全合理，所以你没法靠「值不对」去发现它。

两者的共同点：都能被 `JSON.stringify` 干净地输出。`JSON.stringify({ text: '|' })` 给出 `{"text":"|"}`，一个字都不多。

修法不是「尽力解析」。是**拒绝**——把「猜一个值」换成「报一条错」。

---

## 2. `|` 是位置性的语法

第一处修复有个陷阱。我的第一版把检查塞进了 `parseScalar`：看到标量长得像块标量指示符，就报错。跑完立刻反例：

```
a: [|]
```

这个文件是**合法**的 YAML。`[|]` 是 flow 序列里的一个普通标量，值就是字符串 `|`。我的补丁把它的错误位置也封了，一个真能用的文件被拒。

所以这个检查必须放在**块入口**，不能放在 `parseScalar` 里：

```ts
// "|", ">", "2|", "|-", "|2-" etc. start a block scalar — but only in a
// BLOCK value position. Inside a flow collection ([|], {a: |}) the same
// token is an ordinary plain scalar, so this check belongs at the block
// entry points, not inside parseScalar.
const BLOCK_SCALAR_RE = /^[|>][-+0-9]*$/;

function assertNotBlockScalar(line: Line, tok: string): void {
	if (BLOCK_SCALAR_RE.test(tok.trim())) {
		throw new Error(
			`line ${line.lineNo}: block scalars ("|" literal and ">" folded) are not supported`,
		);
	}
}
```

块入口有三个：顶层映射的 `key: value`、序列项的 `- item`、以及嵌套映射的紧凑形式 `- key: value`。三处都要挂。漏一处，块标量就从那个入口溜进去。

实测的边界正好对得上：

```
formatYaml("text: |")        → line 1: block scalars … not supported
formatYaml("text: >")        → line 1: block scalars … not supported
formatYaml("text: |2-")      → line 1: block scalars … not supported
formatYaml("a:\n  - |")      → line 2: block scalars … not supported
formatYaml("a: [|]")         → a:
                                 - "|"
formatYaml("a: {k: |}")      → a:
                                 k: "|"
formatYaml("a: |literal|")   → a: "|literal|"
```

最后三行是「位置正确所以放行」的证据。同一枚竖线，在块值位置上被拒，在 flow 集合里被当成普通标量，带引号输出。`|literal|` 这种首尾各一个竖线、中间有别的字符的写法不匹配 `^[|>][-+0-9]*$`（正则要求竖线后面只跟裁剪指示符和缩进数字），所以它走普通标量分支——这也说明这个正则没有过宽。

顺带一提，`formatYaml` 对 `a: [|]` 的输出是块序列 `a:\n  - "|"`，不是原样的 flow 序列。这个格式化器只做 canonical 输出，不保留书写风格——这是设计，不是 bug，但值得知道：跑一遍 formatter，文件的视觉结构会变。

---

## 3. TOML 下划线：不是正则能干的事

TOML 规定下划线可以出现在两位数字之间，用来提高可读性：`1_000_000` 是 `1000000`。规矩的全文只有一句——**严格介于两位数字之间**。这句里有两个独立的约束：开头和结尾不能有下划线，且不能出现连续两个下划线。

原来的实现是「删掉再算」：

```ts
if (/^0x[0-9a-fA-F_]+$/.test(s)) return parseInt(s.replace(/_/g, ''), 16);
if (/^0o[0-7_]+$/.test(s)) return parseInt(s.slice(2).replace(/_/g, ''), 8);
if (/^0b[01_]+$/.test(s)) return parseInt(s.slice(2).replace(/_/g, ''), 2);
if (/^[+-]?[0-9][0-9_]*$/.test(s)) return parseInt(s.replace(/_/g, ''), 10);
```

这组字符类把 `_` 和数字并列，允许它出现在任何位置，出现任意多次。四条正则全过，然后 `.replace(/_/g, '')` 把违规痕迹抹掉：

```
旧代码    输入           输出
────────  ─────────────  ─────
          1__000         1000    ← 连续下划线
          100_           100     ← 尾部下划线
          0x1A_          26      ← 十六进制尾部下划线
          007            7       ← 前导零（另一条规矩）
```

四个全是非法 TOML，四个都算出一个数。

关键观察是：**这条规则不是正则能干的事**。`^[0-9]+(?:_[0-9]+)*$` 这个模式确实能表达「数字开头、下划线只夹在数字之间」，但它只能回答 yes/no，回答不了「为什么不是」。而「为什么」恰好是用户需要知道的那半：

```ts
/** Two different failures deserve two different messages: a character that may
 *  never appear here, versus a well-formed digit run with a misplaced `_`. */
function badDigitMessage(part: string, kind: 'integer' | 'float', base: number, raw: string): string {
	const shown = raw.slice(0, 30);
	if (!part) return `invalid ${kind} "${shown}" — a dot needs digits on both sides`;
	if (part.startsWith('_') || part.endsWith('_') || part.includes('__')) {
		return `invalid ${kind} "${shown}" — underscores may only separate two digits`;
	}
	const odd = [...part].find((c) => new RegExp(`[^_${DIGIT_CLASS[base]!}]`).test(c));
	if (odd !== undefined) return `invalid ${kind} "${shown}" — unexpected character "${odd}"`;
	return `invalid ${kind} "${shown}" — underscores may only separate two digits`;
}
```

两种失败分开报：`1__000` 是**格式合法的数字串、位置放错了**，`1a` 是**这个字符在这里根本不许出现**。如果两条共用一条错误文案，用户看到 `unexpected character "_"` 会去查「下划线是不是写错了」，实际该查的是「下划线放哪了」。

顺带一个反例值得记下：`_100` 走不到这里。它的首字符是 `_`，不匹配 `^[+-]?[0-9]` 那条入口正则，于是落进兜底分支，报的是 `invalid value "_100" (unquoted strings are not valid TOML — use "quotes")`。这条文案对 `_100` 是误导的——它不是「忘了加引号」，它是一串下划线开头的数字。这里我把它留了：兜底分支要覆盖真正的裸字符串（`k = hello` 就该报这条），而为了让兜底文案精确区分这两者，得先引入一个「它是不是数字字面量的拼写错误」的判断——那个判断的误报面比收益大。留一条略嫌不准的错误信息，比为一个输入写一段特判更划算。

浮点数那边下划线规则更细：整数部分和小数部分允许下划线，指数部分**不许**：

```ts
/** Check a float's integer and fractional parts (underscores allowed there). */
function assertUnderscores(mant: string, raw: string): void {
	for (const part of mant.replace(/^[+-]/, '').split('.')) {
		if (!DIGIT_RUN[10]!.test(part)) throw new Error(badDigitMessage(part, 'float', 10, raw));
	}
}

/** Exponent parts carry no underscores at all: `1e1_0` is not TOML. */
function assertNoUnderscore(exp: string, raw: string): void {
	if (exp.includes('_')) {
		throw new Error(`invalid float "${raw.slice(0, 30)}" — underscores are not allowed in an exponent`);
	}
}
```

```
x = 1_0.5_0  → 10.5
y = 1_0e+2   → 1000
z = 1_000_000_000_000 → 1000000000000
k = 1e1_0    → invalid float "1e1_0" — underscores are not allowed in an exponent
k = 1.5_     → invalid float "1.5_" — underscores may only separate two digits
k = 1.       → invalid float "1." — a dot needs digits on both sides
```

`1_0.5_0` 这种「整数部分和小数部分各带一个下划线」要**分别**校验——用一条正则横跨小数点，`1_0.5_0` 和 `1_.5_0` 会混在一起。按 `.` 切开逐段验，每段各自是一条完整的「数字串夹下划线」规则。

---

## 4. 十进制不许前导零，十六进制可以

`007` 在多数语言里是八进制写法，等于 7。TOML 明确拒绝：十进制整数不许前导零（`0x01` 合法，因为它本来就是十六进制，前导零在那里没有歧义）。旧代码 `^[+-]?[0-9][0-9_]*$` 放行 `007`，`parseInt("007", 10)` 返回 7——文件里写的是八进制的 7，TOML 读出来是十进制的 7，中间没有任何提示。

这条检查放在基数为十进制的那一支里，并且**只在 `base === 10` 时生效**：

```ts
// Base 10 only: `007` is not a TOML integer (0x01 is).
if (base === 10 && body.length > 1 && body.startsWith('0')) {
	throw new Error(`invalid integer "${raw.slice(0, 30)}" — decimal integers may not start with a zero`);
}
```

`body.length > 1` 这个条件是必要的：单独的 `0` 合法。`0` 和 `00` 的区别就是「有没有歧义」——`0` 只有一个读法，`00` 有两个。

```
k = 007   → invalid integer "007" — decimal integers may not start with a zero
k = 0     → 0
k = 0x01  → 1
```

---

## 5. 两层墙挡在同一条数字路上

这是这条数字路上最值得记的一段。TOML 整数是 64 位有符号，JS 的 `Number` 只能精确表示到 2⁵³。两个上界，一前一后，中间夹着一段「TOML 认、JS 装不下」的灰色地带。

旧代码用 `parseInt` 一把梭，两层墙都没有：

```
旧代码          9223372036854775807  (2⁶³−1，合法 TOML)  → 9223372036854776000
                9223372036854775808  (2⁶³，非法 TOML)    → 9223372036854776000
                -9223372036854775808 (−2⁶³，合法 TOML)   → -9223372036854776000
```

三个输入，一个答案。合法的和非法的撞到同一个数上，你连「文件写错了」这件事都发现不了——因为合法那个也给了这个数。

新的实现把两层墙分开，各自给各自的文案：

```ts
/**
 * Validate and convert a TOML integer literal.
 *
 * TOML integers are signed 64-bit; a JS `Number` is exact only inside 2^53, so
 * both failures used to be silent — and they collapsed onto the same answer:
 *   `9223372036854775808`  (2^63, INVALID TOML)  → 9223372036854776000
 *   `9223372036854775807`  (2^63 − 1, valid TOML) → 9223372036854776000
 * A legal file and an illegal one mapping to one wrong number is not a parser.
 */
function parseTomlInt(raw: string, base: 10 | 16 | 8 | 2): number {
	const sign = raw[0] === '+' || raw[0] === '-' ? raw[0] : '';
	const body = raw.slice(sign.length).replace(/^0[xob]/, '');
	if (!DIGIT_RUN[base]!.test(body)) throw new Error(badDigitMessage(body, 'integer', base, raw));
	if (base === 10 && body.length > 1 && body.startsWith('0')) {
		throw new Error(`invalid integer "${raw.slice(0, 30)}" — decimal integers may not start with a zero`);
	}
	// BigInt is told the radix, and the sign is kept out of the literal:
	// `0x1A` is 26, `0b101` is 5, and `BigInt("-0x10")` is a SyntaxError.
	const prefix = base === 16 ? '0x' : base === 8 ? '0o' : base === 2 ? '0b' : '';
	const mag = BigInt(prefix + body.replace(/_/g, ''));
	const negative = sign === '-';
	const value = negative ? -mag : mag;
	// The negative bound is one wider: −2^63 is a legal TOML integer.
	const maxAbs = negative ? 9223372036854775808n : 9223372036854775807n;
	if (mag > maxAbs) {
		throw new Error(`integer "${raw.slice(0, 30)}" is outside TOML's signed 64-bit range (−9223372036854775808 … 9223372036854775807)`);
	}
	const n = Number(value);
	if (!Number.isSafeInteger(n)) {
		throw new Error(
			`integer "${raw.slice(0, 30)}" is valid TOML but exceeds 2^53 − 1, the largest integer a JS number can hold exactly — quote it as a string instead`,
		);
	}
	return n;
}
```

顺序是有讲究的：**先撞 64 位墙，再撞 2⁵³ 墙**。因为 64 位是 TOML 的事（文件本身非法），2⁵³ 是 JS 的事（文件合法但我们装不下）——两条文案的性质不同，一个说「你写错了」，一个说「写对了但请改主意」。如果顺序反了，`9223372036854775808` 会先被 2⁵³ 墙拦下，报出「valid TOML but exceeds 2⁵³」——对着一份非法文件说「你写对了」。

```
    9007199254740991               → 9007199254740991   （通过）
    9007199254740992   (2⁵³)       → … exceeds 2^53 − 1 … quote it as a string instead
 9223372036854775807   (2⁶³−1)     → … exceeds 2^53 − 1 …（同上，合法但装不下）
 9223372036854775808   (2⁶³)       → … outside TOML's signed 64-bit range …
-9223372036854775808   (−2⁶³)      → … exceeds 2^53 − 1 …（合法但装不下）
-9223372036854775809               → … outside TOML's signed 64-bit range …
```

那个 `maxAbs` 的不对称值得单独说一句：负界比正界宽 1。2⁶³ 是 −2⁶³ 的绝对值，`−9223372036854775808` 是合法 TOML 整数，而 `+9223372036854775808` 不是。写 `Math.abs(value) > 9223372036854775807n` 会顺手把这个合法值拒掉——而且拒的理由会是「超 64 位范围」，一个完全正确的文件被一个错误理由杀掉。用 `mag`（未取负的绝对值）跟 `maxAbs` 比，符号单独走，这条不对称就被保住了。

---

## 6. `BigInt("-0x10")` 是个 SyntaxError

多基数转换里有一个只有真跑过才撞得到的坑。想当然的写法是 `BigInt(s)`——但 JS 的 `BigInt` 字符串构造器不认识带符号的非十进制字面量：

```
BigInt("-0x10")   → SyntaxError: Cannot convert -0x10 to a BigInt
BigInt("0x-10")   → SyntaxError
BigInt("0x10")    → 16n
BigInt("0b101")   → 5n
BigInt("0o77")    → 63n
```

不带符号的全对，带符号的全炸。所以符号必须从字面量里抠出来，单独记，最后自己乘负号。这也是 `parseTomlInt` 里 `const sign = …; const body = raw.slice(sign.length)` 这两行存在的原因——不是为了好看，是为了 `BigInt` 不吃带符号的十六进制。

顺手说一下为什么干脆用 `BigInt` 而不是 `Number`：不是精度洁癖。`Number(9223372036854775808n)` 正好等于 `9223372036854776000`，跟旧代码 `parseInt` 的错答案一模一样——`Number` 这条转换会把「精确的 64 位整数」重新揉回那个模糊的数，64 位范围检查就白做了。必须先精确地比完界，再转成 `Number` 交出去。

基数本身要正确换算，这也是实测过的：

```
a = 0x1A    → 26
b = 0b101   → 5
c = 0o77    → 63
d = 0xFF_FF → 65535
→ JSON: {"a":26,"b":5,"c":63,"d":65535}
```

---

## 7. `yes` 是一条参数，不是两个 bug

YAML 的 `yes`/`no`/`on`/`off` 在 YAML 1.1 里是布尔，在 1.2 里不是。这不是能「修好」的东西，是一个约定分歧，两个解析器同时存在。

所以它被处理成**一条参数**，而不是两处各自为政的判断：

```ts
const WEAK_BOOL_RE = /^(yes|no|on|off)$/i;
```

```ts
if (/^(true|false|null|~)$/i.test(s) || /^[-+]?[.\d]/.test(s) || (strict && WEAK_BOOL_RE.test(s)))
	return JSON.stringify(s);
```

```ts
// strict quotes yes/no/on/off; it is off for formatYaml (a formatter must not
// rewrite what the user's own YAML 1.1 readers see as a boolean) and on for
// jsonToYaml (JSON's "yes" is unambiguously a string, and only the quoted form
// keeps that meaning under a 1.1 schema).
```

两条路径，一个开关，理由写在同一个地方：

- `formatYaml` 关着 `strict`：你在格式化工具里输入的 `flag: yes`，你自己的 YAML 1.1 读取器会读成布尔。formatter 不能替你改语义，所以原样输出 `flag: yes`。
- `jsonToYaml` 开着 `strict`：JSON 的 `"yes"` 毫无疑问是字符串，只有加引号才能保住这个意思。所以输出 `a: "yes"`。

同一个词，两条路径给两种写法，理由都摆在同一个函数的 docstring 里。实测：

```
formatYaml("flag: yes")         → flag: yes
formatYaml("flag: True")        → flag: true      ← YAML 1.1 的强布尔照常规范化
formatYaml("flag: 1_0")         → flag: "1_0"     ← 下划线不是合法裸标量，自动加引号
jsonToYaml('{"a":"yes"}')       → a: "yes"
jsonToYaml('{"n":1,"s":"1_0"}') → n: 1
                                  s: "1_0"
```

这个「同一个分歧只留一个开关」的结构比结论本身更重要。要是 `yes` 的判断散在 `formatYaml` 和 `jsonToYaml` 里各写一份，将来有人决定「干脆都加引号」，得找到两处、改对两处、还得保证两处改在同一天——这种改动从来都是最后一处永远等不到。

---

## 8. emitter：保值，丢类型

反过来写（JSON → TOML）有一条更硬的限制，而且**不能装作它不存在**。

```ts
/**
 * Write a JS number so that this parser reads it back unchanged.
 *
 * Only integers inside 2^53 come out as TOML integers — those are exactly the
 * integers parseTomlInt accepts, so emitted output is always readable again.
 * A larger integer-valued number keeps its value and gives up only its type:
 * a TOML float literal, which must carry a dot or an exponent, and String()
 * supplies one only from 1e21 upward, so 2^53 needs a `.0` bolted on.
 */
function tomlNumber(v: number): string {
	if (Number.isSafeInteger(v)) return String(v);
	const s = String(v);
	return /[.eE]/.test(s) ? s : `${s}.0`;
}
```

实测：

```
输入 JSON:  {"a":9007199254740992,"b":1000000000000000000000,"c":1.5e21,"d":42,"e":0.5}

输出 TOML:  a = 9007199254740992.0
            b = 1e+21
            c = 1.5e+21
            d = 42
            e = 0.5
```

再跑一遍 `formatToml` 完全稳定；`parseToml` 回来值全对：`{"a":9007199254740992,"b":1e+21,"c":1.5e21,"d":42,"e":0.5}`。

这里有一个**不能说成「修好了精度」**的诚实边界：`JSON.parse('{"a":9007199254740992}')` 本身就已经返回 `9007199254740992` 这个被舍入过的数了——`JSON.parse` 用的是 `Number`。精度丢失发生在 emitter **之前**，emitter 从未收到过正确的数，它不可能恢复一个没到达它的值。

emitter 能做到的是另一件事，而且那一件事同样重要：**不谎报类型**。`9007199254740992` 是一个整数值的数，但如果直接写 `a = 9007199254740992`，下游的 `Number.isSafeInteger` 会判它为 false，而 TOML 类型系统会把它当成整数——类型说整数、算术说装不下，两头都对不上。写成 `a = 9007199254740992.0`，类型诚实：这是个浮点字面量，算术行为跟它一致。

`.0` 为什么必须手写：TOML 的浮点字面量**必须**带小数点或指数。`String(9007199254740992)` 给的是 `9007199254740992`，没有点；`String(1e21)` 给的是 `1e+21`，有指数。所以 2⁵³ 这个规模恰好落在「`String` 不带点」的区间里，需要手动补一个 `.0`——1e21 往上 JS 自己就用科学计数法了，不用补。这个 `/[.eE]/.test(s)` 判断就是在区分这两段。

顺带：`null` 直接拒绝，而且文案里带了解法——

```
jsonToToml('{"nullish":null}')  → TOML has no null value (drop the key instead)
```

---

## 9. 拒绝比猜测便宜

这些修复的共同形状：输入不合法 → **抛错**，不返回一个「看起来合理」的值。代价是这些文件以前「能打开」，现在打不开了。这个代价是故意的，而且我认为大多数情况下它是对的：

- 报错是**一次**失败，发生在解析的第一步，错误信息里带着行号和具体原因。
- 猜一个值可能让数据流走完整条链路，在某个业务判断上炸，那时已经没有人知道原始输入长什么样了。

两条错误文案都带行号（`line 2: block scalars …`），这一点比报错本身更重要。没有行号的解析器报错，等于让用户在两百行配置里自己找。

**这里有一个没修的局限，值得明说。** 错误信息的中英文本地化目前只覆盖括号那一段：`errToEn` / `errToZh` 是把英文错误里的圆括号内容换成中文，错误主体本身还是英文。所以上面这些 `underscores may only separate two digits` 在中文界面下是英文句子。要真正双语化，得给每条错误一个稳定键、再维护一张键到中英的表——而半数错误内插了原始输入（`invalid integer "1__000"`），没有稳定键可查。目前的状态是：错误**定位**信息（行号、被拒的 token）在两种语言下都完整，错误**描述**只有英文。这个我判断为可接受的取舍，不是遗漏。

---

## 10. 用 E2E 钉住

这类修复的回归形状很具体：**静默失败变回来**。`|` 又变成字符串，`1__000` 又算出 1000。E2E 不需要测很多正例，只需要把「必须报错的那几个」逐个钉住——一旦有人为了「方便」把检查删掉，用例立刻红。

```ts
for (const [raw, re] of [
	['k = 1__000', /underscores may only separate two digits/],
	['k = 100_',   /underscores may only separate two digits/],
	['k = 0x1A_',  /underscores may only separate two digits/],
	['k = 1e1_0',  /underscores are not allowed in an exponent/],
	['k = 007',    /decimal integers may not start with a zero/],
] as [string, RegExp][]) {
	await input.fill(raw);
	await fmt();
	await expect(output).toHaveValue('');
	await expect(err()).toContainText(re);
}
```

`as [string, RegExp][]` 这个断言不是多余的：不加它，`raw` 从元组数组里被推断成 `string | RegExp`，`astro check` 报一个 error。e2e 文件也在 `astro check` 的扫描范围内，所以类型错误会真的拦下来。

两层墙各钉一条，因为「先撞哪层」这个顺序本身是语义：

```ts
await input.fill('k = 9007199254740992');      await fmt();
await expect(err()).toContainText(/exceeds 2\^53/);
await input.fill('k = -9223372036854775808');   await fmt();
await expect(err()).toContainText(/exceeds 2\^53/);
await input.fill('k = 9223372036854775808');    await fmt();
await expect(err()).toContainText(/signed 64-bit range/);
```

注意正负各取一个：`-9223372036854775808` 撞 2⁵³ 墙（合法 TOML、JS 装不下），`9223372036854775808` 撞 64 位墙（非法 TOML）。两条断言同时存在，就保住了第 5 节那个「负界宽 1」的不对称——如果有人图省事改成 `Math.abs(value) > 2⁶³−1`，第二条会红，但更微妙的是第一条会**从 2⁵³ 变成 64 位**，那也是一次静默的语义错误：一个合法文件被一个错误理由拒掉。

YAML 那边把「必须报错」和「必须放行」钉在同一例里，因为这一对恰好是第 2 节那个「位置性」的两侧：

```ts
await input.fill('text: |');   await fmt();
await expect(output).toHaveValue('');
await expect(page.locator('.t-error')).toContainText(/block scalars/);

await input.fill('a: [|]');    await fmt();
await expect(page.locator('.t-error')).toHaveText('');   // the banner cleared
await expect(output).not.toHaveValue('');
await page.getByRole('button', { name: /YAML → JSON/ }).click();
await expect(output).toHaveValue(/"a":\s*\[\s*"\|"/);
```

`toHaveText('')` 断言错误横幅**被清空了**。这里踩过一个坑：先用 `not.toBeVisible()`，但 Playwright 对「文本被清空」的元素可能返回零尺寸从而仍判定可见，那条断言飘。改成断言文本内容为空是确定的——清空就是清空，跟几何无关。

基线是 `npx playwright test devtools finance` 37 条全绿、`npm run check` 0 errors / 0 warnings / 0 hints。

---

## 11. 这套做法能覆盖什么，覆盖不了什么

**能覆盖的**：所有「构造不合法但能被宽松实现吃下」的输入。下划线位置、前导零、`|` 在块值位置、指数里的下划线、超出 64 位的整数、超出 2⁵³ 的整数、`null` 无对应类型。共同点是**存在一条明确的拒绝理由**，能写进错误信息里。

**覆盖不了的，三条**：

1. **语义分歧**。`yes` 是不是布尔，YAML 1.1 和 1.2 各有一个答案。这不是「报精确错误」能解决的——两个答案都对。这类只能做成参数（第 7 节那条 `strict`），并且把理由写进同一个 docstring，好让将来改主意的人一次看到两边。

2. **精度丢失发生在边界之外**。第 8 节那个 `9007199254740992`：`JSON.parse` 已经舍入完了，emitter 拿到的就是错的数。它能做到的是保值、诚实报类型、可回读，做不到恢复精度。要把这条也说成「已修」，就是这篇要避免的那种失实。

3. **错误信息的本地化不完整**。第 9 节说的 `errToEn` / `errToZh` 只换括号。错误能定位、不能翻译。这是一个已知且可接受的缺口，不是遗漏——但如果哪天有人觉得「中文界面不应该出现英文句子」，需要的是给错误加稳定键，不是把英文串硬翻成中文。

最后一条是这次的收获：写解析器最容易犯的不是漏判，是**把判断写得太松，然后让它自己通过**。正则一宽，检查就退化成 no-op，而 no-op 永远不会报错。
