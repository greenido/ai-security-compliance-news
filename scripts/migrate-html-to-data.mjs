// Converts posts that only exist as HTML (built before posts/data/ existed) into
// posts/data/<slug>.json, using posts/index.json for listing metadata. Posts that
// already have a data file are left alone, so it is safe to re-run.
// Usage: node migrate-html-to-data.mjs   (then: npm run rebuild)
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { countContentWords } from './quality-gate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const POSTS = join(ROOT, 'posts');
const DATA = join(POSTS, 'data');
mkdirSync(DATA, { recursive: true });

const unHtml = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const unAttr = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const one = (html, re, slug, what, optional = false) => {
  const m = html.match(re);
  if (!m && !optional) throw new Error(`${slug}: no ${what}`);
  return m ? m[1] : undefined;
};

const index = JSON.parse(readFileSync(join(POSTS, 'index.json'), 'utf-8'));
const bySlug = new Map(index.map((p) => [p.slug, p]));
const posInDay = new Map();
const seen = {};
for (const p of index) { seen[p.date] = (seen[p.date] || 0); posInDay.set(p.slug, seen[p.date]++); }

let n = 0;
for (const file of readdirSync(POSTS).filter((f) => f.endsWith('.html'))) {
  const slug = file.slice(0, -5);
  if (existsSync(join(DATA, `${slug}.json`))) continue;
  const html = readFileSync(join(POSTS, file), 'utf-8');
  const entry = bySlug.get(slug);

  const open = '<div class="post-content font-serif text-lg text-gray-800 dark:text-gray-200">\n        ';
  const start = html.indexOf(open) + open.length;
  const end = html.indexOf('\n      </div>\n\n      <!-- Tags -->');
  let inner = html.slice(start, end);
  const hasCTA = inner.includes('Discover Espresso Labs');
  const cta = inner.indexOf('\n        \n    <div style="margin:2rem 0"');
  const content = hasCTA ? inner.slice(0, cta) : inner.replace(/\n        $/, '');

  const date = one(html, /<meta property="article:published_time" content="([^"]*)">/, slug, 'date');
  const post = {
    title: unHtml(one(html, /<h1 class="[^"]*">([\s\S]*?)<\/h1>/, slug, 'title')),
    slug,
    date,
    publishedAt: entry ? `${date}T12:00:${String(59 - posInDay.get(slug)).padStart(2, '0')}.000Z` : `${date}T00:00:00.000Z`,
    metaDescription: unAttr(one(html, /<meta name="description" content="([^"]*)">/, slug, 'description')),
    excerpt: entry?.excerpt ?? unAttr(one(html, /<meta name="description" content="([^"]*)">/, slug, 'description')),
    tags: [...html.matchAll(/<meta property="article:tag" content="([^"]*)">/g)].map((m) => unAttr(m[1])),
    categories: entry?.categories ?? [unHtml(one(html, /rounded-full [^"]*">([^<]*)<\/span>\s*<span class="text-sm text-gray-400">/, slug, 'category'))],
    content,
    hasCTA,
    wordCount: entry?.wordCount ?? countContentWords(content),
  };
  const src = html.match(/Source: <a href="([^"]*)" target="_blank" rel="noopener" class="hover:underline">([^<]*)<\/a>/);
  if (src) { post.sourceUrl = unAttr(src[1]); post.sourceName = unHtml(src[2]); }

  if (html.includes('<figure class="mb-10')) {
    const credit = html.match(/Photo by <a href="([^"]*)"[^>]*>([^<]*)<\/a>\s*on <a href="([^"]*)"/);
    post.heroImage = {
      url: unAttr(one(html, /<meta property="og:image" content="([^"]*)">/, slug, 'og:image')),
      smallUrl: entry?.heroImage?.url,
      alt: unAttr(one(html, /<img\s+src="[^"]*"\s+alt="([^"]*)"/, slug, 'img alt')),
      credit: unHtml(credit[2]),
      creditUrl: unAttr(credit[1]),
      unsplashUrl: unAttr(credit[3]),
      color: one(html, /style="background-color: ([^"]*)"/, slug, 'color'),
      width: Number(one(html, /og:image:width" content="([^"]*)"/, slug, 'width')),
      height: Number(one(html, /og:image:height" content="([^"]*)"/, slug, 'height')),
    };
  }
  if (!entry) post.unlisted = true;
  writeFileSync(join(DATA, `${slug}.json`), JSON.stringify(post, null, 2) + '\n');
  n++;
}
console.log(`Migrated ${n} post(s) to posts/data/`);
