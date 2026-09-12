---
title: '从置信区间到方差分析：一个纯函数统计工具链的设计'
description: '站内三个统计计算器（置信区间、假设检验、方差分析）共用同一个数学底座——正则化不完全 Beta 函数。拆解 Lanczos 近似、连分式展开如何给出 ANOVA 的 p 值，以及为什么 n=5 时 t 分位数是 2.78 而不是 1.96。'
pubDate: 'Sep 12 2026'
category: math
topics: [statistics, mathematics]
searchTerms: ['置信区间', '假设检验', '方差分析', 'p 值']
contentLang: 'zh-CN'
relatedTools: ['calculators/confidence-interval', 'calculators/hypothesis-testing', 'calculators/anova-calculator', 'calculators/normal-distribution']
relatedPosts: ['sample-variance-bessel-correction-and-welford']
---

站内 Calculators 分类新添了三个推断统计工具：[置信区间](/calculators/confidence-interval/)、[假设检验](/calculators/hypothesis-testing/)、[方差分析](/calculators/anova-calculator/)。它们是"纯函数 + 注册表"架构下的三个 FormConfig——没有引入任何统计库，从 t 分布分位数到 F 检验 p 值全部手写。这篇文章记录设计中最有料的一段：**三个工具背后其实是同一个数学函数**。

---

## 1. 三个工具，一个底座

先把三个工具的数学骨架列出来：

| 工具 | 核心量 | 需要的分布函数 |
| --- | --- | --- |
| 置信区间（t 模式） | $\bar{x} \pm t_{0.975,\,n-1} \cdot s/\sqrt{n}$ | t 分布**分位数**（给定概率找临界值） |
| 假设检验（t 检验） | $t = (\bar{x}-\mu_0)/(s/\sqrt{n})$ | t 分布**尾部面积**（给定统计量找概率） |
| 方差分析（ANOVA） | $F = MSB/MSW$ | F 分布**尾部面积** |

第一眼是三个不同的查表需求。但数理统计给出了一条漂亮的统一路径：t 和 F 的尾部面积都可以写成**正则化不完全 Beta 函数** $I_x(a,b)$。

ANOVA 的 p 值计算在 `src/tools/calculators.ts` 里只有三行：

```ts
const x = dfw / (dfw + dfb * fStat);
pValue = betaIncomplete(dfw / 2, dfb / 2, x);
```

$P(F_{d_1,d_2} > f) = I_{d_2/(d_2 + d_1 f)}(d_2/2,\, d_1/2)$——组内自由度在前、组间自由度在后，代入即可。t 检验的双侧 p 值是同一个函数换参数（$a = \nu/2$，$b = 1/2$）。所以真正的工程量集中在**把一个函数写对**：`betaIncomplete`。

---

## 2. betaIncomplete：Lanczos + 连分式

$B_x(a,b) = \int_0^x t^{a-1}(1-t)^{b-1}\,dt$ 没有初等闭式，标准做法是 Numerical Recipes 的三段式：

```ts
const bt = Math.exp(
	logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
);
if (x < (a + 1) / (a + b + 2)) {
	return (bt * betaCf(a, b, x)) / a;
}
return 1 - (bt * betaCf(b, a, 1 - x)) / b;
```

三个部件各有来路：

**logGamma 用 Lanczos 近似**。9 个系数的 g=7.5 版本，对 z ≥ 0.5 直接算，z < 0.5 走反射公式 $\Gamma(z)\Gamma(1-z) = \pi/\sin(\pi z)$。为什么不直接 `Math.exp(logGamma(...))` 分着乘？因为 $\Gamma(200)$ 这类中间量会溢出 double——对数域里加减，只在最后一步 exp，是所有涉及阶乘量级的计算的通用纪律。

**betaCf 是 Lentz 算法推进的连分式**：

```ts
let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
```

对称性分支 `x < (a+1)/(a+b+2)` 决定用原式还是余式（$1 - I_{1-x}(b,a)$）——连分式只在 $x$ 小于某个切换点时收敛快，另一侧必须换边。收敛判据 `eps = 3e-7`、上限 100 次迭代，对统计工具的精度需求（p 值报 4 位有效数字）绑绑有余。

**实现后逐值对照**：拿 scipy 的 `scipy.stats.f.sf` 和 `scipy.stats.t.sf` 在 df ∈ {1, 2, 5, 10, 30, 100} × 统计量 ∈ {0.5, 1, 2, 5} 的网格上比对，最大相对误差 < 1e-6——数值代码不跑对照就上线，和不做测试就上线是一个性质。

---

## 3. 设计决策：查表还是计算

置信区间工具有一个更便宜的选择：90/95/99 三个置信水平的 Z 临界值是常数，直接写死：

```ts
const zCritMap: Record<string, number> = { '90': 1.64485, '95': 1.95996, '99': 2.57583 };
```

但 t 模式**不能**这么干——t 分位数依赖自由度，是二维表。两条路：

1. 内置一张 df × 置信水平的查表 + 插值——表只能覆盖有限 df，插值在尾部不准；
2. 数值求根：求解 $I_x(\nu/2, 1/2)$ 等于目标尾概率的根。

实现选了 2，理由和 ANOVA 用 betaIncomplete 是同一个：**底座函数已经存在且验证过，复用它比维护一张会过期的表便宜**。这也是三个工具能共享代码的架构原因——`betaIncomplete` 是 calculators.ts 模块级函数，谁需要谁调。

一个值得写进工具 note 的细节：n = 5 时 t₀.₉₇₅ = 2.776 而不是 1.96，区间比正态假设宽 42%。工具在 t 模式的结果行里明确标注自由度，避免"反正都是 1.96"的肌肉记忆——**小样本用正态近似**是这三兄弟最常见的使用错误。

---

## 4. ANOVA：多重比较的工程翻译

为什么要做 ANOVA 工具而不是让用户做三次 t 检验？数学理由在教科书里：三组两两比较三次，每次 α = 0.05，至少一次假阳性的概率 1 − 0.95³ ≈ 14%；十组时 40%。工程翻译就是**把正确的默认行为做进工具**：ANOVA 工具的表单是"3 或 4 组样本各占一个输入框"，一次算出 F、p、SSB/SSW、MSB/MSW 和各组均值——它没提供"两两 t 检验"这个按钮，因为那是在把统计错误做成功能。

```ts
let ssb = 0;
groups.forEach((g, i) => {
	const m = groupMeans[i]!;
	ssb += g.length * (m - grandMean) ** 2;
});
```

实现里 SSB 和 SSW 是两个直白的循环（教科书公式直译），没有合并成 $\sum x^2 - (\sum x)^2/N$ 的"计算简化"形式——那条捷径在浮点世界里会灾难性抵消（两万个相近的大数相减），直译公式每次减的都是同量级的偏差平方，数值上更稳。**先 profiling 再优化**在这里的变体是：先看数值稳定性，再谈指令数。

结果行的 note 直接给结论："在 α = 0.05 水平下应拒绝 H₀ / 无法拒绝 H₀"——p 值的解读是用户最容易错的一步（它不是"H₀ 为真的概率"），能替用户读一行的就替用户读掉。

---

## 5. 工程收获

- **三个工具共享一个底座**：t、F 的尾部面积与分位数都归约到 $I_x(a,b)$，实现一次、验证一次、三处复用；
- **对数域纪律**：Gamma 量级的中间量永远不 exp 到线性域再运算；
- **查表 vs 计算的分界**：常数（Z 临界值）写死，依赖连续参数的量（t 分位数）数值求根，混合策略两头占；
- **数值稳定优先于指令数**：ANOVA 直译"偏差平方和"而不是"平方和相减"；
- **交叉验证是数值代码的测试**：scipy 网格对照 < 1e-6 才算写完。

三个工具都在这里：[置信区间](/calculators/confidence-interval/)、[假设检验](/calculators/hypothesis-testing/)、[方差分析](/calculators/anova-calculator/)，概率密度与累积分布由[正态分布工具](/calculators/normal-distribution/)配套。全部本地运算，数据不出浏览器。
