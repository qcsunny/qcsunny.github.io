---
title: '文本差异对比的本质：LCS 动态规划、回溯与相似度公式'
description: 'git diff 背后是 Myers 算法，但更基础的文本差异对比从最长公共子序列（LCS）开始。深入剖析 LCS 的动态规划状态转移方程、空间优化为 O(n) 的滚动数组技巧，以及从 DP 表回溯出增删行的方法，最后推导相似度公式 similarity = LCS / max(m, n) 的语义。'
pubDate: 'Sep 09 2026'
category: algorithms
topics: [algorithms]
searchTerms: ['文本差异', 'LCS', '最长公共子序列', '动态规划', '相似度']
contentLang: 'zh-CN'
relatedTools: ['devtools/text-diff', 'devtools/hash-generator', 'devtools/json-formatter']
relatedPosts: ['calculator-engine-tokenizer-parser-eval', 'regex-catastrophic-backtracking-and-redos']
---

git diff 输出的那些红绿行——`-` 开头是删除、`+` 开头是新增——背后是 Myers 差分算法。但 Myers 是 LCS（最长公共子序列）的优化版本，理解差异对比要从 LCS 本身开始。

本站的 [文本差异对比工具](/devtools/text-diff/) 做的是最基础的逐行差异对比：输入两段文本，输出新增行数、删除行数、未变行数和相似度。核心算法是经典 LCS 动态规划。这篇文章拆解实现中的每一步。

---

## 1. 问题定义：行级别的差异

文本差异对比的输入是两段文本，按行分割后得到两个行序列：

```
原文 A: ["alpha", "beta", "gamma"]
改文 B: ["alpha", "beta", "delta"]
```

目标是找出哪些行被新增、哪些被删除、哪些未变。

这里的关键词是"行级别"——不做字符级或单词级差异。git diff 的默认模式也是行级别。字符级差异（如 `diff --word-diff`）需要更细粒度的算法。

---

## 2. 最长公共子序列：动态规划

### 2.1 子序列 vs 子串

子序列（subsequence）和子串（substring）是两个不同的概念：

- **子串**：连续的。`"gamma"` 中 `"amm"` 是子串，`"gma"` 不是。
- **子序列**：不要求连续，但保持相对顺序。`"gamma"` 中 `"gma"` 是子序列，`"amg"` 不是（顺序反了）。

文本差异用 LCS 而非最长公共子串，因为差异可能是不连续的——原文的某些行可能被删除，改文中新增的行可能插在任意位置。LCS 能正确匹配所有"保留相对顺序的公共行"。

### 2.2 状态转移方程

设 $A$ 有 $m$ 行、$B$ 有 $n$ 行。定义 $dp[i][j]$ 为 $A$ 的前 $i$ 行与 $B$ 的前 $j$ 行的 LCS 长度。

$$dp[i][j] = \begin{cases} 0 & \text{if } i = 0 \text{ or } j = 0 \\ dp[i-1][j-1] + 1 & \text{if } A[i-1] = B[j-1] \\ \max(dp[i-1][j], dp[i][j-1]) & \text{otherwise} \end{cases}$$

- 如果 $A$ 或 $B$ 为空，LCS 长度为 0。
- 如果当前行相同，LCS 长度加 1（这行被匹配为公共行）。
- 如果当前行不同，取"跳过 $A$ 的当前行"和"跳过 $B$ 的当前行"两种情况的较大值。

### 2.3 代码实现

```ts
const a = v.str('before').split('\n');
const b = v.str('after').split('\n');
// LCS length over lines via DP (capped to avoid pathological inputs).
const cap = 500;
const aa = a.slice(0, cap);
const bb = b.slice(0, cap);
const dp: Uint32Array[] = [new Uint32Array(bb.length + 1)];
for (let i = 1; i <= aa.length; i++) {
  dp.push(new Uint32Array(bb.length + 1));
  for (let j = 1; j <= bb.length; j++) {
    dp[i][j] =
      aa[i - 1] === bb[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
  }
}
const lcs = dp[aa.length][bb.length];
```

### 2.4 三个工程细节

**Uint32Array 而非 number[]**：DP 表的每个单元格存储一个 32 位无符号整数。`Uint32Array` 比 `number[]` 节省内存（每个元素 4 字节 vs 8 字节），在 $500 \times 500 = 25$ 万个单元格时差距明显。

**cap = 500 的截断**：如果用户粘贴了 5000 行文本，DP 表会是 $5000 \times 5000 = 2500$ 万个单元格，约 100 MB 内存。`cap = 500` 把输入截断到 500 行，DP 表最大 $500 \times 500 = 25$ 万个单元格，约 1 MB。这是一个工程取舍——对超大输入不精确，但避免浏览器 OOM。

**逐行构建 DP 表**：每一行 `dp.push(new Uint32Array(...))` 后立即填充，而不是一次性分配二维数组。这利用了 V8 的数组优化——动态 push 比预分配 + 下标赋值在某些引擎版本中更快。

---

## 3. 从 DP 表推导增删行数

### 3.1 关键公式

LCS 长度已知后，三个结果直接推导：

- **未变行数** = LCS 长度。这些行在 $A$ 和 $B$ 中都存在，且相对顺序一致。
- **删除行数** = $|A| - \text{LCS}$。原文中有但改文中没有的行。
- **新增行数** = $|B| - \text{LCS}$。改文中有但原文中没有的行。

```ts
const total = Math.max(aa.length, bb.length) || 1;
return {
  rows: [
    { label: 'Added lines',    value: String(bb.length - lcs) },
    { label: 'Removed lines',  value: String(aa.length - lcs) },
    { label: 'Unchanged lines', value: String(lcs) },
    {
      label: 'Similarity',
      value: String(Math.round((lcs / total) * 1000) / 10) + '%',
    },
  ],
};
```

### 3.2 验证

以默认示例验证：

```
A = ["alpha", "beta", "gamma"]  → m = 3
B = ["alpha", "beta", "delta"]  → n = 3
```

`alpha` 和 `beta` 匹配，`gamma ≠ delta`。LCS = 2。

- 未变行 = 2（`alpha`、`beta`）
- 删除行 = 3 - 2 = 1（`gamma`）
- 新增行 = 3 - 2 = 1（`delta`）
- 相似度 = 2 / max(3, 3) = 66.7%

---

## 4. 相似度公式：为什么是 LCS / max(m, n)

### 4.1 三种候选公式

文本相似度有多种定义：

| 公式 | 范围 | 特点 |
|------|------|------|
| $\frac{\text{LCS}}{\max(m, n)}$ | $[0, 1]$ | 以较长文本为基准 |
| $\frac{\text{LCS}}{\min(m, n)}$ | $[0, 1]$ | 以较短文本为基准 |
| $\frac{2 \cdot \text{LCS}}{m + n}$ | $[0, 1]$ |Dice 系数，调和均值 |

工具用的是第一种 $\frac{\text{LCS}}{\max(m, n)}$。为什么？

### 4.2 直觉

相似度应该回答"两段文本有多像"。如果原文 100 行、改文 3 行，且 3 行完全匹配原文的某 3 行，LCS = 3：

- $\frac{3}{\max(100, 3)} = 3\%$——"这两段文本只有 3% 像素"。
- $\frac{3}{\min(100, 3)} = 100\%$——"这两段文本 100% 像"。
- $\frac{2 \times 3}{100 + 3} = 5.8\%$（Dice）。

第一种最符合直觉：一段 100 行的文本被删到只剩 3 行，相似度应该很低，不应该是 100%。

### 4.3 精度处理

```ts
String(Math.round((lcs / total) * 1000) / 10) + '%'
```

`* 1000` 后 `round` 再 `/ 10` 保留一位小数。不写 `(lcs / total * 100).toFixed(1)` 是因为 `toFixed` 返回字符串且可能有浮点误差（如 `(0.1).toFixed(1)` 在某些引擎中返回 `"0.1"` 但 `(0.35).toFixed(1)` 返回 `"0.3"` 而非 `"0.4"`）。`Math.round` 的行为是确定性的四舍五入。

`total = Math.max(aa.length, bb.length) || 1` 末尾的 `|| 1` 防止两段文本都为空时除以零。

---

## 5. LCS 的空间优化：滚动数组（本工具未采用）

### 5.1 O(min(m,n)) 空间

标准 LCS 的空间是 $O(m \times n)$。但计算 $dp[i][j]$ 只依赖 $dp[i-1][j-1]$、$dp[i-1][j]$ 和 $dp[i][j-1]$——只需要前一行和当前行。因此可以用两个一维数组交替使用，空间降为 $O(\min(m, n))$。

```ts
// 滚动数组版本（未在本工具中采用）
let prev = new Uint32Array(n + 1);
let curr = new Uint32Array(n + 1);
for (let i = 1; i <= m; i++) {
  for (let j = 1; j <= n; j++) {
    curr[j] = a[i-1] === b[j-1] ? prev[j-1] + 1 : Math.max(prev[j], curr[j-1]);
  }
  [prev, curr] = [curr, prev];
}
const lcs = prev[n];
```

### 5.2 为什么本工具不优化

本工具的 `cap = 500` 限制了 DP 表最大 $500 \times 500 = 25$ 万个单元格，约 1 MB。在浏览器中 1 MB 内存完全可接受。滚动数组优化会把代码复杂度翻倍（交换数组、注意索引），但在 $500 \times 500$ 规模下性能收益微乎其微。

优化的原则是：**先 profiling，再优化**。如果 $500 \times 500$ 的标准 DP 在目标设备上耗时超过 16ms（一帧），再考虑滚动数组。在本工具的场景中，这个计算在 1ms 以内完成。

### 5.3 回溯差异路径

本工具只输出增删行数和相似度，不需要知道"具体哪一行变了"。如果需要精确的差异路径（像 git diff 那样标注每一行的增/删/未变），需要从 $dp[m][n]$ 回溯到 $dp[0][0]$：

- 如果 $A[i-1] = B[j-1]$：这行未变，移动到 $dp[i-1][j-1]$。
- 如果 $dp[i-1][j] \geq dp[i][j-1]$：$A[i-1]$ 被删除，移动到 $dp[i-1][j]$。
- 否则：$B[j-1]$ 被新增，移动到 $dp[i][j-1]$。

回溯得到的路径逆序就是完整的差异序列。本工具没有实现这一步，因为它只关注汇总数据。如果未来需要逐行差异标注，这一段就是补全的方向。

---

## 6. 工程收获

文本差异对比的核心是一个 30 行的 LCS 动态规划。它不花哨，但每一个工程细节都有理由：

- **Uint32Array**：内存效率。
- **cap = 500**：防御性截断。
- **相似度公式选择**：$\frac{\text{LCS}}{\max(m,n)}$ 最符合直觉。
- **不采用滚动数组**：在 500 行规模下不值得增加复杂度。

LCS 是差异对比的地基。git diff 用的 Myers 算法在 LCS 的基础上做了图搜索优化——它把差异问题转化为有向无环图中的最短路径问题，在不显式构建 DP 表的情况下找到最小编辑脚本。但 Myers 的输出仍然可以理解为"删除 $|A| - \text{LCS}$ 行、新增 $|B| - \text{LCS}$ 行"——LCS 是一切差异算法的共同根基。

如果理解了 LCS 的状态转移方程和相似度公式，你就理解了 git diff 红绿行背后的数学。
