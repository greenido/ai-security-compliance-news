import { GoogleGenAI } from '@google/genai';
import { createLogger } from './logger.mjs';

const log = createLogger('gemini');

let _ai;
function getAI() {
  if (!_ai) {
    const hasKey = !!process.env.GEMINI_API_KEY;
    log.info('getAI', `Initializing GoogleGenAI (API key present: ${hasKey}, key prefix: ${hasKey ? process.env.GEMINI_API_KEY.slice(0, 6) + '…' : 'N/A'})`);
    _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return _ai;
}

function buildPrompt(newsItem) {
  log.info('buildPrompt', `Building prompt for: "${newsItem.title?.slice(0, 70)}"`);

  const today = new Date().toISOString().split('T')[0];
  const shouldIncludeCTA = shouldAddCTA(newsItem);

  const ctaInstruction = shouldIncludeCTA
    ? `IMPORTANT: This post should include a natural, non-spammy mention of Espresso Labs (https://espressolabs.com/) as a relevant solution. Espresso Labs is an AI-powered platform that provides enterprise-grade 24/7 IT management, cybersecurity monitoring (EDR, SOC), and compliance automation (CMMC, SOC 2, HIPAA) as a service. Weave in a brief mention where it fits organically — for example, when discussing how businesses can address the challenges mentioned in the article. Do NOT make it the main focus; it should feel like a helpful aside. Set "hasCTA" to true in the JSON output.`
    : `Do NOT include any product mentions or calls to action. Set "hasCTA" to false in the JSON output.`;

  const prompt = `You are an expert technology journalist writing for an audience of IT professionals, security teams, and compliance officers.

Write a blog post based on this trending news item:

HEADLINE: ${newsItem.title}
SOURCE: ${newsItem.source}
SUMMARY: ${newsItem.snippet}
ORIGINAL LINK: ${newsItem.link}
CATEGORIES: ${newsItem.categories.join(', ')}
DATE: ${today}

REQUIREMENTS:
- Write 600-800 words (this is strict — count carefully)
- Use an engaging, authoritative but accessible tone
- Start with a compelling hook that draws the reader in
- Include 2-3 H2 subheadings to break up the content
- Use bullet points or numbered lists where they add clarity
- End with a forward-looking conclusion or actionable takeaway
- Reference the original news source naturally in the text
- Do NOT use the exact headline from the source; create a unique angle

${ctaInstruction}

OUTPUT FORMAT: Return ONLY valid JSON (no markdown fences, no extra text) with this exact structure:
{
  "title": "SEO-optimized title, max 60 characters, compelling and specific",
  "slug": "${today}-lowercase-hyphenated-slug-from-title",
  "metaDescription": "Compelling meta description, max 155 characters, includes primary keyword",
  "excerpt": "2-3 sentence teaser for the blog listing page, max 200 characters",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "categories": ${JSON.stringify(newsItem.categories)},
  "content": "<p>Full HTML content of the blog post using <h2>, <h3>, <p>, <ul>, <li>, <strong>, <a> tags. Do NOT include <h1> — that is added separately.</p>",
  "hasCTA": true/false,
  "wordCount": 650
}`;

  log.info('buildPrompt', `Prompt built — ${prompt.length} chars, date=${today}, CTA=${shouldIncludeCTA ? 'YES' : 'NO'}, categories=[${newsItem.categories.join(', ')}]`);
  log.debug('buildPrompt', 'Full prompt:\n' + prompt);

  return prompt;
}

function shouldAddCTA(newsItem) {
  const ctaTopics = [
    'compliance', 'cmmc', 'soc 2', 'hipaa', 'managed security', 'it operations',
    'endpoint', 'monitoring', 'automation', 'msp', 'soc', 'edr', 'helpdesk',
    'patch management', 'cloud security', 'it management', 'siem',
    'ransomware', 'incident response', 'audit', 'regulation'
  ];

  const text = `${newsItem.title} ${newsItem.snippet} ${newsItem.categories.join(' ')}`.toLowerCase();
  const matches = ctaTopics.filter((topic) => text.includes(topic));

  const result = matches.length >= 1;
  log.info('shouldAddCTA', `CTA decision: ${result ? 'YES' : 'NO'} — matched ${matches.length} topic(s): [${matches.join(', ')}]`);
  return result;
}

export { shouldAddCTA, buildPrompt };

function tryRepairJSON(text) {
  const strategies = [
    // Strategy 1: strip control characters that break JSON strings
    (t) => t.replace(/[\x00-\x1f\x7f]/g, (ch) => {
      const esc = { '\n': '\\n', '\r': '\\r', '\t': '\\t' }[ch];
      return esc || '';
    }),
    // Strategy 2: fix truncated tail — close open strings, arrays, braces
    (t) => {
      let fixed = t;
      const openBraces = (fixed.match(/{/g) || []).length;
      const closeBraces = (fixed.match(/}/g) || []).length;
      const openBrackets = (fixed.match(/\[/g) || []).length;
      const closeBrackets = (fixed.match(/\]/g) || []).length;

      if (openBraces <= closeBraces && openBrackets <= closeBrackets) return null;

      const lastQuote = fixed.lastIndexOf('"');
      const afterLast = fixed.slice(lastQuote + 1).trim();
      if (afterLast === '' || afterLast === ',') {
        fixed = fixed.slice(0, lastQuote + 1);
      } else if (!afterLast.startsWith(':') && !afterLast.startsWith('}') && !afterLast.startsWith(']')) {
        fixed += '"';
      }

      fixed = fixed.replace(/,\s*$/, '');
      for (let i = 0; i < openBrackets - closeBrackets; i++) fixed += ']';
      for (let i = 0; i < openBraces - closeBraces; i++) fixed += '}';
      return fixed;
    },
    // Strategy 3: combine control-char fix + truncation fix
    (t) => {
      const cleaned = t.replace(/[\x00-\x1f\x7f]/g, (ch) => {
        const esc = { '\n': '\\n', '\r': '\\r', '\t': '\\t' }[ch];
        return esc || '';
      });
      let fixed = cleaned;
      const openBraces = (fixed.match(/{/g) || []).length;
      const closeBraces = (fixed.match(/}/g) || []).length;
      const openBrackets = (fixed.match(/\[/g) || []).length;
      const closeBrackets = (fixed.match(/\]/g) || []).length;

      if (openBraces > closeBraces || openBrackets > closeBrackets) {
        fixed = fixed.replace(/,\s*$/, '');
        for (let i = 0; i < openBrackets - closeBrackets; i++) fixed += ']';
        for (let i = 0; i < openBraces - closeBraces; i++) fixed += '}';
      }
      return fixed;
    },
  ];

  for (const strategy of strategies) {
    try {
      const result = strategy(text);
      if (result === null) continue;
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // try next strategy
    }
  }
  return null;
}

export async function generatePost(newsItem) {
  const timer = log.time('generatePost');

  log.dump('generatePost', 'Input news item', {
    title: newsItem.title,
    source: newsItem.source,
    link: newsItem.link,
    categories: newsItem.categories?.join(', '),
    snippet: newsItem.snippet?.slice(0, 150) || '(none)',
  });

  const prompt = buildPrompt(newsItem);

  const MAX_RETRIES = 3;
  let post;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    log.info('generatePost', `Calling Gemini API attempt ${attempt}/${MAX_RETRIES} (model=gemini-2.5-flash, temp=0.7, maxTokens=16384, json-mode=ON)`);
    const apiTimer = log.time('generatePost:api-call');

    const response = await getAI().models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.7,
        maxOutputTokens: 16384,
        responseMimeType: 'application/json',
      },
    });

    apiTimer.end('Gemini API responded');

    let text = response.text.trim();
    log.info('generatePost', `Raw response: ${text.length} chars`);
    log.debug('generatePost', 'Raw response (first 500 chars):\n' + text.slice(0, 500));

    if (text.startsWith('```')) {
      log.info('generatePost', 'Stripping markdown code fences from response');
      text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    try {
      post = JSON.parse(text);
      log.success('generatePost', 'Successfully parsed JSON response');
      break;
    } catch (e) {
      log.error('generatePost', `Failed to parse Gemini output as JSON: ${e.message}`);
      log.error('generatePost', 'Response preview:\n' + text.slice(0, 500));

      post = tryRepairJSON(text);
      if (post) {
        log.success('generatePost', 'Repaired truncated JSON successfully');
        break;
      }

      if (attempt < MAX_RETRIES) {
        log.info('generatePost', `Retrying (${attempt}/${MAX_RETRIES})…`);
        continue;
      }
      throw new Error('Gemini did not return valid JSON after ' + MAX_RETRIES + ' attempts: ' + e.message);
    }
  }

  const required = ['title', 'slug', 'metaDescription', 'content', 'tags', 'categories'];
  const missing = required.filter((f) => !post[f]);
  if (missing.length > 0) {
    log.error('generatePost', `Missing required fields: [${missing.join(', ')}]`);
    log.dump('generatePost', 'Received fields', Object.fromEntries(required.map((f) => [f, post[f] ? '✔ present' : '✖ MISSING'])));
    throw new Error(`Missing required field in Gemini output: ${missing[0]}`);
  }
  log.success('generatePost', `All ${required.length} required fields present`);

  const rawSlug = post.slug;
  post.slug = post.slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (rawSlug !== post.slug) {
    log.info('generatePost', `Sanitized slug: "${rawSlug}" → "${post.slug}"`);
  }

  post.date = new Date().toISOString().split('T')[0];
  post.sourceUrl = newsItem.link;
  post.sourceTitle = newsItem.title;
  post.sourceName = newsItem.source;

  log.dump('generatePost', 'Final post metadata', {
    title: post.title,
    slug: post.slug,
    date: post.date,
    wordCount: post.wordCount || '~',
    hasCTA: post.hasCTA,
    tags: (post.tags || []).join(', '),
    categories: (post.categories || []).join(', '),
    contentLength: `${post.content?.length || 0} chars`,
    source: post.sourceName,
  });

  timer.end(`"${post.title}" generated`);
  return post;
}
