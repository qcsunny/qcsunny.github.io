---
title: '从零手写科学计算器引擎：Tokenizer → Parser → Evaluator 三段式架构与四个陷阱'
description: '不依赖 math.js、不依赖 mathjs，仅用 900 行 TypeScript 实现完整的科学计算器表达式引擎。深入剖析词法分析的 Unicode 别名、递归下降解析器的优先级体系、隐式乘法与百分号消歧、以及浮点安全输出格式化的工程细节。'
pubDate: 'Sep 09 2026'
category: algorithms
topics: [algorithms, mathematics]
searchTerms: ['计算器引擎', '递归下降解析器', 'tokenizer', '表达式求值', '零依赖']
contentLang: 'zh-CN'
relatedTools: ['calculators/standard', 'calculators/graph', 'calculators/graph3d']
relatedPosts: ['floating-point-ieee754-and-precision', 'prime-factorization-and-pollard-brent', 'markdown-parser-and-katex-math']
---

当你打开本站的 [科学计算器](/calculators/standard/)，输入 `sin(π/4)^2 + 2^3 × √(9)` 并按下等号，屏幕上几乎瞬间给出 `24.5`。这背后没有 math.js、没有 mathjs、没有任何 npm 依赖——而是一套约 900 行的 TypeScript 手写引擎，分三段完成从字符串到数字的完整旅程。

这套引擎在本站三个页面共用：[标准计算器](/calculators/standard/) 的按键求值、[2D 函数绘图器](/calculators/graph/) 的表达式采样、[3D 曲面绘图器](/calculators/graph3d/) 的等高线计算。三段式架构让同一套语法规则在三个完全不同的渲染管线中保持一致，任何一处修 bug 等于修了三处。

这篇文章拆解引擎每一层的实现选择与踩过的坑。

---

## 1. 架构总览：为什么是三段而不是一个 eval()

最朴素的计算器实现是 `new Function(expr)()` 或 `eval(expr)`——直接把用户输入当 JavaScript 跑。这在功能上"能用"，但在三个方面不可接受：

1. **安全**：用户输入的字符串直接 `eval` 等于任意代码执行。即使做了沙箱隔离，`while(true){}` 就能让标签页卡死。
2. **语法控制**：JavaScript 不认识 `sin(π/4)^2`、`sin⁻¹(0.5)`、`π`、`√(9)` 这些科学计算器用户期望的输入方式，也无法区分百分号 `50% × 2`（结果是 1）和取模 `7 % 3`（结果是 1）。
3. **错误定位**：`eval` 抛出的 `SyntaxError` 只有一个笼统的消息，没有"位置在第 7 个字符"这种用户能理解的定位信息。

因此引擎分为三层，各司其职：

```
用户输入字符串
     │
     ▼
┌─────────────┐
│  Tokenizer  │  字符串 → Token 数组（词法分析）
│  104 行     │  识别数字、标识符、运算符、括号
└──────┬──────┘
       │ tokens: Token[]
       ▼
┌─────────────┐
│   Parser    │  Token 数组 → AST（语法分析）
│  194 行     │  递归下降，处理优先级与结合性
└──────┬──────┘
       │ ast: Node
       ▼
┌─────────────┐
│  Evaluator  │  AST → number（求值）
│  223 行     │  递归遍历，查变量、调函数
└─────────────┘
       │
       ▼
   数值结果
```

辅助模块：

| 文件 | 行数 | 职责 |
|------|------|------|
| `tokenizer.ts` | 104 | 词法分析：字符串 → Token[] |
| `parser.ts` | 194 | 语法分析：Token[] → AST |
| `eval.ts` | 223 | 求值 + `formatNumber` 输出格式化 |
| `functions.ts` | 123 | 常数表 + 函数表 + 阶乘/三角函数实现 |
| `formatMath.ts` | 236 | AST → MathML（用于渲染数学公式预览） |
| `errors.ts` | 31 | `CalcError` 双语错误类 |
| `index.ts` | 34 | 对外统一入口 `evaluate()` |

---

## 2. 词法层：把字符流变成 Token 流

Tokenizer 的工作是把 `"sin(π/4)^2"` 这样的字符串拆成 Token 数组：

```
[
  { type: 'ident',  value: 'sin',  pos: 0 },
  { type: 'lparen', value: '(',    pos: 3 },
  { type: 'ident',  value: 'pi',   pos: 4 },  // π → pi
  { type: 'op',     value: '/',    pos: 5 },
  { type: 'num',    value: '4',    pos: 6 },
  { type: 'rparen', value: ')',    pos: 7 },
  { type: 'op',     value: '^',    pos: 8 },
  { type: 'num',    value: '2',    pos: 9 },
]
```

### 2.1 数字字面量

科学计算器需要支持的数字格式远比普通编程语言丰富。正则定义为：

```ts
const NUM_RE = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/;
```

这覆盖了 `42`、`3.14`、`.5`、`1e10`、`1.5e-3` 等所有变体。注意 `1.` 也被接受——这在 JavaScript 中是合法的（`1.` === `1`），但在严格语境里会引发歧义，不过计算器场景下接受它比拒绝它更友好。

### 2.2 标识符与 Unicode 别名

标识符正则是 `[a-zA-Z_][a-zA-Z0-9_]*`，匹配 `sin`、`log`、`x_1` 等函数名和变量名。但科学计算器用户习惯直接输入希腊字母和数学符号，因此在扫描到非 ASCII 字符时有一层别名转换：

```ts
// tokenizer.ts 中的 Unicode 别名映射
if (ch === 'π' || ch === 'τ') {
  tokens.push({ type: 'ident', value: ch === 'π' ? 'pi' : 'tau', pos: i });
  i++;
  continue;
}
if (ch === 'φ' || ch === 'ϕ') {
  tokens.push({ type: 'ident', value: 'phi', pos: i });
  i++;
  continue;
}
if (ch === 'γ') {
  tokens.push({ type: 'ident', value: 'gamma', pos: i });
  i++;
  continue;
}
if (ch === '×' || ch === '·') {
  tokens.push({ type: 'op', value: '*', pos: i });
  i++;
  continue;
}
if (ch === '÷') {
  tokens.push({ type: 'op', value: '/', pos: i });
  i++;
  continue;
}
if (ch === '√') {
  tokens.push({ type: 'ident', value: 'sqrt', pos: i });
  i++;
  continue;
}
```

`√(9)` 在词法层就变成了 `sqrt ( 9 )`，后续 Parser 不需要知道 `√` 这个符号的存在。这是一个关键设计决策：**所有语义转换在 Tokenizer 层完成，Parser 只处理 ASCII Token**。这样做的好处是 Parser 的代码可以用纯 ASCII 字符比较，不需要 Unicode switch-case 分支爆炸。

### 2.3 位置追踪：错误消息的根基

每个 Token 都携带 `pos` 字段，记录它在原始字符串中的字符偏移量。这不是装饰性的——当 Parser 发现语法错误时，它能精确地告诉用户"第 7 个字符处缺少右括号"：

```ts
throw new CalcError(
  `Unexpected character '${ch}' at position ${i + 1}`,
  `无法识别的字符 '${ch}'（位置 ${i + 1}）`,
  i,
);
```

注意 `pos` 是 0-based 的内部偏移，而错误消息显示的是 `i + 1`（1-based），因为普通用户不会从 0 开始数字符。

---

## 3. 语法层：递归下降与优先级体系

Parser 采用经典的**递归下降（Recursive Descent）**方式，为每个优先级层次写一个函数：

```
parseExpr    →  parseTerm  ( (+ | -)  parseTerm )*
parseTerm    →  parseUnary ( (* | / | %) parseUnary | implicit-mul)*
parseUnary   →  (+ | -) parseUnary  |  parsePower
parsePower   →  parsePostfix ( ^ parseUnary)?        // 右结合：递归一次，非循环
parsePostfix →  parsePrimary ( ! | %)*
parsePrimary →  number | ident | ident '(' args ')' | '(' expression ')'
```

### 3.1 优先级表

六级优先级，从低到高：

| 级别 | 运算符 | 结合性 | 说明 |
|------|--------|--------|------|
| 1 | `+` `-` | 左 | 加减 |
| 2 | `*` `/` `%` | 左 | 乘除模 |
| 3 | `+` `-`（一元） | 右 | 正负号 |
| 4 | `^` | 右 | 乘方 |
| 5 | `!` `%`（后缀） | — | 阶乘、百分号 |
| 6 | 字面量/变量/调用/括号 | — | 原子 |

注意乘方 `^` 是**右结合**的：`2^3^2` 解析为 `2^(3^2)` = `2^9` = 512，而不是 `(2^3)^2` = 64。这在数学中是标准约定，但很多手写解析器会忘记处理——如果 `parsePower` 的右递归调用走的是 `parsePower` 而非 `parseUnary`，就能自然实现右结合。

### 3.2 陷阱一：`-2^2` 应该等于多少？

数学界约定 `-2^2 = -(2^2) = -4`，但 JavaScript 给出 `(-2)^2 = 4`。这是一个经典分歧点。

在我们的引擎中，`parseUnary` 的级别（3）低于 `parsePower` 的级别（4），所以 `-2^2` 的解析过程是：

```
parseUnary → 遇到 '-'，构造 Unary('-', ...)
  └→ parseUnary → parsePower → 2 ^ 2
```

结果是 `-(2^2) = -4`，与数学约定一致。如果用户想要 `(-2)^2 = 4`，必须显式加括号。

### 3.3 陷阱二：隐式乘法

计算器用户经常写 `2π`、`3sin(x)`、`2(3+4)`，期望它们被理解为 `2*π`、`3*sin(x)`、`2*(3+4)`。Parser 需要在不引入歧义的前提下处理隐式乘法。

实现方式是在 `parseTerm` 中，解析完一个因子后检查下一个 Token 是否可以开始一个新的因子——如果是，就插入一个隐式的乘法节点：

```ts
// 简化示意（实际代码使用 startsOperand 而非 canStartFactor）
function parseTerm(): Node {
  let left = parseUnary();
  for (;;) {
    const t = peek();
    if (t?.type === 'op' && ['*', '/', '%'].includes(t.value)) {
      advance();
      const right = parseUnary();
      left = { kind: 'bin', op: t.value, l: left, r: right };
    } else if (startsOperand(t)) {
      // 隐式乘法：下一个 Token 能开始新因子时插入乘法
      const right = parseUnary();
      left = { kind: 'bin', op: '*', l: left, r: right };
    } else {
      return left;
    }
  }
}
```

`startsOperand` 返回 true 的条件是：当前 Token 是数字、标识符或左括号。这样 `2π` → `2 * π`、`3sin(x)` → `3 * sin(x)`、`2(3+4)` → `2 * (3+4)` 都能正确处理。

但有一个微妙陷阱：隐式乘法只在 `parseTerm` 层插入，不会干扰 `parsePower` 的右递归。例如 `2x^2` 被解析为 `2 * (x^2)` 而非 `(2*x)^2`，因为 `^` 在 `parsePower` 层（优先级 4）处理，高于 `parseTerm`（优先级 2）。

### 3.4 陷阱三：百分号的双重身份

`50% × 2` 中的 `%` 是百分号（0.5 × 2 = 1），`7 % 3` 中的 `%` 是取模（结果 1）。同一个符号在两种语境下意义完全不同。

引擎的处理方式是：在 Parser 层，`%` 作为**后缀运算符**时表示百分号（`50%` → `50 / 100` → `0.5`），作为**中缀运算符**时表示取模。后缀 `%` 在 `parsePostfix` 层处理（优先级 5），中缀 `%` 在 `parseMulDiv` 层处理（优先级 2）。

```
parsePostfix: parsePrimary (%)*
  → 50 %  解析为 Postfix('%', 50) → eval: 50/100 = 0.5

parseMulDiv: parseUnary (% parseUnary)*
  → 7 % 3  解析为 Bin('%', 7, 3) → eval: 7 mod 3 = 1
```

消歧靠的是**位置**：如果 `%` 前面刚解析完一个因子，且后面没有跟新的因子，它就是后缀；如果前后都有因子，它就是中缀。递归下降的自然结构让这个消歧几乎不需要特殊代码——`parsePostfix` 只会在一个因子结束后消费连续的 `%`，`parseMulDiv` 只会在两个因子之间消费 `%`。

### 3.5 陷阱四：阶乘溢出

`fact(n)` 和后缀 `!` 都调用同一个 `factorial` 函数。阶乘增长极快：`170! ≈ 7.26 × 10^306`，而 `171! ≈ 1.24 × 10^309`——这已经超过 IEEE 754 双精度浮点数的最大值 `≈ 1.80 × 10^308`，会返回 `Infinity`。

引擎的阶乘实现硬编码了上限检查：

```ts
export function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0) {
    throw new CalcError('Factorial requires a non-negative integer', '阶乘只接受非负整数');
  }
  if (n > 170) throw new CalcError('Factorial result too large (n ≤ 170)', '阶乘结果过大（n ≤ 170）');
  let r = 1;
  for (let k = 2; k <= n; k++) r *= k;
  return r;
}
```

`171!` 不是报 `Infinity` 而是直接抛错，因为用户看到 `∞` 可能误以为这是合法结果。

---

## 4. 求值层：遍历 AST，查表调函数

Evaluator 的工作最直接：递归遍历 AST，对每种节点类型执行对应操作。

### 4.1 变量查找

引擎维护一个 `Scope` 对象，包含用户变量表和角度模式：

```ts
export interface Scope {
  vars: Record<string, number>;
  deg: boolean;  // true = degrees, false = radians
}
```

常数表在 `functions.ts` 中定义：

```ts
export const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
  phi: (1 + Math.sqrt(5)) / 2,
  gamma: 0.5772156649015329,
  c: 299792458,
};
```

变量查找的优先级是：常数 > 用户变量 > 报错。这意味着 `π` 这样的内置常数不能被用户变量覆盖——`tryAssign` 会拒绝 `pi = 3` 这样的赋值。但如果用户定义了 `x = 5`，后续 `sin(x)` 中的 `x` 就取 5 而非报错。

### 4.2 角度模式

三角函数接受度数还是弧度是一个常见的混淆点。引擎通过 `Scope.deg` 标志统一处理：

```ts
const toRad = (v: number, s: Scope): number => (s.deg ? (v * Math.PI) / 180 : v);
const fromRad = (v: number, s: Scope): number => (s.deg ? (v * 180) / Math.PI : v);
```

`sin(x)` 在 DEG 模式下先用 `toRad` 将输入从度转弧度，再调用 `Math.sin`。`asin(x)` 先用 `Math.asin` 得到弧度，再用 `fromRad` 转回度。所有三角函数共享这两个转换函数，不会出现"sin 用了度但 asin 忘了转"这种 bug。

### 4.3 浮点安全输出：formatNumber

求值完成后，结果需要格式化为人类可读的字符串。`formatNumber` 函数处理了 IEEE 754 双精度的三个边界情况：

```ts
export function formatNumber(n: number): string {
  if (Number.isNaN(n)) return 'undefined';
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '-∞';
  if (Number.isSafeInteger(n)) return String(n);
  const abs = Math.abs(n);
  if (abs !== 0 && (abs >= 1e12 || abs < 1e-9)) {
    return trimExp(n.toExponential(6));
  }
  return String(Number(n.toPrecision(12)));
}
```

四个分支各有精确的含义：

1. **NaN → `'undefined'`**：不输出 `NaN`，因为用户输入 `0/0` 时看到 `undefined` 比看到 `NaN` 更直观（`NaN` 是编程术语，不是数学术语）。
2. **非有限数 → `∞` / `-∞`**：`1/0` 输出 `∞` 而非 `Infinity`。
3. **安全整数 → 直接 `String(n)`**：`1099511627776`（2^40）直接输出完整数字，而不是 `1.099512e+12`。这在数据单位换算器中至关重要——`1 TiB = 1099511627776 bytes`，如果输出科学计数法就丢失了精确值。
4. **大数或极小数 → `toExponential(6)`**：`1e12` 以上或 `1e-9` 以下用 6 位有效数字的科学计数法。
5. **其余 → `toPrecision(12)`**：12 位有效精度恰好覆盖双精度的 ~15.9 位十进制精度中用户关心的部分，去掉了末尾的浮点噪声。

`trimExp` 做的是清理 `toExponential` 的输出：`1.000000e+12` → `1e12`，`1.500000e-3` → `1.5e-3`。

---

## 5. MathML 导出：让公式"长得像数学"

计算器的预览区不是显示原始文本 `sin(pi/4)^2 + 2^3 * sqrt(9)`，而是渲染成 $\sin\left(\frac{\pi}{4}\right)^2 + 2^3 \times \sqrt{9}$。这需要把 AST 转成 MathML。

`formatMath.ts` 的 `nodeToMathML` 函数递归遍历 AST，为每种节点生成对应的 MathML 元素。它的核心难点是**括号消除**：用户输入 `(a+b)*c`，渲染时不应显示 `(a+b)` 的括号，因为分数线本身就是天然的分组符号。

```ts
// 除法的 MathML 输出：分数线天然消除括号
if (node.op === '/') {
  const num = nodeToMathML(node.l, 0);
  const den = nodeToMathML(node.r, 0);
  return `<mfrac><mrow>${num}</mrow><mrow>${den}</mrow></mfrac>`;
}
```

而加法的右子节点如果是减法，则需要加括号：`a - (b - c)` 不能渲染成 `a - b - c`（语义不同）。这些括号决策由 `precedence` 函数和 `parentPrec` 参数共同控制。

希腊字母变量有专门的映射表 `GREEK_VARS`，`pi` → `π`、`tau` → `τ`。下标变量如 `x_1` 会被检测并渲染为 `<msub><mi>x</mi><mn>1</mn></msub>`。

---

## 6. 双语错误消息：构造函数的第二个参数

引擎的每个错误都携带中文和英文两种消息。这不是通过查表实现的——半数错误消息内嵌了位置或变量名，没有稳定的查表键。取而代之的是，`CalcError` 构造函数要求第二个参数必填：

```ts
export class CalcError extends Error {
  pos: number;
  messageZh: string;
  constructor(message: string, messageZh: string, pos = 0) {
    super(message);
    this.name = 'CalcError';
    this.messageZh = messageZh;
    this.pos = pos;
  }
}
```

TypeScript 的类型系统在这里充当了编译期守卫：新增一个 `throw new CalcError(...)` 但漏掉中文消息，编译器会直接报错。三个显示点（标准计算器的错误行、2D 绘图器的行内错误、3D 曲面的 `#g3-error`）都通过 `errorText(err)` 取出 `{en, zh}` 对，用 `setBilingual` 摆 span 对——**绝不用 `innerHTML`**，因为错误消息里可能包含用户刚敲进去的字符，直接 `innerHTML` 会有 XSS 风险。

---

## 7. 工程收获：900 行代码换来什么

回过头看，这套引擎的核心只有不到 900 行 TypeScript，但它解决了：

- **安全**：用户输入永远不会作为代码执行，`while(true)` 在词法层就因为 `while` 不是已知标识符而报错。
- **语法自由度**：隐式乘法、Unicode 别名、百分号消歧——这些是科学计算器的用户期望，但 `eval` 全部做不到。
- **错误定位**：每个错误都精确到字符位置，并附带双语消息。
- **三端复用**：标准计算器、2D 绘图、3D 曲面共用同一套语法规则和错误处理。
- **MathML 预览**：用户看到的是 $\frac{\pi}{4}$ 而非 `pi/4`。

这些收益的前提是接受"不依赖第三方库"的约束。`mathjs`（约 530 KB minified）确实能做这一切，但本站的整个 JavaScript 预算是 `main` < 45 KB（br 压缩后），引入 mathjs 意味着预算翻 12 倍。手写引擎的代价是开发时间，收益是永久性的零依赖、零供应链风险。

如果你也想为一个工具站手写计算器引擎，建议的顺序是：先写 Tokenizer 跑通 `1+2`，再加 Parser 处理优先级，最后接 Evaluator。每加一层就写测试——尤其是 `-2^2`、`50% × 2`、`2π` 这几个边界用例，它们能拦住 80% 的解析器 bug。
