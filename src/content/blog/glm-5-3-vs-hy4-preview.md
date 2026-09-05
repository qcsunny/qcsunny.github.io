---
title: 'GLM-5.3 和 Hy4 preview：两个 78 层 MoE 的对比'
description: '把智谱 GLM-5.3 和腾讯混元 Hy4 preview 的 config、33 项公开基准、OpenRouter 实价和接入细节逐项摊开，包括两家自报数字互相矛盾的地方。'
pubDate: 'Sep 01 2026'
---

GLM-5.3 是 8 月 14 日发布的，Hy4 preview 是 8 月 28 日，隔了两周。都开源了权重，都是 1M 上下文，都在讲长程 Agent 和真实软件工程。

先给个总印象。腾讯那份同 harness 的记分卡上，Hy4 preview 以 18 胜 14 负 1 平领先 GLM-5.3；把智谱自报的数字填回有分歧的格子，就变成 16:16。这个差距选不出赢家。真正会影响决定的是另外几件事：价格差四成、许可证一个 Apache-2.0 一个自定义、思考能不能关掉、以及安全审计方向 GLM 领先得比较多。

## 架构

把 Hy4 preview 的规格表和 GLM-5.3 的 `config.json` 并排放，除了词表和 dense FFN 宽度，基本逐项对齐：

| | GLM-5.3 | Hy4 preview |
| --- | --- | --- |
| 层数 | 78 | 78（第 1 层 dense FFN，其余 77 层 MoE） |
| hidden size | 6144 | 6144 |
| 路由专家 / 共享专家 | 256 / 1 | 256 / 1 |
| 每 token 激活路由专家 | 8 | 8 |
| MoE 中间维度 | 2048 | 2048 |
| dense FFN 中间维度 | 12288 | 18432 |
| 注意力头数 | 64 | 64 |
| 注意力机制 | DSA（`model_type: glm_moe_dsa`） | Gated DSA + IndexCache，iHC 残差（4 路） |
| indexer top-k | 2048 | 2048 |
| MTP 层 | 1 | 1（10B 参数，激活 0.7B） |
| 词表 | 154,880 | 120,832 |
| 上下文 | 1M | 1M |
| 权重规模 | 753B（HF safetensors 合计 753,329,940,480） | 主干 770B / 激活 49B，另加 10B MTP |
| 许可证 | 自定义 `glm-5.3` license | Apache-2.0 |

这个重合不奇怪，Hy4 的 README 自己写了 "inspired by DeepSeek and GLM"。两边都收敛到了 DeepSeek Sparse Attention + 256 专家 top-8 + 单层 MTP 这套配方，Hy4 在上面多加了 Gated DSA、跨层稀疏索引复用（IndexCache）和 iHC 残差。

GLM-5.3 这边更特别的地方是它没换基座。官方说法是与 GLM-5.2 用同一个基础模型，所有提升来自后训练规模化：数十倍的长程任务环境、更长的后训练时间。它的模型卡没写激活参数量，表里那个 753B 是从 safetensors 索引加出来的；Hy4 明确给了 49B。

## 基准

腾讯的 benchmark 附录目前是唯一一份在同一套 harness 下同时跑了两个模型的公开数据。表里带 `*` 的是腾讯自测，写成 `a/b` 的是官方自报和腾讯复测两个值。下面挑出有 GLM-5.3 数字的公开基准。

### Agentic Coding

| 基准 | Hy4 preview | GLM-5.3（腾讯复测） | 智谱自报 |
| --- | --- | --- | --- |
| SWE-bench Multilingual | **82.9** | 81.3 | – |
| SWE-bench Pro | **65.7** | 64.6 | – |
| DeepSWE | 64.3 | **68.1** | 66.9 |
| SWE Atlas – Codebase Q&A | **64.0** | 55.8 | – |
| SWE Atlas – Test Writing | **57.8** | 49.6 | – |
| SWE Atlas – Refactoring | **53.3** | 51.9 | – |
| SWE-Marathon | 31.9 | **35.6** | 42.5 |
| Terminal-Bench 2.1 | 85.4 | **88.3** | 88.2 |
| NL2Repo-Bench | **58.9** | 56.1 | 58.0 |
| CyberGym | 78.4 | **83.0** | 84.5 |
| ProgramBench | 17.5 | **18.0** | 19.0 |
| PostTrainBench V1.1 | **35.6** | 33.2 | 39.8 |
| Harbor-Index | 39.6 | **42.5** | – |

### Agent / 工作场景

| 基准 | Hy4 preview | GLM-5.3（腾讯复测） | 智谱自报 |
| --- | --- | --- | --- |
| WideSearch | **83.9** | 83.2 | – |
| OneMillionBench（带工具） | **65.4** | 64.5 | – |
| DRACO | 77.2 | **78.1** | – |
| OfficeQA Pro | 66.2 | 66.2 | – |
| MCP-Atlas | **83.7** | 81.9 | – |
| Toolathlon-Verified | **74.1** | 73.8 | 73.0 |
| APEX-Agents (pass@1) | 37.1 | **38.1** | – |
| SkillsBench | 62.9 | **63.3** | – |
| JobBench | **61.7** | 58.2 | – |
| WorkspaceBench | 60.2 | **68.2** | – |
| Agents' Last Exam (ALE-CLI) | 22.8 | **23.8** | 28.5 |
| GDPval-AA v2（Elo） | 1678 | **1763** | 1769 |
| AutomationBench v1.0.6 | 32.1 | **49.4** | 48.2 |
| BankerToolBench | **78.6** | 77.8 | – |

### 科研与推理

| 基准 | Hy4 preview | GLM-5.3（腾讯复测） | 智谱自报 |
| --- | --- | --- | --- |
| BioMysteryBench | **71.3** | 69.0 | – |
| HLE（带工具，纯文本） | **55.4** | 54.3 | 62.5 |
| CritPt | 16.9 | **19.1** | – |
| GPQA Diamond | **92.3** | 91.4 | 91.7 |
| HLE（无工具，纯文本） | **43.4** | 42.3 | – |
| SUPERChem | **66.4** | 58.5 | – |

腾讯复测列的统计是 Hy4 胜 18、GLM 胜 14、OfficeQA Pro 打平。

换成智谱自报的数字，有两项翻转：PostTrainBench（39.8 对 35.6）和带工具的 HLE（62.5 对 55.4），总数变成 16:16。前者腾讯标的是 V1.1，版本可能本来就不是一个；后者差了 8 分，更像 harness 差异，智谱的脚注写了他们用 30 万上下文加上下文管理策略、GPT-5.6-luna 当裁判。

分歧最大的一格是 ALE-CLI。腾讯把 GLM-5.3 测成 23.8，智谱自己报 28.5，而 23.8 恰好是智谱表里 GLM-5.2 的成绩。两边用的都是官方评测协议加 Claude Code harness，结果差出一个代际，没有第三方复现没法裁决。

还有一处版本错位容易看漏。智谱主打的战果是 Terminal-Bench 3.0，从 GLM-5.2 的 4.6 拉到 28.3；腾讯表里只有 2.1。2.1 已经接近饱和，前四名挤在 85 到 88 之间，3.0 才拉得开区分度，而 Hy4 preview 没公布 3.0 的成绩。

### 那份 2.99 比 2.92 的盲测

腾讯发布页给的是：163 名内部专家、203 个工程任务，Hy4 preview 均分 2.99/4，GLM-5.3 是 2.92，胜平负 46.8% / 12.8% / 40.4%。对 Kimi K3 是 2.99 比 2.94，51.2% / 7.9% / 40.9%。

这是腾讯内部组织的盲测，评委来自腾讯的软件工程、游戏、金融、安全团队，任务分布和 Hy4 的训练数据来源本来就重合。0.07 分的均分差配 40.4% 的负场率，能读出来的信息就是同一梯队。

第三方口径目前很少。Artificial Analysis 给 GLM-5.3 的智能指数是 59.5、编程 74.8、Agentic 59.1，Hy4 preview 到写这篇时还没挂出 AA 分数。上面表里 GDPval-AA v2 那行是 AA 评的，GLM 领先 85 分 Elo。

### 安全是 GLM 拉开差距的地方

智谱披露的数字：与国内多家安全团队合作，在 269 个项目里发现 2436 个漏洞，其中 1097 个中高危，潜藏最久的一个在代码库里待了约 40 年。基准上 ExploitBench 从 GLM-5.2 的 24.4 涨到 54.4，ExploitGym 两小时内完成 105 项，GLM-5.2 是 29 项。

Hy4 preview 的 CyberGym 是 78.4，GLM 那边 83.0（腾讯自测）和 84.5（智谱自报），而且 Hy4 没有公布 exploit 链路方向的成绩。做漏洞挖掘的话这一栏基本就定了。

## 价格和可获得性

OpenRouter 的实价，美元每百万 token，`/api/v1/models` 可以直接核：

| | GLM-5.3 | Hy4 preview |
| --- | --- | --- |
| 输入 | \$1.40（第一方 Z.AI） | \$0.834 |
| 输出 | \$4.40 | \$2.501 |
| 缓存命中 | \$0.26 | \$0.042 |
| 最便宜的第三方 | AkashML \$1.17 / \$3.96 | 无，只有腾讯自家 |
| OpenRouter 托管方数量 | 21 | 1 |
| 单次最大输出 | 128K（第一方），最高 943K（部分第三方） | 64K |
| 量化 | fp8 / fp4 / 未标注，可挑 | fp8 |

腾讯官方的人民币价是输入 6 元、输出 18 元、缓存命中最低 0.3 元，按 7.2 汇率和上面的美元价对得上。

按单任务算一下：100 万输入加 10 万输出，GLM-5.3 是 1.84 美元，Hy4 preview 是 1.08，大约六成。不过这个账要打折看。智谱强调 GLM-5.3 的 token 效率也涨了，在自家 Z.ai Code Bench 的 max 档，34.5% 准确率下平均每任务输出约 7.5 万 token，GLM-5.2 是 23.4% 配 9.6 万；high 档 31.4% 配 5 万。Hy4 那边官方在 Known Limitations 里承认复杂任务会想得偏久、倾向过度自我验证。单价差四成不一定就是单任务账单差四成，得按 tokens/task 实测。

缓存那 6 倍差价可能比单价更值得看。Agent 循环里同一个仓库 prefix 反复命中，0.042 和 0.26 的差距会一路放大。

托管生态是另一头的差距。GLM-5.3 早两周发布，OpenRouter 上已经有 21 家，上下文能挑（26 万到 131 万）、量化能挑（fp8/fp4）、最大输出最高到 943K，第一方之外还能拿到更低的价。Hy4 preview 现在只有腾讯一个 endpoint，fp8，最大输出 64K。私有化部署两家都给了 vLLM 和 SGLang 的官方镜像与 recipe，GLM 那边还覆盖 TokenSpeed、KTransformers、Unsloth，以及昇腾 NPU 的 vLLM-Ascend / xLLM / SGLang 路线，在国内环境里算个实际差异。

订阅这一侧，GLM Coding Plan 已经全量上了 GLM-5.3，积分制，非高峰时段（含周末全天）只扣一半积分。Hy4 preview 目前是 WorkBuddy 和 CodeBuddy 两周限免，另有元宝、ima 入口，API 走腾讯云 TokenHub 或 OpenRouter。

## 接入细节

思考模式两家的语义不一样，这是最容易踩的地方。

GLM-5.3 关不掉思考。`thinking.type` 只接受 `enabled`，`reasoning_effort` 三档 `low` / `high` / `max`，不传默认 `max`。从 GLM-5.2 迁过来的代码如果还留着 `thinking.type: "disabled"`，请求直接失败，得改成 `enabled` 再把 effort 设成 `low`。另外 chat template 里 `clear_thinking` 默认 `false`，纯聊天场景要显式传 `true`。

```json
{
  "model": "glm-5.3",
  "thinking": { "type": "enabled" },
  "reasoning_effort": "max"
}
```

Hy4 preview 默认 `high`，可以关：

```python
extra_body={"chat_template_kwargs": {"reasoning_effort": "no_think"}}
```

批量分类、格式转换这类能自动校验的任务，"可以关思考"直接换成钱，GLM-5.3 这边最低只能退到 `low`。

采样参数的官方推荐值也不同：Hy4 是 `temperature=0.9`、`top_p=1.0`，GLM-5.3 是 `1.0` 和 `0.95`。

协议入口 GLM-5.3 给了三种：OpenAI Chat Completions、OpenAI Responses、Anthropic Messages。最后一种接 Claude Code 生态很省事，但有个限制，订阅过 GLM Coding Plan 的账号（包括已过期的）目前只能走 Chat Completions。Hy4 preview 是标准 OpenAI 兼容接口。

工具调用上两家第一方端点在 OpenRouter 的能力一样窄，只支持 `tool_choice: auto`，`required` 和指定 function 都不支持。差别是 GLM-5.3 可以换到 AkashML、Cloudflare 这些第三方拿到完整支持，Hy4 preview 没这个退路。依赖强制工具调用的 Agent 框架要留意。

部署两家都是 8 卡 TP 起步、都开 MTP 投机解码。Hy4 的官方命令：

```bash
docker run --gpus all --ipc=host -p 8000:8000 \
  vllm/vllm-openai:hy4-preview tencent/Hy4-preview-FP8 \
    --tensor-parallel-size 8 \
    --speculative-config '{"num_speculative_tokens":3,"method":"mtp"}' \
    --attention-backend FLASHMLA_SPARSE \
    --tool-call-parser hy_v4 --reasoning-parser hy_v4 \
    --enable-auto-tool-choice
```

"激活 49B"不代表部署便宜。权重还是 770B 量级，加上 1M 上下文的 KV Cache 和并发预算，FP8 官方示例就是 8 路张量并行起步。

## 自己怎么测

两家的公开数字已经互相矛盾到不足以定选型了。真要选，拿同一批真实任务各跑三遍，记一次通过率而不是平均分，任务里保留平时会遇到的脏数据、冲突需求和失败命令。同时记 tokens/task 和 wall time，Hy4 承认的过度验证和 GLM 强制 `max` 思考都会体现在账单上，只看单价会看错。

另外两件事基准表里完全看不见：长输出上限（Hy4 在 OpenRouter 是 64K，GLM 第一方 128K），以及 `tool_choice` 只有 `auto` 时你的 Agent 框架会不会崩。

Hy4 的 README 明写了 Known Limitations，也说了宁愿早发出来听哪里坏了。preview 就按 preview 用。

## 来源

- GLM-5.3：[官方文档](https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3)、[HF 模型卡](https://huggingface.co/zai-org/GLM-5.3)（架构数字取自仓库 `config.json`）
- Hy4 preview：[官方仓库](https://github.com/Tencent-Hunyuan/Hy4-preview)、[腾讯发布页](https://www.tencent.com/zh-cn/tencent-releases-and-open-sources-tencent-hy4-preview/)
- 逐项基准：Hy4-preview 仓库的 Benchmark Appendix；智谱自报数字取自 GLM-5.3 模型卡的 Benchmark 表
- 价格、上下文、托管方、`tool_choice`：OpenRouter 的 `/api/v1/models` 与 `/endpoints`

除了 Artificial Analysis 评的 GDPval-AA v2 和 AA 指数，本文所有数字都出自两家厂商自己发布的材料，没有独立第三方在同一 harness 下复现过。
