import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = join(__dirname, '..', 'posts', 'index.json');

const SIMILARITY_THRESHOLD = 0.35;
const LOOKBACK_DAYS = 7;

export function getRecentPosts(days = LOOKBACK_DAYS) {
  if (!existsSync(INDEX_PATH)) return [];

  let index;
  try {
    index = JSON.parse(readFileSync(INDEX_PATH, 'utf-8'));
  } catch {
    return [];
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  return index.filter((p) => p.date >= cutoffStr);
}

function tokenize(text) {
  const stopWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'has',
    'have', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'can', 'it', 'its', 'this', 'that', 'from', 'as', 'not',
    'no', 'new', 'how', 'what', 'why', 'when', 'where', 'who', 'which',
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
}

function jaccardSimilarity(setA, setB) {
  const a = new Set(setA);
  const b = new Set(setB);
  const intersection = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

export function isTooSimilar(candidate, recentPosts) {
  const candidateTokens = tokenize(`${candidate.title} ${candidate.snippet || candidate.contentSnippet || ''}`);

  for (const post of recentPosts) {
    const postTokens = tokenize(`${post.title} ${post.excerpt || ''}`);

    const similarity = jaccardSimilarity(candidateTokens, postTokens);
    if (similarity >= SIMILARITY_THRESHOLD) {
      return { similar: true, matchedPost: post.title, similarity: similarity.toFixed(2) };
    }

    const candidateTags = (candidate.categories || []).map((t) => t.toLowerCase());
    const postTags = (post.tags || []).map((t) => t.toLowerCase());
    const tagOverlap = jaccardSimilarity(candidateTags, postTags);

    if (tagOverlap > 0.6 && similarity > 0.2) {
      return { similar: true, matchedPost: post.title, similarity: similarity.toFixed(2) };
    }
  }

  return { similar: false };
}
