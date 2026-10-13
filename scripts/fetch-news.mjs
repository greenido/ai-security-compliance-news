import Parser from 'rss-parser';
import { getRecentPosts, isTooSimilar, getCategoryGaps } from './dedupe.mjs';
import { createLogger } from './logger.mjs';

const log = createLogger('fetch-news');

/**
 * Strip Slack-style angle-bracket wrapping and truncate at obviously
 * corrupted repeated path segments (e.g. pasted garbled URLs).
 */
export function cleanUrl(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let url = raw.trim().replace(/^<+/, '').replace(/>+$/, '');

  // Slack sometimes appends a label: <url|label>
  const pipeIdx = url.indexOf('|');
  if (pipeIdx !== -1) url = url.slice(0, pipeIdx);

  // Detect repeated path-segment pattern (broken paste) and truncate.
  // e.g. "https://ft.com/content/abc-abc-abc-abc-abc-abc..." repeating the
  // same chunk dozens of times. We keep only the first two occurrences.
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length > 0) {
      const last = segments[segments.length - 1];
      const parts = last.split('-');
      if (parts.length > 12) {
        const seen = new Map();
        const deduped = [];
        for (const p of parts) {
          const count = (seen.get(p) || 0) + 1;
          seen.set(p, count);
          if (count <= 2) deduped.push(p);
        }
        if (deduped.length < parts.length) {
          segments[segments.length - 1] = deduped.join('-');
          parsed.pathname = '/' + segments.join('/');
          url = parsed.toString();
          log.info('cleanUrl', `Truncated corrupted URL → ${url}`);
        }
      }
    }
  } catch {
    // not a valid URL — return as-is for downstream error handling
  }

  return url;
}

const RSS_FEEDS = [
  { url: 'https://feeds.feedburner.com/TheHackersNews', source: 'The Hacker News', focus: 'Security' },
  { url: 'https://krebsonsecurity.com/feed/', source: 'Krebs on Security', focus: 'Security' },
  { url: 'https://techcrunch.com/category/artificial-intelligence/feed/', source: 'TechCrunch', focus: 'AI' },
  { url: 'https://www.wired.com/feed/category/security/latest/rss', source: 'Wired', focus: 'Security' },
  { url: 'https://feeds.arstechnica.com/arstechnica/technology-lab', source: 'Ars Technica', focus: 'AI' },
  { url: 'https://news.google.com/rss/search?q=AI+cybersecurity+compliance&hl=en-US&gl=US&ceid=US:en', source: 'Google News', focus: 'Mixed' },
  { url: 'https://news.google.com/rss/search?q=%22SOC+2%22+compliance+when:7d&hl=en-US&gl=US&ceid=US:en', source: 'Google News', focus: 'Compliance' },
  { url: 'https://news.google.com/rss/search?q=compliance+audit+(%22SOC+2%22+OR+%22ISO+27001%22+OR+GRC)+when:7d&hl=en-US&gl=US&ceid=US:en', source: 'Google News', focus: 'Compliance' },
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
  { word: 'soc2', weight: 4 },
  { word: 'trust services criteria', weight: 4 },
  { word: 'iso 27001', weight: 3 },
  { word: 'fedramp', weight: 3 },
  { word: 'pci dss', weight: 3 },
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

// Whole-word match (plurals allowed) so e.g. "ai" doesn't hit "email" or "against".
const KEYWORD_PATTERNS = RELEVANCE_KEYWORDS.map((kw) => ({
  ...kw,
  pattern: new RegExp(`\\b${kw.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(s|es)?\\b`),
}));

function scoreArticle(article) {
  const text = `${article.title || ''} ${article.contentSnippet || ''} ${article.content || ''}`.toLowerCase();
  let score = 0;
  const matched = [];
  for (const kw of KEYWORD_PATTERNS) {
    if (kw.pattern.test(text)) {
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

  const complianceBoost = getComplianceBoost(text);
  score += complianceBoost;

  log.debug('scoreArticle', `"${article.title?.slice(0, 60)}" → score=${score} (keywords=${matched.join(', ')}, ageBonus=+${ageBonus}, complianceBoost=+${complianceBoost})`);
  return score;
}

// Editorial priority: compliance (SOC 2 above all) should win over routine
// CVE/malware news, which otherwise out-scores it by stacking many keywords.
const SOC2_PATTERN = /\bsoc[\s-]?2\b|trust services criteria/;
const COMPLIANCE_FRAMEWORK_PATTERN = /\bsoc[\s-]?2\b|trust services criteria|iso[\s-]?27001|\bcmmc\b|\bhipaa\b|fedramp|pci[\s-]?dss|\bgrc\b|compliance automation/;
const COMPLIANCE_BOOST = 8;
const SOC2_EXTRA_BOOST = 8;

function getComplianceBoost(lowerText) {
  if (SOC2_PATTERN.test(lowerText)) return COMPLIANCE_BOOST + SOC2_EXTRA_BOOST;
  if (COMPLIANCE_FRAMEWORK_PATTERN.test(lowerText)) return COMPLIANCE_BOOST;
  return 0;
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

const SOC2_LINK = 'https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2';

// Evergreen topics used when RSS has nothing suitable. Rotated (first one not
// too similar to a recent post wins) so gap-fillers don't repeat themselves.
const FALLBACK_TOPICS = {
  'Compliance': [
    {
      title: 'SOC 2 Type I vs. Type II: Choosing the Right Report for Your Customers',
      link: SOC2_LINK,
      snippet: 'Buyers increasingly demand a SOC 2 report before signing. Type I attests to control design at a point in time, while Type II tests operating effectiveness over a 3-12 month window. Choosing the right report, scoping the Trust Services Criteria, and planning the observation period shape cost, timeline, and sales impact.',
      source: 'Industry Analysis',
      categories: ['Compliance'],
    },
    {
      title: 'Continuous Compliance: Automating SOC 2 Evidence Collection',
      link: SOC2_LINK,
      snippet: 'Screenshot-driven audits do not scale. Teams are moving to continuous control monitoring that pulls SOC 2 evidence directly from identity providers, cloud consoles, ticketing, and endpoint management tools, cutting audit prep time and catching control drift before the auditor does.',
      source: 'Industry Analysis',
      categories: ['Compliance'],
    },
    {
      title: 'SOC 2 in the Age of AI: Applying Trust Services Criteria to LLM Features',
      link: SOC2_LINK,
      snippet: 'Shipping AI features changes the SOC 2 scope. Model providers become subservice organizations, prompts and outputs raise confidentiality and processing-integrity questions, and auditors now ask how AI-driven changes are reviewed, logged, and monitored under the Trust Services Criteria.',
      source: 'Industry Analysis',
      categories: ['AI', 'Compliance'],
    },
    {
      title: 'Mapping SOC 2 to ISO 27001 and NIST CSF: Test Once, Comply Many',
      link: 'https://www.nist.gov/cyberframework',
      snippet: 'Organizations facing SOC 2, ISO 27001, and NIST CSF requests can build a single unified control set. Cross-mapping controls, sharing evidence across audits, and choosing a primary framework reduce duplicate work and audit fatigue for lean security and IT teams.',
      source: 'Industry Analysis',
      categories: ['Compliance'],
    },
    {
      title: 'Compliance Frameworks in 2026: CMMC, SOC 2, and HIPAA Updates',
      link: 'https://www.nist.gov/cyberframework',
      snippet: 'Regulatory requirements continue to evolve rapidly. Organizations navigating CMMC 2.0, SOC 2 Type II, HIPAA, and emerging data-privacy frameworks face new audit expectations, tighter timelines, and increased enforcement. Understanding the latest changes is critical for compliance officers and IT leaders.',
      source: 'Industry Analysis',
      categories: ['Compliance'],
    },
  ],
  'IT Ops': [
    {
      title: 'IT Operations Modernization: Automation, Observability, and Resilience',
      link: 'https://www.gartner.com/en/information-technology',
      snippet: 'IT operations teams face mounting pressure to deliver reliable infrastructure at scale. From AIOps and predictive monitoring to endpoint management and cloud-native operations, the modern IT Ops landscape demands automation-first strategies and cross-functional collaboration.',
      source: 'Industry Analysis',
      categories: ['IT Ops'],
    },
  ],
};

const FALLBACK_LOOKBACK_DAYS = 60;

export function pickFallbackTopic(category) {
  const topics = FALLBACK_TOPICS[category] || [];
  const recentPosts = getRecentPosts(FALLBACK_LOOKBACK_DAYS);
  const fresh = topics.find((t) => !isTooSimilar(t, recentPosts).similar);
  if (fresh) {
    log.info('pickFallbackTopic', `Using "${category}" fallback: "${fresh.title}"`);
    return fresh;
  }
  if (topics.length > 0) {
    log.warn('pickFallbackTopic', `All "${category}" fallbacks used in the last ${FALLBACK_LOOKBACK_DAYS} days — reusing the first one`);
  }
  return topics[0] || null;
}

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
          link: cleanUrl(item.link || ''),
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

  const categoryGaps = getCategoryGaps();
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
    .filter((a) => category !== 'Compliance' || COMPLIANCE_FRAMEWORK_PATTERN.test(`${a.title} ${a.contentSnippet}`.toLowerCase()))
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
