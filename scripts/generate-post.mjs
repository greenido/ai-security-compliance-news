import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

import { fetchTrendingNews, pickArticleForCategory, FALLBACK_TOPICS } from './fetch-news.mjs';
import { generatePost } from './gemini-writer.mjs';
import { fetchHeroImage } from './unsplash.mjs';
import { buildPost } from './build-post-html.mjs';
import { getRecentPosts, isTooSimilar, getCategoryGaps } from './dedupe.mjs';
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

  // Step 4: Check category gaps and generate gap-filler posts
  log.section('Step 4 — Category Gap Check');
  const categoryGaps = getCategoryGaps(8);
  const remainingGaps = categoryGaps.filter((cat) => !(post.categories || []).includes(cat));

  if (remainingGaps.length > 0) {
    log.info('main', `Category gaps remaining after main post: [${remainingGaps.join(', ')}]`);

    for (const gapCategory of remainingGaps) {
      log.section(`Gap-Filler: ${gapCategory}`);
      log.info('main', `Generating gap-filler post for "${gapCategory}"`);

      let gapNewsItem = pickArticleForCategory(gapCategory, [newsItem.title]);

      if (!gapNewsItem) {
        log.warn('main', `No RSS article found for "${gapCategory}" — using fallback topic`);
        gapNewsItem = FALLBACK_TOPICS[gapCategory];
        if (!gapNewsItem) {
          log.warn('main', `No fallback topic defined for "${gapCategory}" — skipping`);
          continue;
        }
      }

      log.info('main', `Gap-filler source: "${gapNewsItem.title}" (${gapNewsItem.source})`);

      try {
        const gapGenTimer = log.time(`gap:generate:${gapCategory}`);
        const gapPost = await generatePost(gapNewsItem);
        gapGenTimer.end(`gap-filler post generated for ${gapCategory}`);

        const gapImgTimer = log.time(`gap:image:${gapCategory}`);
        const gapHeroImage = await fetchHeroImage(gapPost);
        if (gapHeroImage) {
          gapPost.heroImage = gapHeroImage;
          log.success('main', `Gap-filler hero image: "${gapHeroImage.query}" by ${gapHeroImage.credit}`);
        }
        gapImgTimer.end('gap-filler image step complete');

        const gapBuildTimer = log.time(`gap:build:${gapCategory}`);
        const gapFilePath = await buildPost(gapPost);
        gapBuildTimer.end('gap-filler HTML built');

        log.success('main', `Gap-filler post saved: ${gapFilePath}`);
        log.dump('main', `Gap-filler summary (${gapCategory})`, {
          title: gapPost.title,
          file: gapFilePath,
          slug: gapPost.slug,
          categories: (gapPost.categories || []).join(', '),
          wordCount: gapPost.wordCount || '~',
          hasCTA: gapPost.hasCTA ? 'Yes' : 'No',
        });
      } catch (err) {
        log.error('main', `Failed to generate gap-filler for "${gapCategory}": ${err.message}`);
        log.warn('main', 'Continuing despite gap-filler failure — main post was already saved');
      }
    }
  } else {
    log.success('main', 'No category gaps — all tracked categories are covered');
  }

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
    gapFillers: remainingGaps.length > 0 ? remainingGaps.join(', ') : 'none needed',
  });

  totalTimer.end('all steps complete');
}

main().catch((err) => {
  log.error('main', `Generation failed: ${err.message}`);
  log.error('main', `Stack trace:\n${err.stack}`);
  process.exit(1);
});
