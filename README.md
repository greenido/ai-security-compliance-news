# AI-Powered Daily Blog: IT, Security & Compliance

An automated blog at [aicybersecurity.news](https://aicybersecurity.news/) that publishes daily posts about AI in IT, Security, and Compliance. Posts are generated with Google Gemini from trending news in security and AI RSS feeds.

## How It Works

1. A GitHub Action runs daily at 15:00 UTC (7:00 AM PST)
2. It fetches trending news from cybersecurity, AI and compliance RSS feeds and picks the best unseen story
3. It fetches the source article's text (when the link allows it) so the post is grounded in the real article
4. Google Gemini writes a 600-800 word post, constrained to a JSON schema
5. A quality gate checks the draft (length, headings, links, unique title); failing drafts are regenerated
6. The post is saved as data in `posts/data/<slug>.json` and rendered to `posts/<slug>.html`, and `posts/index.json`, `sitemap.xml` and `feed.xml` are regenerated
7. The Tailwind CSS is rebuilt and everything is committed to `main`
8. Cloudflare deploys `main` as static assets (see `wrangler.toml`; `.assetsignore` lists what is not deployed)

If the Compliance or IT Ops category hasn't appeared recently, extra "gap-filler" posts are generated for it.

## Setup

### 1. Add secrets

Go to **Settings > Secrets and variables > Actions** and add:

- `GEMINI_API_KEY` — get a key from [Google AI Studio](https://aistudio.google.com/apikey)
- `UNSPLASH_ACCESS_KEY` (optional) — hero images from [Unsplash](https://unsplash.com/developers)

### 2. Hosting

The site is deployed by Cloudflare from the `main` branch. The canonical URL defaults to `https://aicybersecurity.news` and can be overridden with the `SITE_URL` environment variable. After changing it, rebuild the site (below) and update the hard-coded URLs in `index.html`, `about.html` and `robots.txt`.

### 3. Trigger the first post

Go to **Actions > Daily Blog Post > Run workflow** to generate a post manually.

## Local Development

```bash
npm install
npm install --prefix scripts
```

Serve the site at [http://localhost:3000](http://localhost:3000):

```bash
npm run serve
```

Generate a new post (reads `GEMINI_API_KEY` from `.env` or the environment):

```bash
npm run generate
```

Re-render every post page, the index, sitemap and feed from `posts/data/` — for example after changing the post template in `scripts/build-post-html.mjs`:

```bash
npm run rebuild
```

Run the tests:

```bash
npm --prefix scripts run test:unit
```

## Project Layout

| Path | What it is |
| --- | --- |
| `posts/data/*.json` | Source of truth for every post (title, content, tags, hero image, …). A post with `"unlisted": true` gets a page but is left out of the index, feed and sitemap. |
| `posts/*.html`, `posts/index.json`, `sitemap.xml`, `feed.xml` | Generated from `posts/data/` — don't edit by hand |
| `scripts/generate-post.mjs` | Daily pipeline entry point |
| `scripts/build-post-html.mjs` | Post template and listing generation |
| `scripts/quality-gate.mjs` | Checks a post must pass before publishing |
| `index.html`, `about.html`, `js/`, `css/` | Static site shell |

## Tech Stack

- **Site**: HTML, Tailwind CSS (compiled), vanilla JS
- **Generation**: Node.js, @google/genai, rss-parser, sanitize-html
- **Hosting**: Cloudflare (static assets)
- **CI/CD**: GitHub Actions (daily cron)

## RSS Sources

- The Hacker News (cybersecurity)
- Krebs on Security
- TechCrunch AI
- Wired Security
- Ars Technica
- Google News (AI + cybersecurity, SOC 2, compliance audits)
