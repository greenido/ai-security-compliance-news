import { GoogleGenAI } from '@google/genai';
import { createLogger } from './logger.mjs';

const log = createLogger('unsplash');

const UNSPLASH_BASE = 'https://api.unsplash.com';

let _ai;
function getAI() {
  if (!_ai) _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return _ai;
}

/**
 * Ask Gemini to turn a blog post into an evocative, abstract Unsplash
 * search query — something that *feels* like the article rather than
 * literally depicting its topic.
 */
async function generateImageQuery(post) {
  const timer = log.time('generateImageQuery');

  const prompt = `You are a creative art director choosing a hero photograph for a blog article.

ARTICLE TITLE: ${post.title}
TAGS: ${(post.tags || []).join(', ')}
CATEGORIES: ${(post.categories || []).join(', ')}
EXCERPT: ${post.excerpt || post.metaDescription || ''}

Your job: produce a short Unsplash search query (2-5 words) for a beautiful,
evocative photograph that captures the *mood, energy, or metaphor* of the
article — NOT a literal depiction.

Guidelines:
- Think in visual metaphors. A ransomware story → "storm dark city skyline".
  An AI regulation piece → "balance scales morning light". A data breach →
  "shattered glass reflection". Cloud security → "fortress above clouds dawn".
- Prefer natural scenes, architecture, and abstract textures over people or screens.
- The result must work well as a landscape hero image on a modern blog.
- Lean dramatic and cinematic — bold light, strong composition.

Return ONLY the search query, nothing else. No quotes, no explanation.`;

  try {
    const response = await getAI().models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { temperature: 1.0, maxOutputTokens: 60 },
    });

    const query = response.text.trim().replace(/^["']|["']$/g, '');
    timer.end(`query: "${query}"`);
    return query;
  } catch (err) {
    log.warn('generateImageQuery', `Gemini query generation failed: ${err.message} — using fallback`);
    timer.end('fell back to tag-based query');
    return buildFallbackQuery(post);
  }
}

function buildFallbackQuery(post) {
  const moodMap = {
    Security: 'dark shield digital protection',
    AI: 'neural network abstract light',
    Compliance: 'balance order architecture',
    'IT Ops': 'server room blue glow',
  };
  const primary = (post.categories || [])[0] || 'AI';
  return moodMap[primary] || 'technology abstract light';
}

export async function fetchHeroImage(post) {
  const timer = log.time('fetchHeroImage');
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;

  if (!accessKey) {
    log.warn('fetchHeroImage', 'UNSPLASH_ACCESS_KEY not set — skipping hero image');
    timer.end('skipped (no key)');
    return null;
  }

  const query = await generateImageQuery(post);
  log.info('fetchHeroImage', `Searching Unsplash for: "${query}"`);

  try {
    const url = new URL(`${UNSPLASH_BASE}/search/photos`);
    url.searchParams.set('query', query);
    url.searchParams.set('per_page', '3');
    url.searchParams.set('orientation', 'landscape');
    url.searchParams.set('content_filter', 'high');

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Client-ID ${accessKey}` },
    });

    if (!res.ok) {
      const body = await res.text();
      log.error('fetchHeroImage', `Unsplash API ${res.status}: ${body.slice(0, 200)}`);
      timer.end(`failed (${res.status})`);
      return null;
    }

    const data = await res.json();
    if (!data.results || data.results.length === 0) {
      log.warn('fetchHeroImage', `No results for "${query}" — trying fallback`);
      return tryFallback(post, accessKey, timer);
    }

    const pick = selectBestPhoto(data.results);
    const image = formatImageData(pick, query);

    log.success('fetchHeroImage', `Selected image by ${image.credit} — ${image.url.slice(0, 80)}…`);
    log.dump('fetchHeroImage', 'Image data', image);
    timer.end('image found');
    return image;
  } catch (err) {
    log.error('fetchHeroImage', `Unsplash fetch error: ${err.message}`);
    timer.end('failed (network)');
    return null;
  }
}

async function tryFallback(post, accessKey, timer) {
  const fallbackQuery = buildFallbackQuery(post);
  log.info('fetchHeroImage', `Fallback search: "${fallbackQuery}"`);

  try {
    const url = new URL(`${UNSPLASH_BASE}/search/photos`);
    url.searchParams.set('query', fallbackQuery);
    url.searchParams.set('per_page', '3');
    url.searchParams.set('orientation', 'landscape');
    url.searchParams.set('content_filter', 'high');

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Client-ID ${accessKey}` },
    });

    if (!res.ok) {
      timer.end('fallback failed');
      return null;
    }

    const data = await res.json();
    if (!data.results?.length) {
      timer.end('no fallback results');
      return null;
    }

    const pick = selectBestPhoto(data.results);
    const image = formatImageData(pick, fallbackQuery);
    log.success('fetchHeroImage', `Fallback image by ${image.credit}`);
    timer.end('fallback image found');
    return image;
  } catch {
    timer.end('fallback network error');
    return null;
  }
}

function selectBestPhoto(results) {
  // Prefer the photo with the best aspect ratio for a hero banner (~16:9)
  const TARGET_RATIO = 16 / 9;
  return results.reduce((best, photo) => {
    const ratio = photo.width / photo.height;
    const bestRatio = best.width / best.height;
    return Math.abs(ratio - TARGET_RATIO) < Math.abs(bestRatio - TARGET_RATIO)
      ? photo
      : best;
  });
}

function formatImageData(photo, query) {
  return {
    url: photo.urls.regular,
    smallUrl: photo.urls.small,
    thumbUrl: photo.urls.thumb,
    alt: photo.alt_description || photo.description || query,
    credit: photo.user.name,
    creditUrl: `${photo.user.links.html}?utm_source=ai_security_blog&utm_medium=referral`,
    unsplashUrl: `${photo.links.html}?utm_source=ai_security_blog&utm_medium=referral`,
    blurHash: photo.blur_hash,
    color: photo.color,
    width: photo.width,
    height: photo.height,
    query,
  };
}
