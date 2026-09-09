---
title: 'Canvas 逐像素采样与 WebGL 加速：手写 2D 函数绘图器的三个工程决策'
description: '不依赖 Desmos API、不依赖 function-plot，仅用 Canvas 2D + WebGL 双管线实现 2D 函数绘图器。深入剖析逐像素采样的精度取舍、渐近线检测的符号判别法、隐式曲线的 Marching Squares 算法，以及 WebGL 片段着色器在向量场渲染中的加速原理。'
pubDate: 'Sep 09 2026'
category: algorithms
topics: [algorithms, numerical-computing]
searchTerms: ['函数绘图器', 'Canvas 2D', 'WebGL', '逐像素采样', '渐近线检测', '隐式曲线']
contentLang: 'zh-CN'
relatedTools: ['calculators/graph', 'calculators/graph3d', 'calculators/standard']
relatedPosts: ['calculator-engine-tokenizer-parser-eval', 'canvas-2d-surface-plot', 'browser-zero-jank-web-worker-and-transferable']
---

打开本站的 [2D 函数绘图器](/calculators/graph/)，输入 `tan(x)`，你会看到一条条向无穷大飞掠的曲线，在 $x = \pi/2$ 处干净利落地断开——没有那条让所有手写绘图器翻车的"垂直竖线"伪影。输入 `x^2 + y^2 = 25`，你会看到一个完美的圆——不需要参数方程，不需要极坐标，隐式方程直接画。

这套绘图器不依赖 Desmos API、不依赖 function-plot、不依赖任何绘图库。它有一条 Canvas 2D 主管线和一条 WebGL 加速管线，共同处理三种模式：笛卡尔函数 $y = f(x)$、隐式曲线 $f(x, y) = 0$、向量场 $\vec{F}(x, y)$。所有表达式求值由本站自研的 [计算器引擎](/blog/calculator-engine-tokenizer-parser-eval/) 完成，绘图器只负责采样和渲染。

这篇文章拆解三个核心工程决策。

---

## 1. 逐像素采样：为什么不自适应

绘图器最核心的循环是 `drawCurve` 函数。它对 Canvas 的每一列像素执行一次采样：

```ts
function drawCurve(fn: (s: Scope) => number, color: string): void {
  ctx!.strokeStyle = color;
  ctx!.lineWidth = 2;
  ctx!.beginPath();
  let penDown = false;
  let prevY: number | null = null;
  let prevSy = 0;
  for (let px = 0; px <= cssW; px++) {
    const y = sample(fn, mx(px));          // 把像素 x 映射回数学坐标，求 y
    if (y === null || !Number.isFinite(y)) {
      penDown = false;                     // 不连续点：抬笔
      prevY = null;
      continue;
    }
    const py = sy(y);                      // 把数学 y 映射到像素坐标
    // 渐近线检测（下节展开）
    if (penDown) ctx!.lineTo(px, py);
    else {
      ctx!.moveTo(px, py);
      penDown = true;
    }
    prevY = y;
    prevSy = py;
  }
  ctx!.stroke();
}
```

对每个像素列，`mx(px)` 将像素坐标映射回数学 $x$ 坐标，`sample(fn, x)` 调用计算器引擎求出 $y$，`sy(y)` 将数学 $y$ 映射到像素坐标。整个过程就是"每个像素采样一次，连线"。

### 1.1 为什么不用自适应采样

很多绘图库使用自适应采样：先稀疏采样，在曲率大的区域加密。这能减少采样次数，但引入两个问题：

1. **漏掉尖峰**：如果函数在两个稀疏采样点之间有一个窄尖峰（如 $\frac{1}{(x-1)^2}$ 在 $x=1$ 附近），稀疏采样可能完全跳过它，画出的曲线在尖峰处被"削平"。
2. **复杂度不值得**：一个 800px 宽的 Canvas 只有 800 个采样点。在现代浏览器中，800 次 `Math.sin` 调用不到 0.1ms。自适应采样的收益在毫秒级，但它引入的 bug 在小时级。

逐像素采样是最简单也最可靠的方案：**Canvas 有多少列，就采样多少次**。唯一的代价是采样次数与 Canvas 宽度成正比，但对于 2D 函数图（不像 3D 曲面那样需要数百万次求值），这个代价可以忽略。

### 1.2 sample 函数的 try-catch 防护

```ts
function sample(fn: (s: Scope) => number, x: number): number | null {
  try {
    scope.vars['x'] = x;
    const v = fn(scope);
    return typeof v === 'number' ? v : null;
  } catch {
    return null;
  } finally {
    delete scope.vars['x'];
  }
}
```

注意三层防护：

1. **try-catch**：表达式求值可能抛出 `CalcError`（如 `log(-1)` 越界），捕获后返回 `null`，绘图器将其视为不连续点。
2. **typeof 检查**：即使引擎没有抛错，结果可能不是 number（如引擎 bug 返回 `undefined`），用 `typeof v === 'number'` 过滤。
3. **finally 清理**：`scope.vars['x']` 在采样后必须清除，否则会影响下一次采样或污染用户在标准计算器中定义的变量。

---

## 2. 渐近线检测：符号判别法

$\tan(x)$ 在 $x = \pi/2$ 处趋向 $\pm\infty$。如果绘图器在渐近线两侧各取一个采样点，一个 $y \approx +10^6$、一个 $y \approx -10^6$，Canvas 会画出一条从画布顶部直插底部的垂直竖线。这是手写绘图器最经典的 bug。

引擎的检测逻辑在 `drawCurve` 中：

```ts
// Asymptote detection: huge screen-space jump with a sign change
if (penDown && prevY !== null && Math.abs(py - prevSy) > cssH * 2 && prevY * y < 0) {
  penDown = false;
}
```

两个条件必须同时满足才会判定为渐近线：

1. **屏幕跳跃**：$|py - prevSy| > 2 \times cssH$——当前像素的 $y$ 坐标与前一个像素的 $y$ 坐标之差超过画布高度的两倍。这意味着曲线在屏幕空间中"飞了出去"。
2. **符号改变**：$prevY \times y < 0$——前一个采样点的数学 $y$ 值与当前采样点的数学 $y$ 值符号相反。这意味着曲线穿过 $x$ 轴从 $+\infty$ 跳到 $-\infty$（或反之）。

为什么需要两个条件？因为单凭屏幕跳跃不够：

- 一个非常陡峭但连续的函数（如 $y = 100x$）在缩放很小时，相邻像素的 $y$ 差也可以超过画布高度。但它不穿越 $x$ 轴，所以不应被判定为渐近线。

单凭符号改变也不够：

- $y = \sin(100x)$ 在一个像素内可以完成多次振荡，相邻采样点的 $y$ 可能符号相反但都很小。这不是渐近线，只是欠采样。

两个条件的**交集**恰好是渐近线的特征：曲线从 $+\infty$ 跳到 $-\infty$（或反之），在屏幕上表现为一条从顶部到底部的垂直跳跃，且穿过了 $x$ 轴。

---

## 3. WebGL 加速：隐式曲线与向量场

笛卡尔函数 $y = f(x)$ 的计算量很小（800 次采样），Canvas 2D 足以。但隐式曲线 $f(x, y) = 0$ 和向量场 $\vec{F}(x, y)$ 需要对画布的**每个像素**求值。一个 $800 \times 600$ 的画布有 48 万个像素，每个像素一次或两次求值，总计近百万次。Canvas 2D 在这个规模下会卡顿。

解决方案是 WebGL 片段着色器：把数学表达式编译成 GLSL 着色器代码，让 GPU 并行求值。

### 3.1 双管线架构

```ts
const glRenderer = createWebGL2DGraphRenderer(canvas);
// 主渲染函数中
if (row.isImplicit) {
  const ok = glRenderer?.renderImplicit(row.expr, view, COLORS[i]);
  if (!ok && row.fn) {
    // WebGL 不可用时的 CPU 回退
    renderImplicitCPU(ctx!, evalFn, view, COLORS[i], cssW, cssH);
  }
}
```

每次渲染都先尝试 WebGL 路径，如果 `createWebGL2DGraphRenderer` 返回 `null`（设备不支持 WebGL）或 `renderImplicit` 返回 `false`（表达式无法编译为 GLSL），就回退到 CPU 实现。这保证了在任何设备上都能画图，只是慢一些。

### 3.2 WebGL 上下文获取与丢失处理

```ts
export function createWebGL2DGraphRenderer(canvas: HTMLCanvasElement): WebGL2DGraphRenderer | null {
  try {
    const gl =
      (canvas.getContext('webgl2', {
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
      }) as WebGLRenderingContext | WebGL2RenderingContext | null) ||
      (canvas.getContext('webgl', {
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
      }) as WebGLRenderingContext | null);

    if (!gl) return null;

    let isContextLost = false;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      isContextLost = true;
    });
```

优先尝试 WebGL 2，回退到 WebGL 1。`preserveDrawingBuffer: true` 确保渲染结果不会在合成前被清除——否则截图和 Canvas 2D 叠加时会出现闪烁。

`webglcontextlost` 事件处理是必须的：当用户切换标签页或系统回收 GPU 资源时，WebGL 上下文会丢失。`isContextLost` 标志让后续渲染调用直接返回 `false`，触发 CPU 回退。

### 3.3 隐式曲线的 Marching Squares

隐式曲线 $f(x, y) = 0$ 没有 $y = g(x)$ 的显式形式，不能用逐列采样绘制。标准的做法是 **Marching Squares**：把画布分成网格，对每个网格单元的四个角求 $f(x, y)$ 的值，根据正负号的组合判断曲线是否穿过该单元，以及穿入和穿出的位置。

Canvas 2D 的 `renderImplicitCPU` 实现了这个算法。但 WebGL 路径用了更直接的方案：**片段着色器直接求值**。对画布的每个像素，着色器计算 $f(x, y)$ 的值，如果绝对值接近 0 就染成曲线颜色。这本质上是 Marching Squares 的"极致细化"版本——网格细到像素级，不需要插值。

---

## 4. 坐标映射与刻度算法

### 4.1 像素 ↔ 数学坐标的双向映射

```ts
// px → 数学 x
function mx(px: number): number {
  return view.xMin + (px / cssW) * (view.xMax - view.xMin);
}
// 数学 y → 像素 py（注意 y 轴翻转）
function sy(y: number): number {
  return cssH - ((y - view.yMin) / (view.yMax - view.yMin)) * cssH;
}
```

`sy` 中的 `cssH -` 是因为 Canvas 的 y 轴向下，而数学坐标系的 y 轴向上。

### 4.2 niceStep：自适应刻度间隔

刻度线不能太密（挤在一起看不清）也不能太疏（丢失精度）。`niceStep` 函数根据视图范围选择"好看"的刻度间隔：

```ts
function niceStep(range: number, targetTicks = 8): number {
  const raw = range / targetTicks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const mult = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
  return mult * mag;
}
```

算法是经典的"1-2-5"序列：把原始间隔 `range/8` 归一化到 $[1, 10)$ 区间，然后选择最近的 1、2 或 5 作为系数。结果是：缩放到 $[-10, 10]$ 时刻度间隔为 2，缩放到 $[-1, 1]$ 时间隔为 0.2，缩放到 $[-100, 100]$ 时间隔为 20。刻度永远是"圆整"的数字，不会出现 13.7 这种刻度。

---

## 5. 交互层：十字线与切线

绘图器在鼠标悬停时显示十字线和切线。切线的计算用的是数值微分：

```ts
const h = 1e-5 * Math.max(1, Math.abs(x));
const yPlus = sample(fn, x + h);
const yMinus = sample(fn, x - h);
const slope = (yPlus - yMinus) / (2 * h);
```

中心差分法 $(f(x+h) - f(x-h)) / (2h)$ 的精度是 $O(h^2)$，比前向差分 $(f(x+h) - f(x)) / h$ 的 $O(h)$ 高一阶。步长 $h$ 取 $10^{-5} \times \max(1, |x|)$——绝对值随 $|x|$ 缩放，避免在 $x$ 很大时 $h$ 太小导致浮点消去（$f(x+h) - f(x-h)$ 在 $h$ 太小时两个值几乎相等，差的有效位数大幅减少）。

---

## 6. 工程收获

回过头看，2D 绘图器的核心不在于"能画图"——任何 Canvas 教程都能教你画线。真正的工程量在于：

- **渐近线检测**：一条 `if` 语句，拦住了 90% 手写绘图器的翻车场景。
- **双管线架构**：WebGL 加速 + CPU 回退，在任何设备上都不白屏。
- **niceStep 刻度**：12 行代码，让缩放到任何尺度都看到圆整刻度。
- **采样安全**：`try-catch-finally` 三层防护，让 `log(-1)` 这种越界输入不崩页面。

这些细节单独看都不复杂，但组合在一起就是"能用"和"好用"的区别。Desmos 的渲染引擎在这些地方投入了远比绘图本身多的精力。本站的绘图器只是一个轻量替代，但在零依赖、45 KB JS 预算的约束下，它做到了一个工具站该有的品质。
