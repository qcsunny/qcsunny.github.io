# 站点运营、SEO 与商业变现 TODO 清单 (QCSunny Lab)

本文档记录 **QCSunny Lab (https://qcsunny.org)** 的技术建设、SEO 收录推进、内容创作、曝光增长与商业化变现待办事项。

> **当前站点基本盘（截至 2026 年 9 月）**：
> - 📄 **静态生成页面**：75 个全静态秒开页面（已接入 Sitemap 与 Cloudflare 全球 Edge CDN）
> - 🛠️ **在线实用工具**：40+ 款 100% 浏览器客户端离线计算工具（金融、换算、开发格式化、数学）
> - 📝 **已发布技术博文**：10 篇（7 篇中文算法/金融/架构深度指南 + 3 篇英文工具手记）
> - 🌐 **全站双语体系**：主页、导航、搜索弹窗、关于页、隐私页、核心开发者工具（JSON/SQL/JWT/Markdown/URL等）均已实现响应式中英文纯净切换
> - 📧 **站长官方联系邮箱**：`admin@qcsunny.org`（已部署至页脚、关于页与隐私政策页）

---

## 一、 Google AdSense 申请准备与合规检查清单 (AdSense Readiness)

- [x] **必备法定合规页面**
  - [x] `About`（关于本站）：详细阐述网站定位、核心理念、功能清单与站长背景
  - [x] `Privacy Policy`（隐私政策）：详细声明 100% 本地运算隐私、Cloudflare 无 Cookie 统计以及 **Google AdSense Cookie 与个性化广告停用条款 (GDPR / CCPA)**
  - [x] `Contact`（联系方式）：在 `about.astro`、`privacy.astro` 及全站页脚显式提供 `admin@qcsunny.org` 与 GitHub 链接
- [ ] **内容充实度冲刺（目标 16 ～ 20 篇高质量原创长文）**
  - [x] 已完成 10 篇（个税、房贷提前还款、复利与 IRR、消费贷揭秘、FIRE 运动、GLM-5 vs 混元评测、UUID v4 vs v7 数据库指南、时钟/日历/计算器手记）
  - [ ] 新增第 11 篇：《二维码生成原理与 Reed-Solomon 纠错算法手写实现》（导流至 `/tools/qr-code-generator/`）
  - [ ] 新增第 12 篇：《零依赖轻量 Markdown 语法解析器与 LaTeX 数学公式渲染实战》（导流至 `/tools/markdown-preview/`）
  - [ ] 新增第 13 篇：《JSON / SQL 词法分词器与 AST 代码格式化算法原理》（导流至 `/tools/json-formatter/` 与 `/tools/sql-formatter/`）
  - [ ] 新增第 14 篇：《现代密码学：从熵值计算到浏览器端安全随机密码生成》（导流至 `/tools/password-generator/`）
  - [ ] 新增第 15 篇：《国际单位制 (SI) 与高精度物理量换算防浮点误差指南》（导流至 `/converters/`）
  - [ ] 新增第 16 篇：《Web 性能极致优化：如何构建 0 运行时依赖、75 页秒开的纯静态站点》
- [ ] **流量与指标积累**
  - [ ] 连续稳定更新 2~4 周
  - [ ] 日均 UV 达到 50 ~ 100+，且具有正常的停留时长与翻页互动
- [ ] **正式提交审核与上线**
  - [ ] 登录 [Google AdSense 后台](https://google.com/adsense) 提交 `qcsunny.org`
  - [ ] 获批后：
    1. 在 `src/consts.ts` 填入官方发布商 ID `ADSENSE_CLIENT = 'ca-pub-XXXXXXXX'`
    2. 在后台创建展示广告位，填入 `AD_SLOTS = { mid: 'xxxx', bottom: 'xxxx' }`
    3. 在 `public/ads.txt` 填入正式的 `google.com, pub-XXXXXXXX, DIRECT, f08c47fec0942fa0`
    4. 执行构建部署，全站广告位全自动激活

---

## 二、 搜索引擎收录与站长平台 (Search Console & Indexing)

- [ ] **Google Search Console**
  - [ ] 检查 `https://qcsunny.org` 域名所有权验证状态（DNS TXT 记录）
  - [ ] 在“站点地图”页面重新提交：`https://qcsunny.org/sitemap-index.xml`
  - [ ] 使用“网址检查 (URL Inspection)”工具对以下核心页面进行手动“请求编入索引”：
    - 首页：`https://qcsunny.org/`
    - 工具聚合页：`https://qcsunny.org/tools/`
    - 博客首页：`https://qcsunny.org/blog/`
    - 核心高频工具：`/finance/mortgage-prepayment/`、`/tools/markdown-preview/`、`/tools/json-formatter/`
- [ ] **Bing Webmaster Tools (微软必应)**
  - [ ] 确认 Bing Webmaster 后台验证通过
  - [ ] 检查 IndexNow API 推送状态（确保全站 75 个 URL 处于实时收录通道）
- [ ] **百度搜索资源平台 (Baidu Webmaster)**
  - [ ] 登录 [百度搜索资源平台 (ziyuan.baidu.com)](https://ziyuan.baidu.com) 添加站点 `https://qcsunny.org`
  - [ ] 获取 HTML 标签验证代码并将 content 填入 `src/consts.ts` 的 `BAIDU_VERIFICATION`
  - [ ] 提交 Sitemap：`https://qcsunny.org/sitemap-index.xml`
  - [ ] 编写并执行 API 批量推送脚本 `scripts/baidu-push.mjs`

---

## 三、 冷启动外部曝光与高质量外链建设 (Traffic Distribution)

> 纯等待搜索引擎爬虫收录沙盒期较长，主动在高质量技术社区分享工具能快速累积真实受众与自然外链。

- [ ] **国内技术与独立开发社区**
  - [ ] **V2EX**：在“分享创造”或“程序员”节点发帖
    - 主题建议：《写了个 100% 浏览器本地运行、零上报的开发者与金融工具箱（附带 40+ 款工具与源码）》
    - 突出亮点：纯客户端运算、秒开、断网可用、代码/数据绝不上传服务器
  - [ ] **阮一峰《科技爱好者周刊》**：在 GitHub Discussions 或 Issues 提交推荐 QCSunny Lab 工具箱
  - [ ] **掘金 / 知乎 / 少数派**：发布深度算法指南，文末附带本站在线计算器与演示工具链接
  - [ ] **电鸭社区 / 独立开发者出海**：分享独立全栈开发心得与静态站架构选型
- [ ] **海外开发者社区**
  - [ ] **Product Hunt**：制作 Demo 截图与英文标语，提交 Product Hunt Launch
  - [ ] **Reddit**：在 r/webdev, r/SideProject, r/InternetIsBeautiful, r/tools 分享特色工具
  - [ ] **Hacker News**：提交 `Show HN: Fast, private in-browser utilities without trackers`
  - [ ] **Dev.to / Hashnode**：同步英文版技术文章
- [ ] **工具导航站收录提交**
  - [ ] 提交至阮一峰常用工具箱收录列表
  - [ ] 提交至 Toolify.ai、100L5、微工具等国内外知名实用工具聚合目录

---

## 四、 工具箱功能深度优化与体验增强 (Product Iterations)

- [x] **Markdown 实时预览工具**：全量支持 GFM 表格、数学公式、快捷插入、双向同步滚动与纯英文示例文档响应
- [x] **开发工具操作栏中英文响应**：JSON / SQL / JWT / URL / XML / CSS / HTML / Base64 全部支持中英文即时无缝切换
- [ ] **历史记录功能（本地 LocalStorage）**
  - 为房贷对比、IRR 计算、密码生成器等提供本地草稿箱/最近记录，保持 100% 隐私不上传
- [ ] **一键结果导出与分享**
  - 金融工具测算结果支持一键导出为简洁长图（PNG）或打印格式（PDF / Print CSS）
- [ ] **全键盘快捷键支持**
  - 表单工具支持 <kbd>Enter</kbd> 立即重算，输入框支持 <kbd>Esc</kbd> 快速清空

---

## 五、 商业化变现进阶路线 (Monetization Roadmap)

- [ ] **阶段 1（当前）**：
  - 维护高品质用户体验，严守纯前端无追踪原则；
  - 完善 AdSense 审核所需的各项标准与内容储备；
  - 在 About 页与文章末尾添加赞赏支持入口（GitHub Sponsors / 爱发电）。
- [ ] **阶段 2（获得 AdSense 批准后）**：
  - 启用适度的非侵入式广告位（文章中段与页面底部原生广告）；
  - 接入合规的开发者云产品与域名推荐（Affiliate），实现第一波被动收入闭环。
- [ ] **阶段 3（月独立访问破万后）**：
  - 申请加入 **Carbon Ads**（针对技术开发者的高质量精准赞助网络，单价高、审美优秀）；
  - 开放优质技术工具或开源项目的纯文本赞助展示位。
