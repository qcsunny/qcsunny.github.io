---
title: '密码强度的比特账：熵怎么算、为什么必须用 CSPRNG、取模偏差与第二个冻结标签页的死循环'
description: '拆解浏览器端密码/UUID/随机数生成器的三个核心问题：密码强度为什么是 length × log₂(池大小) 而"必须含符号"反而降熵、Math.random 为何不能做安全随机、如何把随机字节无偏地压进任意区间，以及一个范围超过 2³² 就把标签页冻死的拒绝采样死循环。'
pubDate: 'Sep 05 2026'
---

本站有三个都靠随机性吃饭的工具：[强密码生成器](/tools/password-generator/)、[UUID 生成器](/tools/uuid-generator/)和[随机数生成器](/tools/random-number/)。它们看着简单——"生成一串随机东西"——但真正做对要回答三个各自独立、又都容易做错的问题：

1. **怎么衡量一个密码"强不强"**？答案是比特，不是"你用了几种字符"。
2. **随机从哪来**？`Math.random` 在这里是不合格的，必须用密码学安全随机源（CSPRNG）。
3. **怎么把随机字节压进一个区间而不引入偏差**？朴素的 `% n` 是有偏的，正确做法是拒绝采样——而拒绝采样写错一行，就能让整个标签页冻死。

第三个问题的死循环，和[之前 SQL 格式化器那个](/blog/sql-tokenizer-and-code-formatter/)是同一类：一个静默的 `while (true)`，没有报错、没有内存分配，页面看起来只是"卡了一下"，然后再也不动。这篇顺带记录它是怎么被抓出来又怎么修的。

---

## 1. 强度是一笔比特账，不是"字符种类越多越好"

密码强度的正确度量是**熵**（entropy），单位比特。对"从一个大小为 $N$ 的字符池里独立均匀地抽 $L$ 个字符"这种生成方式，熵就是：

$$
H = L \times \log_2 N
$$

工具里就是这一行：

```ts
const bits = Number(slider.value) * Math.log2(pool.length);
```

每比特熵意味着攻击者暴力枚举的空间翻一倍。代入几个常见配置：

| 长度 | 字符池 | 熵 | 含义 |
| --- | --- | --- | --- |
| 16 | 小写+大写+数字（62） | 95.3 bit | 离线暴力破解遥不可及 |
| 16 | 再加符号（89） | 103.6 bit | 更高，但收益递减 |
| 12 | 全字符池（89） | 77.7 bit | 够用，但明显不如加长度 |

强度标签就按这条比特账分档（阈值 40 / 60 / 80）：

```ts
function strengthLabel(entropyBits: number): { label: string; note: string } {
	if (entropyBits < 40) return { label: 'Weak', note: '…' };
	if (entropyBits < 60) return { label: 'Fair', note: '…' };
	if (entropyBits < 80) return { label: 'Strong', note: '…' };
	return { label: 'Very strong', note: '…' };
}
```

### 反直觉的一条：强制"必须含符号"其实是**降**熵

很多网站的"密码必须包含大写/数字/符号"规则（composition rules）是把强度理解反了。上面的熵公式成立的前提是**每个字符独立均匀地从整个池里抽**。一旦规定"至少一个符号"，你就从可能的结果里**划掉了一整块**——所有恰好没抽到符号的组合——空间反而变小，熵反而略降。

它还带来一个实际的摩擦：本工具默认不保证"每种选中的字符集至少出现一次"。从 89 字符池抽 16 位，一次也没抽到符号的概率是 $(62/89)^{16} \approx 0.31\%$，约 325 次里有 1 次。这样一条密码在"必须含符号"的网站会被拒——但它并不比含符号的同长度密码弱。NIST SP 800-63B 也正是基于这个理由，明确建议**废弃** composition rules，转而强调长度与黑名单校验。**加一位长度带来的熵，远多于强行塞进一个符号。**

### 排除易混淆字符：一笔明标出来的取舍

工具提供一个"排除易混淆字符（0、O、o、1、l、I）"选项。它是纯粹的可读性取舍，并且**会**降熵——池子从 89 缩到 83：

```ts
if (noAmbig) {
	pool = pool.replace(/[0Oo1lI]/g, '');
}
```

代价有多大？16 位下从 103.6 bit 掉到 102.0 bit，约 1.6 比特。因为熵是按**实际生效的池**算的（`Math.log2(pool.length)` 在排除之后才求值），这 1.6 比特会如实反映在强度标签里，不会嘴上排除、账上不减。抄写密码时把 `0`/`O` 看混的概率，值不值这 1.6 比特，交给用户自己定。

---

## 2. 熵的前提：每个字符必须真的均匀且不可预测

上面所有比特账都建立在一个假设上——**每个字符是从池里真正独立均匀抽出来的**。这个假设一旦破，熵就是纸面数字。所以随机源用什么，是安全的地基而不是细节。

`Math.random()` 在这里**不合格**，原因不是"不够随机"，而是它压根不是为安全设计的：

- 它是一个**有种子的伪随机数生成器**（V8 里是 xorshift128+），输出完全由内部状态决定；
- 观察到足够多的连续输出，就能反推内部状态、进而**预测后续全部输出**——已有公开的针对 V8 的还原研究；
- MDN 在 `Math.random()` 页面顶部就写着一句话：不要用它做任何和安全相关的事。

正确的源是 **CSPRNG**（密码学安全伪随机数生成器），浏览器通过 `crypto.getRandomValues` 暴露。本工具所有随机性——密码每一位、UUID 每一字节、随机数每一个——无一例外走它，从不碰 `Math.random`：

```ts
function passwordHtml(chars: string, length: number): string {
	let out = '';
	for (let i = 0; i < length; i++) out += chars[randInt(chars.length)];
	return out;
}
```

字符池由勾选的集合拼成，排除歧义字符后再作为 `randInt` 的取值范围：

```ts
const SETS = {
	lower: 'abcdefghijklmnopqrstuvwxyz',
	upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
	digits: '0123456789',
	symbols: '!@#$%^&*()-_=+[]{};:,.<>?/~',
};
```

注意上面那句 `chars[randInt(chars.length)]`——真正的难点不在"拿随机字节"，而在下一步：**怎么把 `crypto` 吐出的 32 位随机整数，压缩到 `[0, chars.length)` 这个区间里，还不引入偏差**。

---

## 3. 取模偏差：为什么 `randomUint32() % n` 是错的

最自然的写法是取模：

```ts
const buf = new Uint32Array(1);
crypto.getRandomValues(buf);
return buf[0] % n;   // 有偏！
```

问题在于 $2^{32}$ 通常**不能被 $n$ 整除**。把 $[0, 2^{32})$ 的整数按 $n$ 取模，就像把 4,294,967,296 个球尽量平均塞进 $n$ 个桶——除不尽时，前面几个桶会多分到一个。设

$$
2^{32} = q \times n + s, \quad s = 2^{32} \bmod n
$$

则余数落在 $0 \ldots s-1$ 的每个值出现 $q+1$ 次，落在 $s \ldots n-1$ 的每个值只出现 $q$ 次。前 $s$ 个结果被系统性地偏爱。

以 $n = 10$ 为例：$2^{32} = 4294967296 = 429496729 \times 10 + 6$，于是数字 0～5 比 6～9 各多约 4.3 亿分之一的概率。对 10 或者 89 这种小 $n$，偏差小到任何统计检验都测不出，做密码毫无实际影响。

但"小到测不出"是个陷阱。同一个 `randInt` 还要服务随机数工具，那里的 $n$ 是用户随便填的——范围一大，偏差就不再可忽略。既然无偏的代价只是几行，就一次做对，永远不用再判断"这个 $n$ 够不够小"。

无偏的办法是**拒绝采样**：把区间顶端那 $s$ 个"多出来的"值直接丢弃重抽，只接受 $[0, q \times n)$。这样每个余数都恰好出现 $q$ 次，严格均匀：

```ts
const limit = Math.floor(0x100000000 / n) * n;   // = q × n
const buf = new Uint32Array(1);
do {
	crypto.getRandomValues(buf);
} while (buf[0] >= limit);
return buf[0] % n;
```

被拒绝的概率是 $s / 2^{32} < n / 2^{32}$，对任何实际的 $n$ 都微乎其微，几乎不会重抽第二次。拒绝采样这个词的英文文档里也常叫 rejection sampling——工具的 About 文案里那句"拒绝采样避免了朴素取模算法导致的微小概率偏差"，说的就是这里。

---

## 4. 第二个把标签页冻死的死循环

上面那段拒绝采样，藏着一个和 [SQL 格式化器那次](/blog/sql-tokenizer-and-code-formatter/)一模一样的坑。看这一行：

```ts
const limit = Math.floor(0x100000000 / n) * n;
```

当 $n \le 2^{32}$ 时它没问题。但随机数工具的最大值来自一个 `<input type="number">`，用户可以填任意大的数。一旦 $n > 2^{32}$：

$$
\left\lfloor \frac{2^{32}}{n} \right\rfloor = 0 \implies \text{limit} = 0
$$

于是 `while (buf[0] >= limit)` 变成了 `while (buf[0] >= 0)`——`Uint32Array` 的元素永远 $\ge 0$，条件恒真。**这是一个静默的 `while (true)`**：没有抛异常，没有内存分配，CPU 一个核吃满，整个标签页的主线程冻死。填一个 `最小值 0 / 最大值 5000000000` 就能触发。

它和 SQL 那个死循环是同一个物种——循环体里的推进条件在某个边界输入下失效，而正常示例数据恰好绕开了那个边界，所以能安然上线很久。**这类 bug 肉眼审查基本抓不到，只有把边界输入喂进去的测试拦得住。**

### 修法：换一个不会塌成 0 的抽取宽度

单个 32 位字覆盖不了大区间，那就用两个字拼一个 53 位的抽取——53 是双精度浮点能精确表示的整数上限，而对任何 $n \le 2^{53}$，$\lfloor 2^{53} / n \rfloor \ge 1$，`limit` 再也不会塌成 0：

```ts
function randInt(maxExclusive: number): number {
	if (!Number.isFinite(maxExclusive) || maxExclusive <= 1) return 0;
	const n = Math.floor(maxExclusive);

	if (n <= 0x100000000) {
		const limit = Math.floor(0x100000000 / n) * n;
		const buf = new Uint32Array(1);
		do { crypto.getRandomValues(buf); } while (buf[0]! >= limit);
		return buf[0]! % n;
	}

	// 21 高位 + 32 低位 = 53 位抽取，doubles 能精确表示的最大整数
	const limit = Math.floor(0x20000000000000 / n) * n;
	const buf = new Uint32Array(2);
	let v: number;
	do {
		crypto.getRandomValues(buf);
		v = (buf[0]! >>> 11) * 0x100000000 + buf[1]!;
	} while (v >= limit);
	return v % n;
}
```

$n \le 2^{32}$ 仍走原来的单字快路径，只有真正的大区间才付两字节的成本。超过 $2^{53}$ 的边界另有一道显式提示，而不是静默返回一个相邻的不精确整数。

### 顺手修掉的第二处：不重复抽取不该分配整个区间

"不允许重复"模式原来是对**整个区间**做 Fisher–Yates 洗牌：

```ts
// 旧实现：range 有多大就分配多大
const pool = Array.from({ length: range }, (_, i) => min + i);
for (let i = pool.length - 1; i > 0; i--) {
	const j = randInt(i + 1);
	[pool[i], pool[j]] = [pool[j]!, pool[i]!];
}
```

从一百万人里抽 6 个中奖号，这会先分配一个一百万元素的数组、做一百万次 `crypto` 抽取，然后把其中 999,994 个扔掉。改成对一个**虚拟**恒等数组做部分 Fisher–Yates——只记录真正被换过的下标，时间和空间都只和抽取数量有关，与区间大小无关：

```ts
function sampleWithoutReplacement(range: number, count: number): number[] {
	const moved = new Map<number, number>();
	const at = (i: number) => moved.get(i) ?? i;
	const picked: number[] = [];
	for (let i = 0; i < count; i++) {
		const j = i + randInt(range - i);
		picked.push(at(j));
		moved.set(j, at(i));
	}
	return picked;
}
```

`at(i)` 把"没被换过的位置就等于它自己"这条规则隐式化，`moved` 只在下标真正参与交换时才落地。从 $10^{15}$ 的区间里抽 6 个和从 100 里抽 6 个一样快。

### 用测试把这个边界钉死

和 SQL 那次一样，光修不够，得让边界输入进 CI。`e2e/devtools.spec.ts` 新增两例：

- **范围 > 2³² 点生成不冻结**——填 `最大值 5000000000` 后点"生成"。如果处理器还在自旋，这次点击永远不会 settle，断言直接超时，正好把回归钉红；通过则要求产出 6 个落在区间内的合法整数。
- **大区间去重抽取**——从一百万里抽 50 个，断言互异且都在区间内。

本地还用一个脚本验证了 `randInt` 在 $[1, 2^{53})$ 全程的边界与终止性、卡方均匀性（$\chi^2 = 14.5$，自由度 9，远低于 $p=.01$ 的临界值 21.67），以及 `sampleWithoutReplacement` 的互异性、逐值均匀性和"全区间抽取恰好是一个排列"。

---

## 5. UUID：能用宿主的就用宿主，缺的才自己写

UUID 生成器把同一条原则用到了极致——**宿主已经提供的就别重写，只手写它没给的那部分**（这也是[JSON 格式化直接复用 `JSON.parse`](/blog/sql-tokenizer-and-code-formatter/) 的同一条思路）。

UUID v4 是纯随机的 122 位，浏览器早已内置：

```ts
let id = ver === 'v7' ? generateUuidV7() : crypto.randomUUID();
```

`crypto.randomUUID()` 一行到位，自带 CSPRNG、格式规范，重写它没有任何收益。但 v7 是 2022 年 [RFC 9562](/blog/uuid-v4-vs-v7-database-guide/) 才定稿的新版本，宿主 API 至今不产 v7，于是这部分得自己拼：

```ts
function generateUuidV7(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	const now = BigInt(Date.now());
	bytes[0] = Number((now >> 40n) & 0xffn);
	bytes[1] = Number((now >> 32n) & 0xffn);
	bytes[2] = Number((now >> 24n) & 0xffn);
	bytes[3] = Number((now >> 16n) & 0xffn);
	bytes[4] = Number((now >> 8n) & 0xffn);
	bytes[5] = Number(now & 0xffn);
	bytes[6] = (bytes[6]! & 0x0f) | 0x70; // 版本号 7
	bytes[8] = (bytes[8]! & 0x3f) | 0x80; // 变体 10xx
	// …按 4-2-2-2-6 字节插连字符，输出 8-4-4-4-12 十六进制
}
```

要点：先用 `crypto.getRandomValues` 填满 16 字节（随机打底），再把**高 48 位覆盖成大端序的毫秒时间戳**——这就是 v7 的时间单调性来源，也是它比 v4 更适合做数据库主键的原因；随后按规范把版本号写进第 6 字节的高半字节、变体写进第 8 字节的高两位；剩下的 74 位保持随机。为什么 v7 能改善 B 树索引、v4 会造成页碎片，[另有一篇专门讲](/blog/uuid-v4-vs-v7-database-guide/)。

## 小结

| 问题 | 错误做法 | 正确做法 |
| --- | --- | --- |
| 密码强度度量 | 数"用了几种字符" | $L \times \log_2 N$ 比特熵 |
| 强制含符号 | 以为更安全 | 反而降熵；加长度才是正解 |
| 随机源 | `Math.random` | `crypto.getRandomValues`（CSPRNG） |
| 压进区间 | `uint32 % n`（有偏） | 拒绝采样，只接受 $[0, \lfloor 2^{32}/n \rfloor \cdot n)$ |
| 大区间 | 阈值塌成 0 → 死循环 | 53 位抽取，`limit` 恒 $\ge 1$ |
| 不重复抽取 | 洗整个区间（$O(\text{range})$） | 虚拟部分洗牌（$O(\text{count})$） |
| UUID v4 | 手写 | 复用 `crypto.randomUUID()` |
| UUID v7 | 找不到宿主 API 就放弃 | 手写：时间戳高位 + 随机低位 |

三个工具都在浏览器本地完成，随机数不离开你的设备，也不依赖任何第三方库或 CDN。而贯穿它们的其实是同一件事：**随机性看起来最好写，恰恰最容易在边界上悄悄错**——错得没有报错、没有异常，只有一个偏斜的分布，或者一个再也不动的标签页。





