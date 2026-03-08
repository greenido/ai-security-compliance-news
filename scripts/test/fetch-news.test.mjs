import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreArticle,
  categorizeArticle,
  fetchTrendingNews,
  RSS_FEEDS,
  RELEVANCE_KEYWORDS,
} from '../fetch-news.mjs';

// ---------------------------------------------------------------------------
// scoreArticle
// ---------------------------------------------------------------------------
describe('scoreArticle', () => {
  it('returns 0 for an article with no relevant keywords', () => {
    const article = { title: 'Best pizza recipes', contentSnippet: 'Margherita is great' };
    assert.equal(scoreArticle(article), 0);
  });

  it('scores higher when multiple keywords match', () => {
    const low = { title: 'New cloud trends', contentSnippet: 'Overview of cloud' };
    const high = {
      title: 'AI ransomware breach hits CMMC compliance',
      contentSnippet: 'cybersecurity threat zero-day',
    };
    assert.ok(scoreArticle(high) > scoreArticle(low));
  });

  it('boosts articles published less than 6 hours ago', () => {
    const recent = {
      title: 'AI security',
      contentSnippet: '',
      isoDate: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h ago
    };
    const old = {
      title: 'AI security',
      contentSnippet: '',
      isoDate: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(), // 30h ago
    };
    assert.ok(scoreArticle(recent) > scoreArticle(old));
  });

  it('boosts articles published less than 12 hours ago', () => {
    const article = {
      title: 'security breach',
      contentSnippet: '',
      isoDate: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(), // 10h ago
    };
    const baseline = { title: 'security breach', contentSnippet: '' };
    assert.ok(scoreArticle(article) > scoreArticle(baseline));
  });

  it('handles missing fields gracefully', () => {
    const article = {};
    const score = scoreArticle(article);
    assert.equal(typeof score, 'number');
    assert.equal(score, 0);
  });
});

// ---------------------------------------------------------------------------
// categorizeArticle
// ---------------------------------------------------------------------------
describe('categorizeArticle', () => {
  it('categorizes an AI article correctly', () => {
    const article = { title: 'New AI model GPT-5 released', contentSnippet: 'Machine learning advances' };
    const cats = categorizeArticle(article);
    assert.ok(cats.includes('AI'));
  });

  it('categorizes a security article correctly', () => {
    const article = { title: 'Major ransomware attack', contentSnippet: 'Cybersecurity teams respond to breach' };
    const cats = categorizeArticle(article);
    assert.ok(cats.includes('Security'));
  });

  it('categorizes a compliance article correctly', () => {
    const article = { title: 'CMMC 2.0 requirements update', contentSnippet: 'SOC 2 audit guidelines' };
    const cats = categorizeArticle(article);
    assert.ok(cats.includes('Compliance'));
  });

  it('categorizes an IT Ops article correctly', () => {
    const article = { title: 'Endpoint monitoring in the cloud', contentSnippet: 'DevOps infrastructure SLA' };
    const cats = categorizeArticle(article);
    assert.ok(cats.includes('IT Ops'));
  });

  it('assigns multiple categories for cross-topic articles', () => {
    const article = {
      title: 'AI-powered cybersecurity for HIPAA compliance',
      contentSnippet: 'machine learning threat detection',
    };
    const cats = categorizeArticle(article);
    assert.ok(cats.includes('AI'));
    assert.ok(cats.includes('Security'));
    assert.ok(cats.includes('Compliance'));
  });

  it('defaults to AI when no keywords match', () => {
    const article = { title: 'Random blog post', contentSnippet: 'Nothing relevant' };
    const cats = categorizeArticle(article);
    assert.deepEqual(cats, ['AI']);
  });
});

// ---------------------------------------------------------------------------
// RSS_FEEDS & RELEVANCE_KEYWORDS integrity
// ---------------------------------------------------------------------------
describe('RSS_FEEDS config', () => {
  it('has at least 3 feed sources', () => {
    assert.ok(RSS_FEEDS.length >= 3);
  });

  it('each feed has url, source, and focus', () => {
    for (const feed of RSS_FEEDS) {
      assert.ok(feed.url, `Feed missing url: ${JSON.stringify(feed)}`);
      assert.ok(feed.source, `Feed missing source: ${JSON.stringify(feed)}`);
      assert.ok(feed.focus, `Feed missing focus: ${JSON.stringify(feed)}`);
    }
  });
});

describe('RELEVANCE_KEYWORDS config', () => {
  it('has at least 10 keywords', () => {
    assert.ok(RELEVANCE_KEYWORDS.length >= 10);
  });

  it('each keyword has word and positive weight', () => {
    for (const kw of RELEVANCE_KEYWORDS) {
      assert.ok(typeof kw.word === 'string' && kw.word.length > 0);
      assert.ok(typeof kw.weight === 'number' && kw.weight > 0);
    }
  });
});

// ---------------------------------------------------------------------------
// fetchTrendingNews (live RSS — integration)
// ---------------------------------------------------------------------------
describe('fetchTrendingNews (live RSS)', () => {
  it('fetches and returns a top news item with required fields', async () => {
    const news = await fetchTrendingNews();

    assert.ok(news.title, 'Missing title');
    assert.ok(news.link, 'Missing link');
    assert.ok(typeof news.snippet === 'string', 'snippet should be a string');
    assert.ok(news.source, 'Missing source');
    assert.ok(Array.isArray(news.categories), 'categories should be an array');
    assert.ok(news.categories.length > 0, 'categories should have at least one entry');
  });
});
