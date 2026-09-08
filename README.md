# QCSunny Lab

> 个人博客与 59 个纯浏览器端在线工具——科学计算器、单位换算、金融计算、二维码生成器等。A bilingual (中文 / English) static site: an engineering blog plus 59 in-browser tools that run with no backend.

Live at **<https://qcsunny.org>** (canonical). The repo is mirrored to GitHub Pages at `qcsunny.github.io`; canonical URLs, the sitemap, and OG cards always point at `qcsunny.org`.

## Features

- **59 browser-side tools** — calculators (scientific, graph, 3D surface), unit converters, finance helpers (compound interest, mortgage, loan), and developer tools (JSON / SQL formatter, JWT decoder, QR & UUID generator, color converter, …). Each tool is a single page; all computation happens client-side, no server round-trip.
- **Bilingual** — every page is Chinese + English via `html[data-lang]` + CSS. The first paint is English (no-JS default); the toggle is sticky across tabs via `localStorage`.
- **Zero-JS prose** — blog posts, the about page, and listings ship no first-party JavaScript. Words render from HTML at build time.
- **Engineering blog** — Markdown via Astro Content Collections, with build-time KaTeX math rendering and a generated RSS feed.
- **SEO built in** — per-route canonical, Open Graph cards generated at 1200×630, `robots.txt`, sitemap, `llms.txt`, and IndexNow ping-on-deploy.

## Tech Stack

| Layer | Choice |
| :--- | :--- |
| Framework | [Astro](https://astro.build) ^7.2.10 (static output) |
| Tools engine | A hand-written tokenizer → parser → evaluator in `src/scripts/calculator/` (shared by the scientific, graph, and 3D tools) |
| Math | KaTeX rendered at build time (no client runtime) |
| Tooling | E2E guards with Playwright (150+ cases) gating every deploy |
| Deploy | `qcsunny.org` on Cloudflare Workers Static Assets (`wrangler.jsonc`); GitHub Pages mirror via CI — every deploy gated by the Playwright suite |

## Project Structure

```text
src/
├── components/        # Header, Footer, BaseHead, tool shell, calculator widgets
├── content/blog/      # Markdown posts (Astro Content Collections)
├── layouts/           # BlogPost layout
├── pages/             # routes: index, about, blog/, tools/ (hub), devtools/, calculators/, converters/, finance/
├── scripts/           # client TS: calculator engine + per-tool logic
├── styles/            # global.css (incl. i18n display rules)
├── tools/             # tool registry (pure data) — adding a tool here auto-generates its route
└── consts.ts          # site title, verification codes, analytics tokens
```

Each tool is a data object in `src/tools/` (`calculators.ts`, `converters.ts`, `finance.ts`, `generators.ts`, `textTools.ts`); the registry in `registry.ts` aggregates them and `[slug].astro` generates the route — no manual page scaffolding.

## Commands

All commands run from the project root:

| Command | Action |
| :--- | :--- |
| `npm install` | Install dependencies |
| `npm run dev` | Start the dev server at `localhost:4321` |
| `npm run build` | Build the production site to `./dist/` |
| `npm run preview` | Preview the build locally |
| `npm run check` | Type-check (`astro check`) |
| `npm run check:generated` | Verify committed icons and vendored KaTeX assets match their sources |
| `npm run check:fonts` | After a build, verify Atkinson subsets cover current site text |
| `npm run icons` | Regenerate raster icons from `public/favicon.svg` |
| `npm run vendor:katex` | Regenerate KaTeX CSS and woff2 assets after a KaTeX upgrade |
| `npx playwright test` | Run the full E2E suite (reads `dist/`, so build first) |

The dev server runs in the background: `astro dev --background`, then `astro dev status` / `astro dev logs` / `astro dev stop`.

## Deployment

CI (`.github/workflows/deploy.yml`) verifies committed generated assets, type-checks, builds the site, runs the full Playwright suite, and deploys the GitHub Pages mirror only on green. Pushing to `main` triggers deployment; pull requests run the same quality gate without publishing.

`qcsunny.org` is the canonical Cloudflare Workers Static Assets deployment. `public/_headers` is consumed there: hashed `/_astro/*` assets receive long immutable caching, while stable OG/icon URLs use shorter caching and HTML revalidates. GitHub Pages is a build mirror and does **not** interpret the repository's `_headers`; its response headers are controlled by GitHub's CDN, so this repository does not promise identical cache behavior on the mirror.

## Credit

Built on the [Astro blog starter](https://github.com/withastro/astro/tree/main/examples/blog) and the [Bear Blog](https://github.com/HermanMartinus/bearblog/) aesthetic. Everything else — the tool registry, the calculator engine, the i18n layer, the E2E guards — is bespoke.
