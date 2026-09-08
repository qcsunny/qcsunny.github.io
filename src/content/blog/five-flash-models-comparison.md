---
title: 'Hy4 preview、GLM-5.3-Flash、Qwen3.8-Flash、DeepSeek-V4-Flash 与 MiMo-V2.5 横向对比'
description: '按官方资料全面对比五款模型的上下文、模态、架构与参数、开放性、美元价格、速率限制、评测证据和接入边界。'
pubDate: 'Sep 08 2026'
asOfDate: 'Sep 08 2026'
category: ai
topics: [ai, llm]
searchTerms: ['Hy4 preview', 'GLM-5.3-Flash', 'Qwen3.8-Flash', 'DeepSeek-V4-Flash', 'MiMo-V2.5', 'Flash model comparison']
contentLang: 'zh-CN'
relatedTools: []
relatedPosts: []
---

“Flash”不是统一的性能等级。五个名字里，有开源权重、API 产品和 preview；有纯文本模型，也有原生多模态；厂商披露的上下文、价格和基准口径也不相同。把它们排进一张“谁更强”的总榜，会制造出并不存在的可比性。

本文资料截至 **2026 年 9 月 8 日**，只记录厂商发布页、官方模型卡和官方 API 文档能够直接支持的事实。未披露就写未披露；厂商 benchmark 只作为厂商自报，不当作独立复现。名称也按官方拼写：腾讯的是 **Hy4 preview**，不是 “HY-4”；小米比较的是 API 中的 **MiMo-V2.5 标准版**，不是参数更大的 Pro。

## 先看结论

- 要自己部署、检查许可证或改推理栈，先看 **Hy4 preview（Apache-2.0）、GLM-5.3-Flash（MIT）、MiMo-V2.5（MIT）与 DeepSeek-V4-Flash（MIT）**，四者均已开源全量权重并支持本地 serving；Qwen 生产 API 虽为托管，但有 125B 架构基础的开放权重 Qwen3.8-Flash-Next 可供预览。
- 要 1M 长上下文并直接处理图像与视频，**GLM-5.3-Flash（声明 `[1m]` 标识）、Qwen3.8-Flash 和 MiMo-V2.5** 均原生支持；要音频输入，目前仅 MiMo-V2.5 明确列出。
- DeepSeek-V4-Flash 基础版是纯文本模型；视觉能力属于单独的实验模型 `deepseek-v4-flash-vision-exp`，不能算到基础 Flash 上。
- 想按公开 benchmark 直接排五强，目前做不到。没有一套五款都参加、版本和 harness 一致的官方或独立测试。
- 真正能先筛掉候选项的，通常是数据能否出域、输入模态、上下文/输出上限、许可证和单任务成本，而不是厂商表格中的一两个分数。

## 一张表看清不是同类产品

| 项目 | Hy4 preview | GLM-5.3-Flash | Qwen3.8-Flash | DeepSeek-V4-Flash | MiMo-V2.5（标准版） |
| --- | --- | --- | --- | --- | --- |
| 交付形态 | 开放权重 + API | 开放权重 + API | 生产托管 API；另有开放权重架构预览 | 开放权重 + API | 开放权重 + API |
| 官方权重许可证 | Apache-2.0 | MIT | 生产版未单独公开权重；架构版 Flash-Next 于 2026-08-26 开源（Qwen Community License 1.0） | MIT | MIT |
| 官方披露参数 | 770B 总计 / 49B 激活，另有 10B / 0.7B 激活 MTP | 320B 总计 / 18B 激活 | 生产版未单列；Flash-Next 预览为 125B core + 51B n-gram / 约 6B 激活 | 284B 总计 / 13B 激活（Pro 版为 1.6T / 49B） | 310B 总计 / 15B 激活（Pro 版为 1.02T / 42B） |
| 上下文 | 1M | 1M（同一模型以 `[1m]` 调用标识启用） | 1M（官方注 1,000,000） | 1M | 1M |
| 最大输出 | 未由官方明确；部分第三方平台限制 64K | 128K（131,072） | 131,072；thinking chain 另有上限 | 384K | 128K（131,072） |
| 输入 / 输出 | 文本 → 文本 | 视频、图像、文本、文件 → 文本 | 文本、图像、视频 → 文本 | 文本 → 文本（另有实验 ID 支持视觉） | 文本、图像、视频、音频 → 文本 |
| 官方兼容接口 | OpenAI 兼容 serving | OpenAI 兼容及多种本地 serving | OpenAI、Anthropic 兼容 | OpenAI、Anthropic 兼容及多种本地 serving | OpenAI、Anthropic 兼容及多种本地 serving |
| 官方美元价（每 1M tokens） | \$0.834 / \$2.501 | \$0.075 / \$0.25（限时五折） | \$0.15 / \$0.47（国际 / Global 区） | \$0.22 / \$0.66（非峰时） | \$0.14 / \$0.28 |

表中的留白与单列说明，严格遵循官方公开披露口径。尤其不能把同系列的其他模型行为补进空格：GLM-5.3-Flash 自身是 1M context、131,072 tokens 最大输出，不能因为命名接近就混用 GLM-5.3 的其他接口行为；Qwen3.8-Flash-Next 虽是生产版 Qwen3.8-Flash 的开放权重/架构预览基础，Next 的本地部署参数仍不等于托管 API 的服务上限。

## Hy4 preview：参数规模最大，部署门槛也最高

腾讯官方模型卡给出 770B 总参数、49B 激活参数、78 层结构：第一层是 dense FFN，后 77 层为 MoE，每个 token 使用 8 个 routed experts 和 1 个 shared expert。它还列出 Gated DeepSeek Sparse Attention、IndexCache、iHC 四残差流，以及 10B 总计、0.7B 激活的 MTP 模块。上下文为 1M，当前模型卡将它描述为 text-only，且未由官方明确公布最大输出上限（部分第三方 API 平台如 TokenHub 目前将其单次生成限制为 64K）。

权重可从 Hugging Face、ModelScope、GitCode 和 CNB 获取，许可证是 Apache-2.0，官方列出 Transformers、vLLM 和 SGLang 路线。这使它适合需要本地部署、可审计许可证或自定义推理服务的团队，但“49B 激活”不等于只需承载 49B 权重；770B 级主干仍决定显存、加载和并行成本。官方 local serving 名称为 `hy4-preview`，另有 `Hy4-preview-FP8` 权重。

腾讯发布公告还给出 TokenHub 口径：输入 **\$0.834 / 百万 token**、输出 **\$2.501 / 百万 token**、缓存命中 **\$0.042 / 百万 token**。这是厂商在特定渠道公布的价格，不代表所有入口、地区和后续时段。

官方内部盲评由 163 名专家评 203 个工程任务：Hy4 preview 为 2.99 / 4，GLM-5.3 为 2.92，Kimi K3 为 2.94；公告还称相对 GLM-5.3 吞吐提高 31.8%。这些都是腾讯自报，不是独立第三方复现，也不能外推到下文另外四款。

## GLM-5.3-Flash：小激活量开放权重，但别与 GLM-5.3 混写

Z.ai 官方模型卡把 GLM-5.3-Flash 标为原生多模态模型，约 320B 总参数、18B 激活参数，输入模态官方 API 文档列出为**视频、图像、文本、文件**，输出文本。架构关键词包括 hybrid sparse + linear attention 和 Manifold-Constrained Hyper-Connections；权重以 safetensors 发布，许可证为 MIT。模型卡 pipeline 标注为 image-text-to-text，但 Z.ai API 文档的模型规格卡明确列入 Video 输入，本文按 API 文档口径。

官方页同时列出 `glm-5.3-flash` 与 `glm-5.3-flash[1m]`。两者是**同一个 GLM-5.3-Flash 模型**；`[1m]` 是调用时声明 1M context 支持的标识，不是另一个模型、权重版本或能力档。测试和生产配置仍应记录实际 model ID，避免客户端默认上下文与 1M 声明不一致。

官方卡列出 Hugging Face Transformers、vLLM、SGLang、TokenSpeed、KTransformers 和 Unsloth 等部署路线，并提供 `reasoning_effort` 的 `low`、`high`、`max` 档。对要部署开放权重又不想承载 Hy4 770B 主干的团队，这个 18B 激活量很有吸引力；但总权重仍约 320B，不能按 18B dense 模型估算硬件。

上下文最容易误写。模型卡在不同评测任务中使用 164K、300K、400K、1M 等预算，而官方调用页用同一模型的 `glm-5.3-flash[1m]` 标识明确声明 1M context 支持。Flash 的最大输出为 **131,072 tokens（128K）**（官方 API 文档规格卡）。这里的 `[1m]` 只声明上下文支持，不代表另一套模型权重；文档和代码应同时写清基础 ID 与长上下文调用标识。

Z.ai 官方价格页对 GLM-5.3-Flash 给出限时促销价：输入 **\$0.075 / 百万 token**、缓存输入 **\$0.015**、输出 **\$0.25**；标价分别为 **\$0.15 / \$0.03 / \$0.50**。页面写明五折优惠在 **2026 年 9 月 9 日 24:00（UTC+8 / Singapore）**结束，因此本文只把它当截至资料日期的短期价格，不用于长期 TCO。该页没有替 Flash 补上通用 context 或 API model ID。

官方卡自报 Terminal-Bench 2.1 为 84.3，ExtractBench mean 为 80.75，并声称相对前代有提升。由于其余四款没有在同一 harness 全部参赛，这些数字只能说明该卡的自报结果，不能生成五模型排名。

## Qwen3.8-Flash：托管多模态和明确的 1M 窗口

阿里云 Model Studio 文档中的准确模型 ID 是 `qwen3.8-flash`。它支持文本、图像、视频输入和文本输出，context window 为 1,000,000；文档列出最大输入 991,808、最大输出 131,072。thinking 模式还单列 983,616 输入和最多 262,144 reasoning chain 的预算，调用方要按模式计算 token 边界，不能只记“1M”。

它提供 OpenAI 与 Anthropic 兼容接口，并列出 function calling、structured output、context caching、prefix continuation 等能力。web search 的地区支持并不一致：北京和新加坡支持，法兰克福、东京、弗吉尼亚不支持；batch 与 fine-tuning 均不支持。区域、数据驻留和功能可用性应在部署前按实际 endpoint 再核一次。

价格按地域和币种分开。国际 / Global 区美元口径为输入 **\$0.15 / 百万 token**、输出 **\$0.47 / 百万 token**（适用 1M context 以内）；中国区人民币价为输入 **¥0.80**、输出 **¥2.70**、缓存命中 **¥0.10**，显式缓存创建 **¥1.25**；新加坡区为输入 **¥1.094**、输出 **¥3.427**、缓存命中 **¥0.117**、缓存创建 **¥1.458**。前一组地区限额为 30,000 RPM / 5M TPM，新加坡为 15,000 RPM / 2M TPM。注意 Qwen 的缓存采用显式创建计费模式（创建缓存按输入计费，后续命中才享受低价），不同于 DeepSeek 或 MiMo 免创建费的自动命中缓存。

生产版 **Qwen3.8-Flash** 本身未单独公开权重文件，仅以托管 API 形式交付；其对应的基础架构与开放权重版本 **Qwen3.8-Flash-Next** 已于 **2026 年 8 月 26 日** 在 Hugging Face（`Qwen/Qwen3.8-Flash-Next`）与 ModelScope 正式公开，采用 **Qwen Community License 1.0**。该预览模型提供 125B 核心 + 51B n-gram 嵌入表（另含 4B MTP）、约 6B 激活，原生支持 262,144 上下文，官方部署指引用 YaRN 扩展至 1,000,000。两者虽具直接技术血缘，但生产版托管 API 的 1M 默认窗口、区域功能与限流规格，不能与开放权重预览版的本地部署参数混为一谈。

## DeepSeek-V4-Flash：284B 开源与 API 双轨，13B 极致激活

DeepSeek 官方更新日志将 API 模型名写为 `deepseek-v4-flash`。2026 年 4 月 24 日 V4 进入 API，7 月 31 日发布 **DeepSeek-V4-Flash-0731**（官方称之 superseding the preview version），后续增加 `low`、`high`、`max` thinking 档，并支持 Responses / Codex 相关接口。接入同时覆盖 OpenAI Chat Completions 与 Anthropic-compatible 形态。

该模型拥有约 **284B 总参数、13B 激活参数**（相比旗舰版 Pro 的 1.6T / 49B 大幅精简），采用 MoE 架构，并针对超长上下文引入**压缩稀疏注意力（CSA）与重度压缩注意力（HCA）**混合机制，结合**流形约束超连接（mHC）**改善极深网络的跨层特征传播。这些数字和术语均来自官方技术报告《DeepSeek-V4: Towards Highly Efficient Million-Token Context Intelligence》（arXiv:2606.19348）。

DeepSeek 已于 2026 年 7 月 31 日在 Hugging Face（`deepseek-ai/DeepSeek-V4-Flash-0731`）开源**全量模型权重**，采用 **MIT 许可证**。注意权重以 fp8/fp4 量化形式分发（config 中 quant_method 为 fp8、expert_dtype 为 fp4），仓库权重文件合计约 167 GB；官方部署指引是 vLLM 跑在单台 4×GB300 节点上。本文不给出社区估算的“几张显卡能跑”的结论——官方未披露相应数字。

官方定价页明确给出 1M context、384K 最大输出和 2500 并发。峰时每百万 token 为缓存命中 **\$0.014**、缓存未命中输入 **\$0.44**、输出 **\$1.32**；非峰时分别为 **\$0.007 / \$0.22 / \$0.66**。峰时是周一至周五 01:00–04:00 与 06:00–10:00 UTC（换算为北京时间即工作日 09:00–12:00 与 14:00–18:00，覆盖核心办公时段），周末全天、工作日午休与夜间均为非峰时。对于数据清洗、离线抽取等非实时批处理任务，错峰调度能让 API 支出直接减半。

基础 `deepseek-v4-flash` 应按文本模型处理。8 月 21 日另有实验 ID `deepseek-v4-flash-vision-exp` 增加视觉输入；它是独立模型名，参数规模未由官方披露，不能据此宣称基础 Flash 原生多模态。对生产系统而言，这个区分会影响请求 schema、回退策略和版本锁定。

## MiMo-V2.5 标准版：310B 开源全模态，15B 激活兼顾私有化

小米已在 Hugging Face（`XiaomiMiMo`）于 **2026 年 4 月 27 日**开源 **MiMo-V2.5 系列**全量权重（含 Base），采用 **MIT 许可证**。标准版模型拥有 310B 总参数、15B 激活参数，稀疏 MoE 架构（256 routed experts，每 token 激活 8 个），并融合**混合注意力**（Hybrid Attention：滑动窗口 SWA 与全局 GA 以 5:1 交错、128 滑动窗口）以及 3 层**多 Token 预测（MTP）**推测解码模块。旗舰版 **MiMo-V2.5-Pro** 则为 1.02T 总参数、42B 激活参数，两者不可混淆。

在官方托管 API 与本地推理形态中，标准版 ID 为 `mimo-v2.5`。它是原生全模态模型，支持文本、图像、视频、音频输入和文本输出，context window 为 1M，最大输出为 128K（131,072 tokens）；功能覆盖 deep thinking、streaming、function calling、structured output、web search 和 context caching，同时提供 OpenAI-compatible 与 Anthropic-compatible 接口。

官方 API 价格为缓存命中 **\$0.0028 / 百万 token**、未命中输入 **\$0.14 / 百万 token**、输出 **\$0.28 / 百万 token**（官方另有人民币口径 ¥0.02 / ¥1 / ¥2）。官方目录列出 100 RPM、10M TPM。需格外留意的是 100 RPM 的频控阈值：折合每秒不足 1.7 次请求，这意味着托管 API 的吞吐配额明显偏向大上下文长任务吞吐（10M TPM 极为宽裕），但并不适合未提额直接硬抗多用户高并发的 Web 在线交互。对于需要全模态且需要本地部署可控的团队，其 15B 极小激活量的 MIT 开源权重具备很高的工程吸引力。

## 成本对照：五款统一按官方美元价

五款模型都有官方美元口径价格，下表统一按每百万 token 列出美元价，避免汇率折算引入的第二层误差。三个口径提示：GLM-5.3-Flash 为限时五折价，原价见括号，优惠在 **2026 年 9 月 9 日 24:00（UTC+8）**结束；DeepSeek-V4-Flash 分峰谷两档，峰时为工作日 01:00–04:00 与 06:00–10:00 UTC；Qwen3.8-Flash 为国际 / Global 区美元价，其美元页未单列缓存命中价（人民币口径为 ¥0.10 / 百万 token）。

下表另列 **1M 输入 + 1M 输出的组合基准**，用于直接比较“一次装满窗口”的任务量级（首轮未缓存输入的粗略成本）：

| 模型与计费版本 | 输入（每 1M tokens） | 输出（每 1M tokens） | 缓存命中（每 1M tokens） | 1M 输入 + 1M 输出基准 | 计费机制与成本特性 |
| --- | --- | --- | --- | --- | --- |
| **Hy4 preview**（TokenHub 托管） | \$0.834 | \$2.501 | \$0.042 | **\$3.335** | 770B 主干推理成本直接反映在托管单价；长线大吞吐调用推荐用 Apache-2.0 权重私有部署 |
| **GLM-5.3-Flash**（限时五折） | \$0.075（原 \$0.15） | \$0.25（原 \$0.50） | \$0.015（原 \$0.03） | **\$0.325** | 五折至 2026-09-09 24:00 UTC+8；原价恢复后基准 \$0.65 |
| **Qwen3.8-Flash**（国际 / Global 区） | \$0.15 | \$0.47 | 美元页未单列（人民币 ¥0.10） | **\$0.62** | 适用 1M context 以内；显式创建缓存（创建费人民币 ¥1.25），创建后命中才享受低价 |
| **DeepSeek-V4-Flash**（非峰时） | \$0.22 | \$0.66 | \$0.007 | **\$0.88** | 周末全天及工作日非峰时段；免创建费自动命中缓存；官方 2500 并发 |
| **DeepSeek-V4-Flash**（工作日峰时） | \$0.44 | \$1.32 | \$0.014 | **\$1.76** | 工作日 01:00–04:00 与 06:00–10:00 UTC；批处理错峰调度省 50% 支出 |
| **MiMo-V2.5 标准版** | \$0.14 | \$0.28 | \$0.0028 | **\$0.42** | 全模态中单价最低；100 RPM 频控偏大吞吐批处理，不适合未提额的高并发在线交互 |

按官方美元价排序的成本阶梯：

- **第一梯队（输入 ≤ \$0.15、输出 ≤ \$0.47）**：GLM-5.3-Flash 限时五折（\$0.075 / \$0.25）、MiMo-V2.5（\$0.14 / \$0.28）、Qwen3.8-Flash（\$0.15 / \$0.47）；
- **第二梯队（输入 \$0.22–\$0.44）**：DeepSeek-V4-Flash，非峰时输入 \$0.22 / 输出 \$0.66，工作日峰时涨到 \$0.44 / \$1.32；
- **第三梯队**：Hy4 preview 托管渠道输入 \$0.834 / 输出 \$2.501，直接反映 770B 主干的推理硬件成本。

缓存计费机制不同，多轮成本结构也不同：Qwen 采用显式创建缓存计费（创建按输入计费，创建后命中才享受低价），而 GLM、MiMo、DeepSeek 都是免创建费的自动命中缓存。只比单价不看缓存机制，会在多轮 agent 循环里选错。

### 典型任务：1M 输入 + 10K 输出

假定单次超长文档分析、代码库审查或多模态长视频总结任务消耗 **1M 未缓存输入 + 10K 输出 tokens**，美元单价下的单次成本：

- **GLM-5.3-Flash（五折）**：\$0.075 + \$0.0025 ≈ **\$0.078**
- **MiMo-V2.5**：\$0.14 + \$0.0028 ≈ **\$0.143**
- **Qwen3.8-Flash**：\$0.15 + \$0.0047 ≈ **\$0.155**
- **DeepSeek-V4-Flash（非峰时）**：\$0.22 + \$0.0066 ≈ **\$0.227**（工作日峰时约 **\$0.453**）
- **Hy4 preview**：\$0.834 + \$0.025 ≈ **\$0.859**

若同一批 1M tokens 文档需要进行 **10 轮连续提问与多轮 Agent 循环（开启 context caching，假设输入缓存命中率 100%）**，总费用将呈现显著分化：

- **MiMo-V2.5**：首轮未命中输入 \$0.14 + 后续 9 轮命中（9 × \$0.0028 ≈ \$0.025）+ 10 轮输出（0.1M × \$0.28 ≈ \$0.028）≈ **\$0.193**；
- **GLM-5.3-Flash（五折）**：\$0.075 + 9 × \$0.015 ≈ \$0.135 + \$0.025 ≈ **\$0.235**（恢复原价后约 **\$0.47**）；
- **DeepSeek-V4-Flash（非峰时）**：\$0.22 + 9 × \$0.007 ≈ \$0.063 + 0.1M × \$0.66 ≈ \$0.066 ≈ **\$0.349**（峰时约 **\$0.698**）；
- **Hy4 preview**：\$0.834 + 9 × \$0.042 ≈ \$0.378 + 0.1M × \$2.501 ≈ \$0.25 ≈ **\$1.46**。

Qwen3.8-Flash 因美元页未单列缓存命中价、且缓存为显式创建计费，未纳入多轮测算；按人民币口径（命中 ¥0.10、创建 ¥1.25）推算，其多轮成本会明显高于自动命中的 MiMo / DeepSeek。

## 怎么选：先用硬约束删候选

### 1. 数据能不能离开自己的环境

不能出域时，托管 API 的低单价没有意义。当前官方资料下，应优先验证 **Hy4 preview（Apache-2.0）、GLM-5.3-Flash（MIT）、MiMo-V2.5（MIT）与 DeepSeek-V4-Flash（MIT）** 的开源权重、许可证、量化版本和硬件预算。尤其 DeepSeek（284B 总/13B 激活）、MiMo（310B 总/15B 激活）与 GLM（320B 总/18B 激活）三者总参数集中在 300B 上下、激活参数仅 13B–18B，部署门槛显著低于 Hy4（770B 总/49B 激活）；DeepSeek 的权重以 fp8/fp4 量化分发，部署估算要按量化权重而非 bf16 全精度算。若进一步需要全模态（含音视频）则首选 MiMo-V2.5；Qwen 的生产版 API 虽是托管，但有 125B 架构预览版 Qwen3.8-Flash-Next 可作为技术参照。能用托管服务时，再把所在地区、数据政策、吞吐限制和故障切换纳入比较。

### 2. 输入不只是文本吗

图像输入可看 GLM-5.3-Flash、Qwen3.8-Flash 和 MiMo-V2.5；视频输入官方明确列出的有 GLM（API 文档 Input Modality 含 Video）、Qwen 与 MiMo；音频输入这里仅 MiMo 标明。DeepSeek 的视觉是单独 experimental ID，Hy4 当前卡为 text-only。不要用系列品牌的其他模型能力替代具体 ID 的能力。

### 3. 是高并发交互，还是大吞吐批处理

面向最终用户的 Web 应用、智能客服等脉冲型高并发场景，务必核实 RPM 和并发上限：Qwen 官方给到 30,000 RPM，DeepSeek 给到 2500 并发，具备较强承载力；而 MiMo 托管 API 默认的 100 RPM 极易在并发时触发频控，更适合长文档解析或后台批量流水线；若自行部署 Hy4、GLM-5.3-Flash、MiMo-V2.5 或 DeepSeek-V4-Flash，则取决于自主算力池的卡数与显存池规划。

### 4. 真的需要 1M 吗

1M 只说明允许送入多少 token，不说明模型能稳定利用多远的信息，也不说明首 token 延迟、KV cache 成本和工具循环表现。先用自己的长仓库、长合同或多轮 agent trace 做 needle retrieval、跨段引用和冲突信息测试，并记录有效正确率随长度如何衰减。

### 5. 比 token 单价，更要比完成一个任务的成本

统一准备 30–100 个真实任务，每款至少重复三次，记录：一次通过率、重试次数、输入/输出/推理 token、缓存命中、wall time 和人工修正分钟数。最后算 `cost per accepted task`。不同厂商的缓存机制（显式创建 vs 自动命中）、thinking token、峰谷和区域计价不一致，只把价目表排成一列通常会选错。

### 6. 版本必须锁到 ID 和日期

preview、public beta 和实验视觉版本都可能快速变化。保存 model ID、请求参数、地区 endpoint、测试日期和原始响应；生产上线前再核一次官方 changelog。本文的 `asOfDate` 是资料截点，不是这些模型长期不变的保证。

## 来源

- Hy4 preview：[腾讯发布公告](https://www.tencent.com/tencent-releases-and-open-sources-tencent-hy4-preview/)、[官方 Hugging Face 模型卡](https://huggingface.co/tencent/Hy4-preview)
- GLM-5.3-Flash：[官方 Hugging Face 模型卡](https://huggingface.co/zai-org/GLM-5.3-Flash)、[官方 GLM-5 仓库](https://github.com/zai-org/GLM-5)、[官方 model ID 页面](https://docs.z.ai/devpack/latest-model)、[Z.ai 官方 API 文档（含输入模态规格）](https://docs.z.ai/guides/llm/glm-5.3-flash)、[Z.ai 官方价格页](https://docs.z.ai/guides/overview/pricing)、[GLM-5.3 API 文档（用于说明不能与 Flash 混用）](https://docs.z.ai/guides/llm/glm-5.3)
- Qwen3.8-Flash：[阿里云 Model Studio 官方文档](https://help.aliyun.com/en/model-studio/qwen3-8-flash)、[Qwen3.8-Flash-Next 官方仓库（开放权重架构预览）](https://github.com/QwenLM/Qwen3.8-Flash-Next)、[Qwen3.8-Flash-Next Hugging Face 模型卡](https://huggingface.co/Qwen/Qwen3.8-Flash-Next)
- DeepSeek-V4-Flash：[DeepSeek-V4-Flash-0731 官方 Hugging Face 权重](https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash-0731)、[官方技术报告（arXiv:2606.19348）](https://arxiv.org/abs/2606.19348)、[DeepSeek API 更新日志](https://api-docs.deepseek.com/updates)、[官方定价与 limits](https://api-docs.deepseek.com/quick_start/pricing)
- MiMo-V2.5：[官方 Hugging Face 权重与模型集合](https://huggingface.co/XiaomiMiMo)、[MiMo-V2.5 开源公告](https://mimo.mi.com/static/docs/news/latest/v2.5-open-sourced.md)、[官方模型页](https://mimo.mi.com/models/en-US/mimo-v2.5)、[模型目录](https://mimo.mi.com/docs/en-US/quick-start/summary/model)、[API 快速开始](https://mimo.mi.com/docs/en-US/quick-start/summary/first-api-call)

除非段落明确写“第三方”，以上 benchmark、吞吐与价格都来自模型厂商自己的页面，尚不能代替同版本、同 harness、同预算下的独立复现。
