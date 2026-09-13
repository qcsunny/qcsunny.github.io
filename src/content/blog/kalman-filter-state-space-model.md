---
title: '卡尔曼滤波与状态空间模型：纯 TypeScript 手写数值平滑与预测'
description: '深度拆解卡尔曼滤波与状态空间模型计算器的实现细节。从状态转移矩阵与观测方程推导切入，剖析预测步与更新步的状态估计递推，并展示在 JS 双精度浮点数限制下通过 Cholesky 分解与 SVD 数值截断保护正定矩阵稳定性的完整工程实践。'
pubDate: 'Sep 13 2026'
category: math
topics: [mathematics, algorithms, numerical-computing]
searchTerms: ['卡尔曼滤波', '状态空间模型', 'Kalman Filter', 'Cholesky', '数值稳定性']
contentLang: 'zh-CN'
relatedTools: ['calculators/state-space-kalman', 'calculators/arima-forecast']
relatedPosts: ['econometrics-cross-validation-with-statsmodels', 'equation-solver-and-matrix-numeric-audit']
---

在时间序列分析、导航定位与金融高频交易领域，数据往往伴随着强烈的噪声与不确定性。无论是传感器测得的物理位置，还是含有市场噪声的股票价格，直接使用原始测量值往往会导致决策失误。

1960 年，鲁道夫·卡尔曼（Rudolf E. Kálmán）提出了著名的**卡尔曼滤波（Kalman Filter）**算法。作为线性最小方差估计的最佳无偏估计量（BLUE），卡尔曼滤波能够利用系统状态方程，通过“预测–更新”循环，在存在系统过程噪声与测量噪声的情况下，实时估计出系统的真实内部状态。

本站 [卡尔曼滤波与状态空间模型计算器](/calculators/state-space-kalman/) 实现了纯 TypeScript 手写的状态空间模型平滑与预测内核。本文将深入拆解卡尔曼滤波的五大核心矩阵方程，以及在 JavaScript 浮点数算术限制下如何保证矩阵求逆与协防对称性的工程实践。

---

## 1. 状态空间模型（State-Space Model）数学表达

一个标准的线性离散时间状态空间模型由**状态转移方程（State Equation）**与**观测方程（Measurement Equation）**共同构建：

$$\begin{aligned}
\mathbf{x}_k &= \mathbf{F} \mathbf{x}_{k-1} + \mathbf{B} \mathbf{u}_k + \mathbf{w}_k \quad &\text{（状态转移方程）} \\
\mathbf{z}_k &= \mathbf{H} \mathbf{x}_k + \mathbf{v}_k \quad &\text{（观测方程）}
\end{aligned}$$

其中：
- $\mathbf{x}_k \in \mathbb{R}^n$：$k$ 时刻系统的隐状态向量（如 $[ \text{位置}, \text{速度} ]^T$）；
- $\mathbf{z}_k \in \mathbb{R}^m$：$k$ 时刻的实际观测向量；
- $\mathbf{F} \in \mathbb{R}^{n \times n}$：状态转移矩阵；
- $\mathbf{H} \in \mathbb{R}^{m \times n}$：观测矩阵；
- $\mathbf{w}_k \sim \mathcal{N}(\mathbf{0}, \mathbf{Q})$：过程噪声（Process Noise），协方差矩阵为 $\mathbf{Q}$；
- $\mathbf{v}_k \sim \mathcal{N}(\mathbf{0}, \mathbf{R})$：测量噪声（Measurement Noise），协方差矩阵为 $\mathbf{R}$。

---

## 2. 卡尔曼滤波五大核心矩阵方程

卡尔曼滤波的递推过程分为两个阶段：**时间更新（预测 Stage）**与**测量更新（校正 Stage）**。

### 第一阶段：时间更新（预测 Predict）
根据 $k-1$ 时刻的最优估计，预测 $k$ 时刻的状态先验估计 $\hat{\mathbf{x}}_k^-$ 与协方差先验估计 $\mathbf{P}_k^-$：

1. **先验状态估计**：
   $$\hat{\mathbf{x}}_k^- = \mathbf{F} \hat{\mathbf{x}}_{k-1}$$
2. **先验估计协方差**：
   $$\mathbf{P}_k^- = \mathbf{F} \mathbf{P}_{k-1} \mathbf{F}^T + \mathbf{Q}$$

### 第二阶段：测量更新（校正 Update）
结合 $k$ 时刻的实际测量值 $\mathbf{z}_k$，计算卡尔曼增益并更新状态后验估计：

3. **卡尔曼增益（Kalman Gain）**：
   $$\mathbf{K}_k = \mathbf{P}_k^- \mathbf{H}^T \left( \mathbf{H} \mathbf{P}_k^- \mathbf{H}^T + \mathbf{R} \right)^{-1}$$
4. **后验状态估计**：
   $$\hat{\mathbf{x}}_k = \hat{\mathbf{x}}_k^- + \mathbf{K}_k \left( \mathbf{z}_k - \mathbf{H} \hat{\mathbf{x}}_k^- \right)$$
5. **后验估计协方差**：
   $$\mathbf{P}_k = (\mathbf{I} - \mathbf{K}_k \mathbf{H}) \mathbf{P}_k^-$$

---

## 3. 纯 TypeScript 内核实现与数值稳定性保护

在浏览器环境中，由于 JavaScript 的 `number` 类型遵循 IEEE 754 双精度浮点数标准，直接按照上述原始方程计算会出现两大数值灾难：
1. **协方差矩阵失去正定性与对称性**：浮点数舍入误差累积会导致 $\mathbf{P}_k$ 不再对称，最终导出的计算结果发散为 `NaN`；
2. **矩阵求逆极易奇异（Singular Matrix）**：当测量噪声 $\mathbf{R}$ 极小或维数较高时，高斯消元法求逆会导致数值飞溅。

为确保零依赖运行下的绝对稳定性，我们在实现中引入了 **Joseph Form 方程** 与 **Cholesky 半正定投影**：

```ts
/**
 * 状态估计与协方差更新核心步
 */
export function kalmanUpdateStep(
	xPred: number[],
	PPred: number[][],
	z: number[],
	H: number[][],
	R: number[][]
): { xHat: number[]; P: number[][] } {
	const n = xPred.length;
	const m = z.length;

	// 1. 残差创新向量 y = z - H * xPred
	const Hx = matrixMultiplyVector(H, xPred);
	const y = z.map((val, i) => val - Hx[i]);

	// 2. 创新协方差 S = H * PPred * H^T + R
	const H_P = matrixMultiply(H, PPred);
	const H_P_HT = matrixMultiply(H_P, transpose(H));
	const S = matrixAdd(H_P_HT, R);

	// 3. 计算 S 的逆矩阵（带伪逆/SVD 保护，避免奇异）
	const SInv = safeMatrixInverse(S);

	// 4. 卡尔曼增益 K = PPred * H^T * SInv
	const K = matrixMultiply(matrixMultiply(PPred, transpose(H)), SInv);

	// 5. 状态后验更新 xHat = xPred + K * y
	const Ky = matrixMultiplyVector(K, y);
	const xHat = xPred.map((val, i) => val + Ky[i]);

	// 6. 使用数值更加稳定的 Joseph Form 更新协方差:
	// P = (I - K*H) * PPred * (I - K*H)^T + K * R * K^T
	const I = identityMatrix(n);
	const KH = matrixMultiply(K, H);
	const I_KH = matrixSubtract(I, KH);

	let P = matrixAdd(
		matrixMultiply(matrixMultiply(I_KH, PPred), transpose(I_KH)),
		matrixMultiply(matrixMultiply(K, R), transpose(K))
	);

	// 7. 强制对称化修整，消除 IEEE 754 累积不对称
	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			const avg = (P[i][j] + P[j][i]) / 2;
			P[i][j] = avg;
			P[j][i] = avg;
		}
	}

	return { xHat, P };
}
```

---

## 4. 实际应用场景：从移动轨迹平滑到金融时序去噪

通过本站 [卡尔曼滤波计算器](/calculators/state-space-kalman/)，你可以直观对比噪声滤波前后的轨迹与置信区间变化：

- **传感器数据滤波**：对于含噪的 GPS 经纬度或加速度计信号，输入真实物理运动模型（如一阶匀速模型 CV 或二阶匀加速模型 CA），滤波器能干净地抹去高频震荡伪影；
- **金融资产 Beta 动态估计**：在量化投资中，利用状态空间模型将股票与大盘的回归系数 $\beta$ 设为可变状态变量 $\mathbf{x}_k = [\alpha_k, \beta_k]^T$，实时追踪市场 Beta 的随时间演化。

欢迎前往本站 [卡尔曼滤波计算器](/calculators/state-space-kalman/) 体验纯前端矩阵状态平滑与预测。
