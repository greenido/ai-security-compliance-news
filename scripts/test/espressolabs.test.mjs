import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ESPRESSO_LABS_URL,
  shouldIncludeEspressoMention,
  normalizeEspressoLinks,
  stripEspressoMentions,
  processEspressoContent,
} from '../espressolabs.mjs';

describe('ESPRESSO_LABS_URL', () => {
  it('includes the aicybersecuritynews UTM parameter', () => {
    assert.equal(ESPRESSO_LABS_URL, 'https://espressolabs.com?utm=aicybersecuritynews');
  });
});

describe('shouldIncludeEspressoMention', () => {
  it('returns true for CMMC compliance topics', () => {
    const news = { title: 'CMMC 2.0 deadline', snippet: 'Defense contractors prepare', categories: ['Compliance'] };
    assert.equal(shouldIncludeEspressoMention(news), true);
  });

  it('returns true for managed IT topics', () => {
    const news = { title: 'MSP growth trends', snippet: 'Managed IT services expand', categories: ['IT Ops'] };
    assert.equal(shouldIncludeEspressoMention(news), true);
  });

  it('returns false for generic ransomware news', () => {
    const news = { title: 'Ransomware hits hospitals', snippet: 'Large-scale campaign targets healthcare', categories: ['Security'] };
    assert.equal(shouldIncludeEspressoMention(news), false);
  });

  it('returns false for generic compliance without frameworks', () => {
    const news = { title: 'Industry overview', snippet: 'compliance audit requirements', categories: ['Compliance'] };
    assert.equal(shouldIncludeEspressoMention(news), false);
  });
});

describe('normalizeEspressoLinks', () => {
  it('adds UTM to bare espressolabs links', () => {
    const html = '<a href="https://espressolabs.com/">Espresso Labs</a>';
    const result = normalizeEspressoLinks(html);
    assert.ok(result.includes('utm=aicybersecuritynews'));
  });

  it('replaces existing query strings with the canonical UTM URL', () => {
    const html = '<a href="https://www.espressolabs.com/?foo=bar">Espresso Labs</a>';
    const result = normalizeEspressoLinks(html);
    assert.equal(result, `<a href="${ESPRESSO_LABS_URL}">Espresso Labs</a>`);
  });
});

describe('stripEspressoMentions', () => {
  it('removes paragraphs containing espressolabs links', () => {
    const html = '<p>Intro</p><p>Try <a href="https://espressolabs.com/">Espresso Labs</a> today.</p><p>Outro</p>';
    const result = stripEspressoMentions(html);
    assert.ok(!result.includes('espressolabs.com'));
    assert.ok(result.includes('Intro'));
    assert.ok(result.includes('Outro'));
  });
});

describe('processEspressoContent', () => {
  it('strips mentions when topic is not aligned', () => {
    const html = '<p>See <a href="https://espressolabs.com/">Espresso Labs</a>.</p>';
    const result = processEspressoContent(html, false);
    assert.ok(!result.includes('espressolabs.com'));
  });

  it('normalizes links when topic is aligned', () => {
    const html = '<p>See <a href="https://espressolabs.com/">Espresso Labs</a>.</p>';
    const result = processEspressoContent(html, true);
    assert.ok(result.includes('utm=aicybersecuritynews'));
  });
});
