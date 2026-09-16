---
title: '42 和 422 在状态码查询里是同一个东西'
description: '查询 42，统计栏写「匹配的状态码: 4」，逐行查询打印「42 → 422 Unprocessable Content」，输入列写 42、输出列写 422，中间没有任何标记。逐层拆开这个匹配器：三位精确、任意位数前缀、六个字段拼接后的整串 includes；前缀查询被静默改写成数组里第一条；关键词 a 命中 42 条但只显示前 8 条，多出来的 34 条没有提示；42 条记录只有 8 个字段，没有方法字段，而 RFC 9110 的幂等与安全是方法的属性、不是状态码的属性；可重试性散落在 meaning 里、而且关键词 retry 只能查回 429 一条；416 和 407 各自缺一个配对码；302 被历史上滥用出四个亲戚；错误文案说试试 100–599，但 0、999、600 都会被接受，只是返回 0 条。'
pubDate: 'Sep 22 2026'
category: engineering
topics: [web-platform, developer-tools]
searchTerms: ['HTTP 状态码', 'HTTP 错误码', '幂等', '重试', '429', '304', '206', '302 303 307 308', '状态码查询', 'http status', 'idempotent', 'retry after']
contentLang: 'zh-CN'
relatedTools: ['devtools/http-status-lookup']
relatedPosts: ['unix-timestamp-timezone-dst-and-leap-seconds', 'json-diff-structural-comparison-and-array-object-equality', 'csv-parser-rfc4180-quote-rules-and-injection']
---

查询 `42`。

统计栏写「匹配的状态码: 4」。

逐行查询那一列打印 `42 → 422 Unprocessable Content / 内容无法处理`。

输入列写的是 `42`，输出列写的是 `422`，两列并排显示，中间没有任何标记说明这是前缀改写。`42` 在 HTTP 里不存在——它只是一个两字符前缀，工具把它扩展成四位数最接近的那个码，然后当作精确查询的结果返回。

---

## 1. 三层匹配，第二层是前缀

```ts
/** Match status codes by number or keyword across name/meaning/cause. */
function matchStatuses(text: string) {
	const q = text.trim().toLowerCase();
	if (!q) return [];
	if (/^\d{3}$/.test(q)) return HTTP_STATUSES.filter((e) => String(e.code) === q);
	if (/^\d+$/.test(q)) return HTTP_STATUSES.filter((e) => String(e.code).startsWith(q));
	const hits = HTTP_STATUSES.filter((e) => `${e.name} ${e.nameZh} ${e.meaning} ${e.meaningZh} ${e.cause} ${e.causeZh}`.toLowerCase().includes(q));
	return hits;
}
```

三层，按顺序判断：

| 层 | 判定 | 行为 |
|---|---|---|
| 1 | `^\d{3}$` | 三位数字精确匹配 |
| 2 | `^\d+$` | 任意位数前缀匹配 |
| 3 | 都不是 | 六个字段拼成一串，`includes` |

第二层的 `\d+` 是**任意位数**。不是「两三位」。实测：

```
输入    匹配条数    匹配的码
4       20         400 401 402 403 404 405 406 408 409 410 412 413 415 418 422 425 428 429 431 451
42      4          422 425 428 429
1       3          100 101 103
10      3          100 101 103
3       6          301 302 303 304 307 308
30      6          301 302 303 304 307 308
100     1          100
103     1          103
302     1          302
303     1          303
206     1          206
428     1          428
```

`42` 与 `4` 差一位，`42` 命中的 4 条是 `4` 命中的 20 条的子集。前缀越短，命中越多。

前导零不参与匹配，因为它不是「三位数字」也不是「纯数字前缀」的常规形态——`004` 会走第二层，`040` 会命中 404。真正的边界在第 11 节。

---

## 2. 逐行查询把前缀静默改写成第一条匹配

批量模式（逐行查询）的判定：

```ts
runBatch(t, (line) => {
	const found = matchStatuses(line);
	if (!found.length) return null;
	const exact = found.find((e) => e.code === Number(line.trim()));
	const e = exact ?? found[0]!;
	return `${e.code} ${e.name} / ${e.nameZh}`;
}),
```

`exact` 用 `e.code === Number(line.trim())` 严格相等。查不到精确码时落到 `found[0]!`——匹配数组里第一条，也就是数字最小的那个。

实测，九行输入：

```
42  → 422 Unprocessable Content / 内容无法处理
4   → 400 Bad Request / 错误请求
10  → 100 Continue / 继续
30  → 301 Moved Permanently / 永久重定向
407 → ✗
416 → ✗
302 → 302 Found / 临时重定向
429 → 429 Too Many Requests / 请求过多
999 → ✗
```

四行被改写：`42 → 422`、`4 → 400`、`10 → 100`、`30 → 301`。四行精确命中：`302`、`429` 加上被改写的 `100` 之外。三行空：`407`、`416`、`999`。

输出格式是 `${line} → ${r}`：输入列原样保留，输出列是改写后的结果。所以改写对读者是**可见的**——`42` 和 `422` 并排摆着，一眼能看出来。但没有标记、没有警告、没有「这是前缀补全」的提示。`runBatch` 对不匹配的行给 `${line} → ✗`，对改写的行不给任何区别。

`exact` 的判断用 `Number(line.trim())`，所以 `42 ` 和 `42` 等价，而 `042` 会得到 `42`（`Number('042')` 是十进制 42），仍然查不到精确码，落到 `found[0]`。

---

## 3. 关键词命中的宽度没有下限

第三层是整串 `includes`：把 `name`、`nameZh`、`meaning`、`meaningZh`、`cause`、`causeZh` 六个字段拼成一串，大小写归一后做子串包含。没有分词，没有词边界，没有最小长度。

实测：

```
关键词            命中条数    显示的条数
a                 42         8
the               40         8
request           18         8
server            17         8
not               14         8
content           7          7（未截断）
method            6          6
error             2          2
redirect          4          4
timeout           2          2
teapot            1          1
etag              1          1
range             1          1
retry             1          1
限流              2          2
超时              2          2
重定向            5          5
内容过大          1          1
request header    1          1
```

`a` 命中 42 条——全部记录。`the` 命中 40 条，只差两条。这是因为 `meaning` 和 `cause` 字段里塞了自然语言散文，`a` 和 `the` 出现在几乎所有句子里。

两个多词查询的行为值得单独看：

```
not found            → 1 条    404 Not Found        命中 name
404 not found        → 0 条
proxy authentication → 0 条
```

`not found` 命中是因为 404 的 `name` 字段就是 `Not Found`。加上 `404 ` 前缀就一条也没有——因为第三层是整串 `includes`，查询串必须**完整出现**在拼出来的长串里，而长串里没有 `404 Not Found` 这个连续子串（`code` 字段根本没参与拼接）。

`proxy authentication` 同理：401 的 `meaning` 里有 `WWW-Authenticate`，但没有 `proxy authentication` 这个连续子串，所以查不到。想查 407 只能查 `407`——而 `407` 在参考表里不存在，见第 8 节。

关键词搜索没有分词，是刻意的。分词会带来歧义（`content type` 是 `content-type` 还是两个词），整串匹配至少是可预测的。代价是想查「代理认证」类问题就得知道那个字段的精确措辞。

---

## 4. 统计栏报命中数，正文只显示前 8 条

```ts
stats: (text: string) => [
	{ label: 'Matching codes', labelZh: '匹配的状态码', value: String(matchStatuses(text).length) },
	{ label: 'Codes in reference', labelZh: '收录状态码', value: String(HTTP_STATUSES.length) },
],
```

统计栏报的是 `matchStatuses(text).length`，真实命中数。正文那边：

```ts
const blocks = found.slice(0, 8).map(...);
```

`slice(0, 8)` 硬编码截断，没有对应的提示文案。

对照 `json-diff` 的做法：那份工具截断到 200 条时会加一行 `Showing the first 200 differences — the documents diverge massively.`。这里的 8 条截断**没有**这句话。

实测落差：

```
关键词   命中   显示   没显示的
a        42     8      34
the      40     8      32
request  18     8      10
server   17     8      9
not      14     8      6
```

读界面的人看到的流程是：统计栏写「匹配的状态码: 42」，下面正文列出 8 条，然后没有下文。多出来的 34 条不会告诉你它们存在，也不会告诉你为什么被丢掉——除非自己去数一遍 42 减 8。

`content` 那条 7 条全显示，是巧合（7 < 8），不是规则。

前 8 条是**参考表里的顺序**，也就是数字升序。`a` 命中的 42 条里，前 8 条是 `100 101 103 200 201 202 204 206`——`451` 那一条永远不会显示出来，除非缩小查询范围。

---

## 5. 42 条记录，8 个字段，没有方法字段

```ts
export interface StatusEntry {
	code: number;
	category: '1xx' | '2xx' | '3xx' | '4xx' | '5xx';
	name: string;
	nameZh: string;
	meaning: string;
	meaningZh: string;
	cause: string;
	causeZh: string;
}
```

八个字段，其中六个拼进第 1 节的匹配串。分布：

| 类别 | 条数 | 码 |
|---|---|---|
| 1xx | 3 | 100 101 103 |
| 2xx | 5 | 200 201 202 204 206 |
| 3xx | 6 | 301 302 303 304 307 308 |
| 4xx | 20 | 400 401 402 403 404 405 406 408 409 410 412 413 415 418 422 425 428 429 431 451 |
| 5xx | 8 | 500 501 502 503 504 505 507 511 |

没有 `method` 字段，没有 `idempotent` 布尔，没有 `retryable` 布尔。第 6 节说这为什么是关键缺口。

对照 IANA 注册表，参考表缺 **23 个**已注册的码：

```
102  203  205  207  208  226
300  305  306
407  411  414  416  417  420  421  423  424  426  499
506  508  510
```

`520` 到 `599` 这 80 个厂商段一个都没有。Cloudflare 的 `520`/`521`/`522`/`524`、AWS ALB 的 `502`（这个收了）之外的变体，查不到。运维场景里最常被贴进问题描述的那几个厂商码，在这里全部返回 0 条。

`511` 那条的存在说明收录标准不是「只用 RFC 里的」——`511 Network Authentication Required` 也是被正式编号的。真正缺的是 `4xx` 那一堆：`416 Range Not Satisfiable`、`407 Proxy Authentication Required`、`411 Length Required`、`414 URI Too Long`、`499 Client Closed Request`。

---

## 6. 幂等是方法的属性，不是状态码的属性

这是这份参考表最根本的缺口。

RFC 9110 里有两个和重试直接相关的属性，都挂在**方法**上，不挂在状态码上：

- **幂等（idempotent）**：重复执行多次产生和执行一次相同的效果。幂等的方法：`HEAD`、`GET`、`PUT`、`DELETE`、`OPTIONS`。
- **安全（safe）**：请求不产生服务器端副作用。安全的方法：`GET`、`HEAD`、`OPTIONS`、`TRACE`。

注意 `TRACE` 是安全但不是幂等——这两个集合不重合。

同一个状态码对不同的方法意味着完全不同的事：

```
状态码   方法      该不该重试
429     GET       安全重试，无副作用
429     POST      重试可能创建两条订单、两笔转账
500     GET       通常可以重试
500     POST      服务器可能已经处理了请求只是没回复，重试等于执行两次
503     POST      同上
429     DELETE    幂等，重试安全
```

RFC 里**没有**正式的「可重试」定义。重试策略是客户端工程约定，不是规范的一部分。要回答「这个码该不该重试」，需要的字段不是 `retryable: boolean`——那是一个假答案，因为它把方法和码绑死——而是「这个方法在这个码下该不该重试」，也就是一个方法×状态码的二维表。

参考表只有 8 个字段，其中没有一个描述请求方法。所以「收到 429 该不该重试」这个问题，从结构上就无法从这份数据里答出来。

这不是 `http-status-lookup` 该承担的职责——它是个查询工具，不是重试决策引擎。但值得知道的是：如果你要写一个「查状态码顺便告诉你要不要重试」的界面，加的字段不能是 `retryable` 布尔，得先有一个方法字段，然后才能有一列「这个方法下是否安全重试」。

第 7 节说工具现在是怎么处理这个缺口的。

---

## 7. 可重试性散落在 meaning 里，而且查不到

第 6 节的结构性缺口，在参考表的措辞里表现为：重试信息藏在 `meaning` 字段的自然语言里，且关键词检索只能捞出一部分。

实测，查 `retry`：

```
关键词 retry    命中 1 条    429
```

只有一条。但常被认为「可重试」的码里：

```
408  meaning: 'The client took too long to send the request; the server gave up waiting.'
     cause:   'Slow upload, stalled connection.'
503  meaning: 'The server is temporarily unable to serve — overloaded or down for maintenance.'
504  meaning: 'The proxy did not receive a response from upstream in time. Unlike 502, upstream said nothing at all.'
```

这三个码的 `meaning` 里没有一个出现 `retry` 这个词。查 `retry` 捞不到它们，而它们的实践含义恰恰是「可以重试」——408 是客户端超时、503 是服务器暂时不可用、504 是上游没回应。

反面是「不可重试」的那一侧，同样查不到：

```
412  meaning: 'A condition the client set (If-Match / If-Unmodified-Since) evaluated to false.'
     cause:   'Optimistic concurrency check failed.'
428  meaning: 'The server demands conditional headers (If-Match) to avoid lost updates.'
```

这两个码是**明确不可重试**的——重试等于重复执行一个已经被服务端拒绝的并发写操作。但它们的字段里也没有任何标记说明这点。

429 是唯一一条 `meaning` 里带「重试」语义的码，措辞是 `A correct response sends Retry-After`。它被写成了「应该带 Retry-After 响应头」，而不是「该不该重试」。

结论是：想从这份参考表里判断可重试性，靠关键词查不到，靠读 `meaning` 能读出来一部分，靠字段标记查不到任何东西。三边都不完整。

---

## 8. 304 和 206 都叫「没拿到全部内容」，但不是同一种

两条码的 `meaning`：

```
206  'Only part of the resource is returned, per the Range header — how video seeking and download resumption work.'
304  'The cached copy is still fresh (validated via If-None-Match / If-Modified-Since) — no body is sent.'
```

两条都涉及「客户端没收到完整资源」，但机制不同：

| | 206 | 304 |
|---|---|---|
| 有没有响应体 | 有 | 没有 |
| 靠什么头协商 | `Range` | `If-None-Match` / `If-Modified-Since` |
| 响应里带什么 | `Content-Range` | `ETag` / `Last-Modified` |
| 客户端该做什么 | 把这段拼进下载缓存 | 用本地缓存，不发新请求 |

206 是「你要的这一部分，这是」；304 是「你本地那份还是新的，别要了」。

参考表里 `range` 只能查回 206：

```
关键词 range    命中 1 条    206
```

206 的配对码 `416 Range Not Satisfiable` 没有收录。所以「Range 请求失败了」这种问题在这里只能报 0 条。

`etag` 命中 304 一条，是对的。但 304 没有配对的失败码——304 本身就是一个「成功但没内容」的响应，客户端不需要区分「304 没缓存命中」和「304 缓存命中」，因为 304 只有后者。

---

## 9. 302 的四个亲戚

302 的 `meaning` 原文：

```
302  'Temporary redirect — the original URL stays canonical. Historically abused, so 303/307 exist for precision.'
```

「历史上被滥用过，所以 303 和 307 存在」——这一句把整组重定向码的问题说清楚了。

五条码按「是否保留方法」和「是否永久」排：

```
301  Moved Permanently         永久，方法历史上被改写成 GET
302  Found                     临时，方法历史上被改写成 GET
303  See Other                 临时，明确指示用 GET 抓目标
307  Temporary Redirect        临时，必须原样重复方法和请求体
308  Permanent Redirect        永久，必须原样重复方法和请求体
```

参考表里 303 的 `cause` 原文：`'POST-then-show-page pattern (PRG).'`——提交表单后跳转到结果页，中间那个 303 是刻意设计来避免浏览器刷新页面时重提表单的。

301 和 302 的现代行为有歧义：规范说「保留方法」，但浏览器实际行为是改成 GET。307 和 308 的存在就是为了消掉这个歧义——它们明确要求保留方法。所以 POST 表单跳转到新 URL 的场景应该用 307 或 308，而不是 302。

已废弃且未收录的：

```
305  Use Proxy     已废弃（RFC 7541）
306  保留          从未正式分配
```

这两个都在第 5 节的 23 个缺失名单里。

---

## 10. 认证四码差一个

参考表里跟认证相关的码：

```
401  Unauthorized                    'Authentication is required (or failed). Should carry WWW-Authenticate. Not about permissions — that is 403.'
403  Forbidden                       'The server understood you, knows who you are, and still refuses. Authentication will not help.'
511  Network Authentication Required 'The client must authenticate with the network first (captive portal / hotel Wi-Fi).'
```

缺的是 **407 Proxy Authentication Required**——401 的代理版本。401 要求 `WWW-Authenticate` 头，407 要求 `Proxy-Authenticate` 头，两者成对出现。参考表里有前者没有后者。

第 3 节那个 `proxy authentication` 查询返回 0 条，缺的就是这个码。查 `auth` 或 `authentication` 都会命中 401、403、511 三条，永远捞不到 407。

401 的 `meaning` 里那句 `Not about permissions — that is 403` 写得清楚：401 是身份问题、403 是权限问题、认证再多次也没用。这一对分界线在运维里是最常被搞混的地方，参考表把它写明白了。

---

## 11. 错误文案说试试 100–599，但实际接受范围不是这个

错误文案原文：

```
'No status code matches — try a number (100-599) or a keyword like "redirect".'
'没有匹配的状态码——试试数字（100–599）或关键词，如 "redirect"。'
```

文案说试试 `100-599`。实测的输入判定：

```
输入    走的分支    命中
100     精确       1 条
099     前缀       0 条（无 99 开头的码）
99      前缀       0 条（同上）
999     前缀       0 条
600     前缀       0 条
0       前缀       0 条
12345   前缀       0 条
-1      关键词层   0 条
abc     关键词层   0 条
```

`0`、`999`、`600`、`12345` 全部会被 `^\d+$` 收下，全部返回 0 条。工具**没有**做范围校验——它接受任意长度的数字前缀，只是返回空。

文案里的 `100-599` 是个提示，不是限制。真正会让输入被拒绝的情况只有一种：空字符串（`if (!q) return []`）。

把「不存在的码」和「超范围的输入」混成同一种失败。两种情况用户看到的结果完全一样——错误文案说试试 `100-599` 或关键词，但用户输入的是 `600`，一个合理的三位数字、在 HTTP 语义上不存在的码，工具给不出任何区分。

想让这两种情况产生不同提示，需要在第二层后面加一个范围检查：`Number(q) < 100 || Number(q) > 599`。这一行能加，代价只是把空返回拆成两种不同的文案。

---

## 12. 这套查询覆盖什么，覆盖不了什么

覆盖的：

- 42 条参考表记录，中英双语的含义与常见原因
- 三位数字精确查询、任意位数数字前缀查询、六字段关键词查询三层匹配
- 批量模式一行一个码，逐行输出
- 中英文关键词都能查（`重定向`、`限流`、`超时`、`内容过大` 都命中）
- 前缀改写对读者可见——输入列和输出列并排显示
- 单条记录里把「401 和 403 的区别」「304 为什么没响应体」「307 和 302 的分界」这些最常见的混淆点写在 `meaning` 里

覆盖不了的：

- **没有方法字段**。幂等与安全是 HTTP 方法的属性，不是状态码的属性。同一个 429 对 GET 无害、对 POST 可能重复下单。这份参考表在结构上回答不了「该不该重试」——没有方法字段就没有这个维度。
- **`retryable` 布尔是假答案**。加一个布尔字段只能把「这个方法在这个码下该不该重试」压成一个数，而答案依赖方法。要给出真正的可重试建议，得先有方法字段，再有一列方法×状态码的判断。
- **可重试性查不到**。关键词 `retry` 只命中 429 一条。408、503、504 常可重试但措辞里没有 `retry`；412、428 明确不可重试但也没有任何标记。
- **42 条是子集**。IANA 注册表里还缺 23 个已注册码（407、411、414、416、417、499、506、508、510 等），520–599 厂商段 80 个全部没有。运维里最常贴的 Cloudflare 520/521/522/524 在这里查不到。
- **成对码只收一半**。206 收了、416 没收；401 收了、407 没收。查 `range` 只返回 206，查 `proxy authentication` 返回 0 条。
- **前缀查询被静默改写成第一条匹配**。批量模式下 `42 → 422`、`4 → 400`、`10 → 100`、`30 → 301` 都会发生，输入列和输出列并排显示但没有任何标记。
- **关键词没有最小长度**。`a` 命中全部 42 条，`the` 命中 40 条——自然语言散文里 `a` 和 `the` 到处都是。
- **多词查询不分词**。`proxy authentication`、`404 not found` 都返回 0 条。`code` 字段没参与关键词拼接，所以「404 Not Found」这个连续子串在拼接串里不存在。
- **正文只显示前 8 条，没有提示**。统计栏写「匹配的状态码: 42」，正文列出 8 条，多出来的 34 条不告诉你它们存在，也不告诉你为什么被丢掉。截断用的是参考表顺序（数字升序），`451` 这种靠后的码永远不会出现在 `a` 的查询结果里。
- **前 8 条的截断顺序是升序**。`content` 命中 7 条全部显示是巧合（7 < 8），不是规则。
- **错误文案的范围描述和实际行为不符**。文案说试试 `100-599`，实际接受 `0`、`999`、`600`、`12345` 等任意长度数字前缀，只是返回 0 条。不存在的码和超范围的输入产生同一种失败。

两条实用建议。第一，用批量模式整理日志之前，先扫一遍输入里有没有两三位数字的码——`42`、`10`、`30` 这类会被静默改写成四位数最接近的码，输出列看起来正常，输入列和输出列不一样才是证据。第二，判断「该不该重试」之前先确认请求方法。这份参考表里没有方法字段，所以 429 和 500 的可重试性在这里是同一个问题（都是「不知道」），但对 GET 和 POST 是两个不同的答案——幂等与否取决于方法，不取决于状态码。
