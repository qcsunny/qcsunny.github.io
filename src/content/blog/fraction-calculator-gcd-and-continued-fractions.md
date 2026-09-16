---
title: '0.3333 和 1/3 在同一个计算器里是两回事'
description: '在 /calculators/fraction/ 页面里，a=24、b=36 给 2 / 3，同一页面下面 d=0.3333 给 3333 / 10000——读者想问的是 1 / 3，工具给的是 0.3333 的精确值，中间没有任何标记。逐层拆开这两个字段背后的三套精度哲学：gcdParts 刻意读 .toString() 的最短 round-trip 串，因为 0.3 是 10^-1 上的整数 3、不是 double 底下的 5404319552844595/18014398509481984；但 0.1+0.2 那个 double 给回的是 17 位串 0.30000000000000004，喂进 a/b 会产出 16 位分子的比；decimalToFraction 完全不走字符串，Math.floor、b−a、1/frac、h1/k1 全程 double；a/b as decimal 那一行是裸浮点除法，24/36 显示 0.6666666666666666；输出用字符串而不是数字，因为 0.3/0.1 在 double 里是 2.9999999999999996，而 0.9/0.3 恰好等于 3；0:0 约成 0:0、0:n 约成 0:1、n:0 约成 1:0，但只有 n:0 真能从比例页触达；k1 > maxDenom 不含等号，0.0001 的分母恰好 10000 能通过，0.3333 在 maxDenom 9999 下返回 null；早退容差 1e-12、末兜底容差 1e-9 松三个数量级；maxDenom 默认 10000 界面上没有字段可改，错误文案与默认参数耦合；fraction 的 a/b/d 用 type: number，prime-factorization 用 type: bigint，因为 <input type=number> 在 2^53 以上 round-trip 不可信；hint 写「最多 20 位」是准确的（2^64−1 是 20 位），但 19 位保证在范围内、20 位要看量级，是必要条件不是充分条件；factorWhole 的 n ≤ 1 守卫分支不可达，注释自认 settle here rather than trusting the caller''s guard；168 个素数到 997、Miller–Rabin 七个底数在 2^64 以下确定、Pollard rho 用 Brent 循环检测加 128 步批量 GCD；τ(360)=24、τ(10^9+7)=2、τ(2^63−1)=96、τ(2^64−1)=128。'
pubDate: 'Sep 23 2026'
category: math
topics: [mathematics, algorithms]
searchTerms: ['分数', '约分', '最大公约数', '欧几里得算法', '连分数', '质因数分解', 'Miller–Rabin', 'Pollard rho', '约数个数', 'fraction simplify', 'continued fraction', '2^53 精度']
contentLang: 'zh-CN'
relatedTools: ['calculators/fraction', 'calculators/ratio', 'calculators/prime-factorization']
relatedPosts: ['number-base-converter-bigint-and-2-53', 'json-diff-structural-comparison-and-array-object-equality', 'unix-timestamp-timezone-dst-and-leap-seconds']
---

`a=24`、`b=36`，最简分数那一行给出 `2 / 3`。

同一个页面下面，`d=0.3333`，「小数还原最简分数」那一行给出 `3333 / 10000`。

两个字段、同一个页面、同一个「把小数还原成精确分数」的目的。上一个给的是最简分数，后一个给的是精确值——而读者多半想问的是 `1 / 3`。把 `3333 / 10000` 和 `1 / 3` 通分是 `9999 / 30000` 和 `10000 / 30000`：分子差 1，中间没有任何标记说明这一层差别。

---

## 1. `gcdParts` 为什么读字符串

分数约分的入口先做一个转换：把小数拆成「有效数字串 + 十进制指数」：

```ts
/**
 * value → (digits, exponent), so that value = Number(digits) × 10^exponent and
 * `digits` has no leading zero. Read from the string form on purpose: 0.3 is the
 * integer 3 at 10^-1, never the float's 5404319552844595/18014398509481984.
 * reducePair divides both operands by one exact divisor, so these have to be the
 * user's decimal digits and not the binary fraction underneath them.
 */
function gcdParts(value: number): { d: string; e: number } {
	let s = Math.abs(value).toString();
	let e = 0;
	const exp = s.indexOf('e');
	if (exp >= 0) {
		e = Number(s.slice(exp + 1));
		s = s.slice(0, exp);
	}
	const dot = s.indexOf('.');
	if (dot >= 0) {
		e -= s.length - dot - 1;
		s = s.slice(0, dot) + s.slice(dot + 1);
	}
	return { d: s.replace(/^0+/, '') || '0', e };
}
```

关键点在 `Math.abs(value).toString()`。JavaScript 的 `Number.prototype.toString` 返回的是**能 round-trip 回同一个 double 的最短十进制串**——对 `0.3` 那个 double 来说，这个串是 `"0.3"`，不是它底下的二进制分数。

对照注释里点名的那个二进制分数：

```
0.3 × 18014398509481984 = 5404319552844595   （18014398509481984 = 2^54）
```

所以 `0.3` 这个 double 精确表示的是 `5404319552844595 / 18014398509481984`。约分要走这条路径的话，`0.3 : 0.1` 的分子分母会是 16 位和 17 位的数。工具不走这条路径。

实测的输出：

```
输入        toString()           gcdParts
0.3         "0.3"                { d: "3",  e: -1 }
0.1         "0.1"                { d: "1",  e: -1 }
0.05        "0.05"               { d: "5",  e: -2 }
0.000001    "0.000001"           { d: "1",  e: -6 }
100         "100"                { d: "100", e: 0 }
1e-7        "1e-7"               { d: "1",  e: -7 }
1e+21       "1e+21"              { d: "1",  e: 21 }
0.1 + 0.2   "0.30000000000000004" { d: "30000000000000004", e: -17 }
```

最后两行值得单独看。`1e-7` 和 `1e+21` 会走 `s.indexOf('e')` 那个分支——V8 对很小的数和很大的数会自动切到科学计数法，`gcdParts` 必须把 `e` 段单独吃进来。

最后一行是这个设计的**代价**：`0.1 + 0.2` 那个 double 的最短 round-trip 串是 `0.30000000000000004`，17 位有效数字。`gcdParts` 忠实读串，所以它拿到的是 17 位的 `d`。工具不会帮你把浮点加法误差抹掉——它如实报告那个 double 的样子。

---

## 2. `gcdBig`：把两个小数搬到同一 10^-k 格

```ts
function gcdBig(x: bigint, y: bigint): bigint {
	while (y > 0n) [x, y] = [y, x % y];
	return x;
}
```

两行欧几里得，跑在 BigInt 上。它自己不做任何小数处理——那个职责在 `gcdParts` 身上。

把两段合起来看 `reducePair`：

```ts
function reducePair(a: number, b: number): { x: string; y: string } | null {
	if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
	const A = gcdParts(a),
		B = gcdParts(b);
	const k = Math.max(0, -A.e, -B.e);
	const X = BigInt(A.d) * 10n ** BigInt(k + A.e),
		Y = BigInt(B.d) * 10n ** BigInt(k + B.e);
	const g = gcdBig(X, Y);
	const d = g === 0n ? 1n : g;
	return {
		x: (a < 0 ? '-' : '') + (X / d).toString(),
		y: (b < 0 ? '-' : '') + (Y / d).toString()
	};
}
```

中间那行是关键：`k = Math.max(0, -A.e, -B.e)`。两个小数的指数可能不同（`0.3` 是 10⁻¹、`0.05` 是 10⁻²），`k` 取两者较深的那个，把两个数都乘到同一个 10⁻ᵏ 格上变成整数，然后欧几里得跑整数。所以整条约分路径只有 BigInt 除法，没有一次浮点运算。

实测：

```
输入                     输出
(24, 36)                 2 : 3
(0.3, 0.1)               3 : 1
(0.33, 0.11)             3 : 1          ← 33/11，走字符串路径
(0.000001, 0.000002)     1 : 2
(0.123, 0.456)           41 : 152
(1000000, 2000000)       1 : 2
(1e-7, 1.5e-7)           2 : 3
(-24, 36)                -2 : 3
(100, 0.001)             100000 : 1
(0.3, 0.2 + 0.1)         7500000000000000 : 7500000000000001
```

`0.33 : 0.11 → 3 : 1` 是字符串路径的证据：如果走 double 除法，`0.33 / 0.11` 会得到 `2.9999999999999996` 之类；这里给的是干净的整数对。

最后一行是第 1 节那个代价的现场：`0.2 + 0.1` 那个 double 是最短串 `0.30000000000000004`，而字面量 `0.3` 是最短串 `0.3`。两个 double 不相等，所以约出来的对是 16 位分子、16 位分母，且不相等——数学上 `0.3 = 0.2 + 0.1`，工具给的是 `7500000000000000 : 7500000000000001`。

---

## 3. 输出是字符串，不是数字

注释把这一点说得很直接：

```ts
 * The pair -- not the divisor -- is what both callers render, and it has to be
 * exact: dividing through a float `g` is how 0.3 / 0.1 became
 * 2.9999999999999996. Strings rather than numbers on the way out so a 17-digit
 * numerator is never rounded back through a double.
```

对照裸浮点除法：

```
算式            double 结果           reducePair 结果
0.3 / 0.1       2.9999999999999996    3 : 1
0.6 / 0.2       2.9999999999999996    3 : 1
0.3 / 0.2       1.4999999999999998    3 : 2
0.9 / 0.3       3                     3 : 1
0.05 / 0.01     5                     5 : 1
24 / 36         0.6666666666666666    2 : 3
123.456 / 0.789 156.47148288973384    41152 : 263
```

`0.3 / 0.1` 和 `0.9 / 0.3` 在数学上都是 3，前者给 `2.9999999999999996`，后者恰好给 `3`。这不是巧合也不是运气——是二进制表示在特定值上的舍入方向。约分这一侧不受影响，因为整个计算在 BigInt 里。

`24 / 36 = 0.6666666666666666` 这一行要单独记一下：这是 fraction 页面**第二行输出**实际显示的内容，见第 5 节。

---

## 4. 0 的三种处理，只有一种真能从界面触达

```ts
	const g = gcdBig(X, Y);
	const d = g === 0n ? 1n : g;
```

`gcdBig(0n, 0n)` 返回 `0n`，`g === 0n ? 1n : g` 把它换成 `1n`。注释里点名了这三种：

```
输入     输出
(0, 0)   0 : 0
(0, 5)   0 : 1
(5, 0)   1 : 0
```

`0 : 0 → 0 : 0`、`0 : n → 0 : 1`，而不是 `NaN : NaN`——两个调用方渲染的都是字符串，`NaN` 会原样印到界面上。

但这三种里，只有 `n : 0` 真能从界面触达。看两个调用方各自的守卫：

fraction 页面：

```ts
	if (Number.isFinite(a) && Number.isFinite(b) && b !== 0) {
		const p = reducePair(a, b)!;
```

`b !== 0` 直接拦掉了 `0 : 0` 和 `n : 0` 两种情况。`a = 0, b = 5` 会进来，得到 `0 : 1`。

ratio 页面：

```ts
	if (a === 0 && b === 0) {
		rows.push({ ... value: '— (both zero)' });
	} else {
		const p = reducePair(a, b)!;
```

只拦 both-zero。所以 `a = 5, b = 0` 会落进 `else`，`reducePair(5, 0)` 返回 `{x: '1', y: '0'}`，界面显示 `1 : 0`——同一页的另一行 `A ÷ B` 同时显示 `— (division by 0)`。

也就是说：`0 : 0 → 0 : 0` 这条分支在两个调用方都被上游拦掉了，是不可达的防御代码。`0 : n → 0 : 1` 在 fraction 页面可达。`n : 0 → 1 : 0` 只在 ratio 页面可达。

---

## 5. 同一个页面三套精度哲学

把 fraction 的 `compute` 完整看一遍：

```ts
	compute: (v) => {
		const rows: import('./registry').FormResultRow[] = [];
		const a = v.num('a');
		const b = v.num('b');
		if (Number.isFinite(a) && Number.isFinite(b) && b !== 0) {
			const p = reducePair(a, b)!;
			rows.push({ label: `a/b simplified`, labelZh: 'a/b 最简分数', value: `${p.x} / ${p.y}`, emphasis: true });
			rows.push({ label: 'a/b as decimal', labelZh: '对应小数值', value: formatNumber(a / b) });
			rows.push({ label: 'a/b as percent', labelZh: '对应百分比', value: pct((a / b) * 100) });
		}
```

同一份输入，三行输出，三条不同的路径：

| 行 | 用什么算 | 精度 |
|---|---|---|
| `a/b simplified` | `reducePair`，字符串 + BigInt | 精确整数 |
| `a/b as decimal` | `formatNumber(a / b)`，裸浮点除法 | 最近 double |
| `a/b as percent` | `pct((a / b) * 100)`，裸浮点除法 | 最近 double |

默认值 `a=24, b=36` 在页面上的实际显示：

```
a/b simplified      2 / 3
a/b as decimal      0.6666666666666666
a/b as percent      66.66666666666666 %
```

第一行是精确的，后两行是浮点除法的产物。工具没有做「2/3 显示成 0.6…（循环小数）」或者「2/3 显示成 66.7 %」这种处理——它就是把 `a / b` 交给 `formatNumber`。

---

## 6. `decimalToFraction` 全程 double，不读字符串

页面下半部分那个「把小数还原成精确分数」的字段用的是另一个函数，走的是完全不同的路径：

```ts
/** Decimal → fraction via continued fractions; null when no exact match within maxDenom. */
function decimalToFraction(x: number, maxDenom = 10000): { num: number; den: number } | null {
	const sign = x < 0 ? -1 : 1;
	x = Math.abs(x);
	let h1 = 1,
		h0 = 0,
		k1 = 0,
		k0 = 1,
		b = x;
	for (let i = 0; i < 32; i++) {
		const a = Math.floor(b);
		[h0, h1] = [h1, a * h1 + h0];
		[k0, k1] = [k1, a * k1 + k0];
		if (k1 > maxDenom) break;
		if (Math.abs(x - h1 / k1) < 1e-12) return { num: sign * h1, den: k1 };
		const frac = b - a;
		if (frac < 1e-12) return k1 <= maxDenom ? { num: sign * h1, den: k1 } : null;
		b = 1 / frac;
	}
	return k1 <= maxDenom && Math.abs(x - h1 / k1) < 1e-9 ? { num: sign * h1, den: k1 } : null;
}
```

标准的连分数展开：`h0, h1` 是收敛分子，`k0, k1` 是收敛分母。但**全程没有一次读字符串**——`Math.floor(b)`、`b - a`、`1 / frac`、`h1 / k1`、`Math.abs` 全都是 double 运算。第 1 节那个「读字符串是为了拿到十进制数字」的设计，在这里没有。

后果就是标题里那件事。实测：

```
输入                    decimalToFraction        说明
0.375                   { num: 3, den: 8 }       终止小数
0.1                     { num: 1, den: 10 }
1.5                     { num: 3, den: 2 }
10.1                    { num: 101, den: 10 }
0.5                     { num: 1, den: 2 }
3                       { num: 3, den: 1 }
0                       { num: 0, den: 1 }
-0.75                   { num: -3, den: 4 }
1/3（double 1/3）        { num: 1, den: 3 }       恰好命中
1/7                     { num: 1, den: 7 }
1/6                     { num: 1, den: 6 }
1e9                     { num: 1000000000, den: 1 }
2.2222222222222223      { num: 20, den: 9 }       正好是 20/9 的 double
0.0001                  { num: 1, den: 10000 }    分母恰好触界
0.3333                  { num: 3333, den: 10000 } ← 标题里那一行
0.33333333              null
0.3333333333333333      { num: 1, den: 3 }       16 个 3 够近
0.123456789             null
3.14159                 null
1/10007                 null                     分母超过 10000
```

`0.3333` 给 `3333 / 10000`，`1/3` 那个 double 给 `1 / 3`。两个输入都是 double，工具对它们给出两个答案——一个是精确值，一个是近似真值。中间没有任何标记。

对照第 2 节那组字符串路径的证据：`reducePair(0.33, 0.11) → 3 : 1`。同一个「0.33 和 0.11 是什么关系」的问题，页面上半部分给 `3 : 1`（字符串路径，`33/11` 约分），下半部分给 `3333 / 10000`（double 路径，`0.3333` 的精确值）。

---

## 7. 32 次迭代、两个容差、一个不含等号的比较

`for (let i = 0; i < 32; i++)` 是硬编码的迭代上限。

两个容差出现在不同位置，宽度不同：

- 循环体内的早退判定 `Math.abs(x - h1 / k1) < 1e-12`
- 循环耗尽后的兜底判定 `Math.abs(x - h1 / k1) < 1e-9`

兜底容差比早退容差**松三个数量级**。这不是随手写的：`b = 1 / frac` 每迭代一次就引入一次 double 舍入，32 次之后累积漂移足以让本来精确的收敛值离开 `1e-12` 窗口。但代价是兜底那一步会接受一些严格意义下不精确的分数。

`k1 > maxDenom` 不含等号。所以分母**恰好等于** `maxDenom` 的收敛值能通过——实测 `0.0001 → {1, 10000}`，分母正好触界。`0.375` 在 `maxDenom = 8` 时返回 `{3, 8}`，在 `maxDenom = 7` 时返回 `null`。

同一批实验里另一组能说明「精确值 vs 近似真值」的分界：

```
0.3333 在 maxDenom = 100    → null
0.3333 在 maxDenom = 9999   → null
0.3333 在 maxDenom = 10000  → { 3333, 10000 }
```

`3333 / 10000` 是 `0.3333` 的精确值，不需要「宽容」就能命中。把上限压到 9999 就再也拿不到它了——因为唯一的收敛候选就是 10000。

---

## 8. `maxDenom` 硬编码 10000，界面上没有这个字段

```ts
	const d = v.num('d');
	if (Number.isFinite(d)) {
		const f = decimalToFraction(d);
		rows.push({
			...
			value: f ? `${f.num} / ${f.den}` : 'no exact fraction with a denominator ≤ 10000',
			valueZh: f ? undefined : '未找到分母 ≤ 10000 的精确分数',
```

`decimalToFraction(d)` 无参调用，走默认值 `maxDenom = 10000`。而 fraction 的 `fields` 只有三个：`a`、`b`、`d`——**没有 `maxDenom`**。界面上改不了这个阈值。

错误文案和默认参数耦合在一起：`'no exact fraction with a denominator ≤ 10000'` 和 `'未找到分母 ≤ 10000 的精确分数'` 两条文案里都硬编码了 `10000`。把默认参数改成别的值，需要同时改两处英文和两处中文共四条文案，漏改任何一条都是静默的——用户看到的阈值和代码里的阈值不一致，界面上没有任何东西会告警。

顺带一条措辞上的偏差。fraction 的 `introZh` 原文：

> 上方将分数约分为最简形式和小数；下方将任意小数还原为精确连分数。

输出实际是分数，不是连分数。`descriptionZh` 那一条写的是「支持小数利用连分数逆向还原为精确分数」，这句是对的——说的是「利用连分数」这个手段，产物是分数。两处文案一个准一个偏。

---

## 9. 质因数分解为什么用 `type: 'bigint'`

同一个 category 下，fraction 的 `a`/`b`/`d` 都用 `type: 'number'`：

```ts
	{ id: 'a', label: 'Fraction numerator a', labelZh: '分子 a', type: 'number', def: '24', step: 'any' },
```

prime-factorization 的那一个字段用 `type: 'bigint'`：

```ts
	{
		id: 'number',
		label: 'Number',
		labelZh: '待分解整数',
		// bigint (text + numeric keypad), not number: an <input type=number>
		// round-trips through a JS Number, which stops being exact at 2^53 —
		// above that the factorization could not be trusted. BigInt holds the
		// whole 2..2^64−1 range exactly (Miller–Rabin is deterministic <2^64).
		type: 'bigint',
		def: '360',
		required: true,
		hint: 'Whole number 2 … 2^64−1 (up to 20 digits).',
		hintZh: '整数 2 … 2^64−1（最多 20 位）。',
	},
```

注释里的理由是 `<input type="number">` 的值会 round-trip 过 JavaScript Number，而 Number 在 2⁵³ 以上不再精确。分解一个大整数时，输入阶段就已经丢精度了——`9007199254740993`（2⁵³+1）在 Number 里就是 `9007199254740992`，分解结果从一开始就是错的。

两个页面选了相反的方向，理由也相反：fraction 页面要处理的值是小数和整数混着来的，`type: 'number'` 的 `step: 'any'` 才方便；prime-factorization 要处理的值最大 20 位，必须绕开 Number。

`v.bigint` 的实现值得一看：

```ts
		bigint: (id) => {
			if (hidden(id)) return null;
			const raw = String(getters.get(id)?.() ?? '').replace(/,/g, '').trim();
			return /^\d+$/.test(raw) ? BigInt(raw) : null;
		},
```

`/^\d+$/` 只认纯数字串。所以 `3.5`、`-360`、`1e6`、`1_844_674_407_370_955_1615`（下划线千分位）全部返回 `null`，落到 `compute` 里 `n === null` 那个分支，界面显示 `— (enter a whole number from 2 to 2^64−1)`。只有逗号千分位会被 `replace(/,/g, '')` 吃进来——`1,844,674,407,370,955,1615` 能进。

这跟 fraction 那边 `v.num` 的行为正好相反：`v.num` 走 `Number(String(...).replace(/,/g, ''))`，`3.5`、`-24`、`1e3` 都能进来。同一个表单框架，两种字段类型，两种输入容差。

---

## 10. hint 写「最多 20 位」，`factorWhole` 里有一个死分支

先说 hint 那条是**准确**的：

```
2^64 − 1 = 18446744073709551615   20 位
2^63 − 1 = 9223372036854775807    19 位
2^53    = 9007199254740992        16 位
2^53 − 1 = 9007199254740991       16 位
```

`2^64 − 1` 确实是 20 位。但「最多 20 位」是**必要条件，不是充分条件**：

```
19 位最大值 9999999999999999999   < 2^64 − 1   → 一定在范围内
20 位最小值 10000000000000000000  < 2^64 − 1   → 在范围内
20 位 18446744073709551615       = 2^64 − 1   → 在范围内
20 位 18446744073709551616       = 2^64       → 超出
20 位 99999999999999999999                        → 超出
```

19 位输入一定在 `[2, 2^64−1]` 里。20 位输入要看量级——最小的 20 位数在范围内，最大的 20 位数超出 8 位。界面上 `18446744073709551616` 会被拒，显示 `— (enter a whole number from 2 to 2^64−1)`。

再看 `factorWhole` 开头那一行：

```ts
function factorWhole(n: bigint): { factors: Array<{ f: bigint; e: number }>; divisors: number } {
	// 1 has no prime factors and 0 has infinitely many divisors. Both sit outside
	// the documented range, but the trailing-zero peel below shifts 0n into 0n
	// forever, so settle here rather than trusting the caller's guard.
	if (n <= 1n) return { factors: [], divisors: n === 1n ? 1 : 0 };
```

注释自己承认这是防御分支：`0n` 往下走会撞那个 trailing-zero peel——`0n >> 1n` 还是 `0n`，`while ((rest & 1n) === 0n)` 永远为真。

但这个分支在工具的调用方里**不可达**：

```ts
				const n = v.bigint('number');
				if (n === null || n < 2n || n >= 1n << 64n) {
					return { rows: [{ label: 'Result', value: '— (enter a whole number from 2 to 2^64−1)' }] };
				}
```

调用方已经拒掉了所有 `n < 2n`。所以 `factorWhole` 里的 `n <= 1n` 是一条死分支——注释里说的 `rather than trusting the caller's guard` 是准确的，它确实没有信任调用方，但代价是这段代码永远不会被执行。

`isPrime` 里同样的模式重复了一次：`if (n < 2n) return false;`，而 `factorBig` 的调用链里 `n` 已经是 `> 1n` 的合数。两处都是防御性写法。

---

## 11. τ(n) 的分布，以及「20 位」这条线的算法

```ts
		const repr = factors
			.map(({ f, e }) => (e === 1 ? f.toString() : `${f}^${e}`))
			.join(' × ');
```

输出格式：指数为 1 的只写因子，指数大于 1 的写 `f^e`，用 ` × ` 连接。

实测，四个跨尺度的输入：

```
输入                  质因数分解                                                    约数个数 τ
360                   2^3 × 3^2 × 5                                                24
1000000007            1000000007                                                   2
2^53 − 1             6361 × 69431 × 20394401                                      8
2^53                 2^53                                                          54
2^63 − 1             7^2 × 73 × 127 × 337 × 92737 × 649657                        96
2^64 − 1             3 × 5 × 17 × 257 × 641 × 65537 × 6700417                     128
9999999999999999999  3^2 × 1111111111111111111                                     6
```

τ(n) = Π(eᵢ + 1)，`1000000007` 是素数所以 τ = 2，`2^64 − 1` 的七个素因子各只出现一次所以 τ = 2⁷ = 128。

`2^53 − 1` 那一行值得单说：它是 16 位数，完全落在 Number 的精确范围内——如果这条路径走 `type: 'number'`，输入阶段就不会丢精度。但它的三个因子 `6361`、`69431`、`20394401` 都是中位素数，试除到 √n 需要走到 94906265 附近，也就是 SMALL_PRIMES 注释里点名的那个量级。

算法那一侧的三条常数：

```ts
const MR_BASES = [2n, 325n, 9375n, 28178n, 450775n, 9780504n, 1795265022n];
```

七个底数，`isPrime` 的注释写的是 `Deterministic below 2^64`——覆盖工具接受的全部输入。表里 `SMALL_PRIMES` 是 168 个素数、从 2 到 997，正好是 1000 以内的全部素数。Pollard rho 那一段用 Brent 循环检测加批量 GCD，批量大小 `m = 128`，步数上限 `r > 65536` 就换一个种子重来，`c` 从 `1n` 试到 `100n`。

这三个数字（批量 128、步数上限 65536、重试 100 次）界面上都看不到。它们的失败模式是静默的：`pollardRho` 走完 100 次都没找到因子就 `return n`，`factorBig` 拿回 `n` 会把它当成一个素因子收进结果——如果输入真的是合数，输出会显示一个错误的「质因数分解」，界面上没有任何标记。

---

## 12. 这套计算器覆盖什么，覆盖不了什么

覆盖的：

- 分数约分、转小数、转百分比三行输出，比例方程 `A:B = C:x` 求 `x`
- 约分路径全程整数：`gcdParts` 读最短 round-trip 串，`reducePair` 用 BigInt 欧几里得，输出用字符串
- 小数还原分数：连分数展开，分母上限 10000 时给出精确匹配或明确返回 `null`
- 质因数分解覆盖 `[2, 2^64−1]`，输入、Miller–Rabin、Pollard rho 全程 BigInt
- 输入 20 位整数不丢精度——`v.bigint` 绕开 Number，`1,844,674,407,370,955,1615` 带逗号也能进
- 越界分支都有守卫文案：分母为 0、A 和 B 同时为 0、超范围、`no exact fraction with a denominator ≤ 10000`
- τ(n) 与质因数分解同时给出，输出格式可预测（指数为 1 省略）

覆盖不了的：

- **同一个页面三套精度哲学**。`a/b simplified` 走字符串 + BigInt 是精确的，`a/b as decimal` 是裸浮点除法（24/36 显示 `0.6666666666666666`），`Decimal as fraction` 走 double + 1e-12 容差。三条路径对同一份输入可能给出三种不同精度的答案。
- **`0.1 + 0.2` 喂进 a/b 会产出 16 位分子**。`gcdParts` 忠实读最短 round-trip 串，而那个 double 的最短串是 `0.30000000000000004`。工具不帮你抹浮点误差——它会如实报告那个 double 的样子。
- **`decimalToFraction` 给的是精确值，不是近似真值**。`0.3333 → 3333/10000`，`1/3 → 1/3`。两个输入都是 double，通分后分子差 1，中间没有标记。想要「把 0.3333 还原成 1/3」这种近似反演，这个工具不给。
- **同一批小数在不同字段给出不同答案**。`reducePair(0.33, 0.11)` 走字符串路径给 `3 : 1`；`decimalToFraction(0.3333)` 走 double 路径给 `3333 / 10000`。同一个「0.33 和 0.11 是什么关系」的问题，页面上半和下半给的不是同一种答案。
- **`maxDenom` 硬编码 10000，界面上没有字段可改**。错误文案与默认参数耦合（两条英文、两条中文都硬编码了 `10000`），改常量要同时改四处文案，漏改任何一处都不会告警。
- **两个容差宽 3 个数量级**。循环内早退 `1e-12`，循环耗尽后兜底 `1e-9`——兜底那一步会接受严格意义下不精确的分数。
- **32 次迭代上限不可配**。连分数的收敛速度取决于输入，`1/10007` 这种分母刚超过 10000 的直接返回 `null`。
- **`fraction` 的 `introZh` 与行为不一致**。文案说「还原为精确连分数」，输出是分数。`descriptionZh` 那一条写的是对的。
- **20 位输入需要过量级比较**。19 位输入一定在 `[2, 2^64−1]` 里，20 位要看量级：`18446744073709551615` 在范围内，`18446744073709551616` 超出。hint 里的「最多 20 位」是必要条件，不是充分条件。
- **`v.bigint` 只认纯数字串**。`3.5`、`-360`、`1e6`、`1_844_674_407_370_955_1615` 全部返回 `null`，只显示一句「请输入 2 到 2^64−1 的整数」。只有逗号千分位会被吃进来。
- **`factorWhole` 的 `n <= 1n` 分支不可达**。调用方已经拒掉了所有 `n < 2n`。注释自己写的是 `rather than trusting the caller's guard`，但这段代码永远不会被执行。`isPrime` 的 `n < 2n` 同样不可达。
- **Pollard rho 的三个内部常数界面上看不到**。批量 GCD 128 步、步数上限 65536、重试 100 次——全部硬编码。走满 100 次重试仍无因子时 `return n`，`factorBig` 会把它当成素因子收进结果，输出一个错误的「质因数分解」而界面上没有标记。
- **`SMALL_PRIMES` 只到 997**。168 个素数、覆盖试除的第一遍。中位素数（如 `2^53−1` 的 `20394401`）落在这张表之后，靠 rho 拆分。

两条实用建议。第一，用 fraction 页面做自动化之前先分清你在读哪一行——`a/b simplified` 是精确整数对，可以直接用；`a/b as decimal` 和 `a/b as percent` 是浮点除法的产物，需要自己决定舍入策略。下半部分的 `Decimal as fraction` 给的是精确值不是近似真值，`0.3333` 想还原成 `1/3` 它做不到。第二，拿超过 19 位的整数去分解之前，先确认它不超出 2^64−1。19 位保证在范围内；20 位要看量级，界面上被拒只会给一句「请输入 2 到 2^64−1 的整数」，不会告诉你它到底超了多少。
