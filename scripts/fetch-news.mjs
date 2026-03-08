import Parser from 'rss-parser';
import { getRecentPosts, isTooSimilar } from './dedupe.mjs';

const RSS_FEEDS = [
  { url: 'https://feeds.feedburner.com/TheHackersNews', source: 'The Hacker News', focus: 'Security' },
  { url: 'https://krebsonsecurity.com/feed/', source: 'Krebs on Security', focus: 'Security' },
  { url: 'https://techcrunch.com/category/artificial-intelligence/feed/', source: 'TechCrunch', focus: 'AI' },
  { url: 'https://www.wired.com/feed/category/security/latest/rss', source: 'Wired', focus: 'Security' },
  { url: 'https://feeds.arstechnica.com/arstechnica/technology-lab', source: 'Ars Technica', focus: 'AI' },
  { url: 'https://news.google.com/rss/search?q=AI+cybersecurity+compliance&hl=en-US&gl=US&ceid=US:en', source: 'Google News', focus: 'Mixed' },
];

const RELEVANCE_KEYWORDS = [
  { word: 'ai', weight: 3 },
  { word: 'artificial intelligence', weight: 3 },
  { word: 'machine learning', weight: 2 },
  { word: 'cybersecurity', weight: 3 },
  { word: 'security', weight: 2 },
  { word: 'compliance', weight: 3 },
  { word: 'cmmc', weight: 4 },
  { word: 'soc 2', weight: 4 },
  { word: 'hipaa', weight: 4 },
  { word: 'ransomware', weight: 3 },
  { word: 'breach', weight: 3 },
  { word: 'vulnerability', weight: 2 },
  { word: 'zero-day', weight: 3 },
  { word: 'endpoint', weight: 2 },
  { word: 'phishing', weight: 2 },
  { word: 'threat', weight: 2 },
  { word: 'it operations', weight: 2 },
  { word: 'cloud security', weight: 3 },
  { word: 'automation', weight: 2 },
  { word: 'managed security', weight: 3 },
  { word: 'siem', weight: 2 },
  { word: 'edr', weight: 2 },
  { word: 'soc', weight: 2 },
  { word: 'patch', weight: 1 },
  { word: 'malware', weight: 2 },
];

function scoreArticle(article) {
  const text = `${article.title || ''} ${article.contentSnippet || ''} ${article.content || ''}`.toLowerCase();
  let score = 0;
  for (const kw of RELEVANCE_KEYWORDS) {
    if (text.includes(kw.word)) {
      score += kw.weight;
    }
  }
  // Boost recent articles
  if (article.isoDate) {
    const ageHours = (Date.now() - new Date(article.isoDate).getTime()) / (1000 * 60 * 60);
    if (ageHours < 6) score += 5;
    else if (ageHours < 12) score += 3;
    else if (ageHours < 24) score += 1;
  }
  return score;
}

function categorizeArticle(article) {
  const text = `${article.title || ''} ${article.contentSnippet || ''}`.toLowerCase();
  const categories = [];
  if (/\bai\b|artificial intelligence|machine learning|llm|gpt|gemini|neural|deep learning/.test(text)) categories.push('AI');
  if (/security|cyber|ransomware|breach|vulnerability|malware|phishing|threat|edr|siem|zero.?day/.test(text)) categories.push('Security');
  if (/compliance|cmmc|soc.?2|hipaa|gdpr|regulation|audit|nist|fedramp/.test(text)) categories.push('Compliance');
  if (/it operations|endpoint|patch|cloud|devops|infrastructure|sla|helpdesk|monitoring/.test(text)) categories.push('IT Ops');
  if (categories.length === 0) categories.push('AI');
  return categories;
}

export { scoreArticle, categorizeArticle, RSS_FEEDS, RELEVANCE_KEYWORDS };

export async function fetchTrendingNews() {
  const parser = new Parser({ timeout: 15000 });
  const allArticles = [];

  const feedResults = await Promise.allSettled(
    RSS_FEEDS.map(async (feed) => {
      try {
        const result = await parser.parseURL(feed.url);
        return (result.items || []).map((item) => ({
          title: item.title || '',
          link: item.link || '',
          contentSnippet: (item.contentSnippet || '').slice(0, 500),
          isoDate: item.isoDate || item.pubDate || '',
          source: feed.source,
          sourceFocus: feed.focus,
        }));
      } catch {
        console.warn(`Failed to fetch ${feed.source}: skipping`);
        return [];
      }
    })
  );

  for (const result of feedResults) {
    if (result.status === 'fulfilled') {
      allArticles.push(...result.value);
    }
  }

  // Filter to last 48h to ensure we have enough articles
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const recent = allArticles.filter((a) => {
    if (!a.isoDate) return true;
    return new Date(a.isoDate).getTime() > cutoff;
  });

  const articlesToScore = recent.length > 5 ? recent : allArticles;

  const scored = articlesToScore
    .map((a) => ({ ...a, score: scoreArticle(a), categories: categorizeArticle(a) }))
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    throw new Error('No articles found from any RSS feed');
  }

  const recentPosts = getRecentPosts();
  if (recentPosts.length > 0) {
    console.log(`Checking against ${recentPosts.length} recent post(s) for duplicates...`);
  }

  let top = null;
  for (const candidate of scored) {
    const check = isTooSimilar(
      { title: candidate.title, snippet: candidate.contentSnippet, categories: candidate.categories },
      recentPosts,
    );
    if (check.similar) {
      console.log(`  Skipped: "${candidate.title}" — too similar to "${check.matchedPost}" (${check.similarity})`);
      continue;
    }
    top = candidate;
    break;
  }

  if (!top) {
    throw new Error('All candidate articles are too similar to recent posts — nothing new to write about');
  }

  console.log(`Selected: "${top.title}" (score: ${top.score}, source: ${top.source})`);

  return {
    title: top.title,
    link: top.link,
    snippet: top.contentSnippet,
    source: top.source,
    categories: top.categories,
    date: top.isoDate,
  };
}
