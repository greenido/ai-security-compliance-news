import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  escapeHtml,
  escapeAttr,
  formatDate,
  estimateReadTime,
  buildPostHtmlPage,
  buildCtaBanner,
  buildPost,
} from '../build-post-html.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const POSTS_DIR = join(ROOT, 'posts');
const INDEX_PATH = join(POSTS_DIR, 'index.json');
const SITEMAP_PATH = join(ROOT, 'sitemap.xml');

function samplePost(overrides = {}) {
  return {
    title: 'Test Post Title',
    slug: '2026-03-07-test-post',
    metaDescription: 'A test post description for unit testing purposes.',
    excerpt: 'Short excerpt for the listing page.',
    tags: ['AI', 'Security', 'Testing'],
    categories: ['AI', 'Security'],
    content: '<p>This is the test post content with <strong>bold</strong> text.</p>',
    hasCTA: false,
    wordCount: 650,
    date: '2026-03-07',
    sourceUrl: 'https://example.com/source',
    sourceTitle: 'Original Article Title',
    sourceName: 'Test Source',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------
describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    assert.equal(escapeHtml('A & B'), 'A &amp; B');
  });

  it('escapes angle brackets', () => {
    assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
  });

  it('escapes double quotes', () => {
    assert.equal(escapeHtml('say "hello"'), 'say &quot;hello&quot;');
  });

  it('handles empty string', () => {
    assert.equal(escapeHtml(''), '');
  });

  it('passes through safe strings unchanged', () => {
    assert.equal(escapeHtml('Hello World'), 'Hello World');
  });
});

// ---------------------------------------------------------------------------
// escapeAttr
// ---------------------------------------------------------------------------
describe('escapeAttr', () => {
  it('escapes ampersands and quotes for attribute values', () => {
    assert.equal(escapeAttr('Tom & "Jerry"'), 'Tom &amp; &quot;Jerry&quot;');
  });

  it('does not escape angle brackets (attribute-safe only)', () => {
    const result = escapeAttr('a < b');
    assert.ok(!result.includes('&lt;'));
  });
});

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------
describe('formatDate', () => {
  it('formats YYYY-MM-DD to human-readable date', () => {
    const result = formatDate('2026-03-07');
    assert.ok(result.includes('March'));
    assert.ok(result.includes('7'));
    assert.ok(result.includes('2026'));
  });

  it('handles January 1st correctly', () => {
    const result = formatDate('2026-01-01');
    assert.ok(result.includes('January'));
    assert.ok(result.includes('1'));
    assert.ok(result.includes('2026'));
  });
});

// ---------------------------------------------------------------------------
// estimateReadTime
// ---------------------------------------------------------------------------
describe('estimateReadTime', () => {
  it('returns 1 min for very short posts', () => {
    assert.equal(estimateReadTime(50), 1);
  });

  it('returns ~3 min for 600-word posts', () => {
    assert.equal(estimateReadTime(600), 3);
  });

  it('returns ~4 min for 800-word posts', () => {
    assert.equal(estimateReadTime(800), 4);
  });

  it('defaults to 3 min when wordCount is falsy', () => {
    assert.equal(estimateReadTime(null), 3);
    assert.equal(estimateReadTime(undefined), 3);
    assert.equal(estimateReadTime(0), 3);
  });
});

// ---------------------------------------------------------------------------
// buildCtaBanner
// ---------------------------------------------------------------------------
describe('buildCtaBanner', () => {
  it('returns HTML containing Espresso Labs link', () => {
    const html = buildCtaBanner();
    assert.ok(html.includes('espressolabs.com'));
    assert.ok(html.includes('Discover Espresso Labs'));
  });

  it('returns valid HTML with a link tag', () => {
    const html = buildCtaBanner();
    assert.ok(html.includes('<a href='));
    assert.ok(html.includes('</a>'));
  });
});

// ---------------------------------------------------------------------------
// buildPostHtmlPage
// ---------------------------------------------------------------------------
describe('buildPostHtmlPage', () => {
  it('generates a complete HTML document', () => {
    const html = buildPostHtmlPage(samplePost());
    assert.ok(html.startsWith('<!DOCTYPE html>'));
    assert.ok(html.includes('</html>'));
  });

  it('includes the post title in <title> and <h1>', () => {
    const post = samplePost({ title: 'Unique Test Headline XYZ' });
    const html = buildPostHtmlPage(post);
    assert.ok(html.includes('Unique Test Headline XYZ'));
  });

  it('includes SEO meta tags', () => {
    const post = samplePost();
    const html = buildPostHtmlPage(post);
    assert.ok(html.includes('<meta name="description"'));
    assert.ok(html.includes('og:title'));
    assert.ok(html.includes('og:description'));
    assert.ok(html.includes('twitter:card'));
  });

  it('includes JSON-LD structured data', () => {
    const html = buildPostHtmlPage(samplePost());
    assert.ok(html.includes('application/ld+json'));
    assert.ok(html.includes('"@type": "BlogPosting"'));
  });

  it('includes canonical URL', () => {
    const post = samplePost();
    const html = buildPostHtmlPage(post);
    assert.ok(html.includes(`<link rel="canonical"`));
    assert.ok(html.includes(post.slug + '.html'));
  });

  it('renders tags as badges', () => {
    const post = samplePost({ tags: ['AI', 'Cloud'] });
    const html = buildPostHtmlPage(post);
    assert.ok(html.includes('AI'));
    assert.ok(html.includes('Cloud'));
  });

  it('includes CTA banner when hasCTA is true', () => {
    const post = samplePost({ hasCTA: true });
    const html = buildPostHtmlPage(post);
    assert.ok(html.includes('espressolabs.com'));
    assert.ok(html.includes('Discover Espresso Labs'));
  });

  it('excludes CTA banner when hasCTA is false', () => {
    const post = samplePost({ hasCTA: false });
    const html = buildPostHtmlPage(post);
    assert.ok(!html.includes('Discover Espresso Labs'));
  });

  it('includes share buttons (Twitter, LinkedIn, Copy)', () => {
    const html = buildPostHtmlPage(samplePost());
    assert.ok(html.includes('twitter.com/intent/tweet'));
    assert.ok(html.includes('linkedin.com/sharing'));
    assert.ok(html.includes('Copy link'));
  });

  it('includes navigation link back to blog', () => {
    const html = buildPostHtmlPage(samplePost());
    assert.ok(html.includes('Back to all posts'));
    assert.ok(html.includes('../index.html'));
  });

  it('includes Tailwind CSS CDN', () => {
    const html = buildPostHtmlPage(samplePost());
    assert.ok(html.includes('cdn.tailwindcss.com'));
  });

  it('includes the post date and source attribution', () => {
    const post = samplePost({ sourceName: 'TestSource123' });
    const html = buildPostHtmlPage(post);
    assert.ok(html.includes('2026-03-07'));
    assert.ok(html.includes('TestSource123'));
  });

  it('properly escapes HTML in title within element content', () => {
    const post = samplePost({ title: 'Test <script>alert(1)</script>' });
    const html = buildPostHtmlPage(post);
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    assert.ok(h1Match, 'Should have an h1 tag');
    assert.ok(h1Match[1].includes('&lt;script&gt;'), 'h1 content should have escaped tags');
    assert.ok(!h1Match[1].includes('<script>alert'), 'h1 content must not have raw script tag');
  });
});

// ---------------------------------------------------------------------------
// buildPost (writes files — uses a test slug to avoid collisions)
// ---------------------------------------------------------------------------
describe('buildPost (file I/O)', () => {
  const testSlug = '_test-runner-temp-post';
  const testPostPath = join(POSTS_DIR, `${testSlug}.html`);
  let originalIndex;
  let originalSitemap;

  beforeEach(() => {
    if (existsSync(INDEX_PATH)) {
      originalIndex = readFileSync(INDEX_PATH, 'utf-8');
    }
    if (existsSync(SITEMAP_PATH)) {
      originalSitemap = readFileSync(SITEMAP_PATH, 'utf-8');
    }
  });

  afterEach(() => {
    // Clean up test post file
    if (existsSync(testPostPath)) {
      rmSync(testPostPath);
    }
    // Restore original index
    if (originalIndex !== undefined) {
      writeFileSync(INDEX_PATH, originalIndex);
    }
    // Restore original sitemap
    if (originalSitemap !== undefined) {
      writeFileSync(SITEMAP_PATH, originalSitemap);
    }
  });

  it('creates an HTML file in the posts directory', async () => {
    const post = samplePost({ slug: testSlug });
    const filePath = await buildPost(post);
    assert.ok(existsSync(filePath), 'Post HTML file should exist');
    const content = readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('<!DOCTYPE html>'));
  });

  it('adds the post to index.json', async () => {
    const post = samplePost({ slug: testSlug, title: 'Index Test Post' });
    await buildPost(post);
    const index = JSON.parse(readFileSync(INDEX_PATH, 'utf-8'));
    const found = index.find((p) => p.slug === testSlug);
    assert.ok(found, 'Post should appear in index.json');
    assert.equal(found.title, 'Index Test Post');
  });

  it('does not duplicate entries in index.json on re-run', async () => {
    const post = samplePost({ slug: testSlug });
    await buildPost(post);
    await buildPost(post);
    const index = JSON.parse(readFileSync(INDEX_PATH, 'utf-8'));
    const matches = index.filter((p) => p.slug === testSlug);
    assert.equal(matches.length, 1, 'Should have exactly one entry');
  });

  it('updates sitemap.xml with the new post URL', async () => {
    const post = samplePost({ slug: testSlug });
    await buildPost(post);
    assert.ok(existsSync(SITEMAP_PATH), 'sitemap.xml should exist');
    const sitemap = readFileSync(SITEMAP_PATH, 'utf-8');
    assert.ok(sitemap.includes(testSlug), 'Sitemap should contain the post slug');
  });
});
