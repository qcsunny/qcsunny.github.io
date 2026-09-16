---
title: '"a": 1 推断成了 integer，下一条 1.5 过不了校验'
description: '单样本推断出的契约看似权威，其实是快照。integer 会拒掉 1.5、required 会声称可选字段必填、[] 会同时"什么都不承诺"和"承诺一切"，而一次数组合并曾造出 Item2 这样一个不存在的类型名。逐个打掉这四种假精确，全部用实测输入输出说话。'
pubDate: 'Sep 17 2026'
category: engineering
topics: [developer-tools, algorithms]
searchTerms: ['JSON 推断 TypeScript', 'JSON Schema 推断', 'schema inference', 'integer 与 number', 'required 交集', 'unknown[]', '空数组推断', 'TypeScript 类型生成', 'JSON Pointer', 'anyOf 合并']
contentLang: 'zh-CN'
relatedTools: ['devtools/json-to-typescript', 'devtools/json-schema', 'devtools/json-formatter', 'text/json-diff']
relatedPosts: ['yaml-toml-parser-silent-type-collapse', 'text-diff-lcs-dynamic-programming-and-similarity', 'markdown-parser-and-katex-math']
---

`{ "a": 1 }` 推断出的契约是 `"a": integer`。

第二条数据是 `{ "a": 1.5 }`。校验失败。

推断器没有报错，也没有说"这只是基于一个样本"。它给出的是一份带 `type`、带 `properties`、带 `required` 的完整 JSON Schema，格式规范、缩进整齐、看起来像一个承诺。它承诺的内容恰好覆盖了它见过的唯一一条数据，然后在那条数据的下一个小数位上失效。

同一条推断路径上有四种这种假精确：类型收窄、必填声称、空数组两端失效、以及一次合并造出不存在的类型名。前三种是推断这件事本身的结构问题——单样本无法证明"总是如此"——最后一种是实现 bug，已经修掉了，但有准确的修复前后对照。

这篇按顺序讲这四种，每一条都给出确切输入和实测输出。

---

## 1. 推断的是快照，不是契约

先看推断器对 `{ "a": 1 }` 给出什么。

```json
{ "type": "object", "properties": { "a": { "type": "integer" } }, "required": [ "a" ] }
```

`properties` 部分没错：`a` 确实是个整数。错的是这份契约被当成了**承诺**而不是**观测**。

`inferSchema` 的核心是一个逐类型的分支：

```ts
function inferSchema(v: unknown, depth = 0): Schema {
	if (depth > MAX_DEPTH) throw new Error(`the document is nested more than ${MAX_DEPTH} levels deep`);
	if (v === null) return { type: 'null' };
	if (typeof v === 'boolean') return { type: 'boolean' };
	if (typeof v === 'number') return { type: Number.isInteger(v) ? 'integer' : 'number' };
	if (typeof v === 'string') return { type: 'string' };
	if (Array.isArray(v)) {
		if (!v.length) return { type: 'array' };
		return { type: 'array', items: v.map((x) => inferSchema(x, depth + 1)).reduce((a, b) => mergeSchemas(a, b, depth + 1)) };
	}
	const properties: Record<string, unknown> = {};
	for (const key of Object.keys(v as object).sort()) properties[key] = inferSchema((v as Record<string, unknown>)[key], depth + 1);
	return { type: 'object', properties, required: Object.keys(properties) };
}
```

最后两行就是问题所在。`required: Object.keys(properties)`——**每一个见过的键都被标成必填**。而单样本能证明的唯一一件事是"这条数据里它出现了"。

一个字段真正可选，唯一的证据是"有的数据里它没出现"。一条数据里不可能出现这种证据，所以单样本推断永远不会生成可选字段。它只能声称必填。

这不是推断器的疏忽，是信息量决定的上界。修法不是假装能推断可选性，而是**接受收窄的代价并让它可见**：同一批数组里出现多个元素时，可选性才浮出来。第 4 节讲这个例外。

---

## 2. `integer` 还是 `number`：`Number.isInteger` 和 `1.0`

同一份 `{ "a": 1 }`，如果写成 `{ "a": 1.0 }` 会怎样？

```json
{ "type": "object", "properties": { "a": { "type": "integer" } }, "required": [ "a" ] }
```

完全一样。这不是偷懒：在 JavaScript 里 `1.0 === 1`，`Number.isInteger(1.0)` 就是 `Number.isInteger(1)`，而 `JSON.stringify(1.0)` 输出 `"1"`——语言层面就没有区分这个信息。推断器拿到的是同一个值。

JSON Schema 的语义也是这样定义的：`integer` 匹配 `1.0`，因为 JSON 数字是实数，`1.0` 在数学上就是整数。所以这里的"integer"不是"不带小数点"，而是"**没有非零小数部分**"。把这两者混为一谈，会写出一条永远匹配不到东西的校验。

实测确认了这个边界：

| 输入 | 推断结果 |
| --- | --- |
| `{ "a": 1 }` | `{ "type": "integer" }` |
| `{ "a": 1.5 }` | `{ "type": "number" }` |
| `[ 1, 1.5, 2 ]` | `{ "type": "array", "items": { "type": "number" } }` |

第三行值得注意：三个元素，一个整数、一个浮点、一个整数，合并结果不是 `anyOf`，而是单纯的 `number`。

这来自 `typeMatches` 里一条刻意不对称的规则：

```ts
actual === t || (t === 'number' && actual === 'integer') || (t === 'object' && actual === 'object' && v !== null && !Array.isArray(v))
```

`number` 接受 `integer`，`integer` 不接受 `number`。按 JSON Schema 的定义，`integer` 是 `number` 的子集，所以 `anyOf: [integer, number]` 永远等价于 `number`——保留前者只是噪声。反方向就不成立：`integer` 拒掉 `1.5`，所以 `{ "type": "integer", "type": "number" }` 不能压成一个。

同一条规则在 object 那一侧的措辞更啰嗦，因为它要把两个东西分开：`null` 和数组。`typeof null === 'object'`，所以判 object 必须显式排除 `null`；数组在 JS 里也是 object，必须再排除一次。这两句不写，`{ "a": null }` 会被推成 object，`[ 1, 2 ]` 会被推成 object。

推断器对这两种输入给出的答案是：

```json
{ "type": "object", "properties": { "a": { "type": "null" } }, "required": [ "a" ] }
```

`"type": "null"` 是 JSON Schema 里真实存在的类型，不是笔误。它匹配而且只匹配 `null`。

---

## 3. 合并规则：能吸收的合并，不能吸收的 `anyOf`

`mergeSchemas` 把两份 schema 合成一份，规则只有一条：**能吸收就吸收，不能吸收就 `anyOf`**。

| 合并 | 结果 |
| --- | --- |
| `integer` + `number` | `{ "type": "number" }` |
| `integer` + `string` | `{ "anyOf": [ { "type": "integer" }, { "type": "string" } ] }` |
| `{}` + `integer` | `{ "type": "integer" }` |
| `object{a,b}` + `object{a,c}` | 见第 4 节 |

第三行看起来无聊，但它决定了一个具体行为。推断数组时，`items` 是用 `reduce` 把每个元素的 schema 依次合起来的：

```ts
items: v.map((x) => inferSchema(x, depth + 1)).reduce((a, b) => mergeSchemas(a, b, depth + 1))
```

`reduce` 没有初始值，所以第一个元素会先跟"不存在的东西"合并。`mergeSchemas` 必须把空 schema 当恒等元处理——`integer` 跟空合并还是 `integer`——否则第一个元素会撞上"object 跟 integer"这种没法合并的分支。实测 `{}` + `integer` 返回 `integer`，正是这条恒等。

至于为什么 `integer` + `number` 能吸收而 `integer` + `string` 不能，答案就是第 2 节那句不对称：`number` 是超集，`string` 和 `integer` 没有包含关系，只能并列。

这里有个容易踩的推广错误。`integer` 与 `number` 可吸收，不代表"越宽的类型总该赢"。`{ "type": "array" }` 和 `{ "type": "object" }` 谁也不吸收谁，`{ "type": "null" }` 跟任何类型都没有包含关系。能吸收的只有 `number`⊇`integer` 这一对，以及 object/object、array/array 的递归合并。

---

## 4. 对象的 `required` 是交集，`properties` 是并集

对象跟对象合并时，两个字段走两条完全不同的规则。

输入两个元素：

```json
[ { "a": 1, "b": 2 }, { "a": 3 } ]
```

推断结果：

```json
{ "type": "object", "properties": { "a": { "type": "integer" }, "b": { "type": "integer" } }, "required": [ "a" ] }
```

`properties` 是**并集**——`a` 和 `b` 都在。`required` 是**交集**——只剩 `a`，`b` 被移出。

对应的实现是一行 `filter`：

```ts
required: reqA.filter((k) => reqB.has(k))
```

这是推断器里唯一一处**合并会丢信息**的地方，而且是故意的。`required` 只能越合并越窄：一旦某个元素里缺少 `b`，"b 必填"这个声称就再也站不住了，所以必须立刻撤掉。反方向——从"不要求"变成"要求"——需要的是所有见过的样本都出现它，而这要求 `required` 越合并越宽，与第一条矛盾。

两个方向不能同时满足，所以选窄的那一边。这也是 TypeScript 侧写出来的样子：

```ts
export type Root = Item[];

export interface Item {
	id: number;
	t: string;
	extra?: number;
}
```

输入是 `[{ "id": 1, "t": "a" }, { "id": 2, "t": "b", "extra": 3 }]`。`extra` 只出现在第二个元素里，于是带上了 `?`。这是整篇里**唯一**能生成可选字段的输入形状——同批数组里的多个元素。单样本永远做不到，无论推断器写得多聪明。

---

## 5. 根节点：数组、`null`、字符串

根节点是特殊位置。子节点的类型由 `typeOf` 决定，而根节点还要决定"这份类型该叫什么"，以及它是不是接口。

早期实现在这里出过两个静默错误：根是数组时走不进任何分支，根是 `null` 时被打成一个空接口。两个都是"没报错，输出了一份看起来合法的、错的 TypeScript"。

现在的分支是：

```ts
if (Array.isArray(data)) {
	if (data.length && data.every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
		const itemName = mergedTypeOfArray(data as Record<string, unknown>[], 'Item', namer, out);
		out.push(`export type ${usedRoot} = ${itemName}[];`);
	} else {
		out.push(`export type ${usedRoot} = ${typeOf(data, 'Item', namer, out)};`);
	}
} else if (data && typeof data === 'object') {
	emitInterface(data as Record<string, unknown>, usedRoot, namer, out);
} else if (data === null) {
	out.push(`export type ${usedRoot} = null;`);
} else {
	out.push(`export type ${usedRoot} = ${typeof data};`);
}
```

八个根节点输入的实测输出：

| JSON 根 | 生成的类型 |
| --- | --- |
| `[ 1, 2, 3 ]` | `export type Root = number[];` |
| `[ [ 1 ], [ 2 ] ]` | `export type Root = number[][];` |
| `null` | `export type Root = null;` |
| `"hi"` | `export type Root = string;` |
| `42` | `export type Root = number;` |
| `true` | `export type Root = boolean;` |
| `[ { "id": 1, "t": "a" } ]` | `export type Root = Item[];` + `export interface Item { id: number; t: string; }` |
| `[ 1, "two", { "three": 3 } ]` | `export type Root = (number \| string \| Item)[];` + `export interface Item { three: number; }` |

第一列的第六行——对象数组根——走了上面的 `data.every(...)` 分支，为元素单独造一个接口名，根只是它的数组。这跟第 4 节那段输出是同一件事：元素类型合并出来的 `Item`，根类型只做引用。

最后一行是混合数组根。三个元素三种类型，元素类型用联合起来，`Item` 是那个对象元素单独生成的接口名。

注意 `null` 分支里 `data && typeof data === 'object'` 这个前置判断：`null` 会通不过 `data &&`，所以必须单独接住。这个模式在第 2 节已经出现过一次——JavaScript 里 `null` 的 `typeof` 是 `object`，而空值判断又是真的。同一个坑在不同层级出现两次，两处都得拦。

---

## 6. `Item2`：为了一次合并造出一个不存在的类型名

对象数组根在修好之前还有一个更隐蔽的错误。

根类型名 `Root` 在开始之前就预占了。然后推断元素类型时，"合并一个对象数组"需要为元素接口申请一个名字，而申请的名字跟被占用的 `Root` 冲突，于是命名器退而求其次给了 `Item2`。最终生成的代码是：

```ts
export type Root = Item[];
export interface Item2 {
	id: number;
	t: string;
	extra?: number;
}
```

根引用 `Item`，接口叫 `Item2`。两个名字对不上。这段 TypeScript 会编译失败——但失败点离原因隔得很远，报的是"`Item` 未定义"，而真正的问题是命名器在给合并产物申请名字时撞上了预占位。

修法是让**合并自己认领名字**：合并产物直接拿到 `Item`，而不是被分配到一个让开的别名。同一个输入现在生成：

```ts
export type Root = Item[];

export interface Item {
	id: number;
	t: string;
	extra?: number;
}
```

顺带一提，接口是自底向上打出来的——先 emit 最深的子接口，最后 `out.reverse()`。所以阅读顺序跟声明顺序相反，这是刻意的：先声明被依赖的类型，TypeScript 里前向引用不需要 `type` 的宽松，但读起来顺序对了，报错也好定位。

这类 bug 值得单独讲一句，因为它属于"输出看起来完全合法"的失败。`Item2` 不是截断、不是乱码、不是空文件——它是一份结构完整、缩进正确、只有名字对不上的 TypeScript。如果生成结果直接交给下游编译，报错会指到 `Root = Item[]` 那一行，让人去查根类型的写法，而不是查命名器。

---

## 7. 空数组：同一个盲区，两个方向相反的假精确

`[]` 是推断的结构性盲区，因为它在 JSON Schema 和 TypeScript 两侧给出的答案方向完全相反。

实测：

| 输入 | TypeScript | JSON Schema |
| --- | --- | --- |
| `[ ]` | `export type Root = unknown[];` | `{ "type": "array" }`（无 `items`） |
| `[ 1, 2 ]` | `export type Root = number[];` | `{ "type": "array", "items": { "type": "integer" } }` |

TypeScript 侧是 `unknown[]`——**诚实地没用**。它确实能装任何数组，但装进去什么都读不出来：`x[0].id` 会直接报 `Object is of type 'unknown'`。你不得不先断言或收窄，而断言就是把类型系统关掉。

JSON Schema 侧是 `{ "type": "array" }` 且没有 `items`——**诚实地太宽**。没有 `items` 约束意味着接受任何元素类型，包括 `[ 1, 2 ]`、`[ "a" ]`、`[ { "x": 1 } ]`，它们全都通过校验。

同一个信息缺失——"这个数组里没有一个元素"——在两侧各产生一种假精确：一侧收窄到不可用，一侧放宽到无约束。这不是两个 bug，是同一件事的两面：样本为空时，"什么都不承诺"和"承诺一切"是同一句话。

两边的实现都能直接看到这一点：

```ts
if (Array.isArray(v)) {
	if (!v.length) return { type: 'array' };
	...
}
```

```ts
if (Array.isArray(v)) {
	if (!v.length) return 'unknown[]';
	...
}
```

两个分支都是三行，都直接返回，都跳过合并。没有捷径——合并需要一个元素作为起点，一个都没有时能做的只有承认。

这也解释了为什么空数组不该被"优化"掉。换成 `never[]` 会更严格，但那样一条真实数据也过不了；换成 `any[]` 会更宽，但那就是在承诺一切。`unknown[]` 和 `{ "type": "array" }` 分别是各自语言里"我不知道"的正确写法。

---

## 8. 非标识符键：`JSON.stringify` 而不是拼接

JSON 的键可以是任意字符串，TypeScript 的属性名只能是标识符或者被引号包住。`{ "a-b": 1 }` 里的 `a-b` 既不是合法标识符，也不能裸写。

实测：

```json
{ "a-b": 1, "a.b": 2, "ok": 3 }
```

```ts
export interface Root {
	"a-b": number;
	"a.b": number;
	ok: number;
}
```

`a-b` 和 `a.b` 各自带上了引号，`ok` 没带。判断依据是一行正则：

```ts
/^[A-Za-z_$][A-Za-z0-9_$]*$/
```

不匹配就走 `JSON.stringify(key)`。为什么不能拼：TypeScript 里 `a-b: number` 是**减法表达式**，`a.b: number` 是**属性访问**。只有带引号才是键名。而 `JSON.stringify` 比手拼引号安全——它同时处理引号转义、Unicode 转义和非法字符，手写的那版迟早漏掉一个。

---

## 9. `in` 会走原型链，`constructor` 在每一个对象上都算"存在"

推断器有一处本地手写的 `hasOwn`：

```ts
const hasOwn = (obj: Record<unknown, unknown>, key: string): boolean => Object.prototype.hasOwnProperty.call(obj, key);
```

注释写的是原因：`in` 运算符会走原型链，所以 `'constructor'` 会在每一个对象上算作"存在"。

这不是理论上的担心。`{ "a": 1 } in` 检查 `"constructor"` 返回 `true`——它来自 `Object.prototype`。如果推断器用 `in` 判断键是否属于当前对象，那么每一个对象都会多出一个 `constructor` 属性，类型描述里会出现一条没人想过的字段。

顺带说明为什么不用 `Object.hasOwn`：它是 ES2022，不在这个项目支持的浏览器目标里。手写这五行比加一条 polyfill 便宜，也比多一个依赖便宜。

这类"语言内建的看起来对其实是错的"是最容易被当成风格问题忽略的一类。`Object.keys` 不会走原型链，`Object.entries` 也不会，所以大部分代码没事；但一旦你手写在对象上做成员判断，`in` 就是那条走错的路。

---

## 10. `uniqueItems` 与 `enum`：顺序无关的两种实现

JSON Schema 里有两处必须**顺序无关**地比较对象：`enum` 是集合，`uniqueItems` 也是集合。`{ "a": 1, "b": 2 }` 和 `{ "b": 2, "a": 1 }` 是同一个值。

实测把这件事说得很清楚：

```
deepEqual({"a":1,"b":2}, {"b":2,"a":1})        => true
JSON.stringify 字符串相等                        => false
canonical 之后字符串相等                          => true
```

`JSON.stringify` 的答案是 `false`——按键序序列化，两个对象的字符串不同。直接用 `JSON.stringify` 做集合判等，会报告两个相等的对象不相等，`uniqueItems` 因此失效。

推断器给了两种工具应对两种场景：`enum` 用 `deepEqual`（递归比较，键序无关），`uniqueItems` 用 `canonical()`（把对象键排序后序列化，变成可哈希的字符串）。前者是语义上的相等，后者是工程上便宜的可比性。

这个区分值得记住：集合判等需要的是语义相等，而语义相等在对象上意味着先排序。任何"直接序列化再比字符串"的写法，在键序不同的两个等价对象之间都会给出错答案。

---

## 11. 两条墙：`MAX_DEPTH` 与 `MAX_REF_DEPTH`

推断和校验都靠递归，所以必须有深度上限。

```ts
const MAX_DEPTH = 1000;
const MAX_REF_DEPTH = 64;
```

`MAX_DEPTH` 管文档本身的嵌套，超了直接抛 `the document is nested more than 1000 levels deep`——**报错**而不是继续推。这条规则跟这篇开头那个静默失败是同一个修法：宁可拒绝，不要猜。

`MAX_REF_DEPTH` 管 `$ref` 的解析深度。JSON Schema 允许 `$ref` 互相引用，写错了会形成环。64 层是个明显的"这不是正常 schema"信号，到那层就停。

另外两条防御性的选择：

`patternRe` 把 `new RegExp(pattern)` 包在 `try/catch` 里，正则非法时返回 `null`，而不是让一次校验整体崩掉。`pattern` 是 schema 作者写进去的字符串，一条写错的正则不该让整份 schema 作废。

`resolveRef` 只跟 `"#"` 和 `"#/…"` 开头的 JSON Pointer，解码 `~1` → `/` 和 `~0` → `~`。外部引用（`file.json`、`https://…`）是**报告**出来，而不是当成通过——因为校验器拿不到那个文件，把它当通过就是在假装校验过。

最后这条值得单独点一下。"取不到所以放行"是最常见的静默失败来源之一：它让报告永远全绿，代价是覆盖率悄悄归零。报告出来，哪怕只有一行日志，读者才知道哪些分支根本没被覆盖。

---

## 12. 覆盖什么，覆盖不了什么

这套推断能覆盖的：标量四型（`string` / `number` 区分 `integer` / `boolean` / `null`）、数组元素合并、对象属性并集与必填交集、`$ref` 到同文档 JSON Pointer、`enum` 与 `uniqueItems` 的顺序无关比较、深度与环的硬上限。

覆盖不了的，都不是 bug，是信息量决定的：

**可选性**只能从同批数组的多个元素里推断出来，单样本给不出任何证据。要拿到可选性，得喂一个数组。

**空数组**在 TypeScript 侧收窄到 `unknown[]`（读不出来），在 JSON Schema 侧放宽到无 `items`（什么都过）。这是同一个盲区两面。

**类型收窄**是单样本的默认代价。`{ "a": 1 }` 给出 `integer`，拒掉 `1.5`。要让契约宽一点，得再喂一条 `1.5`，或者手动改。

**外部 `$ref`** 只报告不解析。拿不到的文件不会被当成通过，代价是那一支的校验没有发生。

推断器的正确用法是把它当**草稿**：它给出一个能编译、能通过格式检查、覆盖了你见过的数据的契约，然后你去改。它不该被当成"这份数据的完整约束"——它只是这份数据的完整观测。

这两句话不是一回事。观测是对的，契约是假的。
