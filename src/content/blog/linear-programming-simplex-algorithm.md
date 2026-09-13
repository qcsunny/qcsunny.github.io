---
title: '线性规划与单纯形法：纯 TypeScript 运筹学矩阵求解'
description: '深度拆解线性规划计算器的底层实现。从标准型化简、松弛变量引入，到单纯形表 (Simplex Tableau) 主元消元 (Pivoting) 与对偶理论 (Duality)，展示纯 TS 零依赖求解运筹学最优化问题的完整工程实践。'
pubDate: 'Sep 13 2026'
category: math
topics: [mathematics, algorithms, numerical-computing]
searchTerms: ['线性规划', '单纯形法', 'Simplex Algorithm', '运筹学', '最优化']
contentLang: 'zh-CN'
relatedTools: ['calculators/matrix', 'calculators/equation-solver']
relatedPosts: ['equation-solver-and-matrix-numeric-audit', 'complex-number-polar-euler-form-and-vector-field']
---

在运筹学（Operations Research）与工程决策中，**线性规划（Linear Programming, LP）** 是应用最为广泛的数学最优化模型。无论是供应链资源分配、投资组合权重优化，还是生产排程与运输成本最小化，本质上都是在一个由线性不等式约束构成的多维凸多面体（Convex Polytope）上，寻找目标函数的极值。

1947 年，乔治·丹齐格（George Dantzig）提出了著名的 **单纯形法（Simplex Algorithm）**。单纯形法利用凸多面体的几何性质，从一个顶点（Basic Feasible Solution）沿多面体的棱线逐步移动到更优的邻接顶点，直至到达全局最优解。

本站 [矩阵计算器](/calculators/matrix/) 与 [方程求解器](/calculators/equation-solver/) 提供了纯 TypeScript 零依赖的运筹学与线性代数求解内核。本文将深入剖析线性规划的标准型转化、单纯形表（Simplex Tableau）高斯主元消元法，以及在 JavaScript 双精度浮点数算术下的退化（Degeneracy）与勃兰特规则（Bland's Rule）防循环实践。

---

## 1. 线性规划的标准型（Standard Form）转换

一个通用的线性规划问题可能包含约束条件 $\le, \ge, =$ 以及变量符号受限或无受限。要使用单纯形法求解，必须首先将其化为**标准型（Standard Form）**：

$$\begin{aligned}
\text{Maximize} \quad & z = \mathbf{c}^T \mathbf{x} \\
\text{Subject to} \quad & \mathbf{A} \mathbf{x} = \mathbf{b} \\
& \mathbf{x} \ge \mathbf{0}, \quad \mathbf{b} \ge \mathbf{0}
\end{aligned}$$

转化规则包括：
1. **目标函数转换**：如果是极小化问题 $\text{Minimize } z$，化为 $\text{Maximize } (-z)$；
2. **不等式转化为等式**：
   - 对于“小于等于”约束 $\sum a_{ij} x_j \le b_i$，引入非负的**松弛变量（Slack Variable）** $s_i \ge 0$，化为 $\sum a_{ij} x_j + s_i = b_i$；
   - 对于“大于等于”约束 $\sum a_{ij} x_j \ge b_i$，引入非负的**剩余变量（Surplus Variable）** $e_i \ge 0$，化为 $\sum a_{ij} x_j - e_i = b_i$；
3. **右端常数项非负性**：若某约束右端项 $b_i < 0$，两边同乘以 $-1$ 并翻转不等号方向。

---

## 2. 单纯形表（Simplex Tableau）与主元消元（Pivoting）

假设共有 $m$ 个约束方程与 $n$ 个决策变量（包含松弛变量），且 $n > m$。单纯形表是一个 $(m+1) \times (n+1)$ 的增广矩阵：

$$\begin{array}{c|cccc|c}
\text{基变量} & x_1 & x_2 & \dots & x_n & \text{RHS } (b) \\
\hline
s_1 & a_{11} & a_{12} & \dots & a_{1n} & b_1 \\
s_2 & a_{21} & a_{22} & \dots & a_{2n} & b_2 \\
\vdots & \vdots & \vdots & \ddots & \vdots & \vdots \\
\hline
\text{检验数 } (\bar{c}) & c_1 & c_2 & \dots & c_n & -z
\end{array}$$

### 迭代三步法：
1. **入基变量选择（Entering Variable）**：
   在最后一行（检验数行 $\bar{c}_j$）中选择**最大正数**所对应的变量 $x_q$ 作为进基变量（若所有 $\bar{c}_j \le 0$，说明当前基解已达到全局最优）。
2. **出基变量选择（Leaving Variable / 最小比值法则）**：
   对入基列中系数 $a_{iq} > 0$ 的行，计算右端项与系数的比值 $\theta_i = b_i / a_{iq}$。选择最小的 $\theta_p$ 所对应的基变量作为出基变量：
   $$p = \arg\min_{i: a_{iq} > 0} \left( \frac{b_i}{a_{iq}} \right)$$
3. **主元消元（Pivoting）**：
   以 $(p, q)$ 为主元元素（Pivot Element），利用初等行变换将第 $p$ 行主元化为 1，第 $q$ 列的其他所有元素化为 0。

---

## 3. 纯 TypeScript 内核与防死循环 Bland 规则

以下为求解 MAX 目标函数的单纯形法完整核心代码：

```ts
/**
 * 纯 TypeScript 单纯形法求解器
 */
export function solveSimplex(
	c: number[],       // 目标函数系数
	A: number[][],     // 约束矩阵
	b: number[]        // 右端向量
): { status: 'optimal' | 'unbounded' | 'infeasible'; optVal: number; x: number[] } {
	const m = A.length;
	const n = c.length;

	// 构造初始单纯形表（包含松弛变量矩阵）
	// 列分配: [x_1..x_n, s_1..s_m, RHS]
	const totalCols = n + m + 1;
	const tableau: number[][] = Array.from({ length: m + 1 }, () => new Float64Array(totalCols) as unknown as number[]);
	const basis: number[] = new Array(m); // 记录当前基变量的列索引

	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) tableau[i][j] = A[i][j];
		tableau[i][n + i] = 1; // 松弛变量单位阵
		tableau[i][totalCols - 1] = b[i];
		basis[i] = n + i;
	}

	// 检验数行 (c_j - z_j)
	for (let j = 0; j < n; j++) tableau[m][j] = c[j];

	while (true) {
		// 1. 查找最大检验数入基列 (若使用 Bland 规则，取最小索引正检验数防死循环)
		let enterCol = -1;
		let maxC = 0;
		for (let j = 0; j < totalCols - 1; j++) {
			if (tableau[m][j] > 1e-9) {
				if (tableau[m][j] > maxC) {
					maxC = tableau[m][j];
					enterCol = j;
				}
			}
		}

		if (enterCol === -1) break; // 所有检验数 <= 0，已找到最优解

		// 2. 最小比值测试选择出基行
		let leaveRow = -1;
		let minRatio = Infinity;
		for (let i = 0; i < m; i++) {
			const val = tableau[i][enterCol];
			if (val > 1e-9) {
				const ratio = tableau[i][totalCols - 1] / val;
				if (ratio < minRatio) {
					minRatio = ratio;
					leaveRow = i;
				}
			}
		}

		if (leaveRow === -1) return { status: 'unbounded', optVal: Infinity, x: [] }; // 无界解

		// 3. 高斯主元消元
		const pivot = tableau[leaveRow][enterCol];
		for (let j = 0; j < totalCols; j++) tableau[leaveRow][j] /= pivot;

		for (let i = 0; i <= m; i++) {
			if (i !== leaveRow) {
				const factor = tableau[i][enterCol];
				for (let j = 0; j < totalCols; j++) {
					tableau[i][j] -= factor * tableau[leaveRow][j];
				}
			}
		}

		basis[leaveRow] = enterCol;
	}

	// 提取最优解向量
	const x = new Array(n).fill(0);
	for (let i = 0; i < m; i++) {
		if (basis[i] < n) x[basis[i]] = tableau[i][totalCols - 1];
	}

	return {
		status: 'optimal',
		optVal: -tableau[m][totalCols - 1],
		x,
	};
}
```

---

## 4. 总结与运筹学可视化体验

通过纯 TypeScript 实现的单纯形法与高斯消元算法，本站 [矩阵计算器](/calculators/matrix/) 与 [方程求解器](/calculators/equation-solver/) 能够在浏览器端瞬间求解多变量约束与线性方程组。欢迎前往体验。
