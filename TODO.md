# 站点运营与被动收入 TODO 清单 (QCSunny Lab)

本文档记录 **QCSunny Lab (https://qcsunny.org)** 的 SEO 推进、曝光增长、内容扩充与商业化变现待办事项。

---

## 一、 搜索引擎收录与站长平台 (Search Console & Indexing)

- [ ] **百度搜索资源平台 (Baidu Webmaster)**
  - [ ] 登录 [百度搜索资源平台 (ziyuan.baidu.com)](https://ziyuan.baidu.com) 添加站点 `https://qcsunny.org`
  - [ ] 获取 HTML 标签验证代码（形如 `<meta name="baidu-site-verification" content="code-xxxx" />`）
  - [ ] 将 content 值填入 `src/consts.ts` 的 `BAIDU_VERIFICATION` 并推送部署
  - [ ] 在后台“普通收录 -> 资源提交 -> sitemap”提交：`https://qcsunny.org/sitemap-index.xml`
  - [ ] 获取“API 提交”的准入 Token，编写 `scripts/baidu-push.mjs` 脚本接入 GitHub Actions 实现全站 56+ 页面自动化推送
- [ ] **Google Search Console**
  - [ ] 登录 [Google Search Console](https://search.google.com/search-console) 检查 `qcsunny.org` 验证状态
  - [ ] 在“站点地图（Sitemaps）”中提交：`sitemap-index.xml`
  - [ ] 使用“网址检查”工具对首页、`/tools/`、最新三篇深度博文进行一次手动“请求编入索引”
- [ ] **Bing Webmaster Tools (微软必应)**
  - [ ] 登录 [Bing Webmaster Tools](https://www.bing.com/webmasters)
  - [ ] 确认已成功导入/验证站点，检查 Sitemaps 状态（IndexNow 已全自动持续推送）

---

## 二、 早期冷启动与外部曝光推广 (Traffic Distribution)

> 纯等待搜索引擎自然爬取通常需要数周，主动在高质量技术社区发布外链是打穿沙盒期、获取初始权重最快的途径。

- [ ] **中文技术与独立开发社区**
  - [ ] **V2EX**：在“分享创造”或“程序员”节点发帖
    - 亮点提炼：34+ 纯浏览器端运行、免注册、数据绝不上报的开发者与金融工具集，支持离线运行
    - 链接带上：`https://qcsunny.org/tools/`
  - [ ] **阮一峰《科技爱好者周刊》**：在 GitHub 提 PR 或 Issue 分享自研的纯前端工具集
  - [ ] **掘金 / 少数派 / 知乎**：同步发布《复利与定投计算原理》、《房贷等额本息/本金提前还款推导》、《UUID v4 vs v7 数据库选型》三篇深度指南，文末附带在线计算器体验链接
  - [ ] **电鸭社区 / 独立黑客**：发布“从个人博客到纯前端工具集与被动收入探索”经验复盘
- [ ] **海外开发者社区**
  - [ ] **Product Hunt**：发布产品展示页面
  - [ ] **Reddit**：在 r/webdev, r/SideProject, r/InternetIsBeautiful, r/selfhosted 发布简要工具介绍
  - [ ] **Hacker News (Show HN)**：提交 Show HN 帖子
  - [ ] **Dev.to / Hashnode**：同步英文版工具架构设计或 AI MoE 评测博文
- [ ] **工具导航站收录提交**
  - [ ] 提交至阮一峰前端工具箱、微工具导航、Toolify 等开源与工具索引站点

---

## 三、 内容持续扩充与深度沉淀 (Content Pipeline)

- [ ] **博文篇数扩展（目标达 10~15 篇，彻底消除 AdSense“低价值内容”拒批风险）**
  - [ ] 《二维码生成原理与 Reed-Solomon 纠错算法手写实现》（导流至 `/tools/qr-code-generator/`）
  - [ ] 《JSON 高性能解析与 AST 语法高亮器原理》（导流至 `/tools/json-formatter/`）
  - [ ] 《常见物理量与国际单位制换算精度陷阱》（导流至 `/converters/`）
- [ ] **工具箱功能迭代建议**
  - [ ] 工具增加快捷键（如 Enter 快速计算、Esc 清空）
  - [ ] 常用计算结果一键导出为 CSV / 图片 / Markdown 报告
  - [ ] 增加近期历史记录（本地 LocalStorage，保持隐私不上传）

---

## 四、 商业变现与被动收入闭环 (Monetization Roadmap)

- [ ] **第一阶段（当前冷启动期）**
  - [ ] 博客或工具底部放置 GitHub Sponsors / 爱发电 / Buy Me a Coffee 赞赏支持入口
  - [ ] 适度加入优质云基础设施（如 Cloudflare, VPS）或开发者工具的合规推荐返佣链接（Affiliate）
- [ ] **第二阶段（Google AdSense 申请与上线）**
  - [ ] 当网站具备稳定日均 50~100+ UV、博文达到 10 篇左右时，提交 [Google AdSense](https://google.com/adsense)
  - [ ] 获批后操作：
    1. 在 `src/consts.ts` 填入 `ADSENSE_CLIENT = 'ca-pub-XXXXXXXX'`
    2. 创建广告单元，填入 `AD_SLOTS = { mid: 'xxxx', bottom: 'xxxx' }`
    3. 在 `public/ads.txt` 去掉注释并填入你的官方 Publisher 记录
    4. 执行 `git push`，全站工具与博文广告位全自动生效
- [ ] **第三阶段（流量规模化后）**
  - [ ] 申请加入 **Carbon Ads**（针对技术开发者的高质量精准赞助广告网络，无扰人弹窗，CPM 收益高）
  - [ ] 开放工具站底部优质开发者工具独立直投赞助位
