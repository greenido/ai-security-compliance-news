import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

import { fetchTrendingNews } from './fetch-news.mjs';
import { generatePost } from './gemini-writer.mjs';
import { buildPost } from './build-post-html.mjs';

async function main() {
  console.log('=== Daily Blog Post Generator ===');
  console.log(`Date: ${new Date().toISOString().split('T')[0]}`);
  console.log('');

  // Step 1: Fetch trending news
  console.log('[1/3] Fetching trending news from RSS feeds...');
  const newsItem = await fetchTrendingNews();
  console.log('');

  // Step 2: Generate post with Gemini
  console.log('[2/3] Generating blog post with Gemini...');
  const post = await generatePost(newsItem);
  console.log('');

  // Step 3: Build HTML and update index
  console.log('[3/3] Building HTML page and updating index...');
  const filePath = await buildPost(post);
  console.log('');

  console.log('=== Complete ===');
  console.log(`Post: ${post.title}`);
  console.log(`File: ${filePath}`);
  console.log(`CTA:  ${post.hasCTA ? 'Yes (Espresso Labs)' : 'No'}`);
  console.log(`Tags: ${post.tags.join(', ')}`);
}

main().catch((err) => {
  console.error('Generation failed:', err.message);
  process.exit(1);
});
