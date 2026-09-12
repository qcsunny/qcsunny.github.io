---
title: '一个 CIDR 计算器的自我修养：32 位无符号、BigInt 的 IPv6 与两处特例'
description: '拆解站内 CIDR 计算器的实现：为什么 JavaScript 的位运算必须配 >>> 0、IPv6 为什么必须整个换到 BigInt、/31 和 /32 为什么要绕开减二公式，以及 lint 校验怎么抓 Disallow 出现在 User-agent 之前这类静默失效。'
pubDate: 'Sep 12 2026'
category: security
topics: [security, algorithms]
searchTerms: ['CIDR', '子网划分', '位运算', 'IPv6']
contentLang: 'zh-CN'
relatedTools: ['security/cidr-calculator']
relatedPosts: ['url-unicode-utf8-base64url-boundaries']
---

[IP 子网与 CIDR 计算器](/security/cidr-calculator/)是 Security 分类里的一个小工具：粘贴 `192.168.1.130/26`，给出网络地址、掩码、广播地址、可用主机范围。它看起来只是一次按位与——但把它写对的过程中踩到的坑，几乎每一条都是 JavaScript 数值语义的通用课。这篇文章把实现逐层拆开。

---

## 1. IPv4：32 位整数与三次 `>>> 0`

工具的核心路径在 `src/tools/textTools.ts` 的 `parseCidrCalc`。第一步是把点分四段变成一个 32 位整数：

```ts
function ipToLong(ip: string): number | null {
	const parts = ip.split('.').map((p) => Number(p));
	if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
	return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}
```

最后的 `>>> 0` 不是装饰。JavaScript 的位运算把操作数按**有符号 32 位**处理：`192.168.1.1` 拼出来的整数最高位是 1（192 ≥ 128），直接 `<<` 的结果是一个**负数**。后续每一个按位与、或、非都要么跟着 `>>> 0`，要么把结果限制在不会触碰符号位的运算里。漏掉一处，`192.168.1.0/24` 算出来是 `-1062731776`，工具当场报废——而 `10.0.0.0/8`（首段 10 < 128）一切正常，这种**只在特定网段触发**的 bug 在测试里最会躲猫猫。

掩码这一行同款处理：

```ts
const maskLong = maskBits === 0 ? 0 : (0xffffffff << (32 - maskBits)) >>> 0;
const netLong = (ipLong & maskLong) >>> 0;
const bcastLong = (netLong | (~maskLong) >>> 0) >>> 0;
```

`maskBits === 0` 的三元不是炫技：`0xffffffff << 32` 在 JS 里等于 `<< 0`（移位数按 mod 32 取），结果不再是 0 而是全 1——`/0` 会算出一个"掩码是 255.255.255.255"的荒谬答案。移位 32 的回卷是第二个通用陷阱。

有了网络地址和广播地址，剩余贷款式的推导都是位运算组合拳：

```ts
const firstUsable = maskBits >= 31 ? netLong : netLong + 1;
const lastUsable = maskBits >= 31 ? bcastLong : bcastLong - 1;
```

---

## 2. /31 与 /32：教科书公式有两个特例

"可用主机数 = 2^(32−前缀) − 2"是所有网络教材的第一课，实现里它写成：

```ts
const totalHosts = maskBits >= 31 ? (maskBits === 32 ? 1 : 2) : Math.pow(2, 32 - maskBits);
const usableHosts = maskBits >= 31 ? totalHosts : Math.max(0, totalHosts - 2);
```

条件分支对应两个 RFC 特例：

- **/32**：主机位为零位，2⁰ = 1 个地址，减 2 会得到 −1。它是"精确到这一台机器"的路由表项，没有子网语义。
- **/31**：2¹ − 2 = 0，按公式一个地址都不可用——但 RFC 3021 专门为点对点链路开了特例：两个地址各归一端，**不设网络地址和广播地址**，所以两个都可用。

如果工具照抄公式，`/31` 会输出"可用主机 0"，而真实世界的每一条 PPP 链路都在用这两个地址。工程上"公式 + 特例清单"比"修正公式"诚实：分支摆在那里，读者能看到规则在哪里拐弯。

同文件里的 IPv6 部分还处理了 `::` 压缩展开、128 位前缀和地址总数——那边的数早就超出 `Math.pow(2, 53)` 的安全整数范围，整个实现换到了 BigInt：

```ts
const mask = prefix === 0 ? 0n : ((1n << BigInt(prefix)) - 1n) << BigInt(128 - prefix);
const total = 1n << BigInt(128 - prefix);
```

IPv4 用 number、IPv6 用 BigInt 是刻意的分层：/48 的地址总数是 2⁸⁰ ≈ 1.2×10²⁴，double 只能保证 15-16 位有效数字，`toLocaleString` 打出来的是一个**看起来精确实则错误**的数。BigInt 没有这个问题，代价是每个字面量都要带 `n`、移位量要 `BigInt()` 包一下——对一次性计算的工具来说这个代价约等于零。

---

## 3. 校验面：不能只算对，还要拦得住

计算器有第二个模式：逐行批量判断两段 IP 是否同网段（排错时最常用的心算外包）。加上一个 lint 入口，抓的是**静默失效**——语法合法、语义为空的 robots.txt 风格错误：

- 输入合法但**越界**：`256.1.1.1`、掩码 `/33`、负数——`ipToLong` 在入口全部挡下，返回 null 而不是 NaN 往下传；
- 首段判断 A/B/C/D/E 类和 RFC 1918 私有段——10/8、172.16/12、192.168/16、127/8 四组区间查表，顺带回答"这个地址该出现在公网吗"。

```ts
else if (firstOctet === 172 && ((ipLong >>> 16) & 255) >= 16 && ((ipLong >>> 16) & 255) <= 31) isPrivate = true;
```

172.16.0.0/12 的判定是一个好例子：它不是按首段（172）而是按**第二段**（16-31）划界——首段相同、前缀长度不同的网段，判定必须下钻到正确的那一段。这类"区间嵌套"的判定手写很容易差一个边界值，实现时拿 172.15.255.255、172.16.0.0、172.31.255.255、172.32.0.0 四个临界点逐一验证过。

---

## 4. 工程收获

这个工具的核心逻辑不到 60 行，但每一行都在跟一个具体的坑搏斗：

- **`>>> 0` 无符号化**：JS 位运算是有符号 32 位的，高位网段必踩；
- **移位 mod 32 回卷**：`<< 32` 不等于 0，`/0` 掩码必须特判；
- **公式带特例**：/31、/32 与教科书公式的关系是 RFC 明文规定，不是实现者发挥；
- **IPv6 换 BigInt**：超出 2⁵³ 的整数在 double 里只保留"看起来精确"的假象；
- **入口校验先于计算**：null 一路短路，比让 NaN 在四则运算里繁殖到输出好排查得多。

子网划分的位图知识本身（网络地址、广播地址、步长 2 的幂）在[上一个版本的文章](/blog/url-unicode-utf8-base64url-boundaries/)里已有铺垫——这篇记录的是把它做成工具时，那层数学底下的 JavaScript 语义层。工具在此：[CIDR 计算器](/security/cidr-calculator/)，全部本地运算。
