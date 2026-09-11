---
title: 'URL 解析器实战：原生 URL API、查询参数清洗与跟踪参数剥离'
description: '从 new URL() 的协议/主机/路径拆解，到 URLSearchParams 的遍历与排序，再到 utm_source/fbclid/gclid 等跟踪参数的一键清洗。深入剖析 URL 解析中的边缘情况：缺省协议补全、percent-decode 与原样输出的取舍、API 签名场景的字母序排序。'
pubDate: 'Sep 09 2026'
category: engineering
topics: [web-platform, developer-tools, frontend]
searchTerms: ['URL 解析', 'URL API', '查询参数', '跟踪参数', 'utm_source', 'URLSearchParams']
contentLang: 'zh-CN'
relatedTools: ['devtools/url-parser', 'devtools/base64', 'security/jwt-decoder']
relatedPosts: ['url-unicode-utf8-base64url-boundaries', 'jwt-security-and-decoder-pitfalls']
---

你刚从分析平台复制了一条链接：

```
https://qcsunny.org/blog/guide?utm_source=google&utm_medium=cpc&utm_campaign=summer_promo&category=%E6%8A%80%E6%9C%AF%E5%8D%9A%E5%AE%A2&sort=desc&page=1&ref=developer_tools#section-faq
```

这条 URL 携带了 7 个查询参数（其中 4 个是 UTM 跟踪参数）、一个 percent-encoded 的中文分类名、一个 hash 锚点。你想知道它拆开长什么样、把跟踪参数洗掉后是什么、参数按字母排序后是什么。本站的 [URL 解析器](/devtools/url-parser/) 做的就是这件事。

这个工具不依赖 `query-string` npm 包、不依赖 `lodash`——它完全基于浏览器原生的 `URL` 和 `URLSearchParams` API。这篇文章拆解实现中的关键决策。

---

## 1. 原生 URL API：能做什么、不能做什么

### 1.1 new URL() 的拆解能力

`new URL()` 是浏览器内置的 URL 解析器，它按照 [WHATWG URL Standard](https://url.spec.whatwg.org/) 把 URL 拆成结构化字段：

```ts
function tryParseUrl(input: string): URL | null {
  const raw = input.trim();
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    // 如果没有协议，尝试补全 https://
    try {
      return new URL('https://' + raw);
    } catch {
      return null;
    }
  }
}
```

一次 `new URL()` 调用就能拿到 `protocol`、`hostname`、`port`、`pathname`、`search`、`hash` 全部字段。不需要自己写正则去拆 `://` 和 `?` 和 `#`——正则拆 URL 是一个著名的"看起来简单实则满是边缘情况"的陷阱（IPv6 地址里有冒号、端口号可能是 `:80` 也可能省略、`pathname` 里有 percent-encoding……）。

### 1.2 缺省协议补全

用户粘贴 URL 时经常不带协议——`qcsunny.org/blog` 而非 `https://qcsunny.org/blog`。`new URL('qcsunny.org/blog')` 会抛出 `TypeError`，因为浏览器认为这不是一个绝对 URL。

工具的补救方式是二次尝试：先原样解析，失败后补 `https://` 再试。这覆盖了 99% 的"用户忘了带协议"的场景。不需要弹出"请输入完整 URL"的错误提示。

### 1.3 URLSearchParams：遍历与解码

`URL.searchParams` 返回一个 `URLSearchParams` 对象，它自动处理 percent-decoding。遍历它就能拿到所有参数的键值对：

```ts
const paramsObj: Record<string, string> = {};
parsed.searchParams.forEach((val, key) => {
  paramsObj[key] = val;
});
```

`category=%E6%8A%80%E6%9C%AF%E5%8D%9A%E5%AE%A2` 会被自动解码为 `category=技术博客`。用户不需要手动 percent-decode——`URLSearchParams` 在遍历时已经做了。

---

## 2. 跟踪参数清洗：UTM、fbclid、gclid

### 2.1 跟踪参数清单

URL 解析器维护了一个跟踪参数黑名单：

```ts
const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'spm', 'from', '_hsenc', '_hsmi'
];
```

这些参数的共同特征是：**它们不影响页面的内容或行为，只用于分析追踪**。删掉它们，页面展示的内容完全不变。

- **UTM 参数**（`utm_source/medium/campaign/term/content`）：Google Analytics 的 Urchin Tracking Module 参数，用于标识流量来源。
- **fbclid**（Facebook Click Identifier）：Facebook 广告点击追踪，会在 URL 后面附加一个长 ID。
- **gclid**（Google Click Identifier）：Google Ads 点击追踪。
- **spm**：阿里系网站（淘宝、天猫、B 站）的流量追踪参数。
- **from**：部分平台的来源标识。
- **_hsenc / _hsmi**：HubSpot 的邮件追踪参数。

### 2.2 一键清洗

清洗逻辑是遍历参数列表，删除在黑名单中的键：

```ts
// 简化示意
TRACKING_PARAMS.forEach((param) => {
  parsed.searchParams.delete(param);
});
const cleaned = parsed.toString();
```

`URLSearchParams.delete()` 是原生方法，删除后 URL 对象会自动更新。最终通过 `parsed.toString()` 重新组装成清洗后的 URL。

### 2.3 为什么不自己写正则

跟踪参数清洗的正确做法是用 `URLSearchParams.delete()`，而不是正则替换字符串。原因有二：

1. **同一参数可出现多次**：`?a=1&a=2` 是合法的，`URLSearchParams.delete('a')` 会删除所有 `a`，而正则 `&a=[^&]*` 可能漏掉第一个（前面是 `?` 不是 `&`）。
2. **percent-encoding**：参数键可能被 percent-encoded。`utm%5Fsource` 和 `utm_source` 是同一个键，`URLSearchParams` 会正确识别，但正则需要额外处理。

---

## 3. 查询参数排序：API 签名的刚需

### 3.1 为什么要排序

许多 API 签名方案要求查询参数按字母序排列后再拼接签名。例如 AWS Signature Version 4 要求：将参数按 key 排序后拼接成 `key1=val1&key2=val2&...`，再对这个字符串做 HMAC 签名。如果参数顺序不一致，签名就会不匹配。

URL 解析器提供了一键排序功能，直接使用 ES2023 新增的 `URLSearchParams.sort()` 原生方法：

```ts
parsed.searchParams.sort();
wb.outputArea.value = parsed.toString();
```

`URLSearchParams.sort()` 按 UTF-16 码元升序排列所有参数键，稳定排序保证相同 key 的值的相对顺序不变。不需要手动 `entries()` + `sort()` + 重建——原生方法一行搞定。

### 3.2 排序的边缘情况

- **同键多值**：`?b=2&a=1&a=0` 排序后是 `a=1&a=0&b=2`。`sort()` 只按 key 排序，相同 key 的值的相对顺序不变（稳定排序）。
- **大小写**：`sort()` 按 UTF-16 码元排序，区分大小写。`A=1&a=2` 排序后 `A` 在前（`A` 的码元值 65 小于 `a` 的码元值 97，升序排列）。API 签名通常要求区分大小写，所以这是正确行为。

---

## 4. 输出格式：报告块的双语重建

URL 解析器的输出放在一个 `<textarea>` 中。`<textarea>` 不能包含 `<span class="i18n-en">` / `<span class="i18n-zh">` 这样的双语 span——它只能容纳纯文本。因此整个报告块需要在语言切换时重建。

工具的实现方式是把解析逻辑参数化为一个 `zh` 布尔量，在 `onLang` 回调中重新执行：

```ts
function doParse() {
  const zh = isZh();
  const raw = wb.inputArea.value.trim();
  // ...解析逻辑，根据 zh 选择标签语言...
  wb.outputArea.value = report;
}

onLang(doParse);
```

`onLang` 会立即执行一次，并在语言切换时再次执行。这保证了无论用户先切换语言还是先输入 URL，输出始终是当前语言。

---

## 5. URL 编码与解码：UTF-8 的完整支持

除了解析，工具还提供 URL 编码/解码功能。`encodeURI` / `decodeURI` 和 `encodeURIComponent` / `decodeURIComponent` 的区别在于保留字符集：

| 函数 | 不编码的字符 | 用途 |
|------|-------------|------|
| `encodeURI` | `#`、`?`、`&`、`=`、`/`、`:` 等 | 编码整个 URL |
| `encodeURIComponent` | 仅 `A-Za-z0-9-_.!~*'()` | 编码单个参数值 |

工具提供两种模式，因为用户可能想编码整个 URL（保留 `?` 和 `&` 的结构），也可能想编码某个参数值（所有特殊字符都编码）。

解码时用 `decodeURIComponent` 而非 `decodeURI`，因为用户粘贴的可能是一个已经编码的参数值（包含 `%3F` 这样的编码 `?`），`decodeURI` 不会解码它（`?` 不在 `decodeURI` 的保留集中……实际上 `decodeURI` 不解码 `#`、`$`、`&`、`+`、`,`、`/`、`:`、`;`、`=`、`?`、`@` 等，而 `decodeURIComponent` 解码所有 `%HH` 序列）。

---

## 6. 工程收获

URL 解析器的实现揭示了一个原则：**能用原生 API 就不要自己解析**。`URL` 和 `URLSearchParams` 是 WHATWG 标准化的、经过全浏览器测试的 URL 解析器。自己写正则拆 URL 的人最终都会在 IPv6、percent-encoding、相对 URL 等 99 种边缘情况中踩坑。

工具的真正价值不在于"解析 URL"——`new URL()` 一行代码就能做。价值在于：

- **一键清洗跟踪参数**：UTM、fbclid、gclid 等参数的完整清单和一键删除。
- **API 签名排序**：参数按字母序排列，满足 AWS 签名等需求。
- **双语报告**：中文和英文用户看到各自语言的标签。
- **编码/解码双向**：整 URL 和单参数两种粒度的编码。

这些功能用原生 API 组合就能实现，不需要 `query-string` 或 `lodash`。零依赖不只是省 KB——它意味着没有供应链风险，没有版本冲突，没有 polyfill 需求。
