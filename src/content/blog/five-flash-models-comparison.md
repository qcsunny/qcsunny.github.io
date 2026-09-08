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

- 要自己部署、检查许可证或改推理栈，先看 **Hy4 preview（Apache-2.0）、GLM-5.3-Flash（MIT）、MiMo-V2.5（MIT）与 DeepSeek-V4-Flash（MIT）**，四者均已开源全量权重（DeepSeek 已公开 `DeepSeek-V4-Flash-0731` 权重）并支持本地 serving；Qwen 生产 API 虽为托管，但有 125B 架构基础的开放权重 Qwen3.8-Flash-Next 可供预览。
- 要 1M 长上下文并直接处理图像与视频，GLM-5.3-Flash（声明 `[1m]` 标识）、Qwen3.8-Flash 以及 MiMo-V2.5 均原生支持；若进一步需要音频输入，目前仅 MiMo-V2.5 明确列出。
- DeepSeek-V4-Flash 基础版是纯文本模型；视觉能力属于单独的实验模型 `deepseek-v4-flash-vision-exp`，不能算到基础 Flash 上。
- 想按公开 benchmark 直接排五强，目前做不到。没有一套五款都参加、版本和 harness 一致的官方或独立测试。
- 真正能先筛掉候选项的，通常是数据能否出域、输入模态、上下文/输出上限、许可证和单任务成本，而不是厂商表格中的一两个分数。

## 一张表看清不是同类产品

| 项目 | Hy4 preview | GLM-5.3-Flash | Qwen3.8-Flash | DeepSeek-V4-Flash | MiMo-V2.5（标准版） |
| --- | --- | --- | --- | --- | --- |
| 交付形态 | 开放权重 + API | 开放权重 + API | 生产托管 API；另有开放权重架构预览 | 开放权重 + API | 开放权重 + API |
| 官方权重许可证 | Apache-2.0 | MIT | 生产版未单独公开权重；架构版 Flash-Next 于 2026-08-26 开源（Qwen 社区许可证） | MIT | MIT |
| 官方披露参数 | 770B 总计 / 49B 激活，另有 10B / 0.7B 激活 MTP | 约 320B / 18B 激活 | 生产版未单列；Flash-Next 预览为 125B core + 51B n-gram / 约 6B 激活 | 约 284B 总计 / 13B 激活（Pro 版为 1.6T / 49B） | 310B 总计 / 15B 激活（Pro 版为 1.02T / 42B） |
| 上下文 | 1M | 1M（同一模型以 `[1m]` 调用标识启用） | 1M（官方注 1,000,000） | 1M | 1M |
| 最大输出 | 未明确披露 | 128K（131,072） | 128K（131,072；thinking chain 另有上限） | 384K | 128K（131,072） |
| 输入 / 输出 | 文本 → 文本 | 文本、图像、视频 → 文本 | 文本、图像、视频 → 文本 | 文本 → 文本（另有实验 ID 支持视觉） | 文本、图像、视频、音频 → 文本 |
| 官方兼容接口 | OpenAI 兼容 serving | OpenAI 兼容及多种本地 serving | OpenAI、Anthropic 兼容 | OpenAI、Anthropic 兼容及多种本地 serving | OpenAI、Anthropic 兼容及多种本地 serving |
| 官方价格口径 | TokenHub 美元价 | Z.ai 美元价，有限时折扣 | 按地域的人民币价 | 美元峰谷价 | 人民币与美元价 |

表中的留白与单列说明，严格遵循官方公开披露口径。尤其不能把同系列的其他模型行为补进空格：GLM-5.3-Flash 自身是 1M context、131,072 tokens 最大输出，不能因为命名接近就混用 GLM-5.3 的其他接口行为；Qwen3.8-Flash-Next 虽是生产版 Qwen3.8-Flash 的开放权重/架构预览基础，Next 的本地部署参数仍不等于托管 API 的服务上限。

## Hy4 preview：参数规模最大，部署门槛也最高

腾讯官方模型卡给出 770B 总参数、49B 激活参数、78 层结构：第一层是 dense FFN，后 77 层为 MoE，每个 token 使用 8 个 routed experts 和 1 个 shared expert。它还列出 Gated DeepSeek Sparse Attention、IndexCache、iHC 四残差流，以及 10B 总计、0.7B 激活的 MTP 模块。上下文为 1M，当前模型卡将它描述为 text-only。

权重可从 Hugging Face、ModelScope、GitCode 和 CNB 获取，许可证是 Apache-2.0，官方列出 Transformers、vLLM 和 SGLang 路线。这使它适合需要本地部署、可审计许可证或自定义推理服务的团队，但“49B 激活”不等于只需承载 49B 权重；770B 级主干仍决定显存、加载和并行成本。官方 local serving 名称为 `hy4-preview`，另有 `Hy4-preview-FP8` 权重。

腾讯发布公告还给出 TokenHub 口径：输入 **\$0.834 / 百万 token**、输出 **\$2.501 / 百万 token**、缓存命中 **\$0.042 / 百万 token**。这是厂商在特定渠道公布的价格，不代表所有入口、地区和后续时段。

官方内部盲评由 163 名专家评 203 个工程任务：Hy4 preview 为 2.99 / 4，GLM-5.3 为 2.92，Kimi K3 为 2.94；公告还称相对 GLM-5.3 吞吐提高 31.8%。这些都是腾讯自报，不是独立第三方复现，也不能外推到下文另外三款 Flash。

## GLM-5.3-Flash：小激活量开放权重，但别与 GLM-5.3 混写

Z.ai 官方模型卡把 GLM-5.3-Flash 标为原生多模态模型，端到端支持文本、图像与连续视频帧/视频文件输入、输出文本，约 320B 总参数、18B 激活参数。架构关键词包括 hybrid sparse + linear attention 和 Manifold-Constrained Hyper-Connections；权重以 safetensors 发布，许可证为 MIT。

官方页同时列出 `glm-5.3-flash` 与 `glm-5.3-flash[1m]`。两者是**同一个 GLM-5.3-Flash 模型**；`[1m]` 是调用时声明 1M context 支持的标识，不是另一个模型、权重版本或能力档。测试和生产配置仍应记录实际 model ID，避免客户端默认上下文与 1M 声明不一致。

官方卡列出 Hugging Face Transformers、vLLM、SGLang、TokenSpeed、KTransformers 和 Unsloth 等部署路线，并提供 `reasoning_effort` 的 `low`、`high`、`max` 档。对要部署开放权重又不想承载 Hy4 770B 主干的团队，这个 18B 激活量很有吸引力；但总权重仍约 320B，不能按 18B dense 模型估算硬件。

上下文最容易误写。模型卡在不同评测任务中使用 164K、300K、400K、1M 等预算，而官方调用页用同一模型的 `glm-5.3-flash[1m]` 标识明确声明 1M context 支持。Flash 的最大输出为 **131,072 tokens（128K）**。这里的 `[1m]` 只声明上下文支持，不代表另一套模型权重；文档和代码应同时写清基础 ID 与长上下文调用标识。

Z.ai 官方价格页对 GLM-5.3-Flash 给出限时促销价：输入 **\$0.075 / 百万 token**、缓存输入 **\$0.015**、输出 **\$0.25**；标价分别为 **\$0.15 / \$0.03 / \$0.50**。页面写明五折优惠在 **2026 年 9 月 9 日 24:00（UTC+8 / Singapore）**结束，因此本文只把它当截至资料日期的短期价格，不用于长期 TCO。该页没有替 Flash 补上通用 context 或 API model ID。

官方卡自报 Terminal-Bench 2.1 为 84.3，ExtractBench mean 为 80.75，并声称相对前代有提升。由于其余四款没有在同一 harness 全部参赛，这些数字只能说明该卡的自报结果，不能生成五模型排名。

## Qwen3.8-Flash：托管多模态和明确的 1M 窗口

阿里云 Model Studio 文档中的准确模型 ID 是 `qwen3.8-flash`。它支持文本、图像、视频输入和文本输出，context window 为 1,000,000；文档列出最大输入 991,808、最大输出 131,072。thinking 模式还单列 983,616 输入和最多 262,144 reasoning chain 的预算，调用方要按模式计算 token 边界，不能只记“1M”。

它提供 OpenAI 与 Anthropic 兼容接口，并列出 function calling、structured output、context caching、prefix continuation 等能力。web search 的地区支持并不一致：北京和新加坡支持，法兰克福、东京、弗吉尼亚不支持；batch 与 fine-tuning 均不支持。区域、数据驻留和功能可用性应在部署前按实际 endpoint 再核一次。

价格也按区域分开。北京、法兰克福、东京和弗吉尼亚文档价为输入 **¥0.80 / 百万 token**、输出 **¥2.70 / 百万 token**、缓存命中 **¥0.10 / 百万 token**，显式缓存创建 **¥1.25**；新加坡为输入 **¥1.094**、输出 **¥3.427**、缓存命中 **¥0.117**、缓存创建 **¥1.458**。需要注意，Qwen 的缓存采用显式创建计费模式（创建缓存按输入计费，后续命中才享受极低折扣），不同于 DeepSeek 或 MiMo 免创建费的自动命中缓存。前一组地区限额为 30,000 RPM / 5M TPM，新加坡为 15,000 RPM / 2M TPM。这是区域 API 价，不能直接与美元渠道价比较而不注明汇率、税费和缓存口径。

生产版 **Qwen3.8-Flash** 本身未单独公开权重文件，仅以托管 API 形式交付；其对应的基础架构与开放权重版本 **Qwen3.8-Flash-Next** 已于 **2026 年 8 月 26 日** 在 Hugging Face（`Qwen/Qwen3.8-Flash-Next`）与 ModelScope 正式公开，采用 Qwen Community License 1.0。该预览模型提供 125B 核心 + 51B n-gram 嵌入表（总计约 176B 参数）、约 6B 激活，原生支持 262K 上下文（支持通过 YaRN 扩展至 1M）。两者虽具直接技术血缘，但生产版托管 API 的 1M 默认窗口、区域功能与限流规格，不能与开放权重预览版的本地部署参数混为一谈。

## DeepSeek-V4-Flash：284B 开源与 API 双轨，13B 极致激活

DeepSeek 官方更新日志与技术披露将该模型写为 `deepseek-v4-flash`。该模型拥有约 **284B 总参数、13B 激活参数**（相比旗舰版 Pro 的 1.6T / 49B 激活大幅精简），采用 MoE 架构，并针对超长上下文引入了**压缩稀疏注意力（CSA）与重度压缩注意力（HCA）**混合机制，结合**流形约束超连接（mHC）**保障极深网络跨层特征传播稳定性。

更关键的是，DeepSeek 已于 2026 年 7 月 31 日在 Hugging Face（`deepseek-ai/DeepSeek-V4-Flash-0731`）正式**开源了全量模型权重**，采用宽松商用的 **MIT 许可证**。本地全精度/常规推理约需 175 GB 显存（可通过 4 张 RTX 3090/4090 或大容量统一内存设备承载），社区生态也迅速跟进了 GGUF、Unsloth、LM Studio 等量化与本地运行方案。

在托管 API 方面，接入同时覆盖 OpenAI Chat Completions 与 Anthropic-compatible 形态，支持 Responses / Codex 接口，并提供 `low`、`high`、`max` thinking 档。官方定价页明确给出 1M context、384K 最大输出和 2500 并发。峰时每百万 token 为缓存命中 **\$0.014**、缓存未命中输入 **\$0.44**、输出 **\$1.32**；非峰时分别为 **\$0.007 / \$0.22 / \$0.66**。峰时是周一至周五 01:00–04:00 与 06:00–10:00 UTC（换算为北京时间即工作日 09:00–12:00 与 14:00–18:00，覆盖核心办公时段），周末全天、工作日午休与夜间均为非峰时。对于数据清洗、离线抽取等非实时批处理任务，错峰调度能直接让 API 支出减少 50%。

基础 `deepseek-v4-flash` 应按文本模型处理。8 月 21 日另有实验 ID `deepseek-v4-flash-vision-exp`（总参数约 305B）增加视觉输入；它是独立模型名，不能据此宣称基础 Flash 原生多模态。对生产系统而言，这个区分会影响请求 schema、回退策略和版本锁定。

## MiMo-V2.5 标准版：310B 开源全模态，15B 激活兼顾私有化

小米已在 Hugging Face（XiaomiMiMo）与社区正式开源了 **MiMo-V2.5** 系列的全量权重，采用宽松的 **MIT 许可证**，允许商用。标准版模型拥有 310B 总参数、15B 激活参数，采用稀疏 MoE 架构，并融合了混合滑动窗口注意力（Hybrid Attention，降低超长上下文下的 KV Cache 显存开销）以及多 Token 预测（MTP）加速模块。旗舰版 **MiMo-V2.5-Pro** 则为 1.02T 总参数、42B 激活参数，两者不可混淆。

在官方托管 API 与本地推理形态中，标准版 ID 为 `mimo-v2.5`。它原生支持文本、图像、视频、音频输入和文本输出，context window 为 1M，最大输出为 128K（131,072 tokens）；功能覆盖 deep thinking、streaming、function calling、structured output、web search 和 context caching，同时提供 OpenAI-compatible 与 Anthropic-compatible 接口。

官方 API 价格为缓存命中 **¥0.02 / 百万 token**、未命中输入 **¥1 / 百万 token**、输出 **¥2 / 百万 token**；美元口径为 **\$0.0028 / \$0.14 / \$0.28**。官方目录列出 100 RPM、10M TPM。需格外留意的是 100 RPM 的频控阈值：折合每秒不足 1.7 次请求，这意味着托管 API 的吞吐配额明显偏向大上下文长任务吞吐（10M TPM 极为宽裕），但并不适合未提额直接硬抗多用户高并发的 Web 在线交互。对于需要全模态且需要本地部署可控的团队，其 15B 极小激活量的 MIT 开源权重具备很高的工程吸引力。

## 跨币种核算的汇率剪刀差与阶梯参考

虽然官方文档分别使用了美元、人民币、不同地区与峰谷计费，但在技术选型初期建立一个真实的“量级坐标”仍然必要。

这里必须注意两层汇率与财务边界：
1. **实际市场行情**：截至 2026 年 9 月 8 日，美元兑人民币（USD/CNY）即期汇率约为 **6.71** 左右；
2. **厂商双币定价的隐含汇率**：部分厂商官方给出的双币定价与真实行情存在剪刀差。例如小米 MiMo-V2.5 官方输入价为 ¥1.00 或 \$0.14，其隐含换算汇率约为 7.14，若国内开发者直接走美元通道反而会承担一定换算溢价；此外，美元支付往往附带跨境手续费，而人民币计价可走国内增值税专票（一般为 6% 技术服务），企业 TCO 需结合报销与合规渠道核算。

若统一以 **2026 年 9 月 8 日实际市场汇率（1 USD ≈ 6.71 CNY）** 将未缓存的输入/输出（每百万 token）折算对比，五款模型呈现出清晰的成本阶梯：

- **第一梯队（极致廉价，输入 ≤ ¥1、输出 ≤ ¥2）**：
  - **GLM-5.3-Flash**（限时五折期）：输入 \$0.075 折合约 **¥0.50**，输出 \$0.25 折合约 **¥1.68**（若促销结束恢复原价 \$0.15 / \$0.50，则折合约 ¥1.01 / ¥3.36）；
  - **MiMo-V2.5 标准版**：国内人民币直付为输入 **¥1.00**、输出 **¥2.00**。
- **第二梯队（主流经济型，输入 ¥1 左右、输出 ¥3 内）**：
  - **Qwen3.8-Flash 国内区**：输入 **¥0.80**、输出 **¥2.70**（新加坡海外区折合略高）。
- **第三梯队（弹性/动态成本）**：
  - **DeepSeek-V4-Flash**：非峰时（输入 \$0.22 / 输出 \$0.66）折合约 **¥1.48 / ¥4.43**；工作日核心办公时段峰时（输入 \$0.44 / 输出 \$1.32）折合约 **¥2.95 / ¥8.86**。
- **第四梯队（高规格主干托管）**：
  - **Hy4 preview 托管渠道**：输入 \$0.834 折合约 **¥5.60**，输出 \$2.501 折合约 **¥16.78**。高单价直接反映了其 770B 庞大参数主干的推理硬件成本。

## 怎么选：先用硬约束删候选

### 1. 数据能不能离开自己的环境

不能出域时，托管 API 的低单价没有意义。当前官方资料下，应优先验证 **Hy4 preview（Apache-2.0）、GLM-5.3-Flash（MIT）、MiMo-V2.5（MIT）与 DeepSeek-V4-Flash（MIT）** 的开源全量权重、许可证、量化版本和硬件预算。尤其 DeepSeek（284B 总/13B 激活）、MiMo（310B 总/15B 激活）与 GLM（320B 总/18B 激活）三者总参数集中在 300B 上下、激活参数仅 13B–18B，部署门槛显著低于 Hy4（770B 总/49B 激活）；若进一步需要全模态（含音视频）则首选 MiMo-V2.5；Qwen 的生产版 API 虽是托管，但有 125B 架构预览版 Qwen3.8-Flash-Next 可作为技术参照。能用托管服务时，再把所在地区、数据政策、吞吐限制和故障切换纳入比较。

### 2. 输入不只是文本吗

图像与视频输入可选 **GLM-5.3-Flash、Qwen3.8-Flash 和 MiMo-V2.5**（三者均原生支持图像与连续视频输入）；若还需要音频直接输入，则目前仅 MiMo-V2.5 明确标明。DeepSeek 的视觉是单独 experimental ID，Hy4 当前卡为 text-only。不要用系列品牌的其他模型能力替代具体 ID 的能力。

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
- GLM-5.3-Flash：[官方 Hugging Face 模型卡](https://huggingface.co/zai-org/GLM-5.3-Flash)、[官方 GLM-5 仓库](https://github.com/zai-org/GLM-5)、[官方 model ID 页面](https://docs.z.ai/devpack/latest-model)、[Z.ai 官方价格页](https://docs.z.ai/guides/overview/pricing)、[GLM-5.3 API 文档（用于说明不能与 Flash 混用）](https://docs.z.ai/guides/llm/glm-5.3)
- Qwen3.8-Flash：[阿里云 Model Studio 官方文档](https://help.aliyun.com/en/model-studio/qwen3-8-flash)、[Qwen3.8-Flash-Next Hugging Face 权重](https://huggingface.co/Qwen/Qwen3.8-Flash-Next)、[Qwen3.8-Flash-Next 官方 GitHub 仓库](https://github.com/QwenLM/Qwen3.8-Flash-Next)
- DeepSeek-V4-Flash：[官方 Hugging Face 权重仓库](https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash-0731)、[DeepSeek 官方发布公告与技术披露](https://www.deepseek.com/)、[DeepSeek API 更新日志](https://api-docs.deepseek.com/updates)、[官方定价与 limits](https://api-docs.deepseek.com/quick_start/pricing)、[官方 API 文档](https://api-docs.deepseek.com/)
- MiMo-V2.5：[官方 Hugging Face 权重与模型集合](https://huggingface.co/XiaomiMiMo)、[官方模型页](https://mimo.mi.com/models/en-US/mimo-v2.5)、[模型目录](https://mimo.mi.com/docs/en-US/quick-start/summary/model)、[API 快速开始](https://mimo.mi.com/docs/en-US/quick-start/summary/first-api-call)

除非段落明确写“第三方”，以上 benchmark、吞吐与价格都来自模型厂商自己的页面，尚不能代替同版本、同 harness、同预算下的独立复现。
