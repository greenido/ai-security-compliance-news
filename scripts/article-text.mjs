import sanitizeHtml from 'sanitize-html';
import { createLogger } from './logger.mjs';

const log = createLogger('article-text');

const MAX_CHARS = 8000;
const MIN_USEFUL_CHARS = 400;
// Google News RSS links are JavaScript redirects, so fetching them never yields the article.
const UNFETCHABLE_HOSTS = /(^|\.)news\.google\.com$/i;

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

/** Turn an article page into plain text (main <article> if present), capped at MAX_CHARS. */
export function extractArticleText(html) {
  const main = html.match(/<article[\s>][\s\S]*<\/article>/i)?.[0] || html;
  const withBreaks = main.replace(/<\/(p|h[1-6]|li|div|blockquote|tr)>|<br\s*\/?>/gi, '$&\n');
  const text = sanitizeHtml(withBreaks, {
    allowedTags: [],
    allowedAttributes: {},
    nonTextTags: ['script', 'style', 'noscript', 'nav', 'header', 'footer', 'aside', 'form', 'svg', 'button', 'iframe'],
  })
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (e) => ENTITIES[e])
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  return text.slice(0, MAX_CHARS);
}

/**
 * Best-effort fetch of the source article's text so the writer works from the
 * real article instead of a 1-2 sentence RSS summary. Returns '' on any failure.
 */
export async function fetchArticleText(url, { timeoutMs = 15000 } = {}) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return '';
  }
  if (UNFETCHABLE_HOSTS.test(host)) {
    log.info('fetchArticleText', `Skipping ${host} (redirect links can't be fetched) — using RSS summary only`);
    return '';
  }

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AISecurityNewsBot/1.0)', Accept: 'text/html' },
    });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('html')) {
      log.warn('fetchArticleText', `Could not fetch source (${res.status} ${res.headers.get('content-type')}) — using RSS summary only`);
      return '';
    }
    const text = extractArticleText(await res.text());
    if (text.length < MIN_USEFUL_CHARS) {
      log.warn('fetchArticleText', `Source text too short (${text.length} chars) — using RSS summary only`);
      return '';
    }
    log.success('fetchArticleText', `Fetched ${text.length} chars of source text from ${host}`);
    return text;
  } catch (err) {
    log.warn('fetchArticleText', `Source fetch failed: ${err.message} — using RSS summary only`);
    return '';
  }
}
