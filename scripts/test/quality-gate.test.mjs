import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkPostContent, checkPostQuality, MIN_WORDS } from '../quality-gate.mjs';

function goodPost(overrides = {}) {
  return {
    title: 'A Good Post',
    slug: '2026-11-17-a-good-post',
    date: '2026-11-17',
    metaDescription: 'Description',
    tags: ['AI'],
    categories: ['AI'],
    content: `<h2>Heading</h2><p>${'word '.repeat(MIN_WORDS)}</p><p><a href="https://example.org.uk/a">src</a></p>`,
    ...overrides,
  };
}

describe('checkPostContent', () => {
  it('passes a well-formed post', () => {
    assert.deepEqual(checkPostContent(goodPost()), []);
  });

  it('reports missing fields', () => {
    const [problem] = checkPostContent(goodPost({ title: '', tags: [] }));
    assert.match(problem, /missing fields: title, tags/);
  });

  it('rejects short posts', () => {
    const problems = checkPostContent(goodPost({ content: '<h2>H</h2><p>too short</p>' }));
    assert.ok(problems.some((p) => /only \d+ words/.test(p)));
  });

  it('requires an h2 subheading', () => {
    const problems = checkPostContent(goodPost({ content: `<p>${'word '.repeat(MIN_WORDS)}</p>` }));
    assert.ok(problems.includes('no <h2> subheadings'));
  });

  it('requires the slug to start with the date', () => {
    const problems = checkPostContent(goodPost({ slug: 'a-good-post' }));
    assert.ok(problems.some((p) => /does not start with the date/.test(p)));
  });

  it('rejects relative and placeholder links', () => {
    const content = goodPost().content + '<a href="/relative">x</a><a href="https://example.com/x">y</a><a href="javascript:alert(1)">z</a>';
    const problems = checkPostContent(goodPost({ content }));
    assert.equal(problems.length, 3, problems.join('\n'));
  });
});

describe('checkPostQuality', () => {
  it('rejects a title already used by another post', () => {
    const existing = [{ slug: '2026-01-01-other', title: '  a good POST ' }];
    const problems = checkPostQuality(goodPost(), existing);
    assert.ok(problems.some((p) => /title already used by 2026-01-01-other/.test(p)));
  });

  it('allows re-building the same slug', () => {
    const existing = [{ slug: '2026-11-17-a-good-post', title: 'A Good Post' }];
    assert.deepEqual(checkPostQuality(goodPost(), existing), []);
  });
});
