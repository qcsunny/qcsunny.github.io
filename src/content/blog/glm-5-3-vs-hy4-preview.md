---
title: 'GLM-5.3 与 Hy4 preview 全面对比：两个 78 层 MoE 的正面碰撞'
description: '智谱 GLM-5.3 与腾讯混元 Hy4 preview 的逐项对比：config 级架构比对、33 项公开基准的交叉核对（含两家自报数字的分歧）、OpenRouter 实价与托管生态、思考模式与工具调用的工程差异，以及怎么选。'
pubDate: 'Sep 01 2026'
---

先说清对象：本文里的 "hy-preview" 指腾讯混元 **Hy4 preview**（`tencent/hy4-preview`，2026 年 8 月 28 日发布并开源）。混元的 preview 系列还有一个 Hy3 preview（2026 年 4 月），如果你要对比的是那一个，结论会完全不同——Hy3 在 Artificial Analysis 上的智能指数是 42.2，GLM-5.3 是 59.5，不在一个量级。

两个模型的发布只隔了 14 天：GLM-5.3 是 8 月 14 日，Hy4 preview 是 8 月 28 日。都开源权重，都是 1M 上下文，都主打"长程 Agent + 真实软件工程"。

## 结论先行

| 你的处境 | 选谁 |
| --- | --- |
| 纯粹按 token 单价买推理 | Hy4 preview（输入便宜 40%，输出便宜 43%，缓存命中便宜 6 倍） |
| 安全审计、漏洞挖掘 | GLM-5.3，差距不是一点点（CyberGym 84.5 vs 78.4，ExploitBench 54.4） |
| 需要跨文件读代码库、写测试、做重构 | Hy4 preview（SWE Atlas 三项全胜，Codebase Q&A 64.0 vs 55.8） |
| 需要稳定的终端 Agent / 自动化流水线 | GLM-5.3（Terminal-Bench 2.1 88.3 vs 85.4，AutomationBench 49.4 vs 32.1） |
| 要商业化二次分发权重 | Hy4 preview（Apache-2.0；GLM-5.3 是自定义许可证） |
| 要换供应商、要 fp4/长输出/昇腾 NPU | GLM-5.3（OpenRouter 上 21 家托管，Hy4 只有腾讯 1 家） |
| 包月订阅省钱 | GLM Coding Plan（积分制，非高峰时段半价）；Hy4 目前只有产品端两周限免 |

如果只能记一句：**Hy4 preview 在腾讯自己的记分卡上以 18:14 领先 GLM-5.3，但把智谱自报的数字填回去就变成 16:16。** 这个量级的差距，决定不了选型，你自己仓库里的成功率才能。

## 一、架构：两个 config 高度重合的模型

这是对比过程里最意外的发现。把 Hy4 preview 的规格表和 GLM-5.3 的 `config.json` 并排放，除了词表和 dense FFN 宽度，几乎逐项对齐：

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

不用阴谋论解释：Hy4 的 README 自己写了 "inspired by DeepSeek and GLM"。两家都收敛到了 DeepSeek Sparse Attention + 256 专家 top-8 + 单 MTP 层这套配方，Hy4 在上面加了 Gated DSA、跨层稀疏索引复用（IndexCache）和 iHC 残差。GLM-5.3 更极端的地方在于它**换了个训练方式而不是换基座**——官方明确说 GLM-5.3 与 GLM-5.2 用同一个基础模型，全部提升来自后训练规模化。

顺带一个细节：GLM-5.3 的模型卡没给出激活参数量，只有 total 能从 safetensors 索引里算出来；Hy4 明确给了 49B。

## 二、基准：同一张表里的 33 项，18:14

腾讯的 benchmark 附录是目前唯一一份**在同一套 harness 下同时跑了两个模型**的公开数据（表中带 `*` 的是腾讯自测；出现 `a/b` 的是"官方自报 / 腾讯复测"）。挑出有 GLM-5.3 数字的公开基准：

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

按腾讯复测列统计：Hy4 胜 18、GLM 胜 14、平 1（OfficeQA Pro）。

把智谱自报数字填回去，两项会翻转：PostTrainBench（39.8 > 35.6）和带工具 HLE（62.5 > 55.4），变成 **16:16**。PostTrainBench 那一栏还差了个版本号（腾讯写的是 V1.1），带工具 HLE 的 8 分差更像 harness 差异——智谱的脚注说他们用 30 万上下文加上下文管理策略、GPT-5.6-luna 做裁判。

最值得盯的分歧是 ALE-CLI：腾讯把 GLM-5.3 测成 **23.8**，而智谱自己报 **28.5**，并且在自家表里把 23.8 标为 **GLM-5.2 的成绩**。同一个基准、同一个 Claude Code harness、差一个代际的分数——这种事没有第三方复现就没法裁决。

还有一处版本错位容易看漏：智谱把 Terminal-Bench **3.0** 当作主要战果（4.6 → 28.3），腾讯的表里只有 Terminal-Bench **2.1**（GLM 88.3 / Hy4 85.4）。2.1 已经接近饱和（前四名挤在 85–88），3.0 才是拉开区分度的那一版，而 Hy4 preview 没有公开 3.0 的成绩。

### 那份 2.99 vs 2.92 的盲测

腾讯官方给的是：163 名内部专家、203 个工程任务，Hy4 preview 均分 2.99/4，GLM-5.3 均分 2.92/4，胜平负 46.8% / 12.8% / 40.4%。对 Kimi K3 是 2.99 vs 2.94，51.2% / 7.9% / 40.9%。

这是腾讯内部组织的盲测，不是独立榜单，评委来自腾讯的软件工程、游戏、金融、安全团队——任务分布天然贴合 Hy4 的训练数据来源。**0.07 分的均分差和 40.4% 的负场率，说明的是"同一梯队"，不是"全面胜过"。**

至于第三方口径：Artificial Analysis 给 GLM-5.3 的智能指数 59.5、编程 74.8、Agentic 59.1；Hy4 preview 截至本文写作时还没有 AA 分数挂出来。GDPval-AA v2 那一行是 AA 评的，GLM 领先 85 分 Elo。

### GLM-5.3 唯一压倒性的方向：安全

这是两家分差最大的地方，而且不是基准游戏。智谱披露：与国内多家安全团队合作，在 **269 个项目中发现 2,436 个漏洞**，其中 1,097 个中高危，最长的一个已在代码库里潜藏约 40 年。基准上 ExploitBench 从 GLM-5.2 的 24.4 涨到 54.4，ExploitGym 两小时内完成 105 项（5.2 是 29 项）。

Hy4 preview 在 CyberGym 上是 78.4，低于 GLM 的 83.0（腾讯自测）/84.5（智谱自报），且没有公布 exploit 链路方向的成绩。要做漏洞挖掘，这一栏基本就是答案。

## 三、价格与可获得性

OpenRouter 上的实价（美元 / 百万 token，`/api/v1/models` 可直接核对）：

| | GLM-5.3 | Hy4 preview |
| --- | --- | --- |
| 输入 | $1.40（第一方 Z.AI） | **$0.834** |
| 输出 | $4.40 | **$2.501** |
| 缓存命中 | $0.26 | **$0.042** |
| 最便宜的第三方 | AkashML $1.17 / $3.96 | 无（只有腾讯自家） |
| OpenRouter 托管方数量 | **21** | 1 |
| 单次最大输出 | 128K（第一方）/ 最高 943K（部分第三方） | 64K |
| 量化 | fp8 / fp4 / 未标注，可挑 | fp8 |

腾讯官方人民币价是输入 6 元、输出 18 元、缓存命中最低 0.3 元每百万 token，按 7.2 汇率与美元价完全对得上。

算一笔长程 Agent 的账：单任务 100 万输入 token + 10 万输出 token，GLM-5.3 是 \$1.84，Hy4 preview 是 \$1.08，约 59%。但这个账有个反向修正——智谱强调 GLM-5.3 的 token 效率也提升了：在自家 Z.ai Code Bench 的 max 档，准确率 34.5% 时平均每任务输出约 7.5 万 token，而 GLM-5.2 是 23.4% / 9.6 万 token；high 档 31.4% 准确率、约 5 万 token。而 Hy4 官方在 Known Limitations 里直接承认"复杂任务推理时间偏长、倾向过度自我验证"。**单价便宜 40% 不等于单任务便宜 40%，得按 tokens/task 实测。**

缓存那 6 倍差价（\$0.26 vs \$0.042）对 Agent 循环影响更大：同一个仓库 prefix 反复命中的场景，Hy4 的账单会明显更平。

供应商生态是另一个方向的差距。GLM-5.3 早两周发布，OpenRouter 上已经有 21 家托管，可以按需挑上下文（26 万到 131 万）、挑量化（fp8/fp4）、挑最大输出（最高 943K），第一方之外还能拿到更便宜的价格；Hy4 preview 目前只有腾讯一个 endpoint，fp8，最大输出 64K。想私有化的话两家都给了 vLLM/SGLang 官方镜像与 recipe，GLM 额外覆盖 TokenSpeed、KTransformers、Unsloth 和**昇腾 NPU**（vLLM-Ascend / xLLM / SGLang），这在国内环境里是个实际差异。

订阅制方面，GLM Coding Plan 已全量上 GLM-5.3，走积分制，非高峰时段（含周末全天）只消耗 50% 积分。Hy4 preview 目前是 WorkBuddy / CodeBuddy 两周限免，外加元宝、ima 入口，API 走腾讯云 TokenHub 或 OpenRouter。

## 四、工程接入：几个会让你请求直接失败的差异

**思考模式的语义完全不同。**

GLM-5.3 **不允许关闭思考**。`thinking.type` 只接受 `enabled`，`reasoning_effort` 三档 `low` / `high` / `max`，不传默认 `max`。从 GLM-5.2 迁移时，如果代码里还留着 `thinking.type: "disabled"`，请求会直接失败——要改成 `enabled` 并把 effort 设成 `low`。另外 chat template 里 `clear_thinking` 默认 `false`，纯聊天场景要显式传 `true`。

```json
{
  "model": "glm-5.3",
  "thinking": { "type": "enabled" },
  "reasoning_effort": "max"
}
```

Hy4 preview 默认 `high`，但可以关：

```python
extra_body={"chat_template_kwargs": {"reasoning_effort": "no_think"}}
```

对能自动校验的批量任务（分类、格式转换），"可以关思考"是真金白银的省钱能力，GLM-5.3 这一侧只能退到 `low`。

**采样参数官方推荐值不一样**：Hy4 是 `temperature=0.9, top_p=1.0`；GLM-5.3 是 `temperature=1.0, top_p=0.95`。别把一套参数套两个模型。

**协议入口**：GLM-5.3 同时提供 OpenAI Chat Completions、OpenAI Responses 和 **Anthropic Messages** 三种协议端点，后者对接 Claude Code 生态很方便——但有个坑：订阅过 GLM Coding Plan（含已过期）的账号目前只能走 Chat Completions。Hy4 preview 是标准 OpenAI 兼容接口。

**工具调用**：两家第一方端点在 OpenRouter 上都只支持 `tool_choice: auto`，`required` 和指定 function 都不支持。区别在于 GLM-5.3 可以换到第三方（AkashML、Cloudflare 等）拿到完整的 `required` / `function` 支持，Hy4 preview 没有这个退路。用了强制工具调用的 Agent 框架要注意。

**部署命令**（都要 8 卡 TP，都开 MTP 投机解码）：

```bash
# Hy4 preview
docker run --gpus all --ipc=host -p 8000:8000 \
  vllm/vllm-openai:hy4-preview tencent/Hy4-preview-FP8 \
    --tensor-parallel-size 8 \
    --speculative-config '{"num_speculative_tokens":3,"method":"mtp"}' \
    --attention-backend FLASHMLA_SPARSE \
    --tool-call-parser hy_v4 --reasoning-parser hy_v4 \
    --enable-auto-tool-choice
```

"激活 49B"不代表部署轻松——权重仍是 770B 量级，FP8 官方示例就是 8 路张量并行起步，再加 1M 上下文的 KV Cache 和并发预算。

## 五、怎么自己测

两家的公开数字已经互相矛盾到不足以定选型了。可执行的做法：

1. **同一批真实任务，两个模型各跑三遍**，记一次通过率而不是平均分。任务要保留你平时遇到的脏数据、冲突需求、失败命令。
2. **记 tokens/task 和 wall time，不只记单价。** 特别注意 Hy4 官方承认的"过度验证"和 GLM 强制 `max` 思考——这两个都会在账单上体现。
3. **测长上下文的真实衰减。** 两家都写 1M，但 Hy4 在 OpenRouter 上单次输出被限到 64K，GLM 第一方是 128K，长文件重写类任务会撞墙。
4. **测工具调用失败率。** `tool_choice` 只有 `auto` 的情况下，你的 Agent 框架有多依赖强制调用，这个坑在基准表里完全看不出来。
5. **如果场景涉及安全审计**，直接拿 GLM-5.3 起手，这一项差距足够大。

Hy4 官方在 README 里明写了 Known Limitations，也说了"宁愿早发出来听哪里坏了"。preview 就按 preview 用：拿它当能干的执行者，关键结论仍然要人验收。

## 数据来源

- GLM-5.3 官方文档与模型卡：[docs.bigmodel.cn](https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3)、[huggingface.co/zai-org/GLM-5.3](https://huggingface.co/zai-org/GLM-5.3)（架构数字取自仓库 `config.json`）
- Hy4 preview 官方仓库与发布公告：[github.com/Tencent-Hunyuan/Hy4-preview](https://github.com/Tencent-Hunyuan/Hy4-preview)、[腾讯官网发布页](https://www.tencent.com/zh-cn/tencent-releases-and-open-sources-tencent-hy4-preview/)
- 逐项基准表：Hy4-preview 仓库的 Benchmark Appendix（`assets/benchmark-appendix.jpg`）；GLM 侧自报数字取自 GLM-5.3 模型卡的 Benchmark 表
- 价格、上下文、托管方、`tool_choice` 支持情况：OpenRouter `/api/v1/models` 与 `/endpoints` 接口，可自行复核

所有对比数字都来自两家厂商自己发布的材料。**没有任何一项是独立第三方在同一 harness 下复现的**——除了 Artificial Analysis 评的 GDPval-AA v2 和 AA 指数。读的时候请按这个折扣。
