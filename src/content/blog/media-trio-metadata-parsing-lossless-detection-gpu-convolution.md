---
title: '媒体三件套：读字节的元数据解析器、只在 48 kHz 设备翻车的无损判别、一个三角形的 GPU 卷积'
description: '三个媒体工具的三个坑：RIFF 里 fmt 只是惯例不是规格，WAVE_FORMAT_EXTENSIBLE 把真正的编解码器藏进 subformat GUID；decodeAudioData 会把采样率重采样到 AudioContext 自己的率，所以 audio.sampleRate 是解码率而不是文件率；WebGL 的 mat3 是列主序，JS 必须转置。'
pubDate: 'Sep 13 2026'
category: engineering
topics: [frontend, web-platform, performance]
searchTerms: ['媒体元数据', 'RIFF', 'WAV', 'WebM', 'EBML', 'ISO-BMFF', '无损音乐', '频谱分析', 'WebGL 卷积']
contentLang: 'zh-CN'
relatedTools: ['media/media-info', 'media/lossless-checker', 'media/image-filter-lab']
relatedPosts: ['mandelbrot-webgl-double-single-precision', 'canvas-function-grapher-2d-sampling-and-webgl', 'floating-point-ieee754-and-precision']
---

[媒体信息查看器](/media/media-info/)、[真假无损音乐判别](/media/lossless-checker/)、[图像滤镜实验室](/media/image-filter-lab/)是站内媒体分类的三个工具。它们共用一条底线——**文件不出浏览器**——但技术路径完全不同：第一个是纯字节解析，第二个是 WebAudio + FFT，第三个是 WebGL。

三个工具各踩了一个"看起来能跑、特定条件才炸"的坑，而且都不是算法错，是**对底层约定的误读**：把 RIFF 的 `fmt` 当成规格、把 `audio.sampleRate` 当成文件属性、把 JS 的行主序矩阵直接喂给 `uniformMatrix3fv`。这篇文章拆这三个坑。

---

## 1. 元数据解析器：别信声明，走结构

浏览器能解码几乎所有媒体格式，但**没有标准 API 能读出编码、分辨率、帧率**。要这些只能自己读字节，或者引一个 MB 级的 wasm 版的 MediaInfo / ffmpeg。工具选了前者：591 行 TypeScript、零依赖，能读 ISO-BMFF（MP4/MOV/M4A）、EBML（WebM/MKV）、RIFF（WAV）、FLAC、MP3 五类容器，其余的走浏览器自己的解码栈兜底。

五类容器各不相同，但**同一条规矩贯穿始终**：容器是"声明 + 实际内容"的两层结构，声明永远不能信，只能顺着结构走。

### 1.1 ISO-BMFF：box 的三种 size 形态

MP4 由自描述的 box 组成，每个 box 是 `size(4) + type(4) + payload`。麻烦在 `size` 有三种合法形态：

```ts
const walk = (start: number, end: number, visit: (type: string, cs: number, ce: number) => void): void => {
	let o = start;
	while (o + 8 <= end) {
		let size = dv.getUint32(o);
		const type = fourcc(o + 4);
		let hdr = 8;
		if (size === 1) {
			if (o + 16 > end) return;
			size = Number(dv.getBigUint64(o + 8));
			hdr = 16;
		} else if (size === 0) size = end - o;
		if (size < hdr || o + size > end) return;
		visit(type, o + hdr, o + size);
		o += size;
	}
};
```

- `size === 1`：真实大小在 `o+8` 的 64 位整数里，头部 16 字节——`mdat` 常见；
- `size === 0`：box 一直跑到本层末尾，规范明确允许；
- 其余情况：`size` 是 32 位字面长度。

关键是最后那句 `if (size < hdr || o + size > end) return;`——**遇到不合法的 size 是"这文件不是 ISO-BMFF"，不是异常**。这个判断顺序很重要：`walk` 先被拿去试 MP4，失败才轮到 WAV；如果这里抛错，所有非 MP4 文件都会报错而不是继续尝试下一个解析器。

同一份文件里到处是 16.16 定点数，读的时候要除以 65536：

```ts
if (t3 === 'tkhd') {
	// width/height (16.16 fixed) are the box's last 8 content bytes
	const w = dv.getUint32(ce3 - 8) / 65536;
	const h = dv.getUint32(ce3 - 4) / 65536;
```

注意 `ce3 - 8`——宽高是 `tkhd` 的**最后** 8 个内容字节，不是开头，因为版本 1 的 `tkhd` 比版本 0 多 12 个字节的时间戳。音频 sample entry 的采样率同样是 16.16：`Math.round(dv.getUint32(E + 32) / 65536)`。

`mvhd` 的 version 0 与 1 字段偏移完全不同（1 版用 `BigUint64` 的时长时间戳），`stsd` 的 sample entry 固定部分按编解码器分（视频 78 字节、音频 28 字节），固定部分之后才轮到承载 HDR 信息的子 box——`colr/nclx` 的 transfer 值 16 是 HDR10、18 是 HLG，`dvcC`/`dvvC` 是杜比视界。

帧率不用读任何"帧率字段"，从 `stts` 反推：

```ts
// content: version/flags(4) + entryCount(4) + (count, delta) pairs
const n = dv.getUint32(cs6 + 4);
let samples = 0, ticks = 0;
for (let i = 0; i < n && cs6 + 8 + i * 8 + 8 <= ce6; i++) {
	const c = dv.getUint32(cs6 + 8 + i * 8);
	const d = dv.getUint32(cs6 + 8 + i * 8 + 4);
	samples += c;
	ticks += c * d;
}
```

`fps = samples × timescale / ticks`——这是从"每条记录多少帧、每帧多少个 tick"累加出来的平均值，比任何声明字段都诚实。

### 1.2 EBML：vint 的 marker 对 ID 和 size 要分开处理

WebM/MKV 用 variable-size integer（vint）。同一个 vint 在读 **ID** 和读 **size** 时处理不一样，这是 EBML 最容易写错的一行：

```ts
/** Read a vint at pos. `strip` drops the marker bits (sizes); IDs keep them. */
const vint = (pos: number, strip: boolean): { value: number; len: number } | null => {
	if (pos >= len) return null;
	const first = dv.getUint8(pos);
	if (first === 0) return null;
	let n = 0, mask = 0x80;
	while (mask && !(first & mask)) { mask >>= 1; n++; }
	if (n > 7 || pos + 1 + n > len) return null;
	let v = strip ? first & (0xff >> (n + 1)) : first;
	for (let i = 1; i <= n; i++) v = v * 256 + dv.getUint8(pos + i);
	return { value: v, len: n + 1 };
};
```

第一字节的最高位是 marker，用来编码长度。ID 的 marker **属于 ID 值本身**（`0x1a45dfa3` 就是文档头），size 的 marker 则要剥掉——`0xff >> (n+1)` 正好把 marker 和它下面的值位分界。这里如果写反，size 会大一个量级，走两步就跳出文件。

其余都是同一种走法：`MASTERS` 集合里的 ID 递归下钻，`size === 0` 表示"未知大小"直接结束本层，递归深度封顶 6 层。`TimestampScale` 缺省 `1_000_000`，所以 `Duration` 的单位是毫秒，换算成秒要乘 scale 再除 1e9；把这个默认值当成 1（即把 `Duration` 直接当秒读）会差出 10⁶ 倍。

### 1.3 RIFF：`fmt` 在第一个 chunk 是惯例，不是规格

这是这条链上唯一的真 bug。第一版按偏移 12 直接读 `fmt `：

```ts
// fmt is only the *first* chunk by convention, not by spec: real files
// carry LIST / JUNK / fact before it, and WAVE_FORMAT_EXTENSIBLE uses a
// 40-byte fmt whose bit depth lives in a subformat GUID. Walk the chunks.
let fmtOff = -1;
let fmtSize = 0;
let dataBytes = 0;
let o = 12;
while (o + 8 <= buf.byteLength) {
	const id = tag(o);
	const size = dv.getUint32(o + 4, true);
	if (id === 'fmt ') { fmtOff = o + 8; fmtSize = size; }
	else if (id === 'data') {
		// Writers often pad the data chunk size out to the file end.
		dataBytes = Math.min(size, buf.byteLength - (o + 8));
		break;
	}
	o += 8 + size + (size % 2);
}
```

三个细节各自都是坑：

- **`o += 8 + size + (size % 2)`**：RIFF 的 chunk 是 16 位对齐的，奇数大小的 chunk 后面补一个 pad 字节。漏掉 `size % 2`，第二个 chunk 就整体错位一字节。
- **`dataBytes = Math.min(size, ...)`**：不少写手把 `data` chunk 的 size 填成"到文件末尾"，比实际字节多。不钳住的话时长会虚高。
- **奇数 pad 之后才继续走**：所以 `fmt ` 的偏移是边走边找出来的，不是常量。

`fmt ` 的内容里还有一个藏起来的字段：

```ts
// fmt+12 is the block align, but WAVE_FORMAT_EXTENSIBLE puts a 16-byte
// SubFormat GUID at fmt+18 instead; the real codec is that GUID's first two
// bytes (0x0001 PCM, 0x0003 IEEE float).
if (format === 0xfffe && fmtSize >= 40) format = dv.getUint16(fmtOff + 18, true);
```

`WAVE_FORMAT_EXTENSIBLE`（0xFFFE）是 Windows 上的主流写法——Windows 自己写的 WAV 大多是它。真实编解码器不在 `wFormatTag` 里，而在 fmt 的 `+18` 处的 subformat GUID 的前两个字节。偏移算错一字节就会读出 GUID 的第二字段，得到一个 0xFFFF 之类的乱码。

顺带一条口径问题：WAV 只有 fmt 说了才是 PCM。工具用一张 `WAVE_FORMATS` 表把 1/3/6/7/11/17/22/255/4584 命名成 PCM、IEEE float、A-law、µ-law、IMA ADPCM、G.722.1、AC-3、G.719、WMA，剩下的打 `format 1234`——**不猜**。

时长用 `fmt ` 自己声明的字节率做分母，这是对所有编解码器都成立的口径：

```ts
// fmt's own byteRate is the honest denominator for every codec; the
// sample-rate formula only holds for block-aligned PCM and IEEE float.
const byteRate = byteRateField || ((sampleRate * channels * bits) / 8 || 1);
```

`samplerate × channels × bits / 8` 只对块对齐的 PCM 和 IEEE float 成立，G.711 的 A-law/µ-law 是压缩流，套这个公式算出来的码率是错的。

### 1.4 MP3 与 FLAC：两处"减法"

MP3 有两处需要减法：

```ts
// skip ID3v2: "ID3" + ver(2) + flags(1) + syncsafe size(4)
if (len > 10 && dv.getUint8(0) === 0x49 && dv.getUint8(1) === 0x44 && dv.getUint8(2) === 0x33) {
	const size = ((dv.getUint8(6) & 0x7f) << 21) | ((dv.getUint8(7) & 0x7f) << 14)
		| ((dv.getUint8(8) & 0x7f) << 7) | (dv.getUint8(9) & 0x7f);
	off = 10 + size;
}
```

ID3v2 的大小是 **syncsafe** 编码——每字节只用低 7 位。四个 syncsafe 字节只装 28 位值，按普通大端读最多放大 8 倍（`0x7f7f7f7f` 在 syncsafe 里是 268 435 455，当普通大端读是 2 147 418 239）；一个 1 MiB 的 tag 会被读成 4 MiB。后果不是"时长算错"而是更硬：`off` 直接甩到文件末尾之外，帧同步扫描找不到 11 位同步头，`parseMp3` 返回 `null`，整条 MP3 掉到 `<video>` 兜底。减掉 tag 之后：

```ts
// The ID3v2 tag is not audio; a 200 KB tag on a 13 MB track is a 1.5% lie.
// The nominal bitrate is a CBR assumption — a Xing/VBRI frame in the first
// audio frame means the track is VBR and this estimate is not trustworthy.
const first4 = dv.getUint32(hdr + 4);
const vbr = first4 === 0x58696e67 || first4 === 0x56425249; // "Xing" / "VBRI"
```

时长本身就是估的（`size × 8 / bitrate`），CBR 假设成立时误差在 1% 内；第一个音频帧的 `+4` 处是 Xing 或 VBRI 标签就说明这条 track 是 VBR，标称码率不可信——报告里直接印 `nominal-bitrate estimate, VBR — unreliable`，而不是给出一个假的精确时长。

FLAC 只需要读 34 字节的 STREAMINFO。全部关键信息挤在一个大端窗口里：

```ts
const bits = dv.getUint32(18) >>> 0; // rate<<12 | ch<<9 | depth<<4 | hi(samples)
const sampleRate = bits >>> 12;
const channels = ((bits >>> 9) & 0x07) + 1;
const depth = ((bits >>> 4) & 0x1f) + 1;
const totalSamples = (bits & 0x0f) * 2 ** 32 + (dv.getUint32(22) >>> 0);
```

128 位尾部的四个字段挤在一起：采样率 20 位、声道数−1 占 3 位、位深−1 占 5 位、总样本数的高 4 位，剩下的 32 位在下一个字里。36 位的样本数除以采样率就是精确时长——FLAC 是这几种容器里唯一能**不估算**时长的。

### 1.5 兜底：`<video>` + blob URL

五种容器都读不出来时才走兜底——让浏览器自己的解码栈出数据，仍然不出设备：

```ts
const el = document.createElement('video');
const url = URL.createObjectURL(new Blob([data]));
const done = (r: { w: number; h: number; d: number } | null): void => {
	URL.revokeObjectURL(url);
	resolve(r);
};
el.preload = 'metadata';
el.onloadedmetadata = () => done({ w: el.videoWidth, h: el.videoHeight, d: el.duration });
el.onerror = () => done(null);
setTimeout(() => done(null), 4000);
el.src = url;
```

`preload='metadata'` 让浏览器只读头部，不解码全片；三条退出路径（metadata 就绪、解码失败、4 秒超时）**都必须 revoke**，否则每个未识别文件都会泄漏一个 blob 引用。

---

## 2. 无损判别：`decodeAudioData` 会偷偷重采样

[真假无损判别](/media/lossless-checker/)的原理是频率天花板：有损编解码器会低通滤波自己的输出（LAME 320 kbps 约 20.5 kHz，V0 约 19.5 kHz，128 kbps 约 16 kHz），而真 CD 抓轨带得到 22.05 kHz。所以扫频谱，看能量在哪断崖式下跌。

算法本身不复杂——Hann 窗 + N = 8192 的迭代 radix-2 FFT，在 44.1 kHz 下每个 bin 约 5.4 Hz；截止频率取"幅度不低于峰值 −60 dB 的最高 bin"；先按粗步长算 RMS 挑最响的 6 个窗口，再取**中位数**。中位数是为了抗住一个静音窗口或一个削峰窗口把整片拖偏。

真正的坑在判定基准上：

```ts
const sampleRate = audio.sampleRate;
const cutoffs = windowCutoffs(channel, sampleRate, 6);
await ctx.close();
// …
const ctxNyquist = sampleRate / 2;
// decodeAudioData resamples to the AudioContext rate, so sampleRate above is
// the *decode* rate, not the file's own rate. A 44.1 kHz master tops out at
// 22050 Hz, which sits below the 24 kHz Nyquist of a 48 kHz context — judge
// against the smaller ceiling or every genuine CD rip reads as a transcode.
const refCeiling = Math.min(ctxNyquist, 22050);
```

`decodeAudioData` 会把解码结果**重采样到 AudioContext 自己的采样率**，而 Chrome 的 AudioContext 通常是 48 kHz。所以 `audio.sampleRate` 报的是**解码率**，不是文件的采样率——没有任何参数能拿回原始率，传一个采样率进去反而会把结果强制成那个值。

于是旧代码在 48 kHz 设备上必然翻车：

- 44.1 kHz 母带的真实天花板是 22 050 Hz；
- 48 kHz 上下文的 Nyquist 是 24 000 Hz；
- 判定写成 `cut >= nyquist × 0.97` = 23 280 Hz；
- 22 050 < 23 280，**永远不通过**——每一片真 CD 抓轨都被判成 MP3/AAC 转码。

而在 44.1 kHz 设备上（Nyquist 恰好 22 050），旧代码一直是对的。**这个 bug 只在一半设备上出现**，本机测试全绿，用户那边炸。修法是判一个绝对基准而不是设备基准：`min(Nyquist, 22050)`。

阈值取 0.97 而不是 0.99：

```ts
// 0.97 × 22050 = 21389 Hz clears LAME 320's ~20.5 kHz lossy floor while
// still accepting real rips whose energy runs to 21–22 kHz. 15.5–21.4 kHz:
// classic lossy low-pass (V0 ~19.5, 128 ~16); below that: heavy lossy or
// a dull master.
```

`0.97 × 22050 = 21 388.5 Hz`，比 LAME 320 的有损下限高约 900 Hz，留出分离；同时又够低，能接受能量只跑到 21 kHz 的真抓轨（Hann 窗的旁瓣会让测得的截止略高于 22 050，中位数落在 22.x kHz）。15.5–21.4 kHz 是有损低通的典型带，再低就是高压缩转码或母带本身偏暗。

报告的最后一行是刻意的诚实声明：部分真无损母带（老录音、轻音乐）16 kHz 以上本来就没多少能量，这种情况下应该看**截止频率本身**而不是只看结论。报告里因此始终打印 6 个窗口各自的数值，而不只打印判定。

---

## 3. GPU 卷积：一个三角形，9 次 `texture2D`

[图像滤镜实验室](/media/image-filter-lab/)和站内 [Mandelbrot 浏览器](/fun/mandelbrot-explorer/) 共用同一个全屏三角形套路，但把"每像素算一遍"换成了"每像素取 9 个邻居"：

```ts
const VERT = 'attribute vec2 p; varying vec2 vUv; void main() { vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }';
```

```glsl
vec3 sum =
	texture2D(uImg, vUv + uTexel * vec2(-1.0,  1.0)).rgb * uKernel[0][0] +
	texture2D(uImg, vUv + uTexel * vec2( 0.0,  1.0)).rgb * uKernel[1][0] +
	/* …9 项… */
	texture2D(uImg, vUv + uTexel * vec2( 0.0, -1.0)).rgb * uKernel[1][2];
gl_FragColor = vec4(sum / uDivisor + uOffset, 1.0);
```

`uTexel` 是 `(1/width, 1/height)`，UV 的 y 轴原点在下左角，所以 UI 上"第一行"（顶行）对应 shader 里的 `+1.0`。这一层方向约定写反，滤镜不会报错，只会上下镜像。

第一处真坑在矩阵：

```ts
// mat3 is column-major; our UI reads row-major so transpose
gl.uniformMatrix3fv(U.kernel, false, new Float32Array([
	kernel[0], kernel[3], kernel[6],
	kernel[1], kernel[4], kernel[7],
	kernel[2], kernel[5], kernel[8],
]));
```

WebGL 的 `uniformMatrix3fv` 要**列主序**，而 UI 的 3×3 九宫格是按行读的。不转置的话 Sobel 不会崩——它会正常输出一个结果，只是 X 方向和 Y 方向互换：边缘照样亮，方向反了。这种"结果看起来对但语义错"的 bug 是矩阵 API 的经典陷阱。

第二处在采样参数上，这里要**刻意不设**两件事：

```ts
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
```

- `CLAMP_TO_EDGE`：边界像素需要取越界的邻居，`REPEAT` 会让图像边缘包住自己，Sobel 在四角给出假的强边缘；
- **不生成 mipmap**：默认的最小化过滤是 `LINEAR_MIPMAP_LINEAR`，一旦生成 mipmap，卷积的结果就被二次插值——模糊滤镜会自己叠加一层模糊。

第三处是个静默开关：

```ts
const glCtx = canvas.getContext('webgl', { preserveDrawingBuffer: true });
```

不给 `preserveDrawingBuffer: true`，`canvas.toDataURL('image/png')` 可能返回一张**空白 PNG**——绘制缓冲在合成之后就被清了，导出时拿到的是清屏后的画布。页面看起来完全正常，只有点导出才暴露。这也是为什么导出按钮先 `render()` 再取 dataURL。

画布尺寸钳在 1024：

```ts
const maxDim = 1024; // GPU-side cap: a 24MP photo is pointless for a preview
```

2400 万像素的照片缩到 1024 对预览毫无损失，但纹理内存和每帧 fragment 数能降一个量级。`precision mediump float` 对 3×3 卷积足够——9 个样本乘 9 个系数再除以除数，不会碰到 mediump 的动态范围。

---

## 4. 工程收获

- **容器都是"声明 + 实际内容"两层**，声明不可信——走结构（box / vint / chunk），把"不合法"当作"不是这个格式"而不是异常，让解析器链能优雅降级；
- **偏移要靠走出来的，不能是常量**：RIFF 的奇数 pad、ISO-BMFF 的 16 字节大 size 头、`tkhd` 里版本 1 多出的 12 字节，任何一个漏掉都是整体错位一字节；
- **定点数要除以 2¹⁶**，`mvhd` 的 version 0/1 偏移不同，`stsd` 的固定部分按编解码器分长——同一份规范里的偏移表不是一张；
- **API 返回的"采样率"要确认是谁的**：`decodeAudioData` 静默重采样，导致一个只在 48 kHz 设备上翻车、本机测试全绿的 bug；判定阈值必须挂在一个绝对基准上；
- **矩阵 API 要确认主序**：不转置不会报错，只会给出语义镜像的结果；
- **静默失效比报错更难抓**：`preserveDrawingBuffer` 关着时导出的是空白 PNG，页面一切正常，只有点导出才暴露；
- **兜底也要出本地**：`<video>` + blob URL 让未识别的容器仍能给出尺寸与时长，三条退出路径都必须 `revokeObjectURL`；
- **能诚实标注"不可靠"就不要给假精度**：VBR 的标称码率、偏暗母带的频谱天花板，报告里直接印 `unreliable` 比给出一个精确数字有用。

三个工具在此：[媒体信息查看器](/media/media-info/)、[真假无损音乐判别](/media/lossless-checker/)、[图像滤镜实验室](/media/image-filter-lab/)。全部本地运算，文件不出设备。
