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

站内 Calculators 分类新增了十个计量经济学工具：线性回归（OLS/WLS/GLS、分位数、混合效应）、离散选择（Logit/Probit、计数回归）、时间序列（ADF/KPSS、ARIMA、VAR/Johansen、卡尔曼滤波）、回归诊断（异方差、自相关、稳健标准误、影响点）。它们的数值内核是 `src/tools/econometrics.ts`——2500 行、89 个导出的纯函数，不碰 DOM、不用 `Math.random`、不读时钟，全部确定性。

写这个东西最大的风险不是工程，是**数学**。一个界面 bug 用户会报错；一个系数算错的回归工具会安静地输出错误的经济学结论。这篇文章记录的不是内核本身（那是一摞教科书公式），而是**怎么证明自己写对了**——一套 136 组的 statsmodels/scipy 交叉验证，和它抓出来的 11 个真实数学 bug。

---

## 1. 验证先于完成：harness 怎么搭

原则在动手前就定了：**每个数值函数上线前，必须与 statsmodels 在同一组数据上逐项对数**。工程上是一条三段流水线：

```
python gen.py ──► expected.json ──► esbuild bundle ──► node compare.mjs
（statsmodels      （固定种子         （TS 内核打包成      （逐组对数，
 生成期望值）        的数据+答案）       可执行 mjs）        容差 1e-6~1e-10）
```

为什么绕这么一圈？仓库的 node 不能直接跑 TypeScript，而 venv 里的 statsmodels 不能进浏览器——两边只能通过 JSON 文件握手。gen.py 用固定种子生成数据（回归矩阵、时间序列、面板分组），对每组数据调 statsmodels 拿到"标准答案"，连数据带答案写进 expected.json；esbuild 把内核打包成 mjs 后，node 脚本逐组调用、逐项比较。**同一份固定种子数据喂两边**，排除数据漂移，任何不一致都是实现分歧。

容差不是一刀切：OLS/GLM/VAR 的系数和标准误对 1e-8；Johansen 迹统计量对 1e-6（特征值排序本身有并列可能）；ARIMA 的 CSS 估计放宽到 1e-4——它的目标函数与 statsmodels 的 MLE **本质不同**（下文展开）。136 组对照，最终全部通过。

---

## 2. 记忆是最不可信的输入源

设计阶段我凭记忆写下了 ADF 检验的 MacKinnon 2010 临界值：−3.454 / −2.887 / −2.581。**错了**。真实值是 −3.4304 / −2.8615 / −2.5668。KPSS 的 trend 情形我记成 0.463/0.574/0.673，真值是 0.119/0.146/0.216——差出一个数量级级别的误判区间。Numerical Recipes 的 betacf 连分式系数我也记错了，差 6%。

这三个常数最后都是从 statsmodels 源码里**读**出来的，不是回忆出来的。教训被写进了长期记忆：统计常数（临界值表、公式细节）先怀疑自己的记忆，再动手验证。对统计工具来说，"查了权威实现"和"记得是对的"是两种完全不同的可信度。

---

## 3. 十一个真 bug：每一条都是对照抓的

这 11 个 bug 全部通过（且仅通过）交叉验证发现——类型系统能拦住未定义变量，拦不住 `incBeta` 里一个正负号。

**LU 主元顺序（最隐蔽的一个）**。带部分主元的 LU 分解里，第 k 步的行交换会**连带已算好的乘数一起换行**，所以存储的 L 属于"完全置换后的矩阵"。正确的解法是先把所有行交换按发生顺序应用到 b 上，再做一次朴素前代。我最初写成了"边交换边消元"——对**不需要交换主元**的矩阵完全正确，一旦某步发生交换，前代用的乘数和 b 的行就错位了。这个 bug 的恶心之处在于：良态测试数据常常不触发主元交换，而 Logit 的 IRLS 迭代到第三轮开始交换——于是 IRLS 周期性发散。修好的 `luApply` 现在带着一段注释解释为什么置换必须整体前置。

**t 与 F 的 survival 函数**。凭直觉写成了 `incBetaUpper`，正确公式是**正则化不完全 Beta 本身**：

```ts
export function tSurvival(df: number, t: number): number {
	// P(T > t)，t 两侧对称；关键：用 I_x(df/2, 1/2)，x = df/(df+t²)
	return 0.5 * incBeta(df / 2, 0.5, df / (df + t * t));
}
```

F 分布同理但自由度位置对调：$P(F > f) = I_{df_2/(df_2+df_1 f)}(df_2/2,\, df_1/2)$。这两个函数底下压着整个假设检验工具的 p 值——错一个正则化方向，每个 p 值都是错的。

**incBeta 的符号**。$B_t(a,b)$ 的对数前因子我写成了 `+lnBeta(a,b)`，正确是 `-lnBeta(a,b)`（除以完全 Beta 函数，不是乘）。一个正负号让所有 p 值偏离几个数量级。

**连分式实现**。凭记忆手写的 betacf 收敛不到正确值，换成 DLMF 5.12 的连分式 + 修正 Lentz 算法后，与 scipy 逐值对照到 4e-14。数值分析的教科书公式，"记得大意"和"照着 DLMF 抄"之间隔着一个 bug。

**GLS 变换**。我最初用 Z = V⁻¹X 的变换法解广义最小二乘——这**只对对角 V 成立**，一般 V 需要 Cholesky 分解或者直接解正规方程 (X'V⁻¹X)β = X'V⁻¹y。AR(1) 误差结构的 V 不是对角的，变换法给出的系数全错。

**ARMA 递归的符号**。AR 模型的差分方程里 c = −ar.slice(1)，负号漏掉后 AR(1) 的自相关直接镜像翻转。

**cluster 稳健标准误的 meat**。聚类的三明治协方差要按**组**聚合：meat = Σ_g s_g s_g'，其中 s_g = Σ_{i∈g} x_i e_i（每组先内部求和、再外积）。我写成了 Σ x'x e²——那是异方差 HC 的形状，对聚类情形低估了组内相关带来的方差。

**IRF 递归**。VAR 的脉冲响应 Φ_h = Σ_{l=1}^{p} Φ_{h−l} A_l，我最初只用了 Φ_{h−1}·A_1——p > 1 时第 3 期以后全错。修法是保留整个 phis 数组而不是滚动覆盖。

**分位数回归的权重**。损失函数 |e| 的 check 权重应该是 e<0 ? (1−τ) : τ，我写反了——τ=0.9 的"上分位数"被拟合成 0.1。这种错不会崩、不会发散，只会安静地给出**另一个问题的答案**。

其余两个（erf 级数漏掉 2/√π 因子、cluster 对称化的循环边界）同类：都是"代码跑得很顺，结果不对"的静默错误。

---

## 4. 惯例的暗礁：对上了 statsmodels 也不算完

数值对上之后还有一层**统计惯例**的选择——同一组数据，两个"正确"实现可以给出不同的标准误，因为惯例不同：

- Probit 的标准误：GLM 框架用 EIM（期望信息矩阵），discrete 框架用 OIM（观测信息矩阵）。我们选 EIM 并在工具页注明，因为站内实现走 IRLS 路线，与 sm.GLM 对齐；
- HAC（Newey–West）的小样本修正：Stata 的 newey 乘 n/(n−k)，statsmodels 的 `get_robustcov_results` 不乘。选乘——对齐 Stata，且对工具页的小样本输入更保守；
- BG 自相关检验的前 p 个滞后残差：Greene 与 statsmodels 都用零填充，照做；
- Johansen 的确定性项：`det_order=-1`（无确定性项的辅助回归）才是与我们裸实现对应的口径。

**惯例没有对错，但不标明就是 bug**。每个选择都写进了工具页的 note，让拿结果去和论文对照的读者知道分歧会在哪。

还有一处刻意的不做：Johansen 的迹统计量我们**不硬编码临界值表**。MacKinnon-Haug-Michelis 的表按 K、det_order、样本量三维插值，抄错一格就是上面第 2 节的故事重演——工具输出统计量本身，并诚实标注"请对照发表的临界值表"。

---

## 5. 三处"对不上但没错"的地方

有三组对照天然对不齐，各需要换一个参照物：

**ARIMA 的 CSS vs MLE**。statsmodels 默认做精确 MLE（Kalman 滤波算似然），我们的实现用条件平方和（CSS）——目标函数本身不同，参数估计在小样本下有可观差异。参照物换成**用 scipy 独立实现同一个 CSS 目标函数**，对照"我们的优化器 vs scipy 的优化器"在同一目标上的解。顺带还抓出参数化问题：把 θ 映射到 (−1,1) 的 tanh 变换在 |θ|→1 时梯度消失，Nelder–Mead 在平坦区爬不动——改成裸参数 + |v|≥0.9995 的屏障函数 + 三段重启。

**Kalman 的初始化**。statsmodels 用扩散初始化（diffuse initialization），我们的实现用 x₀=y[0]、P₀=10(σa²+σe²)+1 的平稳近似——前若干步的滤波方差天然不同。参照物换成**用 numpy 镜像同一套初始化约定**的独立实现，对齐到 1e-8。这验证的是"我们的滤波方程与递归没有 bug"，而不是"我们与 statsmodels 惯例一致"——后者本来就不是目标。

**Granger 因果的 df**。statsmodels 的系统级检验用 K·df_resid 做分母自由度，教科书单方程检验用 F(p, T−Kp−1)。这是两个都存在的流派，选教科书口径并注明。

---

## 6. 方法学遗产

- **验证是开发的一部分，不是收尾**：harness 与内核同步生长，每写完一个函数立刻进 gen.py——11 个 bug 没有一个活过当天；
- **固定种子是对照的前提**：两边喂同一份数据，排除掉"数据不同"这个最无聊的分歧源；
- **记忆不是数据源**：临界值、公式细节，从权威实现读，不从脑子里抄；
- **"对不上"先分类再处理**：是 bug（改代码）、是惯例（选择+注明）、还是本质不同（换参照物）——三种处理完全不同；
- **确定性是可验证的前提**：内核不用随机、不读时钟，e2e 才能把拟合系数钉到小数位。

十个工具都构建在这块内核上：[线性回归](/calculators/linear-regression/)、[Logit/Probit](/calculators/logistic-regression/)、[计数回归](/calculators/count-regression/)、[平稳性检验](/calculators/time-series-stationarity/)、[ARIMA 预测](/calculators/arima-forecast/)、[VAR 与协整](/calculators/var-vecm/)、[卡尔曼滤波](/calculators/state-space-kalman/)、[回归诊断](/calculators/ols-diagnostics/)、[分位数回归](/calculators/quantile-regression/)、[混合效应](/calculators/mixed-effects-model/)。全部本地运算，数据不出浏览器。
