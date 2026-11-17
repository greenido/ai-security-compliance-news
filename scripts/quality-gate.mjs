// Checks a generated post must pass before it is published. Each check returns
// a human-readable problem; an empty list means the post is OK to publish.

export const MIN_WORDS = 450;
const REQUIRED_FIELDS = ['title', 'slug', 'date', 'metaDescription', 'content', 'tags', 'categories'];
const PLACEHOLDER_HOSTS = /^(localhost|127\.0\.0\.1|example\.(com|org|net))$/i;

export function countContentWords(html) {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  return text.split(' ').filter((w) => w.length > 0).length;
}

function checkLinks(html) {
  const problems = [];
  for (const [, href] of html.matchAll(/<a\s[^>]*href="([^"]*)"/gi)) {
    let url;
    try {
      url = new URL(href);
    } catch {
      problems.push(`link is not an absolute URL: "${href}"`);
      continue;
    }
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) {
      problems.push(`link has unsupported scheme: "${href}"`);
    } else if (PLACEHOLDER_HOSTS.test(url.hostname)) {
      problems.push(`link points to a placeholder host: "${href}"`);
    }
  }
  return problems;
}

/**
 * Content checks that need nothing but the post itself (run right after generation,
 * so a bad draft can be regenerated).
 */
export function checkPostContent(post) {
  const missing = REQUIRED_FIELDS.filter((f) => !post[f] || (Array.isArray(post[f]) && post[f].length === 0));
  if (missing.length > 0) return [`missing fields: ${missing.join(', ')}`];

  const problems = [];
  const words = countContentWords(post.content);
  if (words < MIN_WORDS) problems.push(`only ${words} words (minimum ${MIN_WORDS})`);
  if (!/<h2[\s>]/i.test(post.content)) problems.push('no <h2> subheadings');
  if (!post.slug.startsWith(post.date)) problems.push(`slug "${post.slug}" does not start with the date ${post.date}`);
  problems.push(...checkLinks(post.content));
  return problems;
}

/** Full gate before publishing: content checks plus collisions with existing posts. */
export function checkPostQuality(post, existingPosts = []) {
  const problems = checkPostContent(post);
  if (post.title) {
    const title = post.title.trim().toLowerCase();
    const clash = existingPosts.find((p) => p.slug !== post.slug && p.title.trim().toLowerCase() === title);
    if (clash) problems.push(`title already used by ${clash.slug}`);
  }
  return problems;
}
