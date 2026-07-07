import { createLogger } from './logger.mjs';

const log = createLogger('espressolabs');

export const ESPRESSO_LABS_URL = 'https://espressolabs.com?utm=aicybersecuritynews';

export const ESPRESSO_LABS_SERVICES = [
  'AI-powered 24/7 IT management',
  'managed security and cybersecurity monitoring (EDR, SOC)',
  'compliance automation for CMMC, SOC 2, and HIPAA',
  'MSP / managed IT services (helpdesk, patch management)',
].join('; ');

// Topics must directly map to Espresso Labs offerings — not generic threat/CVE news.
const SERVICE_PATTERNS = [
  /\bcmmc\b/,
  /\bsoc\s*2\b/,
  /\bhipaa\b/,
  /\bfedramp\b/,
  /\bmanaged (?:security|detection|it|services?|soc)\b/,
  /\bmsp\b/,
  /\bhelpdesk\b/,
  /\bpatch management\b/,
  /\bit management\b/,
  /\bcompliance automation\b/,
  /\b24\/7 (?:monitoring|it|support)\b/,
  /\bvciso\b/,
  /\bvirtual ciso\b/,
  /\boutsourced (?:security|it)\b/,
  /\b(?:cmmc|soc\s*2|hipaa|fedramp|nist|gdpr).{0,40}(?:compliance|audit|framework|certification)\b/,
  /\b(?:compliance|audit).{0,40}(?:cmmc|soc\s*2|hipaa|fedramp|nist)\b/,
  /\biso\s*27001\b/,
  /\bsecurity growth platform\b/,
];

export function shouldIncludeEspressoMention(newsItem) {
  const text = `${newsItem.title} ${newsItem.snippet} ${(newsItem.categories || []).join(' ')}`.toLowerCase();
  const matches = SERVICE_PATTERNS.filter((pattern) => pattern.test(text));
  const result = matches.length >= 1;
  log.info('shouldIncludeEspressoMention', `Decision: ${result ? 'YES' : 'NO'} — matched ${matches.length} service pattern(s)`);
  return result;
}

export function normalizeEspressoLinks(html) {
  if (!html) return html;
  return html.replace(
    /href=(["'])https?:\/\/(?:www\.)?espressolabs\.com\/?(?:\?[^"']*)?\1/gi,
    `href=$1${ESPRESSO_LABS_URL}$1`,
  );
}

export function stripEspressoMentions(html) {
  if (!html) return html;

  let result = html;
  // Drop individual paragraphs that contain an espressolabs link (do not span across </p> boundaries).
  result = result.replace(/<p\b[^>]*>(?:(?!<\/p>)[\s\S])*espressolabs\.com(?:(?!<\/p>)[\s\S])*<\/p>/gi, '');
  // Unlink any remaining Espresso Labs anchors (e.g. inside lists).
  result = result.replace(
    /<a\b[^>]*href=["']https?:\/\/(?:www\.)?espressolabs\.com[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi,
    '$1',
  );
  return result;
}

export function processEspressoContent(html, includeEspresso) {
  if (!html) return html;
  if (!includeEspresso) {
    const stripped = stripEspressoMentions(html);
    if (stripped.length !== html.length) {
      log.info('processEspressoContent', 'Removed Espresso Labs mention from post body (topic not aligned)');
    }
    return stripped;
  }
  return normalizeEspressoLinks(html);
}
