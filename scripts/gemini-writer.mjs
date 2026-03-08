import { GoogleGenAI } from '@google/genai';

let _ai;
function getAI() {
  if (!_ai) {
    _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return _ai;
}

function buildPrompt(newsItem) {
  const today = new Date().toISOString().split('T')[0];
  const shouldIncludeCTA = shouldAddCTA(newsItem);

  const ctaInstruction = shouldIncludeCTA
    ? `IMPORTANT: This post should include a natural, non-spammy mention of Espresso Labs (https://espressolabs.com/) as a relevant solution. Espresso Labs is an AI-powered platform that provides enterprise-grade 24/7 IT management, cybersecurity monitoring (EDR, SOC), and compliance automation (CMMC, SOC 2, HIPAA) as a service. Weave in a brief mention where it fits organically — for example, when discussing how businesses can address the challenges mentioned in the article. Do NOT make it the main focus; it should feel like a helpful aside. Set "hasCTA" to true in the JSON output.`
    : `Do NOT include any product mentions or calls to action. Set "hasCTA" to false in the JSON output.`;

  return `You are an expert technology journalist writing for an audience of IT professionals, security teams, and compliance officers.

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
  return matches.length >= 1;
}

export { shouldAddCTA, buildPrompt };

export async function generatePost(newsItem) {
  const prompt = buildPrompt(newsItem);

  console.log('Generating post with Gemini...');

  const response = await getAI().models.generateContent({
    model: 'gemini-3.0-flash',
    contents: prompt,
    config: {
      temperature: 0.7,
      maxOutputTokens: 4096,
    },
  });

  let text = response.text.trim();

  // Strip markdown code fences if Gemini wraps the JSON
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  let post;
  try {
    post = JSON.parse(text);
  } catch (e) {
    console.error('Failed to parse Gemini output as JSON:');
    console.error(text.slice(0, 500));
    throw new Error('Gemini did not return valid JSON: ' + e.message);
  }

  // Validate required fields
  const required = ['title', 'slug', 'metaDescription', 'content', 'tags', 'categories'];
  for (const field of required) {
    if (!post[field]) {
      throw new Error(`Missing required field in Gemini output: ${field}`);
    }
  }

  // Sanitize slug
  post.slug = post.slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  post.date = new Date().toISOString().split('T')[0];
  post.sourceUrl = newsItem.link;
  post.sourceTitle = newsItem.title;
  post.sourceName = newsItem.source;

  console.log(`Post generated: "${post.title}" (${post.wordCount || '~'} words, CTA: ${post.hasCTA})`);

  return post;
}
