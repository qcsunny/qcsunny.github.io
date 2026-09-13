---
title: '浏览器 Web Audio API 实战：音频 FFT 频谱分析与真假无损音质检测'
description: '深度拆解无损音质检测工具的算法实现。从 Web Audio API 的 AudioContext 采样流切入，剖析 2048 点离散傅里叶变换 (FFT) 频域映射原理，分析 16kHz 与 20kHz 频响硬截断伪影，并展示大文件分块 PCM 解码与纯前端真假 FLAC 识别的完整工程实践。'
pubDate: 'Sep 13 2026'
category: web
topics: [frontend, web-platform, algorithms]
searchTerms: ['无损音质检测', 'Web Audio API', 'FFT', '频响截断', 'FLAC']
contentLang: 'zh-CN'
relatedTools: ['media/lossless-checker', 'media/media-info']
relatedPosts: ['browser-office-vendored-libraries', 'browser-zero-jank-web-worker-and-transferable']
---

在数字音乐领域，**“假无损”**（Fake Lossless / Upsampled Audio）是一个屡见不鲜的现象：某些不合规的音源提供者将 128kbps 或 192kbps 的有损 MP3 重新编码导出为 FLAC 或 WAV 格式，宣称其为“无损音频”。由于文件体积翻了数倍且扩展名变为了 `.flac`，普通用户仅凭文件信息无法分辨真伪。

然而，无论文件包装如何改变，**有损压缩在频域中留下的高频裁切伪影（High-Frequency Cutoff Artifacts）永远无法恢复**。

本站 [无损音质检测器](/media/lossless-checker/) 与 [媒体信息查看器](/media/media-info/) 实现了完全在浏览器本地运行的音频频谱分析管线。不需要把数百兆的音频文件上传到远程服务器，利用 HTML5 原生的 **Web Audio API** 与 **FFT（快速傅里叶变换）**，数秒内即可绘制声学频谱并精准判断音频真伪。

这篇文章将深入拆解这套前端音频分析引擎的底层原理与实现细节。

---

## 1. 声学原理：为什么有损压缩会留下“高频悬崖”？

人耳的听觉频率范围通常在 $20\,\text{Hz} \sim 20\,\text{kHz}$ 之间。有损音频压缩算法（如 MP3、AAC、OGG）的核心原则是**心理声学模型（Psychoacoustic Model）**与**频域量化裁切**：

1. **128 kbps MP3**：为了在极低码率下维持人声清晰度，编码器会将 $16\,\text{kHz}$ 以上的音频信号彻底丢弃（或使用极粗糙的 SBR 频段复制）。在频谱图上，在 $16\,\text{kHz}$ 位置会出现一条干净利落的横向“断崖”。
2. **320 kbps MP3**：高码率 MP3 虽保留了更多细节，但限于算法上限，通常会在 $20\,\text{kHz} \sim 20.5\,\text{kHz}$ 处实施硬截断。
3. **真实 CD 级无损（44.1kHz / 16bit FLAC）**：根据**奈奎斯特–香农采样定理（Nyquist–Shannon Sampling Theorem）**，采样率为 $f_s = 44.1\,\text{kHz}$ 的音频，其最高有效频率可达到奈奎斯特极限 $f_{\text{Nyquist}} = f_s / 2 = 22.05\,\text{kHz}$。真正的无损音频在 $20\,\text{kHz} \sim 22\,\text{kHz}$ 之间依然拥有丰富的高频谐波能量与渐进衰减曲线。

| 音频格式 / 质量 | 频响高频上限 | 频谱特征描述 |
|---|---|---|
| 128 kbps MP3 | $\sim 16.0\,\text{kHz}$ | $16\,\text{kHz}$ 以上完全无信号（一片漆黑） |
| 192 kbps MP3 | $\sim 18.5\,\text{kHz}$ | $18.5\,\text{kHz}$ 处显著断层 |
| 320 kbps MP3 | $\sim 20.0\,\text{kHz}$ | $20.0\,\text{kHz}$ 处硬截断 |
| **真无损 (FLAC/WAV)** | **$\ge 22.05\,\text{kHz}$** | **能量自然延伸至奈奎斯特极限，泛音完整** |

---

## 2. 基于 Web Audio API 的 2048 点 FFT 频域映射

要在浏览器中分析音频文件，首先需要将时域的 PCM 采样点转换为频域的能量分布。

### 步骤一：使用 `OfflineAudioContext` 解码 PCM
我们不需要实时播放音频，因此使用 `OfflineAudioContext` 可以在后台以数倍速完成解码：

```ts
// 创建离线音频上下文
const offlineCtx = new OfflineAudioContext(1, sampleRate, sampleRate);
const audioBuffer = await offlineCtx.decodeAudioData(fileArrayBuffer);
```

### 步骤二：配置 `AnalyserNode` 进行 2048 点 FFT
通过创建 `AnalyserNode` 并设置 `fftSize = 2048`，引擎会将时间窗内的采样数据进行快速傅里叶变换：

$$\text{Frequency Resolution} = \frac{f_s}{\text{fftSize}} = \frac{44100}{2048} \approx 21.533\,\text{Hz/bin}$$

共有 $\text{frequencyBinCount} = \text{fftSize} / 2 = 1024$ 个频率槽（Bins）。第 $k$ 个频槽代表的物理频率为：

$$f_k = k \cdot \frac{f_s}{\text{fftSize}}$$

```ts
const analyser = offlineCtx.createAnalyser();
analyser.fftSize = 2048;
analyser.smoothingTimeConstant = 0.0; // 获取无平滑的精确瞬间频响

const frequencyData = new Float32Array(analyser.frequencyBinCount);
```

---

## 3. 高频能量衰减判定与算法实现

在获取到整个音频时长内不同时间段的频响数据矩阵后，检测引擎通过计算最高频段（$16\,\text{kHz} \sim 22.05\,\text{kHz}$）的相对能量密度（Relative Power Spectral Density）来进行自动分类决策：

```ts
/**
 * 分析音频频响数据，返回音频品质判定结果
 */
export function analyzeAudioQuality(
	freqMatrix: Float32Array[],
	sampleRate: number
): { status: 'lossless' | 'lossy_320k' | 'lossy_128k'; cutoffFreq: number } {
	const binCount = freqMatrix[0].length;
	const binWidth = sampleRate / (binCount * 2);

	// 计算每个频槽在全曲时间段内的平均分贝值 (dBFS)
	const avgPowers = new Float32Array(binCount);
	for (let k = 0; k < binCount; k++) {
		let sum = 0;
		for (let t = 0; t < freqMatrix.length; t++) {
			sum += freqMatrix[t][k];
		}
		avgPowers[k] = sum / freqMatrix.length;
	}

	// 查找能量发生陡降的截断频率点 (Cutoff Frequency)
	let cutoffFreq = sampleRate / 2;
	const thresholdDb = -75; // 噪声基底阈值

	for (let k = binCount - 1; k >= 0; k--) {
		const freq = k * binWidth;
		if (avgPowers[k] > thresholdDb) {
			cutoffFreq = freq;
			break;
		}
	}

	if (cutoffFreq < 17000) {
		return { status: 'lossy_128k', cutoffFreq };
	} else if (cutoffFreq < 20500) {
		return { status: 'lossy_320k', cutoffFreq };
	}
	return { status: 'lossless', cutoffFreq };
}
```

---

## 4. 大文件内存控制与 Web Worker 性能优化

对于动辄几十兆甚至几百兆的高解析度无损音频（如 $96\,\text{kHz} / 24\,\text{bit}$ FLAC），如果一次性将全部 PCM 采样加载到内存中做完整 FFT，会导致移动端浏览器内存飙升甚至崩溃。

我们采用了**多点均匀采样与分块流式分析**策略：
1. **多点均匀抽样**：无需解码整首歌曲的所有采样点，而是沿时间轴均匀抽取 20 个 2 秒长的音频片段（如开篇、主歌、副歌、高潮、结尾）；
2. **内存及时释放**：每个片段分析完成后，立即将 `AudioBuffer` 显式解绑归还内存；
3. **Canvas 2D 频谱图绘制**：利用热力图颜色映射表（Magma / Inferno Color Map），将分贝数据 $dB \in [-100, 0]$ 映射为从深蓝（低能量）到亮黄/白（高能量）的频谱图，给用户提供一目了然的直观凭证。

欢迎体验本站 [无损音质检测器](/media/lossless-checker/)，体验纯前端声学分析的魅力。
