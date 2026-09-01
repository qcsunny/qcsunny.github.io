# Astro Starter Kit: Blog

```sh
npm create astro@latest -- --template blog
```

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

Features:

- ✅ Minimal styling (make it your own!)
- ✅ 100/100 Lighthouse performance
- ✅ SEO-friendly with canonical URLs and Open Graph data
- ✅ Sitemap support
- ✅ RSS Feed support
- ✅ Markdown & MDX support

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
├── public/
├── src/
│   ├── assets/
│   ├── components/
│   ├── content/
│   ├── layouts/
│   └── pages/
├── astro.config.mjs
├── README.md
├── package.json
└── tsconfig.json
```

Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.

There's nothing special about `src/components/`, but that's where we like to put any Astro/React/Vue/Svelte/Preact components.

The `src/content/` directory contains "collections" of related Markdown and MDX documents. Use `getCollection()` to retrieve posts from `src/content/blog/`, and type-check your frontmatter using an optional schema. See [Astro's Content Collections docs](https://docs.astro.build/en/guides/content-collections/) to learn more.

Any static assets, like images, can be placed in the `public/` directory.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 👀 Want to learn more?

Check out [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).

## Credit

This theme is based off of the lovely [Bear Blog](https://github.com/HermanMartinus/bearblog/).

## 📈 Analytics & Ads

Both are controlled by constants in `src/consts.ts` and stay completely off until enabled.

### Cloudflare Web Analytics (no cookies)

1. Create a free account at [dash.cloudflare.com](https://dash.cloudflare.com) and add the site `qcsunny.github.io`.
2. Copy the beacon **token** from the site's Web Analytics settings.
3. Paste it into `CF_ANALYTICS_TOKEN` in `src/consts.ts` and redeploy.
   While the token is empty, the beacon script is not rendered at all.

### Google AdSense

The site carries the two compliant ad slots required for monetization (below the tool and
above the footer on every tool page), each reserving fixed height so late-loading ads
never shift the layout (CLS). They stay hidden until both constants are filled.

Approval checklist (all already done in this repo):

- Real content on every page: bilingual tool explanations + FAQ (no thin pages)
- Privacy policy at `/privacy/` disclosing analytics and future ad cookies
- About page at `/about/`
- JSON-LD structured data (WebApplication / BreadcrumbList / FAQPage)
- No ads placed adjacent to buttons or form inputs (accidental-click policy)

Steps after approval:

1. Add the site in AdSense and wait for review.
2. Fill `ADSENSE_CLIENT` in `src/consts.ts` with the publisher id (`ca-pub-…`).
3. Create two display ad units in the AdSense dashboard and put their ids into
   `AD_SLOTS.mid` and `AD_SLOTS.bottom`.
4. Redeploy — the script and both slots render automatically.
