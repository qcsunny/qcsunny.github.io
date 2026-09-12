---
title: '静态站的 SEO 四件套：robots.txt、sitemap、meta 标签与 URL slug'
description: '不用框架、不用插件，纯静态站也能做对四件影响收录的事：robots.txt 的语义与反直觉细节、sitemap 的 lastmod 陷阱、OG/Twitter 卡片的字段选择、以及 slug 的可读性规则。'
pubDate: 'Sep 12 2026'
category: web
topics: [seo, web-platform]
searchTerms: ['robots.txt', 'sitemap', 'meta 标签', 'SEO', 'slug']
contentLang: 'zh-CN'
relatedTools: ['seo/robots-txt-generator', 'seo/sitemap-xml-generator', 'seo/meta-tag-generator', 'seo/slug-generator']
relatedPosts: ['url-parser-native-api-query-cleaning-and-tracking-params']
---

搜索引擎优化（SEO）的玄学浓度全行业最高，但静态站的收录基础其实只有四件事：让爬虫知道**什么可以抓、有什么可抓、每页是什么、以及页面叫什么**。四件事分别对应 robots.txt、sitemap.xml、meta 标签和 URL slug。这四样没有玄学，全是规格，做对就行。

## robots.txt：先读懂它"不能"做什么

robots.txt 放在域名根目录，告诉遵守协议的爬虫"哪些路径不要抓"。语法只有几条：

```text
User-agent: *
Disallow: /admin/
Allow: /admin/public/
Sitemap: https://example.com/sitemap.xml
```

反直觉的三件事：

1. **Disallow 不等于保密**。它只是请求，不拦访问——任何人都能直接打开被 Disallow 的 URL。真正的隐私靠认证，永远不要用 robots.txt 藏敏感路径（反而等于向全世界广播了这些路径的存在）。
2. **更长的匹配优先**。`Allow: /admin/public/` 比 `Disallow: /admin/` 更具体，所以该子路径允许抓取——不是"先到先得"。
3. **不要把 API、追踪脚本所在路径全部 Disallow**。有些页面的渲染依赖这些资源，Google 已经明确会因此降低对页面的理解。

`User-agent: *` 之后可以再叠加针对具体爬虫的段落（如 `User-agent: GPTBot`），控制 AI 爬虫是否可以抓正文——这是近两年最常被问到的配置。

## sitemap.xml：收录的目录，lastmod 别乱填

sitemap 是站点的 URL 清单，机器可读：

```xml
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/blog/hello/</loc>
    <lastmod>2026-09-01</lastmod>
  </url>
</urlset>
```

要点：

- **URL 必须绝对路径且与 `loc` 的协议、域名完全一致**——`https://example.com/a` 与 `https://example.com/a/` 在爬虫眼里是两个地址；
- **lastmod 只在内容真的变了时更新**。每次构建都把所有 lastmod 刷成当天，爬虫很快学会不信任这个字段，真正更新的页面反而被淹没；
- **只放希望被索引的规范地址（canonical）**：带追踪参数的 URL、分页的第 N 页、重定向目标都不该出现；
- 站点地图超过 5 万条 URL 或 50MB 就要拆分并用 sitemap index 引用——静态站一般远达不到。

生成器应该从页面清单直接产出这份 XML，而不是手写。站内的 [sitemap 生成器](/seo/sitemap-xml-generator/)输入 URL 列表与更新日期，输出带校验的 XML。

## meta 标签：标题、描述与社交卡片

页面 `<head>` 里真正影响结果的就几个：

- `<title>`：60 字符左右（中文约 30 字以内），每个页面唯一，关键词放前半段——它同时是搜索结果的标题和浏览器标签页的文字；
- `<meta name="description">`：150–160 字符，不直接决定排名，但决定搜索结果里的点击率——写得像广告文案而不是关键词堆；
- `<link rel="canonical">`：同页多 URL（带参数、带 www 变体）时指明权威版本，是避免"自我竞争"的关键；
- OG 与 Twitter 卡片：`og:title`、`og:description`、`og:image`、`twitter:card` 决定链接被分享到社交平台时的预览卡。`og:image` 建议 1200×630，缺失时分享卡没有图，点击率显著掉。

结构化数据（JSON-LD）是加分项：`BlogPosting`、`BreadcrumbList` 这类 schema 让搜索引擎理解"这是一篇文章/一条面包屑"，有机会拿到富摘要。字段多且容易写错类型，用生成器（[meta 标签生成器](/seo/meta-tag-generator/)）从表单产出比手拼字符串稳。

## URL slug：页面叫什么

slug 是 URL 的可读尾巴。规则收敛成四条：

1. **全小写、连字符分词**：`/blog/markdown-table-alignment/` 而不是 `Markdown_Table_Alignment`——大小写在某些服务器上是不同地址；
2. **短而有意义**：3–5 个词以内，去掉 a/the/的 等虚词，但保留主题词；
3. **ASCII 化**：中文标题转拼音或英文关键词（`%E4%B8%AD%E6%96%87` 这种百分号编码的 URL 在哪都难看难抄）；
4. **定了就不改**：URL 是公开契约，改了就要 301；能不改就不改。

站内的 [slug 生成器](/seo/slug-generator/)负责标题到 slug 的这一步：转小写、去标点、分词连字符、剔除停用词，标题粘贴进去直接得到候选 slug。

## 四件套的共同点

它们都是**给机器读的文本**，规格明确、可验证、可生成——这正是工具比手写强的地方。站内四个工具（[robots.txt 生成器](/seo/robots-txt-generator/)、[sitemap 生成器](/seo/sitemap-xml-generator/)、[meta 标签生成器](/seo/meta-tag-generator/)、[slug 生成器](/seo/slug-generator/)）把四件事各自的规则固化下来，全部本地运算、无数据上传。SEO 的确还有很多玄学，但把这四件规格内的事做对，是任何策略的地基。
