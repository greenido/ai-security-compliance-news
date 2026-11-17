import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractArticleText, fetchArticleText } from '../article-text.mjs';

describe('extractArticleText', () => {
  it('prefers the <article> element and drops page chrome', () => {
    const html = `<html><head><style>p{}</style><script>var x=1</script></head><body>
      <nav>Home | About</nav>
      <article><h1>Big &amp; Bold</h1><p>First   paragraph.</p><p>Second<br>line</p><aside>Ad</aside></article>
      <footer>Copyright</footer></body></html>`;
    assert.equal(extractArticleText(html), 'Big & Bold\nFirst paragraph.\nSecond\nline');
  });

  it('falls back to the whole page without an <article>', () => {
    assert.equal(extractArticleText('<div><p>Hello</p><p>World</p></div>'), 'Hello\nWorld');
  });

  it('caps the text length', () => {
    assert.equal(extractArticleText(`<p>${'x'.repeat(20000)}</p>`).length, 8000);
  });
});

describe('fetchArticleText', () => {
  it('skips Google News redirect links without fetching', async () => {
    assert.equal(await fetchArticleText('https://news.google.com/rss/articles/abc'), '');
  });

  it('returns empty text for invalid URLs', async () => {
    assert.equal(await fetchArticleText('not a url'), '');
  });
});
