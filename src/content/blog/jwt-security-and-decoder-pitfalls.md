---
title: 'JWT 签名真的安全吗？None 算法注入、密钥混淆与浏览器端解码的安全边界'
description: '拆解 JSON Web Token (JWT) 的三段结构与其核心安全假象：Payload 为何不是加密而只是 Base64Url 序列化、历史上臭名昭著的 alg: none 绕过与 RS256/HS256 密钥混淆攻击，以及纯前端本地解码器的设计安全边界。'
pubDate: 'Sep 07 2026'
category: security
topics: [security, cryptography]
searchTerms: ['JWT', 'None算法', '密钥混淆']
contentLang: 'zh-CN'
relatedTools: ['devtools/jwt-decoder']
relatedPosts: ['password-entropy-and-secure-random']
---

在现代 Web 前后端分离、微服务架构以及 OAuth 2.0 / OIDC 身份认证体系中，JSON Web Token（JWT）几乎已经成为了跨系统传递身份凭证的行业标准。

然而，在日常开发和技术交流中，关于 JWT 的误解极为普遍。最经典的一个误区莫过于：
> "这个 Token 已经签名了，里面存着用户的敏感数据，别人截获了也看不到。"

事实上，**签名（Signature）保护的是数据的完整性（Integrity）与不可篡改性，但对保密性（Confidentiality）完全没有任何保护作用**。任何人只要拿到一段 JWT，不仅不需要任何密码就能直接看光里面的全部内容；如果后端的签名校验逻辑实现有瑕疵，攻击者甚至可以伪造身份绕过整个系统的鉴权防线。

本站的 [JWT 在线解码器](/devtools/jwt-decoder/) 与 [Base64 编解码器](/devtools/base64/) 正是基于纯本地零网络请求的原则构建的。这篇文章系统剖析 JWT 的底层结构、经典安全漏洞与生产防御要则。

---

## 1. 结构拆解：为什么说 JWT 根本没有加密？

一个标准的 JWT 字符串通过两个半角句点 `.` 分割为三部分：

```text
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFsaWNlIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

这三个部分分别是：
1. **头部（Header）**：声明签名算法和令牌类型；
2. **载荷（Payload）**：存储业务声明（Claims，如用户 ID、角色、过期时间等）；
3. **签名（Signature）**：由前两部分加上服务端私密密钥计算得到的校验摘要。

### Base64URL 不是加密，只是编码
很多初学者误以为 Header 和 Payload 那串难以辨认的乱码是某种加密算法生成的。实际上，它们只是标准的 **Base64URL 编码**（移除了标准 Base64 中的 `+`、`/` 与末尾补齐的 `=`，方便在 URL 参数或 HTTP Header 中传递）。

在浏览器控制台或任何终端里，只需一行命令：

```js
JSON.parse(atob("eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFsaWNlIiwiaWF0IjoxNTE2MjM5MDIyfQ"));
// 立即输出明文对象：{ sub: "1234567890", name: "Alice", iat: 1516239022 }
```

**任何在 JWT Payload 里存放明文密码、银行卡号、手机号或敏感私隐信息的行为，都相当于直接把数据赤裸裸地暴露在网络和客户端面前。**

如果确实需要对 Payload 数据进行端到端保密传输，必须采用 **JWE（JSON Web Encryption，RFC 7516）** 规范，而不是普通的 JWS（JSON Web Signature）。

---

## 2. 经典高危漏洞复盘

即便只是用于权限传递，JWT 在后端的验签逻辑如果写得不够严谨，也会引入灾难性的权限提升漏洞。历史上最著名的两类经典漏洞至今仍在很多自研实现中屡屡出现：

### 漏洞一：臭名昭著的 `alg: none` 攻击（CVE-2015-9235 等）
RFC 7519 规范中允许一种无签名的特殊模式：当 Header 中声明 `"alg": "none"` 时，表示该 Token 不需要任何数字签名，签名部分留空（形式为 `header.payload.`）。这种模式原本是为了便于在已经受 TLS/SSL 强保护的调试环境中传输。

然而，早期许多主流的 JWT 开源校验库存在致命缺陷：
```python
# 早期有缺陷的伪代码实现
def verify_token(token, secret):
    header, payload, signature = parse(token)
    algorithm = header['alg']
    if algorithm == 'none':
        # ⚠️ 致命漏洞：直接信任了 Header 里声明的算法！
        return payload
    else:
        return crypto_verify(header, payload, signature, secret, algorithm)
```

攻击者只需：
1. 抓取一个普通用户的有效 Token；
2. 解码 Payload，将自己的身份字段修改为 `"role": "admin"`；
3. 将 Header 的 `"alg"` 改为 `"none"`；
4. 删除签名部分，仅保留前两段及末尾的句点；
5. 发送给服务端。

有漏洞的后端在读取 Header 发现算法是 `none` 后，直接跳过了签名校验，攻击者从而轻而易举获得了超级管理员权限！

**防御原则**：服务端必须在代码层面**强制白名单锁定允许的验签算法**（如明确只接受 `HS256`），坚决拒绝接受并解析任何 `alg: none` 的令牌。

### 漏洞二：非对称公钥混淆攻击（Key Confusion / Algorithm Confusion）
这是针对支持非对称加密（如 `RS256`）系统的一种精妙攻击：

* 正常情况下，服务端使用**私钥（Private Key）**签署 Token，公开**公钥（Public Key）**供各微服务验签；
* 攻击者将 Header 中的算法从 `RS256` 恶意篡改为对称加密算法 **`HS256`**；
* 当服务端的验证函数被调用时，如果它把之前加载的公钥对象（一段公开可获取的 PEM 格式字符串）直接传入 `verify(token, key)`；
* 如果校验库没有严格校验算法一致性，`HS256` 就会**将原本公开的公钥文本直接当作 HMAC 对称加密的 Secret Key** 来验证签名！
* 因为公钥是全网公开的，攻击者可以直接在本地用这个公钥作为对称密钥，签署任意篡改后的恶意 Payload，后端依然会认为签名合法！

---

## 3. 浏览器端解码工具的安全边界

本站的 [JWT 在线解码器](/devtools/jwt-decoder/) 遵守了一套严格的安全原则：

1. **零服务端网络传输（100% Client-side）**：所有解码与格式化操作均通过原生 JavaScript 的 `TextDecoder` 与 `atob` 在本地完成。你的 Token 绝不会被发送到任何第三方服务器；
2. **明确的“只解不验”语义**：在浏览器前端工具中，由于没有（也不应该有）服务端的私钥或签名密钥，前端工具展示的仅仅是该 Token 内部所携带的声明内容。解码成功**绝不代表**该 Token 目前在业务后端是有效或合法的；
3. **过期时间（exp）与生效时间（nbf）时区解析**：工具会自动将标准 Unix 时间戳（如 `exp: 1772870400`）换算为当地可读的本地时间与 UTC 时间，并标记当前状态是“有效”、“已过期”还是“尚未生效”。

---

## 4. 生产环境下的最佳安全实践

要在生产系统中真正安全地使用 JWT，建议严格遵守以下几条黄金准则：

1. **短期 Token + 轮转刷新（Short-lived Access Token + Refresh Token）**：
   JWT 是无状态的，这意味着一旦签发出门，在到达 `exp` 过期时间之前无法轻易主动撤销（除非维护复杂的黑名单 Redis）。因此，Access Token 的有效期应尽量短（例如 15 到 30 分钟），配合存储在安全环境下的 Refresh Token 进行按需换发；
2. **防 XSS 窃取：优先采用 `HttpOnly` Cookie**：
   避免将高权限 JWT 存放在前端的 `localStorage` 或 `sessionStorage` 中，因为一旦页面出现任何 XSS（跨站脚本注入）漏洞，攻击者通过一行 `localStorage.getItem('token')` 就能窃取凭证。存放在声明了 `HttpOnly; Secure; SameSite=Strict` 的 Cookie 中更为稳妥；
3. **验证所有标准声明**：
   服务端验签不仅要校验签名本身，还必须严格比对 `iss`（签发者）、`aud`（受众）以及 `exp`（是否过期，注意留出合理的时钟偏差 Clock Skew，如 1 分钟以内）。
