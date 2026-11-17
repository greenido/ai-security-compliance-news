// Re-render every post page, index.json, sitemap.xml and feed.xml from
// posts/data/*.json. Run after changing the post template or SITE_URL.
import { buildAll } from './build-post-html.mjs';

const count = buildAll();
console.log(`Rebuilt ${count} posts`);
