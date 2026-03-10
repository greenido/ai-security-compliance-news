import Parser from 'rss-parser';
import { getRecentPosts, isTooSimilar, getCategoryGaps } from './dedupe.mjs';
import { createLogger } from './logger.mjs';

const log = createLogger('fetch-news');

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
  const matched = [];
  for (const kw of RELEVANCE_KEYWORDS) {
    if (text.includes(kw.word)) {
      score += kw.weight;
      matched.push(`${kw.word}(+${kw.weight})`);
    }
  }

  let ageBonus = 0;
  if (article.isoDate) {
    const ageHours = (Date.now() - new Date(article.isoDate).getTime()) / (1000 * 60 * 60);
    if (ageHours < 6) ageBonus = 5;
    else if (ageHours < 12) ageBonus = 3;
    else if (ageHours < 24) ageBonus = 1;
    score += ageBonus;
  }

  log.debug('scoreArticle', `"${article.title?.slice(0, 60)}" → score=${score} (keywords=${matched.join(', ')}, ageBonus=+${ageBonus})`);
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

  log.debug('categorizeArticle', `"${article.title?.slice(0, 60)}" → [${categories.join(', ')}]`);
  return categories;
}

const CATEGORY_GAP_BOOST = 10;

let _scoredArticlesCache = [];

const FALLBACK_TOPICS = {
  'Compliance': {
    title: 'Compliance Frameworks in 2026: CMMC, SOC 2, and HIPAA Updates',
    link: 'https://www.nist.gov/cyberframework',
    snippet: 'Regulatory requirements continue to evolve rapidly. Organizations navigating CMMC 2.0, SOC 2 Type II, HIPAA, and emerging data-privacy frameworks face new audit expectations, tighter timelines, and increased enforcement. Understanding the latest changes is critical for compliance officers and IT leaders.',
    source: 'Industry Analysis',
    categories: ['Compliance'],
  },
  'IT Ops': {
    title: 'IT Operations Modernization: Automation, Observability, and Resilience',
    link: 'https://www.gartner.com/en/information-technology',
    snippet: 'IT operations teams face mounting pressure to deliver reliable infrastructure at scale. From AIOps and predictive monitoring to endpoint management and cloud-native operations, the modern IT Ops landscape demands automation-first strategies and cross-functional collaboration.',
    source: 'Industry Analysis',
    categories: ['IT Ops'],
  },
};

export { scoreArticle, categorizeArticle, RSS_FEEDS, RELEVANCE_KEYWORDS, FALLBACK_TOPICS };

export async function fetchTrendingNews() {
  const timer = log.time('fetchTrendingNews');
  log.info('fetchTrendingNews', `Starting RSS fetch from ${RSS_FEEDS.length} feeds`);

  const parser = new Parser({ timeout: 15000 });
  const allArticles = [];

  const feedResults = await Promise.allSettled(
    RSS_FEEDS.map(async (feed) => {
      const feedTimer = log.time(`fetch:${feed.source}`);
      try {
        const result = await parser.parseURL(feed.url);
        const items = (result.items || []).map((item) => ({
          title: item.title || '',
          link: item.link || '',
          contentSnippet: (item.contentSnippet || '').slice(0, 500),
          isoDate: item.isoDate || item.pubDate || '',
          source: feed.source,
          sourceFocus: feed.focus,
        }));
        feedTimer.end(`${items.length} articles from ${feed.source}`);
        return items;
      } catch (err) {
        log.warn('fetchTrendingNews', `Failed to fetch ${feed.source}: ${err.message} — skipping`);
        return [];
      }
    })
  );

  for (const result of feedResults) {
    if (result.status === 'fulfilled') {
      allArticles.push(...result.value);
    }
  }

  log.info('fetchTrendingNews', `Collected ${allArticles.length} total articles from all feeds`);

  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const recent = allArticles.filter((a) => {
    if (!a.isoDate) return true;
    return new Date(a.isoDate).getTime() > cutoff;
  });

  log.info('fetchTrendingNews', `Filtered to ${recent.length} articles from last 48h (of ${allArticles.length} total)`);

  const articlesToScore = recent.length > 5 ? recent : allArticles;
  if (recent.length <= 5) {
    log.warn('fetchTrendingNews', `Only ${recent.length} recent articles — falling back to scoring all ${allArticles.length}`);
  }

  const scored = articlesToScore
    .map((a) => ({ ...a, score: scoreArticle(a), categories: categorizeArticle(a) }));

  const categoryGaps = getCategoryGaps(8);
  if (categoryGaps.length > 0) {
    log.info('fetchTrendingNews', `Category gaps detected: [${categoryGaps.join(', ')}] — applying +${CATEGORY_GAP_BOOST} boost to matching articles`);
    let boosted = 0;
    for (const article of scored) {
      const matchesGap = article.categories.some((c) => categoryGaps.includes(c));
      if (matchesGap) {
        article.score += CATEGORY_GAP_BOOST;
        boosted++;
        log.debug('fetchTrendingNews', `  Boosted: "${article.title?.slice(0, 60)}" [${article.categories.join(',')}] → score=${article.score}`);
      }
    }
    log.info('fetchTrendingNews', `Boosted ${boosted} article(s) matching gap categories`);
  }

  scored.sort((a, b) => b.score - a.score);
  _scoredArticlesCache = scored;

  log.info('fetchTrendingNews', `Scored ${scored.length} articles — top 5:`);
  scored.slice(0, 5).forEach((a, i) => {
    log.info('fetchTrendingNews', `  #${i + 1} [score=${a.score}] "${a.title?.slice(0, 70)}" (${a.source}, [${a.categories.join(',')}])`);
  });

  if (scored.length === 0) {
    log.error('fetchTrendingNews', 'No articles found from any RSS feed');
    throw new Error('No articles found from any RSS feed');
  }

  const recentPosts = getRecentPosts();
  if (recentPosts.length > 0) {
    log.info('fetchTrendingNews', `Checking against ${recentPosts.length} recent post(s) for duplicates`);
  } else {
    log.info('fetchTrendingNews', 'No recent posts found — skipping dedup check');
  }

  let top = null;
  let skippedCount = 0;
  for (const candidate of scored) {
    const check = isTooSimilar(
      { title: candidate.title, snippet: candidate.contentSnippet, categories: candidate.categories },
      recentPosts,
    );
    if (check.similar) {
      skippedCount++;
      log.info('fetchTrendingNews', `  Skipped [score=${candidate.score}]: "${candidate.title?.slice(0, 60)}" — too similar to "${check.matchedPost}" (similarity=${check.similarity})`);
      continue;
    }
    top = candidate;
    break;
  }

  if (!top) {
    log.error('fetchTrendingNews', `All ${scored.length} candidates were too similar to recent posts (${skippedCount} skipped)`);
    throw new Error('All candidate articles are too similar to recent posts — nothing new to write about');
  }

  log.success('fetchTrendingNews', `Selected: "${top.title}" (score=${top.score}, source=${top.source}, categories=[${top.categories.join(',')}])`);
  log.dump('fetchTrendingNews', 'Selected article details', {
    title: top.title,
    link: top.link,
    snippet: top.contentSnippet?.slice(0, 150) || '(none)',
    source: top.source,
    date: top.isoDate || '(unknown)',
    score: top.score,
    categories: top.categories.join(', '),
  });

  timer.end(`selected 1 article from ${allArticles.length} candidates`);

  return {
    title: top.title,
    link: top.link,
    snippet: top.contentSnippet,
    source: top.source,
    categories: top.categories,
    date: top.isoDate,
  };
}

export function pickArticleForCategory(category, excludeTitles = []) {
  log.info('pickArticleForCategory', `Looking for a "${category}" article (excluding ${excludeTitles.length} title(s), cache size=${_scoredArticlesCache.length})`);

  const candidates = _scoredArticlesCache
    .filter((a) => a.categories.includes(category))
    .filter((a) => !excludeTitles.includes(a.title));

  if (candidates.length === 0) {
    log.warn('pickArticleForCategory', `No RSS articles found for "${category}" — will need fallback`);
    return null;
  }

  const recentPosts = getRecentPosts();
  for (const candidate of candidates) {
    const check = isTooSimilar(
      { title: candidate.title, snippet: candidate.contentSnippet, categories: candidate.categories },
      recentPosts,
    );
    if (!check.similar) {
      log.success('pickArticleForCategory', `Selected "${category}" article: "${candidate.title}" (score=${candidate.score})`);
      return {
        title: candidate.title,
        link: candidate.link,
        snippet: candidate.contentSnippet,
        source: candidate.source,
        categories: candidate.categories,
        date: candidate.isoDate,
      };
    }
    log.debug('pickArticleForCategory', `  Skipped: "${candidate.title?.slice(0, 60)}" — too similar to recent post`);
  }

  log.warn('pickArticleForCategory', `All ${candidates.length} "${category}" candidates were too similar to recent posts — will need fallback`);
  return null;
}
