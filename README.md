# AI-Powered Daily Blog: IT, Security & Compliance

An automated blog that publishes daily posts about AI in IT, Security, and Compliance. Posts are generated using Google Gemini based on trending news from top tech/security RSS feeds.

## How It Works

1. A GitHub Action runs daily at 8:00 AM UTC
2. It fetches trending news from cybersecurity and AI RSS feeds
3. Google Gemini writes a 600-800 word SEO-optimized blog post
4. The post is committed as a full standalone HTML file to `posts/`
5. The site is deployed to GitHub Pages

## Setup

### 1. Fork or clone this repository

### 2. Add your Gemini API key

Go to **Settings > Secrets and variables > Actions** and add:

- `GEMINI_API_KEY` - Get a free key from [Google AI Studio](https://aistudio.google.com/apikey)

### 3. Enable GitHub Pages

Go to **Settings > Pages** and set the source to **GitHub Actions**.

### 4. Update the base URL

Search for `YOUR_USERNAME` across the project and replace with your GitHub username:

- `sitemap.xml`
- `robots.txt`
- `scripts/build-post-html.mjs`

### 5. Trigger the first post

Go to **Actions > Daily Blog Post > Run workflow** to generate your first post manually.

## Local Development

```bash
cd scripts
npm install
GEMINI_API_KEY=your_key_here node generate-post.mjs
```

Then open `index.html` in a browser to preview the site.

## Tech Stack

- **Site**: HTML, Tailwind CSS (CDN), Vanilla JS
- **Generation**: Node.js, @google/genai, rss-parser
- **Hosting**: GitHub Pages
- **CI/CD**: GitHub Actions (daily cron)

## RSS Sources

- The Hacker News (cybersecurity)
- Krebs on Security
- TechCrunch AI
- Wired Security
- Ars Technica
- Google News (AI + cybersecurity)
