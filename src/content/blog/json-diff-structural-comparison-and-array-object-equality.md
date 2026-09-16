---
title: '[] 和 {} 在 JSON Diff 里是同一个东西'
description: 'jsonDiff([], {}) 返回空数组，工具显示「完全一致——两个文档结构相等。」根因是第二个分支 a && b && typeof a === "object" 不含 Array.isArray，数组与对象落在同一个按 Object.keys 逐键比的分支里，于是 [1,2,3] 与 {"0":1,"1":2,"2":3}、[[1]] 与 {"0":[1]} 也判等。同一个结构差异会产出两种路径语法：[] 与 [1,2,3] 报 $[0]，{} 与 [1,2,3] 报 $.0。逐个打掉分支判定顺序、键顺序与缩进确实不是噪音、数组按索引比让重排算两处变更、非标识符键改走 JSON.stringify 加引号、布尔与数字算变更、字典序决定报出顺序、200 条之后停止比较、值超过 80 字符截到 77 加省略号，以及 __proto__ 为什么在这个工具里没事。'
pubDate: 'Sep 20 2026'
category: engineering
topics: [developer-tools, algorithms]
searchTerms: ['JSON Diff', '结构化对比', '数组', '对象', '空数组', '空对象', '键顺序', '路径语法', 'JSONPath', '差异对比', 'json diff', '数组对象相等']
contentLang: 'zh-CN'
relatedTools: ['text/json-diff', 'devtools/json-formatter']
relatedPosts: ['json-to-typescript-and-json-schema-inference', 'xml-json-converter-lossy-roundtrip', 'csv-parser-rfc4180-quote-rules-and-injection']
---

`jsonDiff([], {})` 返回空数组。

工具显示「完全一致——两个文档结构相等。」

空数组和空对象被判定为结构相等。不是显示层的问题——差异列表里没有一条记录，`Changed`、`Added in B`、`Removed from A` 三个计数全是 0。

---

## 1. 三个分支，第一个只接两个数组

函数一共三个分支，判定顺序很重要：

```ts
if (Array.isArray(a) && Array.isArray(b)) {
    // 按索引比
} else if (a && b && typeof a === 'object' && typeof b === 'object') {
    // 按键比
} else if (a !== b) {
    out.push({ path, kind: 'changed', a: show(a), b: show(b) });
}
```

第一个分支的条件是「两个都是数组」，数组和对象混在一起就进不来。

第二个分支的条件是 `a && b && typeof a === 'object' && typeof b === 'object'`。注意这里没有 `Array.isArray`——而 `typeof [] === 'object'` 是成立的。

所以在 JavaScript 里，只要两边都是 object 类型，数组和对象就会一起掉进「按 `Object.keys` 逐键比」那个分支。

这不是笔误的偶然结果。`Object.keys([1, 2, 3])` 返回 `['0', '1', '2']`：数组在运行时就是一个键名为字符串数字的普通对象。第二个分支对数组和对象做完全相同的处理，不是巧合。

第 4 节是这个分支的直接后果。

---

## 2. 键顺序和缩进确实不是噪音

工具介绍里承诺的是这句原文：

> Paste two JSON documents. The comparison is structural (parsed trees, not text), so reordered keys and different indentation do not show up as changes.

中文是：

> 粘贴两个 JSON 文档。比较基于解析后的树而非文本，键顺序不同、缩进不同都不会被当作变更。

实测三组「肉眼看起来完全不同」的输入，都是 0 条差异：

```
A: {"enum":{"a":1,"b":2},"name":"x"}     B: {"name":"x","enum":{"b":2,"a":1}}      → 0
A: {\n  "a": 1\n}                         B: { "a": 1 }                              → 0
A: 两空格缩进、尾部多一个换行              B: tab 缩进、无尾随空白                      → 0
```

缩进在 `JSON.parse` 那一步就消失了，diff 拿到的是对象而不是字符串。键顺序则由 `.sort()` 抹平——第 8 节。

反面是文本 diff。同样这两份输入，`diff` 命令会报出整片增删行，因为键序变了每一行都对不上。工具名里带 `Structural`、描述里写 `not text`，指的就是这条分界线。

---

## 3. 数组按索引比，重排算变更

源码注释把这一点写得很直：

```ts
/** Deep structural comparison of two parsed JSON values; arrays compare by
 *  index (a reordering is a row of changes, which is honest for data files).
 *  Returns at most `cap` entries so a wildly different pair cannot produce a
 *  10k-row report. */
```

实测：

```
A: [1, 2, 3]
B: [3, 2, 1]
Changed: 2   Added in B: 0   Removed from A: 0
  $[0]   ~ changed   1  →  3
  $[2]   ~ changed   3  →  1
```

两处变更。中间那个 `2` 没动，报不出来。

这是刻意的设计：数组是有序结构，`[3, 2, 1]` 和 `[1, 2, 3]` 是两份不同的数据。CSV 导出的排序变了、分页接口的翻页顺序变了，报「没变」才是错。注释里那句 `honest for data files` 说的就是这件事。

代价是找不到「哪个元素是同一个元素」。没有主键就没有对齐，工具只能按下标硬比：

```
A: {"items":[{"id":1,"v":"a"},{"id":2,"v":"b"}]}
B: {"items":[{"id":1,"v":"a"},{"id":2,"v":"c","new":true}]}
Changed: 1   Added in B: 1   Removed from A: 0
  $.items[1].new   + added     —  →  true
  $.items[1].v     ~ changed   "b"  →  "c"
```

两条。人肉看是「第二条改了个字段、多了一个字段」，工具说出来的也是两条，对得上。

换成真的重排就露出代价：

```
A: {"items":[{"id":1,"v":"a"},{"id":2,"v":"b"}]}
B: {"items":[{"id":2,"v":"c","new":true},{"id":1,"v":"a"}]}
  $.items[0].id    ~ changed   1  →  2
  $.items[0].new   + added     —  →  true
  $.items[0].v     ~ changed   "a"  →  "c"
  $.items[1].id    ~ changed   2  →  1
  $.items[1].v     ~ changed   "b"  →  "a"
```

五条。实际语义是「第一条被改、第二条挪到后面」，工具报出五条位置级别的变更。按索引看它是正确的；想看出语义层面的移动，得自己拿 `id` 做键重新对齐。

---

## 4. `[]` 等于 `{}`

第 1 节那个第二个分支的实测后果：

```
A: []                  B: {}                      → 0 条差异
A: [1, 2, 3]           B: {"0":1,"1":2,"2":3}     → 0 条差异
A: [{"a":1}]           B: {"0":{"a":1}}            → 0 条差异
A: [[1],[2]]           B: {"0":[1],"1":[2]}        → 0 条差异
```

四组全部返回空数组，工具都显示「完全一致——两个文档结构相等。」

原因是分支进入之后做的事：`Object.keys([])` 是 `[]`，`Object.keys({})` 也是 `[]`，并集排序后还是空，循环体一次都不执行，直接 `return out`。

`[1, 2, 3]` 那组同理：`Object.keys([1,2,3])` 给出 `['0','1','2']`，对象侧的键也是 `['0','1','2']`，两边都有的键逐个递归下去，`1 === 1`、`2 === 2`、`3 === 3`，全都不进 `a !== b`。

这个行为不是 bug 也不是 feature——它精确反映了 JavaScript 里数组和对象的底层关系。`[1,2,3]` 和 `{"0":1,"1":2,"2":3}` 在属性枚举上真的是同一个东西。

真正会让人吃亏的地方在下面这组：

```
A: [1, 2, 3]                          B: {"0":1,"1":2,"2":9}     → 1 条
  $.2   ~ changed   3  →  9
```

`3` 改成了 `9`，报出来了，但路径写的是 `$.2` 而不是 `$[2]`。同一个结构差异，走哪个分支决定了路径长什么样——第 5 节。

不对称的那一侧：只要两边类型不完全对齐，比较就退化成一条整值变更。

```
A: [1, 2, 3]          B: {"0":1,"1":2,"2":3,"extra":4}   → 1 条   $.extra  + added
A: [1, 2, 3]          B: {"0":1,"1":2}                    → 1 条   $.2      − removed
A: [1, 2, 3]          B: {"1":1,"3":3}                    → 4 条   $.0 −、$.1 ~、$.2 −、$.3 +
```

键名对得上就逐键比，对不上就各自报增删。到这里它还是一致的——只是把数组当成对象在读。

---

## 5. 同一个结构差异，两种路径语法

这是从第 4 节直接长出来的第二个问题。

```
A: []      B: [1, 2, 3]        → $[0]  + added    /  $[1]  + added    /  $[2]  + added
A: {}      B: [1, 2, 3]        → $.0   + added    /  $.1   + added    /  $.2  + added
```

同一次比较（空 → 三个元素），只是 A 侧是数组还是对象，路径语法就变了：一个是 `$[0]`，一个是 `$.0`。

两种写法来自源码里两个不同的字符串模板：

```ts
// 数组分支
out.push({ path: `${path}[${i}]`, ... });

// 对象分支
const key = /^\w+$/.test(k) ? `.${k}` : `[${JSON.stringify(k)}]`;
out.push({ path: path + key, ... });
```

数组分支硬编码方括号；对象分支先用 `/^\w+$/` 判一下，是合法标识符就拼 `.name`，否则拼 `["name"]`。数字字符串 `'0'` 匹配 `\w+`，所以走点号。

这不只是排版差异。`$.0` 会被当成「对象属性 `0`」，`$[0]` 是「数组下标 0」——大多数 JSONPath 实现里这两个是同一处数据，但 `$a.0` 和 `$a[0]` 在嵌套场景下的行为并不总一致（比如 `$x.0.y` 里 `.0` 之后接 `.y`，点号链会继续按属性访问走）。

更要紧的是抄代码的时候：如果你的 diff 结果是拿去喂给一个只认 `$[...]` 的 JSONPatch 生成器，遇到对象分支报出的 `$.0` 就会生成一个错误的操作路径。

---

## 6. 类型变更也算变更

第三分支的条件只有一个：`a !== b`。JavaScript 的 `!==` 是严格比较，类型不同就不相等。

实测：

```
A: 1               B: "1"            → $           ~ changed   1  →  "1"
A: true            B: "true"         → $           ~ changed   true  →  "true"
A: false           B: 0              → $.x         ~ changed   false  →  0
A: null            B: {}             → $           ~ changed   null  →  {}
A: ""              B: {}             → $           ~ changed   ""  →  {}
A: [1, 2]          B: 1              → $           ~ changed   [1,2]  →  1
A: {"a":1}         B: null           → $           ~ changed   {"a":1}  →  null
```

源码注释就写在这一行的上面：

```ts
} else if (a !== b) {
    // type-changing or value-changing: 1 !== "1" is a change, not noise
```

`1 !== "1"` 是变更，不是噪音。

这条对配置文件的 diff 很重要。YAML 或手写 JSON 里 `"enabled": true` 和 `"enabled": "true"` 是两种东西——前者会让 `if (cfg.enabled)` 成立，后者是一个永远为真的字符串。工具报出来是对的；如果这里做了宽松比较，这种错误就永远不会出现在报告里。

顺带一条：`typeof a === 'object'` 那个分支里，`null` 因为 `typeof null === 'object'` 会走到条件里，但 `a && b` 先把 `null` 挡掉了。所以 `null` vs `{}` 落到第三分支，报一条整值变更——不是按「`null` 没有键」逐键比出来的。

---

## 7. 点号和方括号的分工

对象分支决定路径写法的那行：

```ts
const key = /^\w+$/.test(k) ? `.${k}` : `[${JSON.stringify(k)}]`;
```

`\w` 是 `[A-Za-z0-9_]`。所以：

```
键            路径
name          $.name
_x            $._x
1             $.1            ← 纯数字也走点号
a b           $["a b"]
a-b           $["a-b"]
a.b           $["a.b"]
a"b           $["a\"b"]
中文          $["中文"]
```

实测最后三行：

```
A: {"a b":2,"a-b":1,"a.b":3}    B: {"a b":9,"a-b":9,"a.b":9}
  $["a b"]   ~ changed   2  →  9
  $["a-b"]   ~ changed   1  →  9
  $["a.b"]   ~ changed   3  →  9

A: {"a\"b":1}    B: {"a\"b":2}
  $["a\"b"]   ~ changed   1  →  2

A: {"中文":1}    B: {"中文":2}
  $["中文"]   ~ changed   1  →  2
```

`JSON.stringify` 负责加引号和转义，所以路径本身永远是可解析的——不需要调用方自己再想一遍引号怎么转义。

但要注意 `$["a.b"]` 和 `$.a.b` 是不同的路径：前者是键名里带点的单个键，后者是两层嵌套。生成下游操作时要区分这两种。

---

## 8. 报出顺序是字典序，不是文档顺序

对象分支取键的那行：

```ts
const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
```

`.sort()` 无参数，按 UTF-16 码元升序。

实测：

```
A: {"z":1, "a":2, "m":3}
B: {"z":2, "a":3, "m":4}
  $.a   ~ changed   2  →  3
  $.m   ~ changed   3  →  4
  $.z   ~ changed   1  →  2
```

文档里写的顺序是 `z, a, m`，报出来的顺序是 `a, m, z`。

第 7 节那组也印证了这点：文档顺序是 `a b, a-b, a.b`，报出来是 `a b, a-b, a.b`——按码元排序，空格（0x20）在连字符（0x2D）前面，连字符在点（0x2E）前面。

对读报告的人来说这是好消息：同一份文档不管怎么重排，diff 的输出顺序是稳定的，可以拿来做 diff 的 diff。

对想「按文档顺序看变更」的人来说是约束：拿不到那个顺序，除非自己把 diff 结果按原始文档的键序重排。

---

## 9. 200 条之后不再比了

```ts
/** Returns at most `cap` entries so a wildly different pair cannot produce a
 *  10k-row report. */
function jsonDiff(a: unknown, b: unknown, path = '$', out: JsonDiff[] = [], cap = 200) {
    if (out.length >= cap) return out;
```

判定在函数入口，每层递归都过一次。对象循环里另有一处 `if (out.length >= cap) break;`，数组循环的条件里也带 `out.length < cap`——三个地方各拦一次，因为递归会回到入口，但同一次循环体内不会。

实测：

```
A 和 B 都有 200 个键，值全部不同    → 200 条
A 和 B 都有 201 个键，值全部不同    → 200 条
A 和 B 都有 205 个键，值全部不同    → 200 条
A 是 210 个数组元素的对象数组       → 200 条（$.items[0].v … $.items[199].v）
```

200 是含 200 的上限，不是 199。

输出层还多给了一句提示：

```ts
const capNote = diffs.length >= 200;
...
note: capNote ? 'Showing the first 200 differences — the documents diverge massively.' : undefined,
noteZh: capNote ? '仅显示前 200 条差异——两份文档差异过大。' : undefined,
```

注意这里的判定是 `>= 200`，和 diff 里的 `>= cap` 一致——恰好 200 条时也会显示这句。

这条上限救的是显示层：如果两份文档差了几万处，渲染一张几万行的表格比不比较更慢。但要注意它的语义——200 条之后被丢弃的差异不会被标记为「还有更多」以外的任何内容。想知道总量得自己重跑不限 cap 的版本。

---

## 10. 超过 80 字符的值会被截断

```ts
const show = (v: unknown): string => {
    const s = JSON.stringify(v);
    return s === undefined ? 'undefined' : s.length > 80 ? s.slice(0, 77) + '…' : s;
};
```

边界是 `> 80`，不是 `>= 80`。实测：

```
键值是 78 个字符的字符串   → 完整显示（JSON.stringify 后 80 字符，含两端引号）
键值是 79 个字符的字符串   → 截断到 77 字符 + '…'
```

`JSON.stringify` 会把字符串加上引号，所以 78 个字符的字符串序列化后正好是 80 字符，没超，完整显示。79 个就是 81，超了，截掉。

截断发生在 `show` 里，也就是只影响报告里那一列的显示。比较本身用的还是完整的值——一个 5000 字符的字符串字段如果两边只有一个字符不同，工具仍然报一条 `~ changed`，只是 A 和 B 两列都只有 77 个字符加省略号，看不出差别在哪。

第三个分支 `'undefined'`：`JSON.stringify(undefined)` 返回 `undefined`（不是字符串 `"undefined"`），所以 `s === undefined` 这个判断成立。

JSON 里没有 undefined，`JSON.parse` 永远造不出这个值，所以这一分支在工具的实际用法里是死的——留着是防别人拿这个函数比 JavaScript 对象。实测确实能走通：`jsonDiff({a: undefined}, {a: 1})` 报 `$.a  ~ changed  undefined  →  1`。

---

## 11. `__proto__` 为什么在这个工具里没事

同一套工具里有多处会把键名拿来当属性赋值。这里的 `jsonDiff` 也涉及键名，但它没有那个 bug。

实测：

```
A: {"__proto__":{"a":1}}    B: {"__proto__":{"a":2}}
  $.__proto__.a   ~ changed   1  →  2
```

正常报出，一条变更，路径写的是 `$.__proto__.a`。

这个坑有两条路，一条会踩，一条不会：

`JSON.parse` 用的是定义属性而不是赋值，所以 `{"__proto__":{...}}` 解析出来是一个**自身属性**，对象的原型没被改：

```
JSON.parse('{"__proto__":{"a":1}}')
  Object.keys()                     → ["__proto__"]
  hasOwnProperty("__proto__")       → true
  Object.getPrototypeOf(o)          → Object.prototype   ← 没变
  "__proto__" in o                  → true
```

对比直接赋值：

```
const q = {};
q["__proto__"] = { a: 1 };
  Object.keys(q)                    → []                 ← 没有自身属性
  Object.getPrototypeOf(q)          → { a: 1 }           ← 原型被替换
```

`__proto__` 在 `Object.prototype` 上是个 setter，赋值走 setter 去改原型；`Object.defineProperty`（也就是 `JSON.parse` 用的那条路）不触发 setter，创建的是自身属性。

`jsonDiff` 这边呢：它遍历 `Object.keys(a)`——只返回自身属性，所以能看到 `__proto__`；判断用 `k in a`——对已遍历到的自身属性必然为真；整个过程没有任何一处写 `obj[key] = value`。

三件事凑齐才没事：输入侧用 `JSON.parse` 而非字面量，遍历侧用 `Object.keys` 而非 `for...in`，写入侧压根没有写入。

顺带提醒一句：如果你在代码里手搓输入（`const a = {"__proto__": {...}}`），键在进 `jsonDiff` 之前就没了，报告是空的——那不是 diff 的问题。

---

## 12. 这套比较覆盖什么，覆盖不了什么

覆盖的：

- 任意深度的嵌套对象和数组，递归到叶子
- 键顺序、缩进、空白、尾部换行都不算差异
- 类型变更被明确标为变更（`1` vs `"1"`、`false` vs `0`、`null` vs `{}`）
- 路径生成可解析：非标识符键自动加引号并转义
- 报出顺序稳定（字典序），同一份文档重排后 diff 输出不变
- 上限 200 条，且到上限时会显示提示
- 长值截断显示，但比较用的是完整值
- `__proto__` 这类特殊键名能正常比较

覆盖不了的：

- **数组和对象会互相判等**。第 4 节那四组都是 0 条差异。判断依据是 `typeof === 'object'` 而非 `Array.isArray`，所以 `[] ≡ {}`、`[1,2,3] ≡ {"0":1,"1":2,"2":3}`、`[[1]] ≡ {"0":[1]}`。如果你的数据校验要求「这里必须是数组」，这个 diff 帮不了你——它把两种类型当成同一种在比。
- **同一个结构差异有两种路径写法**。数组分支给 `$[0]`，对象分支给 `$.0`。喂给只认一种写法的下游（JSONPatch 生成器、JSONPath 求值器）之前要先归一化。
- **数组元素没有身份**。按下标硬比，重排会报出一片位置级别的变更，看不出「哪条挪到了哪条后面」。想要语义级别的移动检测，得自己拿主键做键重新对齐。
- **200 条之后没有总量**。被丢弃的差异只剩一句「差异过大」，想知道真实规模得去掉 cap 重跑。
- **超过 80 字符的值看不出差别在哪**。两边各显示前 77 字符加省略号；一个字符不同的大字段，报告里看不出改在哪。
- **不是 JSON Patch**。输出是「路径 + 类型 + 两侧值」的报告，不是一串可回放的 `add`/`remove`/`replace` 操作。
- **不理解 schema**。`1` 和 `1.0` 会被判为变更（`!==`），即便你的 schema 里两者都是同一个 number；反过来 `1` 和 `"1"` 被判为变更，即便你的 schema 里两者都是 string。类型判断用的是 JavaScript 的值类型，不是声明的类型。
- **不是模糊比较**。没有阈值、没有容差，浮点数也没有特殊处理：`0.1 + 0.2` 的结果和字面量 `0.3` 在这里就是两个不同的值，会报一条变更。

两条实用建议。第一，拿这个 diff 的结果去做自动化修复之前，先按第 5 节把 `$.0` 和 `$[0]` 归一成同一种写法。第二，如果两份文档的类型结构可能不一致（数组换成了对象、字段从数字变成了字符串），先看第 4 节和第 6 节那两组输出再决定要不要用它的结论——`0 条差异` 在这个工具里不等于「两份文档类型也对得上」。
