---
title: '复数的三副面孔与向量场可视化：从代数形式到极坐标到欧拉公式'
description: '一个复数可以写成 a+bi、r∠θ、r·e^(iθ) 三种形式，它们是同一个数学对象的不同视角。深入剖析复数的代数运算、极坐标转换、棣莫弗定理与复指数，以及在 2D 向量场可视化中的应用。'
pubDate: 'Sep 09 2026'
category: math
topics: [mathematics]
searchTerms: ['复数', '极坐标', '欧拉公式', '棣莫弗定理', '向量场']
contentLang: 'zh-CN'
relatedTools: ['calculators/complex-number', 'calculators/vector', 'calculators/standard']
relatedPosts: ['floating-point-ieee754-and-precision', 'calculator-engine-tokenizer-parser-eval', 'canvas-function-grapher-2d-sampling-and-webgl']
---

$e^{i\pi} + 1 = 0$——欧拉恒等式把数学中最重要的五个常数 $e$、$i$、$\pi$、$1$、$0$ 用一个等式联系在一起。但如果你打开本站的 [复数计算器](/calculators/complex-number/) 输入 $z_1 = 3 + 4i$、$z_2 = 1 - 2i$，你会看到同一组运算以三种形式呈现：代数形式 $3 + 4i$、极坐标形式 $5 \angle 53.13°$、欧拉形式 $5 \cdot e^{0.9273i}$。

这三种形式不是"三种不同的复数"，而是同一个数学对象的三个视角。理解它们之间的关系——以及为什么计算器要同时展示三种——是复数运算的入门钥匙。

---

## 1. 三副面孔：同一个复数

复数 $z = a + bi$ 由实部 $a$ 和虚部 $b$ 组成。但"实部 + 虚部"只是复数的**代数形式**。同一个复数也可以用**极坐标形式** $r \angle \theta$ 描述，其中 $r = |z| = \sqrt{a^2 + b^2}$ 是模长，$\theta = \arctan2(b, a)$ 是辐角。或者用**欧拉形式** $r \cdot e^{i\theta}$——极坐标的指数写法，由欧拉公式 $e^{i\theta} = \cos\theta + i\sin\theta$ 与极坐标形式等价。

三种形式的信息量完全相同，但各有所长：

| 形式 | 表示 | 擅长 |
|------|------|------|
| 代数形式 | $a + bi$ | 加减法——实部虚部分别运算 |
| 极坐标形式 | $r \angle \theta$ | 几何直观——模长和角度一目了然 |
| 欧拉形式 | $r \cdot e^{i\theta}$ | 乘除法和乘方——指数律直接适用 |

本站复数计算器同时展示三种形式，因为不同的运算在不同形式下有截然不同的复杂度。

---

## 2. 代数形式：加减法的主场

复数加减法在代数形式下最自然：实部加减实部，虚部加减虚部。

$$z_1 + z_2 = (a_1 + a_2) + (b_1 + b_2)i$$
$$z_1 - z_2 = (a_1 - a_2) + (b_1 - b_2)i$$

计算器中对应的实现：

```ts
rows.push({
  label: 'Addition z₁ + z₂',
  value: fmtC(a1 + a2, b1 + b2),
});
rows.push({
  label: 'Subtraction z₁ − z₂',
  value: fmtC(a1 - a2, b1 - b2),
});
```

`fmtC` 是格式化函数，负责把实部和虚部拼成人类可读的字符串。它处理了三个边界情况：

1. 虚部为 0：只输出实部，不显示 `+ 0i`。
2. 实部为 0：只输出虚部，不显示 `0 +`。
3. 虚部绝对值为 1：输出 `i` 而非 `1i`。

```ts
const fmtC = (re: number, im: number): string => {
  const rStr = formatNumber(re);
  if (Math.abs(im) < 1e-12) return rStr;              // 纯实数
  const sign = im >= 0 ? ' + ' : ' − ';
  const absIm = Math.abs(im);
  const iStr = Math.abs(absIm - 1) < 1e-12 ? 'i' : `${formatNumber(absIm)}i`;
  if (Math.abs(re) < 1e-12) return im < 0 ? `−${iStr}` : iStr;  // 纯虚数
  return `${rStr}${sign}${iStr}`;
};
```

注意 `1e-12` 的浮点容差——不写 `=== 0` 是因为浮点运算可能产生 $10^{-16}$ 级别的残余。

---

## 3. 极坐标与欧拉形式：乘除法和乘方的主场

复数乘法在代数形式下需要展开：

$$z_1 \cdot z_2 = (a_1 a_2 - b_1 b_2) + (a_1 b_2 + a_2 b_1)i$$

但在极坐标形式下，乘法变成了模长相乘、辐角相加：

$$z_1 \cdot z_2 = r_1 r_2 \angle (\theta_1 + \theta_2)$$

计算器中乘法的实现走的是代数形式（因为用户输入的是 $a + bi$），但结果可以同时从极坐标视角理解：

```ts
const mulRe = a1 * a2 - b1 * b2;
const mulIm = a1 * b2 + a2 * b1;
```

### 3.1 除法：分母有理化

复数除法需要分母有理化——乘以共轭复数消去分母的虚部：

$$\frac{z_1}{z_2} = \frac{z_1 \bar{z}_2}{|z_2|^2} = \frac{(a_1 a_2 + b_1 b_2) + (b_1 a_2 - a_1 b_2)i}{a_2^2 + b_2^2}$$

```ts
const d2 = a2 * a2 + b2 * b2;
if (d2 !== 0) {
  const divRe = (a1 * a2 + b1 * b2) / d2;
  const divIm = (b1 * a2 - a1 * b2) / d2;
}
```

`d2 !== 0` 的检查防止除以零复数（$z_2 = 0 + 0i$）。

### 3.2 乘方：棣莫弗定理

$z_1^n$ 在代数形式下需要二项式展开，但在极坐标形式下由棣莫弗定理直接给出：

$$z^n = r^n (\cos(n\theta) + i\sin(n\theta))$$

计算器的实现先转极坐标，再应用棣莫弗定理，最后转回代数形式：

```ts
if (Number.isFinite(n) && r1 > 0) {
  const rn = Math.pow(r1, n);
  const thn = th1 * n;
  rows.push({
    label: `Power z₁^${n}`,
    value: fmtC(rn * Math.cos(thn), rn * Math.sin(thn)),
  });
}
```

`r1 > 0` 的检查是因为 $r = 0$ 时 $\theta$ 无定义（零复数的辐角不确定）。

### 3.3 共轭与倒数

共轭复数 $\bar{z} = a - bi$ 只需翻转虚部符号。倒数 $1/z$ 利用共轭做分母有理化：

$$\frac{1}{z} = \frac{\bar{z}}{|z|^2} = \frac{a - bi}{a^2 + b^2}$$

```ts
const d1 = a1 * a1 + b1 * b1;
if (d1 !== 0) {
  rows.push({
    label: 'Reciprocal 1 / z₁',
    value: fmtC(a1 / d1, -b1 / d1),
  });
}
```

---

## 4. 模长与辐角：从代数到几何

模长 $|z| = \sqrt{a^2 + b^2}$ 就是复数在复平面上到原点的距离，用 `Math.hypot` 计算以避免大数溢出：

```ts
const r1 = Math.hypot(a1, b1);
```

`Math.hypot(a, b)` 比 `Math.sqrt(a*a + b*b)` 更安全——后者在 $a$ 或 $b$ 很大时 $a^2$ 可能溢出为 `Infinity`，而 `hypot` 内部做了缩放。

辐角 $\theta = \arctan2(b, a)$ 用 `Math.atan2` 计算。`atan2` 与 `atan` 的区别在于象限处理：`atan(b/a)` 无法区分第一象限 $(a>0, b>0)$ 和第三象限 $(a<0, b<0)$（两者 $b/a$ 的符号相同），而 `atan2(b, a)` 根据两个参数的符号正确判断象限。

```ts
const th1 = Math.atan2(b1, a1);
const deg1 = (th1 * 180) / Math.PI;
```

辐角以弧度返回，计算器同时显示度数。

---

## 5. 复指数与复对数

欧拉公式 $e^{i\theta} = \cos\theta + i\sin\theta$ 的推广形式 $e^z = e^{a+bi} = e^a(\cos b + i\sin b)$ 让复指数可以分解为实部贡献模长、虚部贡献旋转：

```ts
const expA = Math.exp(a1);
rows.push({
  label: 'Exponential e^z₁',
  value: fmtC(expA * Math.cos(b1), expA * Math.sin(b1)),
});
```

复对数 $Ln(z) = \ln|z| + i\arg(z)$ 是复指数的逆运算，但它是多值的——辐角可以加任意 $2k\pi$。计算器返回主值（$k = 0$，辐角取 $(-\pi, \pi]$）：

```ts
if (r1 > 0) {
  rows.push({
    label: 'Principal Logarithm Ln(z₁)',
    value: fmtC(Math.log(r1), th1),
  });
}
```

`r1 > 0` 的检查：零复数的对数无定义（$\ln 0 = -\infty$）。

---

## 6. 平方根：半角法

复数平方根 $\sqrt{z}$ 可以用棣莫弗定理取 $n = 1/2$：

$$\sqrt{z} = \sqrt{r} \left(\cos\frac{\theta}{2} + i\sin\frac{\theta}{2}\right)$$

```ts
const sqrtR = Math.sqrt(r1);
const sqrtTh = th1 / 2;
rows.push({
  label: 'Principal Square Root √z₁',
  value: fmtC(sqrtR * Math.cos(sqrtTh), sqrtR * Math.sin(sqrtTh)),
});
```

这是"主平方根"——另一个平方根是它的负值。每个非零复数有两个平方根，主值取辐角在 $(-\pi/2, \pi/2]$ 的那个。

---

## 7. 向量场：复数的另一面

复数 $a + bi$ 和 2D 向量 $(a, b)$ 在表示上是同构的。本站的 [向量计算器](/calculators/vector/) 把这层联系用到了 2D 向量场可视化中。

在 [2D 绘图器](/calculators/graph/) 的向量场模式下，用户输入一个微分方程 $dy/dx = f(x, y)$，绘图器在画布上每个网格点画一个小箭头，箭头的方向由 $(1, f(x, y))$ 给出（即向量场 $(1, f(x,y))$）。这就是方向场图，常用于可视化常微分方程的解。

向量场的渲染在 GPU 不可用时回退到 CPU 实现 `renderVectorFieldCPU`，在 GPU 可用时由 WebGL 片段着色器并行计算。每个像素的颜色或箭头方向由片段着色器在该像素对应的 $(x, y)$ 坐标处求值 $f(x, y)$ 得出。

---

## 8. 工程收获

复数计算器的实现揭示了一个设计原则：**同一组运算，多种表示**。用户输入的是代数形式 $a + bi$，但计算器同时展示极坐标和欧拉形式，因为：

- 加减法看代数形式最直观。
- 乘除法和乘方看极坐标最简洁。
- 几何理解（旋转、缩放）看极坐标最直观。

这不是过度展示——它是帮助用户建立三种表示之间的直觉联系。当你看到 $z_1 \cdot z_2$ 的模长恰好是 $|z_1| \cdot |z_2|$、辐角恰好是 $\theta_1 + \theta_2$ 时，棣莫弗定理就不再是一个需要死记的公式，而是一个可以亲眼验证的几何事实。
