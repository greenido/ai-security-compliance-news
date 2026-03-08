import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

import { fetchTrendingNews } from './fetch-news.mjs';
import { generatePost } from './gemini-writer.mjs';
import { fetchHeroImage } from './unsplash.mjs';
import { buildPost } from './build-post-html.mjs';
import { getRecentPosts, isTooSimilar } from './dedupe.mjs';
import { createLogger } from './logger.mjs';

const log = createLogger('main');

async function main() {
  const totalTimer = log.time('main');

  log.section('AI Security & Compliance News — Post Generator');
  log.info('main', `Date: ${new Date().toISOString().split('T')[0]}`);
  log.info('main', `Node: ${process.version}, Platform: ${process.platform}`);
  log.info('main', `ENV: GEMINI_API_KEY=${process.env.GEMINI_API_KEY ? 'set (' + process.env.GEMINI_API_KEY.length + ' chars)' : 'NOT SET'}`);
  log.info('main', `DEBUG mode: ${process.env.DEBUG ? 'ON' : 'OFF (set DEBUG=1 for verbose logs)'}`);

  // Step 1: Fetch trending news
  log.section('Step 1/3 — Fetch Trending News');
  const fetchTimer = log.time('step1:fetch');
  const newsItem = await fetchTrendingNews();
  fetchTimer.end('news fetched');

  // Safety check: verify the selected article isn't a duplicate
  log.info('main', 'Running safety dedup check on selected article');
  const recentPosts = getRecentPosts();
  const dupeCheck = isTooSimilar(newsItem, recentPosts);
  if (dupeCheck.similar) {
    log.error('main', `Aborting: selected topic "${newsItem.title}" is too similar to "${dupeCheck.matchedPost}" (similarity: ${dupeCheck.similarity})`);
    throw new Error(
      `Aborting: selected topic "${newsItem.title}" is too similar to recent post "${dupeCheck.matchedPost}" (similarity: ${dupeCheck.similarity})`,
    );
  }
  log.success('main', 'Safety dedup check passed — article is unique');

  // Step 2: Generate post with Gemini
  log.section('Step 2/3 — Generate Blog Post with Gemini');
  const genTimer = log.time('step2:generate');
  const post = await generatePost(newsItem);
  genTimer.end('post generated');

  // Step 2b: Fetch hero image from Unsplash
  log.section('Step 2b — Fetch Hero Image (Unsplash)');
  const imgTimer = log.time('step2b:image');
  const heroImage = await fetchHeroImage(post);
  if (heroImage) {
    post.heroImage = heroImage;
    log.success('main', `Hero image: "${heroImage.query}" by ${heroImage.credit}`);
  } else {
    log.warn('main', 'No hero image — post will render without one');
  }
  imgTimer.end('image step complete');

  // Step 3: Build HTML and update index
  log.section('Step 3/3 — Build HTML & Update Index');
  const buildTimer = log.time('step3:build');
  const filePath = await buildPost(post);
  buildTimer.end('HTML built');

  // Summary
  log.section('Complete');
  log.dump('main', 'Final output summary', {
    title: post.title,
    file: filePath,
    slug: post.slug,
    date: post.date,
    wordCount: post.wordCount || '~',
    hasCTA: post.hasCTA ? 'Yes (Espresso Labs)' : 'No',
    tags: (post.tags || []).join(', '),
    categories: (post.categories || []).join(', '),
    source: post.sourceName,
    sourceUrl: post.sourceUrl,
  });

  totalTimer.end('all steps complete');
}

main().catch((err) => {
  log.error('main', `Generation failed: ${err.message}`);
  log.error('main', `Stack trace:\n${err.stack}`);
  process.exit(1);
});
