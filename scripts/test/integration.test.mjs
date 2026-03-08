import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

import { fetchTrendingNews } from '../fetch-news.mjs';
import { generatePost } from '../gemini-writer.mjs';
import { buildPost } from '../build-post-html.mjs';

const ROOT = join(__dirname, '..', '..');
const POSTS_DIR = join(ROOT, 'posts');
const INDEX_PATH = join(POSTS_DIR, 'index.json');
const SITEMAP_PATH = join(ROOT, 'sitemap.xml');

// ---------------------------------------------------------------------------
// Full pipeline integration test
// ---------------------------------------------------------------------------
describe('Full pipeline: fetch → generate → build', () => {
  let createdPostPath;
  let originalIndex;
  let originalSitemap;
  let createdSlug;

  afterEach(() => {
    if (createdPostPath && existsSync(createdPostPath)) {
      rmSync(createdPostPath);
    }
    if (originalIndex !== undefined) {
      writeFileSync(INDEX_PATH, originalIndex);
    }
    if (originalSitemap !== undefined) {
      writeFileSync(SITEMAP_PATH, originalSitemap);
    }
  });

  it('end-to-end: fetches news, generates post, builds HTML', async () => {
    if (!process.env.GEMINI_API_KEY) {
      console.log('  ⏭  Skipping: GEMINI_API_KEY not set');
      return;
    }

    // Save originals for cleanup
    if (existsSync(INDEX_PATH)) {
      originalIndex = readFileSync(INDEX_PATH, 'utf-8');
    }
    if (existsSync(SITEMAP_PATH)) {
      originalSitemap = readFileSync(SITEMAP_PATH, 'utf-8');
    }

    // Step 1: Fetch news
    console.log('  [1/3] Fetching trending news...');
    const newsItem = await fetchTrendingNews();
    assert.ok(newsItem.title, 'News should have a title');
    assert.ok(newsItem.link, 'News should have a link');
    assert.ok(Array.isArray(newsItem.categories), 'News should have categories');

    // Step 2: Generate post via Gemini
    console.log(`  [2/3] Generating post from: "${newsItem.title}"`);
    const post = await generatePost(newsItem);
    assert.ok(post.title, 'Generated post should have a title');
    assert.ok(post.slug, 'Generated post should have a slug');
    assert.ok(post.content.length > 100, 'Generated content should be substantial');
    createdSlug = post.slug;

    // Step 3: Build HTML file + update index + sitemap
    console.log('  [3/3] Building HTML and updating index...');
    createdPostPath = await buildPost(post);
    assert.ok(existsSync(createdPostPath), 'Post HTML file should be created');

    // Validate the generated HTML
    const html = readFileSync(createdPostPath, 'utf-8');
    assert.ok(html.includes('<!DOCTYPE html>'), 'Should be a full HTML doc');
    assert.ok(html.includes(post.title.replace(/&/g, '&amp;').replace(/</g, '&lt;')), 'HTML should contain the post title');
    assert.ok(html.includes('application/ld+json'), 'Should have JSON-LD');
    assert.ok(html.includes('og:title'), 'Should have OG tags');

    // Validate index.json was updated
    const index = JSON.parse(readFileSync(INDEX_PATH, 'utf-8'));
    const entry = index.find((p) => p.slug === post.slug);
    assert.ok(entry, 'Post should appear in index.json');
    assert.equal(entry.title, post.title);
    assert.deepEqual(entry.tags, post.tags);

    // Validate sitemap
    const sitemap = readFileSync(SITEMAP_PATH, 'utf-8');
    assert.ok(sitemap.includes(post.slug), 'Sitemap should reference the new post');

    console.log(`  ✓ Pipeline complete: "${post.title}" → ${createdPostPath}`);
  });
});
