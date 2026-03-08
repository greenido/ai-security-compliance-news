import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

import { shouldAddCTA, buildPrompt, generatePost } from '../gemini-writer.mjs';

// ---------------------------------------------------------------------------
// shouldAddCTA
// ---------------------------------------------------------------------------
describe('shouldAddCTA', () => {
  it('returns true for compliance-related topics', () => {
    const news = { title: 'New CMMC requirements', snippet: 'SOC 2 audit guide', categories: ['Compliance'] };
    assert.equal(shouldAddCTA(news), true);
  });

  it('returns true for managed security topics', () => {
    const news = { title: 'EDR monitoring best practices', snippet: 'managed security endpoint', categories: ['Security'] };
    assert.equal(shouldAddCTA(news), true);
  });

  it('returns true for IT operations topics', () => {
    const news = { title: 'IT management automation', snippet: 'patch management', categories: ['IT Ops'] };
    assert.equal(shouldAddCTA(news), true);
  });

  it('returns false for unrelated topics', () => {
    const news = { title: 'New JavaScript framework', snippet: 'Frontend rendering speeds', categories: ['AI'] };
    assert.equal(shouldAddCTA(news), false);
  });

  it('returns true when category list includes relevant terms', () => {
    const news = { title: 'Industry overview', snippet: 'general article', categories: ['Compliance', 'SOC'] };
    assert.equal(shouldAddCTA(news), true);
  });
});

// ---------------------------------------------------------------------------
// buildPrompt
// ---------------------------------------------------------------------------
describe('buildPrompt', () => {
  const sampleNews = {
    title: 'Major Ransomware Attack Hits Hospitals',
    source: 'The Hacker News',
    snippet: 'A large-scale ransomware campaign targets healthcare organizations',
    link: 'https://example.com/article',
    categories: ['Security', 'Compliance'],
  };

  it('returns a non-empty string', () => {
    const prompt = buildPrompt(sampleNews);
    assert.ok(typeof prompt === 'string' && prompt.length > 100);
  });

  it('includes the news headline in the prompt', () => {
    const prompt = buildPrompt(sampleNews);
    assert.ok(prompt.includes(sampleNews.title));
  });

  it('includes the source in the prompt', () => {
    const prompt = buildPrompt(sampleNews);
    assert.ok(prompt.includes(sampleNews.source));
  });

  it('includes the article link in the prompt', () => {
    const prompt = buildPrompt(sampleNews);
    assert.ok(prompt.includes(sampleNews.link));
  });

  it('includes today\'s date in YYYY-MM-DD format', () => {
    const prompt = buildPrompt(sampleNews);
    const today = new Date().toISOString().split('T')[0];
    assert.ok(prompt.includes(today));
  });

  it('requests JSON output format', () => {
    const prompt = buildPrompt(sampleNews);
    assert.ok(prompt.includes('"title"'));
    assert.ok(prompt.includes('"slug"'));
    assert.ok(prompt.includes('"content"'));
  });

  it('includes CTA instruction when topic aligns', () => {
    const prompt = buildPrompt(sampleNews);
    assert.ok(prompt.includes('Espresso Labs'));
    assert.ok(prompt.includes('"hasCTA" to true'));
  });

  it('excludes CTA instruction when topic does not align', () => {
    const noCtaNews = {
      title: 'New JavaScript Framework Released',
      source: 'TechCrunch',
      snippet: 'A new front-end framework promises faster rendering',
      link: 'https://example.com/js-framework',
      categories: ['AI'],
    };
    const prompt = buildPrompt(noCtaNews);
    assert.ok(prompt.includes('"hasCTA" to false'));
    assert.ok(prompt.includes('Do NOT include any product mentions'));
  });
});

// ---------------------------------------------------------------------------
// generatePost (live Gemini API — integration, requires GEMINI_API_KEY)
// ---------------------------------------------------------------------------
describe('generatePost (live Gemini API)', () => {
  it('generates a valid blog post from a news item', async () => {
    if (!process.env.GEMINI_API_KEY) {
      console.log('  ⏭  Skipping: GEMINI_API_KEY not set');
      return;
    }

    const newsItem = {
      title: 'AI-Powered Threat Detection Reduces MTTR by 60%',
      source: 'The Hacker News',
      snippet: 'New AI systems help security teams detect and respond to threats faster than ever, with mean-time-to-respond dropping by 60% in early deployments.',
      link: 'https://example.com/ai-threat-detection',
      categories: ['AI', 'Security'],
    };

    const post = await generatePost(newsItem);

    assert.ok(post.title, 'Post should have a title');
    assert.ok(post.title.length <= 80, `Title too long: ${post.title.length} chars`);
    assert.ok(post.slug, 'Post should have a slug');
    assert.ok(/^[a-z0-9-]+$/.test(post.slug), `Slug has invalid chars: ${post.slug}`);
    assert.ok(post.metaDescription, 'Post should have a metaDescription');
    assert.ok(post.metaDescription.length <= 200, `metaDescription too long: ${post.metaDescription.length}`);
    assert.ok(post.content, 'Post should have content');
    assert.ok(post.content.length > 200, 'Content seems too short');
    assert.ok(Array.isArray(post.tags), 'tags should be an array');
    assert.ok(post.tags.length >= 3, 'Should have at least 3 tags');
    assert.ok(Array.isArray(post.categories), 'categories should be an array');
    assert.ok(post.date, 'Post should have a date');
    assert.ok(typeof post.hasCTA === 'boolean', 'hasCTA should be a boolean');
    assert.ok(post.sourceUrl === newsItem.link, 'sourceUrl should match news link');
    assert.ok(post.sourceName === newsItem.source, 'sourceName should match news source');
  });
});
