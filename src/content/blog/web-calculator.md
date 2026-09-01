---
title: '网页科学计算器：功能与实现'
description: '博客的科学计算器与函数绘图器：标准/科学键盘、变量、历史记录，以及背后零依赖的手写表达式引擎。'
pubDate: 'Sep 01 2026'
---

博客导航栏里的 **Calculator**（[/calculators/standard/](https://qcsunny.github.io/calculators/standard/)）是一个纯浏览器端运行的进阶计算器。它最初是四个选项卡挤在一个页面里，后来随着工具页体系（见 [Tools](https://qcsunny.github.io/tools/)）的建立被拆成了独立子页面——每个工具一个网址，更好分享、更好搜索：

- **Calculator** → [/calculators/standard/](https://qcsunny.github.io/calculators/standard/)（科学计算器）
- **Graph** → [/calculators/graph/](https://qcsunny.github.io/calculators/graph/)（函数绘图）
- **Units** → 独立成 8 个换算页 [/converters/length/](https://qcsunny.github.io/converters/length/) 等（长度、重量、温度、面积、体积、速度、时间、数据大小）
- **Stats** → 并入 [/calculators/average/](https://qcsunny.github.io/calculators/average/)（平均数与统计）

旧地址 `/calculator/` 会自动跳转到新页面。

## 功能总览

### 计算器

支持完整的数学表达式，而不是普通计算器的"一步一步"输入：

```text
2 + 3 * 4        → 14
sin(pi/2)        → 1        （弧度制）
a = 5            → 定义变量
a^2 + 1          → 26
ans * 2          → 上一轮结果
```

- **标准 / 科学键盘**：右上角可切换。标准键盘是 4 列的日常布局；科学键盘多出 `sin cos tan √ ln log π e x^y n!` 等按键
- **DEG / RAD**：科学键盘上可切换角度制与弧度制。注意与实体计算器一致的语义——角度制下 `sin(pi/2)` 会把 π/2 ≈ 1.57 当作 1.57° 来算
- **变量**：`名字 = 表达式` 赋值（常量名和函数名不可占用），变量以 chips 形式列在输入框下方，点一下插入、点 × 删除。变量存进 localStorage，在绘图页里可以直接引用（如 `a*x`）
- **历史记录**：每次按 = 的算式都进历史，点击任意一条可回填

### 函数绘图

最多同时画 4 条曲线（固定四色，色盲友好），支持 `sin(x)`、`x^2 - 3`、`a*x`（引用计算器变量）等：

- **滚轮缩放**（以鼠标位置为中心）、**拖拽平移**、触屏双指 pinch
- 悬停显示十字线与各函数在该 x 处的取值
- 自动网格与坐标轴刻度，`1/x` 这类渐近线会自动断笔
- 修改科学计算器页里的变量，图形实时联动重绘
- 暗色主题下画布配色自动跟随重绘（颜色从 CSS 变量读取，MutationObserver 监听主题切换）

## 实现原理

整个工具**零第三方依赖**——没有 math.js，没有 React，只有 TypeScript 和浏览器原生 API。

### 手写表达式引擎

核心是一条经典的编译流水线，位于 `src/scripts/calculator/engine/`：

```
tokenizer → parser（递归下降） → AST → compile 为闭包
```

1. **tokenizer**：把 `"2+3*4"` 切成数字、运算符、函数名、括号 token
2. **parser**：按文法递归下降，处理优先级和结合性：

   ```
   expr  := term (('+'|'-') term)*
   term  := unary (('*'|'/'|'%') unary | 隐式乘法)*
   unary := ('-'|'+') unary | power
   power := postfix ('^' unary)?        // 右结合
   postfix := primary ('!' | '%')*
   ```

3. **compile**：把 AST 编译成一个 `(scope) => number` 闭包。绘图时每帧要采样上千个点，解释执行 AST 太慢，预编译成闭包后绘图热路径就是纯函数调用

`%` 有一个刻意设计的歧义处理：跟在操作数后面且下一个 token 不是操作数时是百分号（`50 + 10%` = 55），否则是取模（`10 % 3` = 1），与主流计算器一致。

### Canvas 绘图

- **DPR 适配**：画布物理尺寸 = CSS 尺寸 × `devicePixelRatio`，保证 2K/4K 屏不糊
- `ResizeObserver` 监听容器尺寸变化自动重绘
- 每像素列采样一个点；相邻两点屏幕跳跃超过两倍画布高且函数值变号时断笔（渐近线检测）
- Pointer Events 统一处理鼠标/触摸的拖拽与 pinch

### 拆分后的工程组织

工具页共用一套**注册表驱动**的架构：`src/tools/registry.ts` 里每个工具是一条数据（路径、名称、字段定义、compute 纯函数），四个动态路由 `src/pages/{calculators,converters,finance,tools}/[slug].astro` 据此静态生成全部子页面，客户端按 `data-tool-kind` 分发到对应的渲染器（表单、换算器、文本工具……）。新增一个计算器只需在注册表里加一条配置，路由、目录页、sitemap 全部自动跟上。

### 性能哲学

没有用 React 之类的框架：这类工具页交互密度低、无状态共享需求，vanilla TS 在**加载**（无框架运行时）与**运行**（无虚拟 DOM diff）两端都更快，打包体积只有几 KB。

## 技术栈小结

| 部分 | 方案 |
| --- | --- |
| 表达式求值 | 手写 tokenizer + 递归下降 parser + 闭包编译 |
| 绘图 | 原生 Canvas 2D + Pointer Events |
| 状态持久化 | localStorage（历史、变量、键盘模式） |
| 框架依赖 | 0 |
