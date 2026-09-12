---
title: 'Mandelbrot 浏览器 GPU 实现：一个三角形、每像素迭代与 10⁻¹³ 精度墙'
description: '拆解站内 Mandelbrot/Julia 浏览器：全屏只画一个三角形，fragment shader 每像素独立跑逃逸时间；光滑迭代与余弦调色消除色带；光标锚定缩放怎么推导；为什么 float32 在浅缩放就糊成色块，以及用 double-single（hi+lo）把深潜推进到 10⁻¹³。'
pubDate: 'Sep 12 2026'
category: engineering
topics: [algorithms, numerical-computing, performance]
searchTerms: ['Mandelbrot', 'WebGL', 'fragment shader', '浮点精度', 'Julia 集']
contentLang: 'zh-CN'
relatedTools: ['fun/mandelbrot-explorer']
relatedPosts: ['canvas-2d-surface-plot', 'floating-point-ieee754-and-precision', 'canvas-function-grapher-2d-sampling-and-webgl']
---

[Mandelbrot 与 Julia 集浏览器](/fun/mandelbrot-explorer/)是站内最短、也最像 GPU 程序的工具：TypeScript 负责一个 WebGL canvas、几个 uniform 和拖拽/滚轮；真正的图像全部在一个 fragment shader 里生成。每个像素独立迭代 $z_{n+1}=z_n^2+c$，越界就着色，没越界就涂深色。没有纹理、没有顶点模型、没有帧缓冲后处理。

第一版做到这里就能流畅拖动，但滚轮深入几次后图像突然糊成大色块：不是迭代次数不够，而是**相邻像素在 float32 里变成了同一个复数**。这篇文章从那堵精度墙开始，拆解一个三角形怎么铺满画布、光滑着色怎么消掉同心色带、光标锚定缩放怎么推导，以及最终为什么要在 shader 里手写一层 double-single 算术。

---

## 1. 全屏不是矩形，是一个超大三角形

顶点缓冲只有 6 个 float：

```ts
gl.bufferData(
	gl.ARRAY_BUFFER,
	new Float32Array([-1, -1, 3, -1, -1, 3]),
	gl.STATIC_DRAW,
);
gl.drawArrays(gl.TRIANGLES, 0, 3);
```

三个点构成一个覆盖整个裁剪空间的超大三角形。常见的全屏 quad 要两个三角形、6 个顶点，中间那条共享边可能让 GPU 做重复插值；超大三角形没有内部边、少三个顶点。这里顶点本身没有任何信息，vertex shader 只有一行：

```glsl
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
```

它的唯一任务是让 WebGL 为画布的每个像素启动一次 fragment shader。Mandelbrot 正适合这种计算模型：像素 $(x,y)$ 对应复平面上的一个 $c$，它的轨道与邻居完全独立，不需要通信、不需要原子操作。800×480、DPR=2 的画布一帧约 154 万个 fragment；CPU 若逐像素循环再写 ImageData，拖动时会持续搬 6 MB 像素，GPU 则原地算、原地画。

DPR 上限刻意钳在 2：

```ts
const dpr = Math.min(2, window.devicePixelRatio || 1);
```

4× DPR 的手机会把像素数放大 16 倍，而分形边界的视觉收益远达不到 16 倍。钳 2 是画质与每帧 fragment 数之间最划算的一刀。

---

## 2. 逃逸时间：为什么半径用 16 而不是 2

Mandelbrot 模式从 $z_0=0$ 开始、$c$ 是当前像素；Julia 模式相反：$z_0$ 是像素、$c$ 固定为用户选择的常数。shader 用同一套循环，通过两个 uniform 分支：

```glsl
vec2 z = uMode == 1 ? c : vec2(0.0);
vec2 k = uMode == 1 ? uJulia : c;
for (int n = 0; n < 2000; n++) {
	if (n >= uMaxIter) break;
	z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + k;
	if (dot(z, z) > 256.0) { escaped = 1.0; break; }
	i += 1.0;
}
```

数学上，$|z|>2$ 就能证明轨道必然逃逸；代码却用 $|z|^2>256$（半径 16）。不是理论变了，是为了**光滑着色**。只记录整数迭代次数会形成一圈一圈的硬色带，逃逸时保留更大的 $|z|$，能稳定估计"在第 i 次与 i+1 次之间的哪一点"越界：

```glsl
float sn = i - log2(log2(mag2) / 2.0) + 4.0;
```

这个连续值喂给余弦调色板：

```glsl
float t = 0.02 * sqrt(sn) + uHue;
vec3 col = 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
```

三个通道相位相差约 1/3 周期，滑块只移动 `uHue`，不用生成/上传一张 palette texture。`sqrt(sn)` 压缩高迭代区的色彩变化，边界深入时不会一千次迭代挤出一千条细到看不见的颜色。

循环的上限 2000 必须是编译期常量——WebGL 1 / GLSL ES 1.00 的一些驱动不接受动态循环上界。实际迭代数由 `if (n >= uMaxIter) break` 控制，UI 限制 50-1200，给驱动一个可展开的硬上限，也给用户一个不会把标签页拖死的软上限。

---

## 3. 光标锚定缩放：先记住那个复数，再改坐标系

滚轮缩放最容易写成 `span *= factor`——结果是永远朝画布中心缩，鼠标指着的细节会从光标底下漂走。正确做法分三步：

1. 用旧 scale 算出光标下的复数 $(z_x,z_y)$；
2. 改 span；
3. 反解新 center，让同一个复数仍投影到同一像素。

实现直接对应这三步：

```ts
const s = span / canvas.width;
const zx = cx + (px - canvas.width / 2) * s;
const zy = cy - (py - canvas.height / 2) * s;
span /= factor;
const s2 = span / canvas.width;
cx = zx - (px - canvas.width / 2) * s2;
cy = zy + (py - canvas.height / 2) * s2;
```

屏幕 y 向下、复平面虚轴 y 向上，所以两处 y 的符号相反。遗漏任何一处，水平缩放正常，垂直方向却会向光标的镜像点漂——这种纯几何 bug 看静态截图发现不了，E2E 用例真的发 wheel 事件并检查画布发生重绘。

迭代数随缩放自动加深：

```ts
iter = clamp(round(300 - log10(span / 3.2) * 120), 100, 1200);
```

每深入 10 倍多 120 次。它不是严格的数学最优值，而是经验预算：放大越深，接近边界的轨道越久才暴露逃逸；固定 300 次会把本应逃逸的点误涂成集合内部。

---

## 4. 真正的精度墙：JavaScript 是 double，uniform 不是

第一版状态 `cx/cy/span` 存在 JavaScript number 里，有 53 位尾数。注释因此写了"double precision floor: 1e-13"。但 fragment shader 的 `highp float` 在桌面 GPU 上通常只有 IEEE 754 float32——**24 位有效位，约 7 位十进制**。

Mandelbrot 主体中心大约 $c_x=-0.6$。float32 在 0.6 附近相邻可表示数相差约 $2^{-24}\approx5.96\times10^{-8}$。画布宽 1600 物理像素时，只要 span 小于约 $1600\times6\times10^{-8}\approx10^{-4}$，`center + pixelOffset` 的低位就开始被 center 吞掉；继续缩放，相邻像素拿到完全相同的 c，整块画面结成马赛克。**JS 能记住 1e-13 的中心不等于 GPU 收得到它。**

这就是工具原来"宣称 10¹⁴ 缩放，实际浅得多就糊"的隐藏 bug。提高迭代次数没有用——你是在对同一个数重复算更多遍。

WebGL 1 没有通用 double uniform，修法是 double-single：一个数拆成两个 float32，`hi + lo`。CPU 侧：

```ts
const splitFloat = (v: number): [number, number] => {
	const hi = Math.fround(v);
	return [hi, Math.fround(v - hi)];
};
```

shader 侧用无误差变换近似 48 位精度。加法先算高位和，再把舍入残差连同两个低位补回来；乘法用 Dekker split，常数 $4097=2^{12}+1$ 把 24 位 float 拆成两半：

```glsl
vec2 dsAdd(vec2 a, vec2 b) {
	float s = a.x + b.x;
	float v = s - a.x;
	float t = ((b.x-v) + (a.x-(s-v))) + a.y + b.y;
	float z = s + t;
	return vec2(z, t-(z-s));
}
```

深潜路径里实部/虚部各是一对 vec2，复数平方变成四次 dsMul + dsAdd/dsSub。成本明显高于普通 float，所以只在 `span < 2e-4` 时切换；浅层拖动继续走原来的快路径。double-single 实际提供约 44-48 位有效精度，够把相邻像素分到 10⁻¹³ 附近；再深，hi+lo 也会重复，工具在 span=1e-13 硬钳住，不假装无限缩放。

---

## 5. 为什么不用 CPU 高精度或 WebGL 2

三个替代方案都考虑过：

**CPU arbitrary precision**：可以无限深，但每像素每迭代都做大整数/定点运算。百万像素 × 1000 次迭代，即使开 worker 也不可能维持交互帧率；需要 perturbation（只高精度算一条参考轨道，邻点算扰动）才可用，那是另一套复杂得多的算法。

**强制 WebGL 2**：GLSL ES 3.00 仍不保证 64 位 float；WebGL API 本身没有 double shader 类型。升级上下文解决不了精度根因，还会丢掉旧设备覆盖。

**只平移中心、不在 shader 相加**：把坐标先在 CPU 算好再传每个像素不可能——uniform 是全画面共享的，逐像素坐标仍要么靠插值（float32），要么靠纹理（同样要选格式）。

因此 double-single 是这个规模最合适的中间点：零依赖、WebGL 1 可用、浅层无额外成本、深层精度从 7 位推到约 14 位。

---

## 6. 工程收获

- **像素独立的问题就交给 fragment shader**：一个全屏三角形足够，不需要网格与纹理；
- **离散算法需要连续显示量**：整数逃逸次数正确但难看，smooth iteration 把迭代内的位置补出来；
- **交互坐标要守不变量**：缩放前后"光标下的复数不变"，先写不变量再反解 center；
- **精度要沿整条链路核账**：JS double → `uniform1f` → shader float32，最窄的一环决定结果；
- **双路径优化**：普通 float 覆盖 99% 视图，double-single 只在精度真正成为瓶颈时启用；
- **极限必须写成代码**：1e-13 的 clamp 不是 UI 限制，是现有数值表示的诚实边界。

工具在此：[Mandelbrot / Julia 集浏览器](/fun/mandelbrot-explorer/)。拖动平移、滚轮以光标为锚缩放、切换 Julia 常数、调迭代与配色，最后可以导出 PNG；所有计算都在当前页面的 GPU 上完成。
