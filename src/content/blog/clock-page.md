---
title: '极简时钟页：主题、番茄钟与零依赖实现'
description: '博客的 /clock/ 全屏时钟页：自适应字号、三态主题、秒数开关和番茄钟，全部零依赖纯浏览器实现。'
pubDate: 'Sep 01 2026'
---

博客导航栏里的 **Clock**（[/clock/](https://qcsunny.github.io/clock/)）是一个全屏极简时钟页面，参考 Kindle 待机时钟的设计：白底黑字（或黑底白字）、超大时间、星期与英文长日期。本文记录它的功能与实现。

## 功能

- **24 小时制大时钟**：`Monday / September 1, 2026 / 14:32:09`，时间完全取自设备本地时钟，**不联网**——加载后断网也照常走
- **主题三态切换**（右上角按钮循环）：☀ 浅色 → ☾ 暗色 → ◐ 自动（跟随浏览器 `prefers-color-scheme`，且系统切换时实时响应）
- **秒数开关**（`:ss` 按钮）：在 `HH:MM:SS` 与 `HH:MM` 间切换，隐藏秒后时间字号自动放大继续占满屏宽
- **番茄钟**（左上角 🍅）：25 分钟专注 → 自动进入 5 分钟休息，到点蜂鸣

## 关键实现

### 字号自适应：vw + dvh

时间要"占满屏幕又不溢出"，用的是双约束：

```css
.time {
	font-size: min(17vw, 30dvh);      /* 宽度约束 | 高度约束取小者 */
	font-variant-numeric: tabular-nums; /* 等宽数字防跳动 */
}
```

- 17vw：8 个字符（`HH:MM:SS`）约占宽度的 87%
- 30dvh：竖屏（如手机）时高度先到顶，取小的那个
- 隐藏秒后只有 5 个字符，切换到 `min(27vw, 30dvh)` 保持占满

`tabular-nums` 让每个数字等宽，秒数跳字时整个时间不会左右抖动。

### 主题：CSS 变量 + 防闪烁

```css
:root { --bg: #fff; --fg: #000; }
html[data-theme='dark'] { --bg: #000; --fg: #fff; }
```

页面所有颜色只引用变量。难点是**防闪烁**：如果等 JS 加载完再设置 `data-theme`，暗色用户会先看到一帧白色。解法是在 `<head>` 里放一段同步内联脚本，渲染前就确定主题：

```html
<script is:inline>
	const mode = localStorage.getItem('clock:theme') ?? 'auto';
	document.documentElement.dataset.theme =
		mode === 'auto'
			? matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
			: mode;
</script>
```

### 番茄钟：时间戳而非倒计时

计时器存的是**截止时间戳**（`endAt`）而不是剩余秒数：

```js
{ phase: 'focus', endAt: Date.now() + 25 * 60_000, paused: false }
```

好处：刷新页面后从 localStorage 恢复时，直接用 `endAt - Date.now()` 算剩余时间，标签页挂起（浏览器节流后台定时器）期间时间也照走不漂移。状态存 `clock:pomodoro`，关闭页面期间已到期的计时器在下次打开时按空闲处理。

到点提示用 WebAudio 现场合成三声蜂鸣（880Hz 振荡器 + 增益包络），**零音频文件**。注意浏览器自动播放策略：AudioContext 必须在用户点击 🍅 的手势里创建并 `resume()`，到点时才能出声。

### 整秒对齐

时钟更新先同步到下一个整秒再起 `setInterval`，避免累计漂移导致分钟跳变延迟：

```js
setTimeout(() => {
	tick();
	setInterval(tick, 1000);
}, 1000 - (Date.now() % 1000));
```

## 零请求

整个页面（含主题逻辑、番茄钟）只有**一个 HTML 文件**：脚本全部 `is:inline` 内联，不产生任何额外 JS/CSS/字体请求。对用旧平板/Kindle 当挂钟的场景，这是最省电、最快的形态。
