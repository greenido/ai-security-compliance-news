import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from './logger.mjs';

const log = createLogger('dedupe');

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = join(__dirname, '..', 'posts', 'index.json');

const SIMILARITY_THRESHOLD = 0.35;
const LOOKBACK_DAYS = 7;

export function getRecentPosts(days = LOOKBACK_DAYS) {
  log.info('getRecentPosts', `Looking up recent posts (last ${days} days) from ${INDEX_PATH}`);

  if (!existsSync(INDEX_PATH)) {
    log.warn('getRecentPosts', `Index file not found at ${INDEX_PATH} — returning empty list`);
    return [];
  }

  let index;
  try {
    index = JSON.parse(readFileSync(INDEX_PATH, 'utf-8'));
    log.info('getRecentPosts', `Loaded index with ${index.length} total posts`);
  } catch (err) {
    log.error('getRecentPosts', `Failed to parse index.json: ${err.message}`);
    return [];
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const recent = index.filter((p) => p.date >= cutoffStr);
  log.info('getRecentPosts', `Found ${recent.length} posts since ${cutoffStr}`);

  if (recent.length > 0) {
    recent.forEach((p) => {
      log.debug('getRecentPosts', `  • [${p.date}] "${p.title}" (slug=${p.slug})`);
    });
  }

  return recent;
}

function tokenize(text) {
  const stopWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'has',
    'have', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'can', 'it', 'its', 'this', 'that', 'from', 'as', 'not',
    'no', 'new', 'how', 'what', 'why', 'when', 'where', 'who', 'which',
  ]);

  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  log.debug('tokenize', `"${text.slice(0, 60)}…" → ${tokens.length} tokens [${tokens.slice(0, 8).join(', ')}${tokens.length > 8 ? '…' : ''}]`);
  return tokens;
}

function jaccardSimilarity(setA, setB) {
  const a = new Set(setA);
  const b = new Set(setB);
  const intersection = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  const similarity = union === 0 ? 0 : intersection / union;

  log.debug('jaccardSimilarity', `|A|=${a.size}, |B|=${b.size}, ∩=${intersection}, ∪=${union} → similarity=${similarity.toFixed(3)}`);
  return similarity;
}

export function isTooSimilar(candidate, recentPosts) {
  log.info('isTooSimilar', `Checking candidate: "${candidate.title?.slice(0, 60)}" against ${recentPosts.length} recent posts (threshold=${SIMILARITY_THRESHOLD})`);

  const candidateTokens = tokenize(`${candidate.title} ${candidate.snippet || candidate.contentSnippet || ''}`);

  for (const post of recentPosts) {
    const postTokens = tokenize(`${post.title} ${post.excerpt || ''}`);

    const similarity = jaccardSimilarity(candidateTokens, postTokens);
    log.debug('isTooSimilar', `  vs "${post.title?.slice(0, 50)}" → textSimilarity=${similarity.toFixed(3)}`);

    if (similarity >= SIMILARITY_THRESHOLD) {
      log.warn('isTooSimilar', `  MATCH: text similarity ${similarity.toFixed(3)} >= ${SIMILARITY_THRESHOLD} with "${post.title}"`);
      return { similar: true, matchedPost: post.title, similarity: similarity.toFixed(2) };
    }

    const candidateTags = (candidate.categories || []).map((t) => t.toLowerCase());
    const postTags = (post.tags || []).map((t) => t.toLowerCase());
    const tagOverlap = jaccardSimilarity(candidateTags, postTags);

    if (tagOverlap > 0.6 && similarity > 0.2) {
      log.warn('isTooSimilar', `  MATCH: tag overlap ${tagOverlap.toFixed(3)} > 0.6 AND text similarity ${similarity.toFixed(3)} > 0.2 with "${post.title}"`);
      return { similar: true, matchedPost: post.title, similarity: similarity.toFixed(2) };
    }
  }

  log.success('isTooSimilar', `No duplicates found — candidate is unique`);
  return { similar: false };
}
