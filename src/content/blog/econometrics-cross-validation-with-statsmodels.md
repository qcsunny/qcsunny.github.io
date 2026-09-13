---
title: '不信任自己的记忆：计量经济学工具的 136 组 statsmodels 交叉验证'
description: '写一个 2500 行的计量经济学数值内核（OLS 到 Johansen 协整），最危险的不是工程是数学。本文记录 136 组 statsmodels/scipy 对照怎么抓出 11 个真实数学 bug——LU 主元顺序、t/F 分布的 survival 公式、incBeta 的符号、ARMA 递归的符号——以及为什么 ADF 临界值永远不该靠记忆写。'
pubDate: 'Sep 12 2026'
category: algorithms
topics: [statistics, numerical-computing, algorithms]
searchTerms: ['计量经济学', '交叉验证', 'statsmodels', '数值计算']
contentLang: 'zh-CN'
relatedTools: ['calculators/linear-regression', 'calculators/logistic-regression', 'calculators/arima-forecast', 'calculators/var-vecm']
relatedPosts: ['sample-variance-bessel-correction-and-welford', 'text-diff-lcs-dynamic-programming-and-similarity']
---

站内 Calculators 分类新增了十个计量经济学工具：线性回归（OLS/WLS/GLS、分位数、混合效应）、离散选择（Logit/Probit、计数回归）、时间序列（ADF/KPSS、ARIMA、VAR/Johansen、卡尔曼滤波）、回归诊断（异方差、自相关、稳健标准误、影响点）。数值内核是 `src/tools/econometrics.ts`——2500 行，68 个导出的值（67 个函数加一个 `expit` 常量），不碰 DOM、不用 `Math.random`、不读时钟，全部确定性。

我一开始把它的规模记成了「2500 行、89 个导出函数」。行数碰巧对，函数个数错了 21 个。这大概就是这篇文章想说的第一件事，只是发生得比预想的早。

界面上错了，用户会截图发回来。系数算错了没人发——他们只会拿一个错误的经济学结论去下决定。所以真正值得写的是后半段：怎么证明自己写对了。一套 136 组的 statsmodels/scipy 交叉验证，以及它抓出来的 11 个数学 bug。

---

## 1. harness 怎么搭

动手前定了条规矩：每个数值函数上线前，必须与 statsmodels 在同一组数据上逐项对数。落成一条三段流水线：

```
python gen.py ──► expected.json ──► esbuild bundle ──► node compare.mjs
（statsmodels      （固定种子         （TS 内核打包成      （逐组对数，
 生成期望值）        的数据+答案）       可执行 mjs）        容差 1e-6~1e-10）
```

绕这么一圈是环境逼的。仓库的 node 跑不了 TypeScript，venv 里的 statsmodels 进不了浏览器，两边只能靠 JSON 握手。gen.py 用固定种子生成回归矩阵、时间序列和面板分组，对每组数据调 statsmodels 拿答案，连数据带答案写进 expected.json；esbuild 把内核打成 mjs，node 脚本逐组调用逐项比。两边吃同一份种子，数据漂移就被排除掉了——不一致只剩下一个解释：实现分歧。

容差按方法定，不一刀切。OLS/GLM/VAR 的系数和标准误对 1e-8；Johansen 迹统计量放宽到 1e-6，特征值排序本身允许并列；ARIMA 的 CSS 估计到 1e-4，因为它的目标函数和 statsmodels 的 MLE 根本不是一个函数，第 5 节展开。136 组全过。

---

## 2. 凭记忆写常数

设计阶段我凭记忆写下了 ADF 检验的 MacKinnon 2010 临界值：−3.454 / −2.887 / −2.581。真值是 −3.4304 / −2.8615 / −2.5668。KPSS 的 trend 情形我记成 0.463 / 0.574 / 0.673，真值 0.119 / 0.146 / 0.216，差了快一个数量级。Numerical Recipes 的 betacf 连分式系数也记错，差 6%。

这三个数最后都是去 statsmodels 源码里读的。"查了权威实现"和"我记得是对的"不是同一个东西——后者在写下来的那一刻就已经是数据了，只是这份数据的误差方差大得离谱。

---

## 3. 十一个真 bug

这 11 个全部由对照发现，而且只有对照能发现。类型系统拦得住未定义变量，拦不住正则化不完全 Beta 里的一个正负号。

**LU 主元顺序**，最隐蔽的一个。带部分主元的 LU 分解里，第 k 步的行交换会连带已算好的乘数一起换行，所以存下来的 L 属于"完全置换后的矩阵"。正确做法是先把所有行交换按发生顺序整体应用到 b，再做一次朴素前代。我最初写成"边交换边消元"：对不需要交换主元的矩阵完全正确，一旦某步真的发生交换，前代用的乘数和 b 的行就错位了。更恶心的是，良态测试数据常常不触发主元交换，而 Logit 的 IRLS 迭代到第三轮才开始交换——表现出来是 IRLS 周期性发散，看着像收敛策略的问题。修好的 `luApply` 后面挂了一段注释说明置换为什么必须整体前置。

**t 与 F 的 survival 函数**。我凭直觉写成了 `incBetaUpper`，正确的是**正则化不完全 Beta 本身**：

```ts
export function tSurvival(df: number, t: number): number {
	// P(T > t)，t 两侧对称；关键：用 I_x(df/2, 1/2)，x = df/(df+t²)
	return 0.5 * incBeta(df / 2, 0.5, df / (df + t * t));
}
```

F 分布同理，自由度位置对调：$P(F > f) = I_{df_2/(df_2+df_1 f)}(df_2/2,\, df_1/2)$。假设检验工具里每一个 p 值都压在这两个函数底下，正则化方向错一个，全错。

**incBeta 的符号**。$B_t(a,b)$ 的对数前因子我写成了 `+lnBeta(a,b)`，应该是 `-lnBeta(a,b)`——除以完全 Beta 函数，不是乘。一个正负号，p 值偏几个数量级。

**连分式实现**。凭记忆手写的 betacf 收不到正确值。换成 DLMF 5.12 的连分式加修正 Lentz 算法之后，与 scipy 逐值对到 4e-14。"记得大意"和"照着 DLMF 抄"之间正好隔着一个 bug。

**GLS 变换**。我一开始用 Z = V⁻¹X 的变换法解广义最小二乘——这**只对对角 V 成立**。一般 V 要么做 Cholesky，要么直接解正规方程 (X'V⁻¹X)β = X'V⁻¹y。AR(1) 误差结构的 V 不是对角的，变换法给出的系数全错。

**ARMA 递归的符号**。AR 模型的差分方程里 c = −ar.slice(1)，负号漏掉，AR(1) 的自相关直接镜像翻转。

**cluster 稳健标准误的 meat**。聚类的三明治协方差要按**组**聚合：meat = Σ_g s_g s_g'，s_g = Σ_{i∈g} x_i e_i——每组先在组内求和，再取外积。我写成 Σ x'x e²，那是异方差 HC 的形状，对聚类情形低估了组内相关带来的方差。

**IRF 递归**。VAR 的脉冲响应是 Φ_h = Σ_{l=1}^{p} Φ_{h−l} A_l，我只用了 Φ_{h−1}·A_1。p > 1 时第 3 期以后全错，修法是保留整个 phis 数组而不是滚动覆盖。

**分位数回归的权重**。损失函数 |e| 的 check 权重应该是 e<0 ? (1−τ) : τ，我写反了。τ=0.9 的"上分位数"被拟合成 0.1——这种错不崩也不发散，只是安静地给出另一个问题的答案。

剩下两个同类：erf 级数漏掉 2/√π 因子，cluster 对称化的循环边界。都是"代码跑得很顺，结果不对"。

---

## 4. 数值对上之后的第二层

还有统计惯例这一层。同一组数据，两个都"正确"的实现能给出不同的标准误，因为惯例不同：

- Probit 的标准误，GLM 框架用 EIM（期望信息矩阵），discrete 框架用 OIM（观测信息矩阵）。选了 EIM 并在工具页注明，站内走 IRLS 路线，与 sm.GLM 对齐；
- HAC（Newey–West）的小样本修正，Stata 的 newey 乘 n/(n−k)，statsmodels 的 `get_robustcov_results` 不乘。选乘，对齐 Stata，对工具页常见的小样本输入也更保守；
- BG 自相关检验的前 p 个滞后残差，Greene 与 statsmodels 都用零填充，照做；
- Johansen 的确定性项，`det_order=-1`（无确定性项的辅助回归）才是与我们的裸实现对应的口径。

惯例本身没有对错，不标明才是问题。每个选择都写进了工具页的 note，拿结果去和论文对照的读者知道分歧会在哪。

还有一处刻意不做：Johansen 的迹统计量**不硬编码临界值表**。MacKinnon-Haug-Michelis 的表按 K、det_order、样本量三维插值，抄错一格就是第 2 节的故事重演。工具只输出统计量本身，并明确写"请对照发表的临界值表"。

---

## 5. 三处对不上

有三组对照天然对不齐，各得换一个参照物。

**ARIMA 的 CSS vs MLE**。statsmodels 默认做精确 MLE，用 Kalman 滤波算似然；我们的实现用条件平方和。目标函数不同，参数在小样本下差异可观。参照物换成**用 scipy 独立实现同一个 CSS 目标函数**，比的是"我们的优化器 vs scipy 的优化器"在同一目标上的解。这条路还顺带抓出一个参数化问题：把 θ 映射到 (−1,1) 的 tanh 变换在 |θ|→1 时梯度消失，Nelder–Mead 在平坦区爬不动。改成裸参数，加 |v|≥0.9995 的屏障函数，再配三段重启。

**Kalman 的初始化**。statsmodels 用扩散初始化，我们用 x₀=y[0]、P₀=10(σa²+σe²)+1 的平稳近似，前若干步的滤波方差天然不同。参照物换成**用 numpy 镜像同一套初始化约定**的独立实现，对齐到 1e-8。这验证的是滤波方程和递归没有 bug，不是我们与 statsmodels 惯例一致——后者本来就不是目标。

**Granger 因果的 df**。statsmodels 的系统级检验用 K·df_resid 做分母自由度，教科书单方程检验用 F(p, T−Kp−1)。两个流派都真实存在，选了教科书口径并注明。

---

## 6. 留下来的几条做法

- 验证是开发的一部分，不是收尾。harness 与内核同步生长，每写完一个函数立刻进 gen.py——11 个 bug 没有一个活过当天；
- 固定种子是对照的前提，两边喂同一份数据，排除掉"数据不同"这个最无聊的分歧源；
- 记忆不是数据源，临界值、公式细节，从权威实现里读，不从脑子里抄；
- "对不上"先分类再处理：bug 就改代码，惯例就选择并注明，本质不同就换参照物；
- 确定性是可验证的前提。内核不用随机、不读时钟，e2e 才能把拟合系数钉到小数位。

十个工具都在这块内核上：[线性回归](/calculators/linear-regression/)、[Logit/Probit](/calculators/logistic-regression/)、[计数回归](/calculators/count-regression/)、[平稳性检验](/calculators/time-series-stationarity/)、[ARIMA 预测](/calculators/arima-forecast/)、[VAR 与协整](/calculators/var-vecm/)、[卡尔曼滤波](/calculators/state-space-kalman/)、[回归诊断](/calculators/ols-diagnostics/)、[分位数回归](/calculators/quantile-regression/)、[混合效应](/calculators/mixed-effects-model/)。全部本地运算，数据不出浏览器。
