---
title: 'URL、Unicode、UTF-8 与 Base64URL：边界到底发生在哪一层'
description: '从 URL percent-encoding 到 UTF-8 字节，再到 Base64 与 Base64URL，逐层厘清 JavaScript 字符串、URLSearchParams 和 JWT 在边界输入上的真实语义。'
pubDate: 'Sep 08 2026'
category: engineering
topics: [web-platform, developer-tools, frontend, cryptography]
searchTerms: ['percent-encoding', 'UTF-8', 'Base64URL', 'UTF-16', 'URLSearchParams', 'JWT']
contentLang: 'zh-CN'
relatedTools: ['devtools/url-parser', 'devtools/base64', 'devtools/jwt-decoder', 'utilities/text-diff']
relatedPosts: ['jwt-security-and-decoder-pitfalls', 'password-entropy-and-secure-random']
---

URL 参数里出现 `%F0%9F%98%80`，Base64 里出现 `8J+YgA==`，JWT 里又出现一串没有 `=` 的 `eyJ...`。它们都像是“把文本变成不可读字符”，于是实现时很容易把几种操作混成一句“编码一下”。

但这三层处理的对象根本不同：

- **percent-encoding** 把字节写成 URL 语法允许传输的 `%HH` 形式；
- **UTF-8** 把 Unicode 标量值编码成字节；
- **Base64 / Base64URL** 把任意字节重新映射为有限的 ASCII 字符表。

它们都不是加密，也都不提供保密性。真正容易出错的地方，是一层的输出被当成另一层的输入：把 UTF-16 code unit 当成字符，把 URL 参数预先编码两次，把 Base64 当作“安全字符串”，或者把 JWT Payload 的 Base64URL 当作签名后的密文。

本文把边界按数据流拆开，并把浏览器 API 的具体语义放在最后，而不是用一个模糊的“encode/decode”概括一切。相关实现也可以直接用本站的 [URL 解析与编码工具](/devtools/url-parser/)、[Base64 编解码器](/devtools/base64/) 和 [JWT 解码器](/devtools/jwt-decoder/) 做本地实验。

---

## 1. 先画清楚数据流：字符、码点、字节、文本

### Unicode code point 不是 JavaScript 的一个“字符单位”

Unicode 给每个抽象字符分配一个 **code point（码点）**。例如：

- 拉丁字母 `A` 是 `U+0041`；
- 汉字 `汉` 是 `U+6C49`；
- 😀 是 `U+1F600`。

JavaScript 字符串的底层可观察单位却是 **UTF-16 code unit（码元）**。BMP 内的码点通常占一个 16 位码元，而 `U+10000` 以上的码点要用一对 surrogate code unit 表示。于是：

```js
const text = 'A😀';

console.log(text.length);              // 3：A + 高代理项 + 低代理项
console.log([...text].length);          // 2：A + 😀
console.log(text.codePointAt(1).toString(16)); // '1f600'
console.log([...text].map(ch => ch.codePointAt(0).toString(16)));
// ['41', '1f600']
```

`length` 统计的是 UTF-16 code unit，不是 Unicode code point 数量，也不是用户眼中的字素簇数量。一个带组合音标的字母、旗帜 emoji 或家庭 emoji 还可能由多个码点组成。因此“截断前 10 个字符”必须先明确到底要按码元、码点，还是 grapheme cluster 截断；这不是 URL 编码能替你决定的事情。

### UTF-8 才是跨边界传输时的字节表示

UTF-8 将 Unicode 标量值编码为 1 到 4 个字节。上面的字符串可以直接观察：

```js
const bytes = new TextEncoder().encode('A😀');
console.log([...bytes]);
// [65, 240, 159, 152, 128]
console.log([...bytes].map(byte => byte.toString(16).padStart(2, '0')).join(' '));
// 41 f0 9f 98 80
```

这里 `😀` 的 UTF-8 是 `F0 9F 98 80`，不是把两个 UTF-16 码元各自转成两个字节。网络协议谈“编码文本”时通常需要先规定这样的字节编码；URL percent-encoding 和 Base64 处理的正是这些字节，而不是抽象的 Unicode 码点本身。

还要区分一个危险输入：**孤立代理项**。`\\u0000` 这类写法若只构造出一个高代理项，它不是合法 Unicode 标量值：

```js
const loneSurrogate = '\uD83D';

try {
  encodeURIComponent(loneSurrogate);
} catch (error) {
  console.log(error instanceof URIError); // true
}

console.log([...new TextEncoder().encode(loneSurrogate)]);
// [239, 191, 189]：以 U+FFFD（EF BF BD）替代
```

`encodeURIComponent` 遇到不能组成代理对的 surrogate 会抛出 `URIError`，不会静默替换。WHATWG Encoding 标准定义的 UTF-8 编码路径则会把这类输入处理成替换字符；`TextEncoder` 因而得到 `EF BF BD`。生产代码要么在进入 URI 组件编码前拒绝非 well-formed 字符串，要么明确接受替换结果；不能假设所有 API 会用同一种策略。

---

## 2. Percent-encoding：它编码的是字节，不是“把汉字换成乱码”

RFC 3986 把 URI 语法拆成组件，并定义了 percent-encoded 形式：一个百分号后跟两个十六进制数字，表示一个八位字节，例如 `%2F` 表示字节 `0x2F`。`%E6%B1%89` 则是汉字 `汉` 的 UTF-8 三个字节 `E6 B1 89` 的逐字节表示。

因此完整的数据流是：

```text
Unicode 字符串 → UTF-8 字节 → %HH / 保留字符的 URL 表示
```

`encodeURIComponent` 会把一个 URI 组件编码成适合放进单个组件的形式。它对字符串先按 UTF-8 处理，再保留字母、数字以及 `- _ . ! ~ * ' ( )`，其余字节转成 `%HH`：

```js
const value = '汉字 & a/b?x=1';
const encoded = encodeURIComponent(value);
console.log(encoded);
// %E6%B1%89%E5%AD%97%20%26%20a%2Fb%3Fx%3D1
console.log(decodeURIComponent(encoded));
// 汉字 & a/b?x=1
```

这就是为什么组件值中的 `&`、`=`、`?` 和 `/` 必须编码：它们在外层 URL 中各有语法意义。如果要编码整条已经包含协议、主机、路径和查询的 URI，`encodeURIComponent` 反而会把结构分隔符也编码掉；`encodeURI` 的保留集合不同，但它同样不是一个“修复任意 URL”的万能清洗器。更稳妥的方式是用 `URL` 对结构建模，用 `URLSearchParams` 写查询字段。

### Percent-encoding 不等于 Unicode 规范化

`é` 可以是一个预组字符 `U+00E9`，也可以是 `e` 加组合尖音符 `U+0065 U+0301`。两者视觉相同，但 UTF-8 字节不同，percent-encoded 结果也不同：

```js
const composed = 'é';
const decomposed = 'é';
console.log(encodeURIComponent(composed));   // %C3%A9
console.log(encodeURIComponent(decomposed)); // e%CC%81
console.log(composed === decomposed);         // false
console.log(composed.normalize('NFC') === decomposed.normalize('NFC')); // true
```

URL 编码不会自动替你做 Unicode normalization。签名、缓存键、去重或数据库查询如果要求等价文本归一化，必须在业务层明确约定规范化形式，并且在签名和验证两端采用同一规则；不能看到两个 URL 都“能显示”就认为字节级相同。

---

## 3. `encodeURIComponent` 的 surrogate 边界：不要按 `charCodeAt` 手搓 UTF-8

代理对的高代理项范围是 `0xD800–0xDBFF`，低代理项范围是 `0xDC00–0xDFFF`。`charCodeAt` 读出的正是单个 UTF-16 code unit；直接把它当成完整字符，会在非 BMP 字符处拆坏数据：

```js
const emoji = '😀';
console.log(emoji.charCodeAt(0).toString(16)); // d83d
console.log(emoji.charCodeAt(1).toString(16)); // de00
console.log(emoji.codePointAt(0).toString(16)); // 1f600
console.log(encodeURIComponent(emoji));          // %F0%9F%98%80
```

常见的错误实现是遍历 `string.length`，对每个 `charCodeAt(i)` 计算 `%HH`。那既没有完成 UTF-8 编码，也没有处理代理对，结果可能产生无法解码的 URL。需要 URL 组件编码时直接调用 `encodeURIComponent`；需要字节时用 `TextEncoder`；只有在实现协议编码器时，才有理由自己处理码点，并且必须先检查 surrogate 配对、标量值范围和错误策略。

反向解码也应当把异常当成输入错误，而不是假设所有外部字符串合法：

```js
function decodeComponentSafely(input) {
  try {
    return decodeURIComponent(input);
  } catch (error) {
    if (error instanceof URIError) {
      throw new TypeError('输入不是合法的 percent-encoded UTF-8 组件');
    }
    throw error;
  }
}

console.log(decodeComponentSafely('%E6%B1%89')); // 汉
// decodeComponentSafely('%E6%B1')           // 抛出，而不是猜一个字符
// decodeComponentSafely('%')                // 抛出
```

防御性实现还应设置长度上限，避免对超大输入进行无界解码；如果数据来自 HTML 或日志，解码后的值仍然是不可信文本，不能直接拼接进 `innerHTML`。

---

## 4. `URLSearchParams` 不是 `encodeURIComponent` 的批处理包装

`URLSearchParams` 表达的是 URL 查询参数集合，序列化时遵循 `application/x-www-form-urlencoded` 的语义。最容易踩的差异是：**空格序列化为 `+`，而不是 `%20`；输入字符串中的 `+` 会按空格解释。**

```js
const params = new URLSearchParams();
params.set('q', 'a b+c');
console.log(params.toString());
// q=a+b%2Bc：空格变 +，字面量 + 变 %2B

const parsed = new URLSearchParams('q=a+b%2Bc');
console.log(parsed.get('q')); // 'a b+c'
```

因此下面两种输入不是一回事：

```js
console.log(new URLSearchParams('bin=E+AX').get('bin')); // 'E AX'
console.log(new URLSearchParams([['bin', 'E+AX']]).get('bin')); // 'E+AX'
```

第一种把字符串当作查询编码来解析，`+` 已被解释为空格；第二种把值作为结构化字符串传入，序列化时会把字面量 `+` 编成 `%2B`。这也是把普通 Base64（可能含 `+` 和 `/`）塞进 query 时必须使用 API 构造参数，而不是手写 `'?data=' + value` 的原因。更好的方案通常是使用 Base64URL，或让 `URLSearchParams` 正确编码普通 Base64。

不要预先调用 `encodeURIComponent` 再交给 `URLSearchParams`：

```js
const params = new URLSearchParams();
params.set('q', encodeURIComponent('汉字')); // 错：值已经是 %E6...
console.log(params.toString());
// q=%25E6%25B1%2589...：百分号再次被编码

const correct = new URLSearchParams([['q', '汉字']]);
console.log(correct.toString()); // q=%E6%B1%89%E5%AD%97
```

读取一个完整 URL 时，可以让 `URL` 和 `URLSearchParams` 各自负责结构与字段：

```js
const url = new URL('https://example.test/search?q=a%20b&tag=x%2By');
console.log(url.searchParams.get('q'));   // 'a b'
console.log(url.searchParams.get('tag')); // 'x+y'
url.searchParams.set('q', 'a b');
console.log(url.href); // 查询部分可能按 URLSearchParams 规则重序列化为 q=a+b
```

修改 `searchParams` 可能改变原本看似等价的 URL 字符串（例如 `%20` 与 `+`、某些安全字符的转义形式）。如果 URL 字符串本身参与缓存键、签名或审计日志，修改前后要按协议重新计算，而不能只比较“解码后的参数对象”。WHATWG URL 标准定义的是浏览器实际使用的解析与序列化算法；RFC 3986 是 URI 通用语法规范，两者的关注点不同，不能把 RFC 中的抽象组件规则直接当作每个 Web API 的逐字符行为。

---

## 5. Base64：把字节变成 ASCII，不是加密

RFC 4648 的 Base64 把每 3 个八位字节拼成 24 位，再切成 4 个 6 位数，映射到 64 个字符。输入不是 3 的倍数时，标准 Base64 用 `=` padding 表示缺少的输出字节：

| 输入字节数 | 输出字符数 | 末尾 padding |
| ---: | ---: | ---: |
| 3 | 4 | 无 |
| 2 | 4 | 1 个 `=` |
| 1 | 4 | 2 个 `=` |

例如文本 `汉` 先变成 UTF-8 字节 `E6 B1 89`，再得到 Base64：

```js
const bytes = new TextEncoder().encode('汉');
const binary = String.fromCharCode(...bytes);
console.log(btoa(binary)); // 5rGJ
```

`btoa` 和 `atob` 的名字容易让人误以为它们直接处理 Unicode 文本。实际上，`btoa` 接受的是“每个 code unit 都在 `0x00–0xFF` 的二进制字符串”；直接传 `汉` 会抛出 `InvalidCharacterError`。可靠的浏览器实现应明确在文本和字节之间转换：

```js
function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000; // 避免一次性展开超大数组
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const encoded = bytesToBase64(new TextEncoder().encode('汉😀'));
const decoded = new TextDecoder().decode(base64ToBytes(encoded));
console.log(encoded); // 5rGJ8J+YgA==
console.log(decoded); // 汉😀
```

这段转换只改变表示，不隐藏内容、不验证来源、不防止篡改。任何人都可以 Base64 解码；如果需要保密性，要使用经过设计的加密协议；如果需要完整性和来源认证，要使用 MAC 或数字签名。Base64 不是加密，JWT 的 Payload 也不会因为用了 Base64URL 就变成机密——这正是 [JWT 签名、算法混淆与解码边界](/blog/jwt-security-and-decoder-pitfalls/) 一文反复强调的核心区别。

---

## 6. Base64URL：只换字母表，padding 是否保留要看协议

Base64URL 是 RFC 4648 §5 定义的 URL 与文件名安全字母表变体：

| 标准 Base64 | Base64URL |
| --- | --- |
| `+` | `-` |
| `/` | `_` |
| 末尾 `=` | 通常按协议省略 |

它不是另一种二进制编码，也不是加密算法。对同一组字节，Base64 和 Base64URL 的信息完全相同，只是输出字符表与 padding 约定不同：

```js
function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

function base64UrlToBytes(input) {
  if (!/^[A-Za-z0-9_-]*$/.test(input)) {
    throw new TypeError('不是未填充的 Base64URL 字符串');
  }
  if (input.length % 4 === 1) {
    throw new TypeError('Base64URL 长度模 4 不能为 1');
  }
  const base64 = input.replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
  return base64ToBytes(padded);
}

const original = new TextEncoder().encode('汉😀');
const compact = bytesToBase64Url(original);
console.log(compact); // 5rGJ8J-YgA
console.log(new TextDecoder().decode(base64UrlToBytes(compact))); // 汉😀
```

长度模 4 等于 1 时不存在合法的补齐方式；例如一个长度为 5 的 Base64URL 字符串不能靠“无脑补三个等号”变成有效数据。解码器还应明确是否接受带 padding 的输入、空白字符和混用 `+ /` 的普通 Base64。对于 JWT 这类严格协议，最好只接受规范规定的未填充 Base64URL 字符集，并在解码后检查 JSON、尺寸和字段，而不是宽松地“尽量解出来”。

编码和解码的两个阶段仍然不同：先决定字节是什么，再选择 Base64URL 表示。如果把 JavaScript 字符串直接按 UTF-16 code unit 压成 Base64，非 ASCII 文本会与其他语言实现产生不同结果。跨语言协议必须写清“文本先 UTF-8 编码”，不能只写“Base64 编码字符串”。

---

## 7. JWT 为什么使用 Base64URL，以及它仍然不安全到可以随便信

JWT 通常采用 JWS Compact Serialization 的三段形式：

```text
BASE64URL(UTF-8(header-json)) . BASE64URL(payload-bytes) . BASE64URL(signature-bytes)
```

头部和载荷是 JSON 的序列化字节，签名是对特定 signing input 计算出的结果。Base64URL 让这些段不包含普通 Base64 的 `+`、`/` 和 padding，段之间再用 `.` 分隔，适合放在 HTTP Header 或 URL 参数里。它解决的是传输字符集与分隔符冲突，不是身份认证本身。

一个解码 JWT 头部或载荷的浏览器函数可以这样写：

```js
function decodeJwtJson(segment) {
  const bytes = base64UrlToBytes(segment);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return JSON.parse(text);
}

function inspectJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(part => part.length === 0)) {
    throw new TypeError('JWT 必须包含三个非空段');
  }
  return {
    header: decodeJwtJson(parts[0]),
    payload: decodeJwtJson(parts[1]),
    signature: parts[2],
  };
}
```

这段代码的语义是 **inspect（查看）**，不是 verify（验证）。它没有密钥，也没有根据 `alg` 选择可信的算法，更没有校验 `iss`、`aud`、`exp` 或签名。前端看到 `{"role":"admin"}` 只说明有人把这段 JSON 放进了 Token，不说明服务器会接受它。不要在浏览器端解码结果上做授权决策，也不要因为载荷“看起来像 Base64URL”就信任来源。

还有两个实际边界：

1. JWT 的 JSON 载荷一般应按 UTF-8 字节处理；不能用 `atob` 返回的二进制字符串直接当作 Unicode 文本。上面的 `TextDecoder` 正是为了把字节正确还原为文本。
2. JWT 是不可信输入。应限制 Token 总长度和每段长度，拒绝意外的空段、非法字符、非法 JSON 与重复结构；解析结果要当作数据，不能通过 `innerHTML` 拼入页面。

如果需求是让中间人无法看到 claims，应该评估 JWE 或其他端到端加密设计；普通 JWT/JWS 的签名保护完整性与认证，不提供载荷保密性。密码、会话秘密和随机令牌的生成与存储是另一条边界，可参见[密码熵、CSPRNG 与无偏随机](/blog/password-entropy-and-secure-random/)；不要把“Base64URL 看起来不可读”误当成密钥保护。

---

## 8. 一张边界表：每层应该接收什么、输出什么

| 层 | 输入 | 输出 | 解决的问题 | 不解决的问题 |
| --- | --- | --- | --- | --- |
| Unicode | 码点序列 | 抽象文本 | 字符的统一编号 | 传输字节、保密、认证 |
| UTF-8 | Unicode 标量值 | 1–4 字节 | 文本到字节的互操作 | URL 语法、保密、签名 |
| percent-encoding | 字节/URI 组件 | `%HH` 与允许字符 | 避免 URL 组件破坏语法 | 加密、完整性、规范化 |
| Base64 | 任意字节 | 标准 Base64 字符 | 把字节放进 ASCII 文本 | URL 兼容性、加密、认证 |
| Base64URL | 任意字节 | `A-Z a-z 0-9 - _`（按协议处理 `=`） | 减少 URL 分隔符冲突 | 加密、签名验证、授权 |
| JWT/JWS | JSON/载荷字节 + 密钥 | 三段 Compact Serialization | 可携带声明并验证完整性 | 普通 JWS 的保密性 |

写代码时可以用下面四个问题快速定位 API：

1. 我现在处理的是 Unicode 文本，还是已经确定的字节？如果是文本，先明确 UTF-8。
2. 我要把一个值放进 URL 组件，还是要序列化完整查询参数集合？前者可用 `encodeURIComponent`，后者优先使用 `URLSearchParams`。
3. 接收方要的是普通 Base64 还是 Base64URL？padding、空白和非法字符的容忍度是否由协议规定？
4. 我需要的只是可逆表示，还是保密性、完整性和来源认证？后者不能靠任何 `encode` 函数补上。

最后可以把一个安全的处理链写成明确的类型边界：

```text
字符串 --UTF-8--> Uint8Array --Base64URL--> ASCII token
字符串 --URL 组件规则--> URL 查询值
JWT 段 --Base64URL 解码--> UTF-8 JSON --JSON.parse--> 不可信数据
```

每次跨层都写出转换，而不是复用一个名为 `encode` 的函数。这样遇到 emoji、孤立代理项、字面量 `+`、缺失 padding、重复 percent-encoding 或 JWT 伪造时，错误会停在正确的边界上，而不会悄悄变成另一种合法但含义不同的数据。

### 参考资料

- [WHATWG URL Standard](https://url.spec.whatwg.org/)：浏览器 URL 解析、查询参数与序列化算法。
- [RFC 3986：Uniform Resource Identifier](https://www.rfc-editor.org/rfc/rfc3986)：URI 通用语法与 percent-encoding。
- [RFC 4648：The Base16, Base32, and Base64 Data Encodings](https://www.rfc-editor.org/rfc/rfc4648)：Base64 字母表、padding 与 Base64URL 变体。
- [Unicode Core Specification](https://www.unicode.org/versions/latest/core-spec/)：码点、代理项与 Unicode 编码模型。
- [MDN：`encodeURIComponent()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent)：浏览器 JavaScript API 的组件编码与 surrogate 异常说明。
- [MDN：`URLSearchParams`](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams)：查询参数 API 与 `application/x-www-form-urlencoded` 语义。
- [MDN：Base64](https://developer.mozilla.org/en-US/docs/Glossary/Base64)：浏览器 Base64 API 与字节字符串边界。
