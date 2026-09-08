---
title: 'Hy4 preview、GLM-5.3-Flash、Qwen3.8-Flash、DeepSeek-V4-Flash 与 MiMo-V2.5 横向对比'
description: '按官方资料全面对比五款模型的上下文、模态、架构与参数、开放性、API 价格、速率限制、评测证据和接入边界。'
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

- 要自己部署、检查许可证或改推理栈，先看 Hy4 preview、GLM-5.3-Flash，以及作为 Qwen 生产模型架构基础的开放权重 Qwen3.8-Flash-Next；前两者分别是 Apache-2.0 和 MIT，Qwen 生产 API 与预览权重的服务规格要分开核对。
- 要 1M 长上下文并直接处理图像，Qwen3.8-Flash 和 MiMo-V2.5 的官方 API 文档给得最明确；MiMo 还列出视频、音频输入。
- DeepSeek-V4-Flash 是 API 型、文本模型；视觉能力属于单独的实验模型 `deepseek-v4-flash-vision-exp`，不能算到基础 Flash 上。
- 想按公开 benchmark 直接排五强，目前做不到。没有一套五款都参加、版本和 harness 一致的官方或独立测试。
- 真正能先筛掉候选项的，通常是数据能否出域、输入模态、上下文/输出上限、许可证和单任务成本，而不是厂商表格中的一两个分数。

## 一张表看清不是同类产品

| 项目 | Hy4 preview | GLM-5.3-Flash | Qwen3.8-Flash | DeepSeek-V4-Flash | MiMo-V2.5（标准版） |
| --- | --- | --- | --- | --- | --- |
| 交付形态 | 开放权重 + API | 开放权重 + API | 生产托管 API；另有开放权重架构预览 | 托管 API | 托管 API |
| 官方权重许可证 | Apache-2.0 | MIT | 生产版不以开放权重交付 | 未公布权重 | 未公布权重 |
| 官方披露参数 | 770B 总计 / 49B 激活，另有 10B / 0.7B 激活 MTP | 约 320B / 18B 激活 | 生产版未单列；Flash-Next 预览为 125B core + 51B n-gram / 约 6B 激活 | 未披露 | 未披露 |
| 上下文 | 1M | 1M（同一模型以 `[1m]` 调用标识启用） | 1,000,000 | 1M | 1M |
| 最大输出 | 未明确披露 | 128K | 131,072；thinking chain 另有上限 | 384K | 128K |
| 输入 / 输出 | 文本 → 文本 | 文本、图像 → 文本 | 文本、图像、视频 → 文本 | 文本 → 文本 | 文本、图像、视频、音频 → 文本 |
| 官方兼容接口 | OpenAI 兼容 serving | OpenAI 兼容及多种本地 serving | OpenAI、Anthropic 兼容 | OpenAI Chat Completions、Anthropic 兼容 | OpenAI、Anthropic 兼容 |
| 官方价格口径 | TokenHub 美元价 | Z.ai 美元价，有限时折扣 | 按地域的人民币价 | 美元峰谷价 | 人民币与美元价 |

表中的“未披露”不是能力为零，而是官方资料不足以给出可复核数字。尤其不能把同系列的其他模型补进空格：GLM-5.3-Flash 自身是 1M context、131,072 tokens 最大输出，不能因为命名接近就混用 GLM-5.3 的其他接口行为；Qwen3.8-Flash-Next 虽是生产版 Qwen3.8-Flash 的开放权重/架构预览基础，Next 的本地部署参数仍不等于托管 API 的服务上限。

## Hy4 preview：开放程度最高，部署门槛也最高

腾讯官方模型卡给出 770B 总参数、49B 激活参数、78 层结构：第一层是 dense FFN，后 77 层为 MoE，每个 token 使用 8 个 routed experts 和 1 个 shared expert。它还列出 Gated DeepSeek Sparse Attention、IndexCache、iHC 四残差流，以及 10B 总计、0.7B 激活的 MTP 模块。上下文为 1M，当前模型卡将它描述为 text-only。

权重可从 Hugging Face、ModelScope、GitCode 和 CNB 获取，许可证是 Apache-2.0，官方列出 Transformers、vLLM 和 SGLang 路线。这使它适合需要本地部署、可审计许可证或自定义推理服务的团队，但“49B 激活”不等于只需承载 49B 权重；770B 级主干仍决定显存、加载和并行成本。官方 local serving 名称为 `hy4-preview`，另有 `Hy4-preview-FP8` 权重。

腾讯发布公告还给出 TokenHub 口径：输入 **\$0.834 / 百万 token**、输出 **\$2.501 / 百万 token**、缓存命中 **\$0.042 / 百万 token**。这是厂商在特定渠道公布的价格，不代表所有入口、地区和后续时段。

官方内部盲评由 163 名专家评 203 个工程任务：Hy4 preview 为 2.99 / 4，GLM-5.3 为 2.92，Kimi K3 为 2.94；公告还称相对 GLM-5.3 吞吐提高 31.8%。这些都是腾讯自报，不是独立第三方复现，也不能外推到下文另外三款 Flash。

## GLM-5.3-Flash：小激活量开放权重，但别与 GLM-5.3 混写

Z.ai 官方模型卡把 GLM-5.3-Flash 标为原生多模态模型，输入图像和文本、输出文本，约 320B 总参数、18B 激活参数。架构关键词包括 hybrid sparse + linear attention 和 Manifold-Constrained Hyper-Connections；权重以 safetensors 发布，许可证为 MIT。

官方页同时列出 `glm-5.3-flash` 与 `glm-5.3-flash[1m]`。两者是**同一个 GLM-5.3-Flash 模型**；`[1m]` 是调用时声明 1M context 支持的标识，不是另一个模型、权重版本或能力档。测试和生产配置仍应记录实际 model ID，避免客户端默认上下文与 1M 声明不一致。

官方卡列出 Hugging Face Transformers、vLLM、SGLang、TokenSpeed、KTransformers 和 Unsloth 等部署路线，并提供 `reasoning_effort` 的 `low`、`high`、`max` 档。对要部署开放权重又不想承载 Hy4 770B 主干的团队，这个 18B 激活量很有吸引力；但总权重仍约 320B，不能按 18B dense 模型估算硬件。

上下文最容易误写。模型卡在不同评测任务中使用 164K、300K、400K、1M 等预算，而官方调用页用同一模型的 `glm-5.3-flash[1m]` 标识明确声明 1M context 支持。Flash 的最大输出为 **131,072 tokens（128K）**。这里的 `[1m]` 只声明上下文支持，不代表另一套模型权重；文档和代码应同时写清基础 ID 与长上下文调用标识。

Z.ai 官方价格页对 GLM-5.3-Flash 给出限时促销价：输入 **\$0.075 / 百万 token**、缓存输入 **\$0.015**、输出 **\$0.25**；标价分别为 **\$0.15 / \$0.03 / \$0.50**。页面写明五折优惠在 **2026 年 9 月 9 日 24:00（UTC+8 / Singapore）**结束，因此本文只把它当截至资料日期的短期价格，不用于长期 TCO。该页没有替 Flash 补上通用 context 或 API model ID。

官方卡自报 Terminal-Bench 2.1 为 84.3，ExtractBench mean 为 80.75，并声称相对前代有提升。由于其余四款没有在同一 harness 全部参赛，这些数字只能说明该卡的自报结果，不能生成五模型排名。

## Qwen3.8-Flash：托管多模态和明确的 1M 窗口

阿里云 Model Studio 文档中的准确模型 ID 是 `qwen3.8-flash`。它支持文本、图像、视频输入和文本输出，context window 为 1,000,000；文档列出最大输入 991,808、最大输出 131,072。thinking 模式还单列 983,616 输入和最多 262,144 reasoning chain 的预算，调用方要按模式计算 token 边界，不能只记“1M”。

它提供 OpenAI 与 Anthropic 兼容接口，并列出 function calling、structured output、context caching、prefix continuation 等能力。web search 的地区支持并不一致：北京和新加坡支持，法兰克福、东京、弗吉尼亚不支持；batch 与 fine-tuning 均不支持。区域、数据驻留和功能可用性应在部署前按实际 endpoint 再核一次。

价格也按区域分开。北京、法兰克福、东京和弗吉尼亚文档价为输入 **¥0.80 / 百万 token**、输出 **¥2.70 / 百万 token**、缓存命中 **¥0.10 / 百万 token**，显式缓存创建 **¥1.25**；新加坡为输入 **¥1.094**、输出 **¥3.427**、缓存命中 **¥0.117**、缓存创建 **¥1.458**。前一组地区限额为 30,000 RPM / 5M TPM，新加坡为 15,000 RPM / 2M TPM。这是区域 API 价，不能直接与美元渠道价比较而不注明汇率、税费和缓存口径。

**Qwen3.8-Flash-Next** 是开放权重的架构预览版；托管的 **Qwen3.8-Flash** 是基于它形成的生产版本，并加入面向生产环境的服务特性。两者因此有技术谱系关系，但仍不是可互换的交付物：前者官方仓库给出 125B core + 51B n-gram、约 6B 激活和 262,144 serving context；后者应以 Model Studio 的 1M context、API 功能、区域和价格文档为准。不能把开放权重版的部署参数直接当成生产 API 的服务规格。

## DeepSeek-V4-Flash：API 迭代快，视觉能力是另一个模型

DeepSeek 官方更新日志将 API 模型名写为 `deepseek-v4-flash`。2026 年 4 月 24 日 V4 进入 API，7 月 31 日更新到 `DeepSeek-V4-Flash-0731` public beta，后续增加 `low`、`high`、`max` thinking 档，并支持 Responses / Codex 相关接口。接入同时覆盖 OpenAI Chat Completions 与 Anthropic-compatible 形态。

官方定价页明确给出 1M context、384K 最大输出和 2500 并发。峰时每百万 token 为缓存命中 **\$0.014**、缓存未命中输入 **\$0.44**、输出 **\$1.32**；非峰时分别为 **\$0.007 / \$0.22 / \$0.66**。峰时是周一至周五 01:00–04:00 与 06:00–10:00 UTC，其余为非峰时。参数规模、架构和公开权重仍没有在这些官方 API 页面中明确披露。

基础 `deepseek-v4-flash` 应按文本模型处理。8 月 21 日另有实验 ID `deepseek-v4-flash-vision-exp` 增加视觉输入；它是独立模型名，不能据此宣称基础 Flash 原生多模态。对生产系统而言，这个区分会影响请求 schema、回退策略和版本锁定。

## MiMo-V2.5 标准版：API 功能面最宽，和 Pro 分开看

小米官方模型页和 API 目录中的标准模型 ID 是 `mimo-v2.5`。它支持文本、图像、视频、音频输入和文本输出，context window 为 1M，最大输出为 128K；还列出 deep thinking、streaming、function calling、structured output、web search 和 context caching。接口同时有 OpenAI-compatible 与 Anthropic-compatible endpoint。

官方价格为缓存命中 **¥0.02 / 百万 token**、未命中输入 **¥1 / 百万 token**、输出 **¥2 / 百万 token**；美元口径为 **\$0.0028 / \$0.14 / \$0.28**。官方目录还列出 100 RPM、10M TPM。实际成本仍取决于缓存命中率、推理 token 是否计入输出、地区和账号方案。

标准版官方页没有披露参数规模、架构或开放权重。**MiMo-V2.5-Pro** 是另一款模型，独立页面给出的 1.02T / 42B 激活参数不能套到标准 `mimo-v2.5`。官方页面有 benchmark 图，但当前文本资料不足以稳定复核其中每个任务、数字和方法，因此本文不抄图生成排行。

## 怎么选：先用硬约束删候选

### 1. 数据能不能离开自己的环境

不能出域时，托管 API 的低单价没有意义。当前官方资料下，应优先验证 Hy4 preview、GLM-5.3-Flash 或 Qwen3.8-Flash-Next 的权重、许可证、量化版本和硬件预算；Qwen 的生产版 API 服务规格仍以 `qwen3.8-flash` 文档为准。能用托管服务时，再把所在地区、数据政策、吞吐限制和故障切换纳入比较。

### 2. 输入不只是文本吗

图像输入可看 GLM-5.3-Flash、Qwen3.8-Flash 和 MiMo-V2.5；视频输入官方明确列出的有 Qwen 与 MiMo；音频输入这里仅 MiMo 标明。DeepSeek 的视觉是单独 experimental ID，Hy4 当前卡为 text-only。不要用系列品牌的其他模型能力替代具体 ID 的能力。

### 3. 真的需要 1M 吗

1M 只说明允许送入多少 token，不说明模型能稳定利用多远的信息，也不说明首 token 延迟、KV cache 成本和工具循环表现。先用自己的长仓库、长合同或多轮 agent trace 做 needle retrieval、跨段引用和冲突信息测试，并记录有效正确率随长度如何衰减。

### 4. 比 token 单价，更要比完成一个任务的成本

统一准备 30–100 个真实任务，每款至少重复三次，记录：一次通过率、重试次数、输入/输出/推理 token、缓存命中、wall time 和人工修正分钟数。最后算 `cost per accepted task`。不同厂商的缓存、thinking token、峰谷和区域计价不一致，只把价目表排成一列通常会选错。

### 5. 版本必须锁到 ID 和日期

preview、public beta 和实验视觉版本都可能快速变化。保存 model ID、请求参数、地区 endpoint、测试日期和原始响应；生产上线前再核一次官方 changelog。本文的 `asOfDate` 是资料截点，不是这些模型长期不变的保证。

## 来源

- Hy4 preview：[腾讯发布公告](https://www.tencent.com/tencent-releases-and-open-sources-tencent-hy4-preview/)、[官方 Hugging Face 模型卡](https://huggingface.co/tencent/Hy4-preview)
- GLM-5.3-Flash：[官方 Hugging Face 模型卡](https://huggingface.co/zai-org/GLM-5.3-Flash)、[官方 GLM-5 仓库](https://github.com/zai-org/GLM-5)、[官方 model ID 页面](https://docs.z.ai/devpack/latest-model)、[Z.ai 官方价格页](https://docs.z.ai/guides/overview/pricing)、[GLM-5.3 API 文档（用于说明不能与 Flash 混用）](https://docs.z.ai/guides/llm/glm-5.3)
- Qwen3.8-Flash：[阿里云 Model Studio 官方文档](https://help.aliyun.com/en/model-studio/qwen3-8-flash)、[Qwen3.8-Flash-Next 官方仓库（开放权重架构预览）](https://github.com/QwenLM/Qwen3.8-Flash-Next)
- DeepSeek-V4-Flash：[DeepSeek API 更新日志](https://api-docs.deepseek.com/updates)、[官方定价与 limits](https://api-docs.deepseek.com/quick_start/pricing)、[官方 API 文档](https://api-docs.deepseek.com/)
- MiMo-V2.5：[官方模型页](https://mimo.mi.com/models/en-US/mimo-v2.5)、[模型目录](https://mimo.mi.com/docs/en-US/quick-start/summary/model)、[API 快速开始](https://mimo.mi.com/docs/en-US/quick-start/summary/first-api-call)

除非段落明确写“第三方”，以上 benchmark、吞吐与价格都来自模型厂商自己的页面，尚不能代替同版本、同 harness、同预算下的独立复现。
