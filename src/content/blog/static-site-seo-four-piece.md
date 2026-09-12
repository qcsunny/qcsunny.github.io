---
title: '静态站自用的 SEO 四件套工具：生成器怎么写才不是玩具'
description: '站内 SEO 分类的四个工具（robots.txt、sitemap、meta 标签、slug）是从本站自己的需求里长出来的。拆解 robots 的 DSL 与 lint 双模式、sitemap 的去重与 5 万上限校验、slug 生成器的 NFKD 变音折叠与中文保留，以及"生成"和"校验"为什么必须做成一对。'
pubDate: 'Sep 12 2026'
category: web
topics: [web-platform, static-sites]
searchTerms: ['robots.txt', 'sitemap', 'meta 标签', 'slug']
contentLang: 'zh-CN'
relatedTools: ['seo/robots-txt-generator', 'seo/sitemap-xml-generator', 'seo/meta-tag-generator', 'seo/slug-generator']
relatedPosts: ['url-parser-native-api-query-cleaning-and-tracking-params']
---

qcsunny.org 自己就是一个 Astro 静态站——sitemap 按构建期页面清单生成、robots.txt 手写、每篇文章的 slug 定了就不改。SEO 分类的四个工具（[robots.txt 生成器](/seo/robots-txt-generator/)、[sitemap 生成器](/seo/sitemap-xml-generator/)、[meta 标签生成器](/seo/meta-tag-generator/)、[slug 生成器](/seo/slug-generator/)）不是照着竞品抄的，是把本站踩过的规格细节固化成表单。这篇文章拆几个"生成器怎么写才不是玩具"的决策。

---

## 1. 生成与校验必须成对

四个工具里两个纯文本的有**双模式**：同一个输入框，"Generate" 从简化行格式生成正式产物，"Validate" 反向校验已有文件。为什么校验不是可有可无的附加功能？因为 robots.txt 的错误是**静默失效**的——语法错一半，爬虫忽略整个文件，站长不会有任何报错。

lint 抓的第一类错误就是静默失效的典型：

```ts
if ((d === 'disallow' || d === 'allow') && !groupHasAgent)
	problems.push(`✗ "${t.slice(0, 40)}" comes before any User-agent — it applies to nothing. 该行出现在任何 User-agent 之前，不会生效。`);
```

`Disallow` 写在第一条 `User-agent` 之前，语法上完全合法，语义上**作用于 nobody**——这正是"更长的匹配优先""Allow 与 Disallow 共存"这些 robots 语义之外，最容易漏的实际错误。拼写检查也在同一个 lint 里：`disalow`、`dissallow` 这类高频手滑单独点名（"typo for disallow?"），比一句笼统的 unknown directive 可操作得多。

---

## 2. robots 生成器：DSL 而不是表单

输入侧是一个极简行格式——`user-agent: *` / `disallow: /admin` 每行一条，空行分组。转成正式产物时**只做两件事**：指令名规范化（首字母大写）、未知指令拒绝：

```ts
if (!['user-agent', 'disallow', 'allow', 'sitemap', 'crawl-delay'].includes(d)) {
	errors.push(`✗ Unknown directive "${d}" — allowed: ...`);
	break;
}
```

拒绝清单是白名单而不是黑名单——robots 的正式指令还有 `noindex`（已废弃）、`host`（Yandex 专有）这类"某些文档里出现过"的条目，白名单保证生成的文件只含**所有主流爬虫都认**的五条。生成器不猜"用户可能是想写 host"，直接报错——**生成器产出的一定是可预期的合法文件**，这条底线比宽容解析更值钱。

---

## 3. sitemap 生成器：三个规格数字

sitemaps.org 的规格里有三个能校验的硬数字，工具全钉了：

```ts
const urls = [...new Set(entries.map((e) => e.url))];
// …
`URLs URL 数: ${locs.length}${locs.length > 50000 ? '  ⚠ over the 50,000 limit · 超过 5 万上限!' : ''}`,
```

- **绝对 URL 强制**：`/^https?:\/\//` 不匹配的行直接报错并点名前三个坏行——相对 URL 在 sitemap 里是规格违例，不是风格问题；
- **去重**：`new Set` 静默合并重复 URL（同一页面出现两次会稀释爬虫预算），但**保留第一次出现的 lastmod**——后面才发现的更新日期不应该覆盖先写的；
- **50,000 上限**：超限在输出里带 ⚠ 提示拆分 sitemap index——静态站一般达不到，但工具的校验边界必须与规格一致，"反正没人会超"的假设在生成器里就是 bug。

`escXml` 转义（`& < > " '`）在生成路径上逐 URL 执行——URL 里的 `&`（查询参数分隔符）在 XML 里必须写成 `&amp;`，这是"看起来能跑"和"真的合法"的区别。

---

## 4. slug 生成器：NFKD 折叠与中文保留

slug 的实现只有五行，但每一行都是一个决策：

```ts
const s = text
	.normalize('NFKD')
	.replace(/[̀-ͯ]/g, '')
	.toLowerCase()
	.replace(/[^a-z0-9㐀-鿿぀-ヿ가-힯]+/gu, sep);
return s.split(sep).filter(Boolean).join(sep);
```

- **NFKD + 去组合附标**：`é` 分解成 `e` + U+0300 附标，附标剥掉只剩 `e`——`Café` → `cafe`，西文标题不需要转写表；
- **中文原样保留**：`㐀-鿿`（CJK 统一表意）与假名、谚文区间留在白名单里——`%E4%B8%AD` 百分号编码的 URL 在哪都难看难抄，但**中文 slug 本身是合法且常见的选择**（本站文章 URL 全是英文 slug，但工具不该替用户做这个决策），所以保留而非转拼音——转拼音需要一张几千条的映射表，那是一个依赖，不是一个函数；
- **`split + filter + join` 收尾**：标点 collapsing（`Better CSS!` 的 `!` 和空格连成一个 `-`）顺便 trim 了首尾——一行干三件事，比三个 replace 链好读。

---

## 5. 工程收获

- **生成与校验成对**：静默失效的格式（robots.txt）里，lint 不是附加功能是另一半本体；
- **白名单优于黑名单**：只产出可预期的合法输出，把"猜意图"留给报错信息；
- **规格数字全部钉住**：5 万上限、绝对 URL、XML 转义——生成器的校验边界与规格一致才算实现完整；
- **能用一个函数解决的不引依赖**：NFKD 折叠是 Unicode 标准化的副产品，拼音转写才是需要数据的——分清楚哪个是哪个。

四个工具在此：[robots.txt](/seo/robots-txt-generator/)、[sitemap](/seo/sitemap-xml-generator/)、[meta 标签](/seo/meta-tag-generator/)、[slug](/seo/slug-generator/)。全部本地运算，URL 清单不出浏览器。
