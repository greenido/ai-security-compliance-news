import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from './logger.mjs';

const log = createLogger('build-post');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const POSTS_DIR = join(ROOT, 'posts');
const INDEX_PATH = join(POSTS_DIR, 'index.json');
const SITEMAP_PATH = join(ROOT, 'sitemap.xml');

const SITE_URL = 'https://greenido.github.io/ai-security-compliance-news';
const SITE_NAME = 'AI Security and Compliance News';

function estimateReadTime(wordCount) {
  const time = Math.max(1, Math.ceil((wordCount || 600) / 200));
  log.debug('estimateReadTime', `wordCount=${wordCount || '(default 600)'} → ${time} min read`);
  return time;
}

function buildCtaBanner() {
  log.info('buildCtaBanner', 'Generating CTA banner HTML for Espresso Labs');
  return `
    <div style="margin:2rem 0" class="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
      <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div class="flex-1">
          <h3 class="font-bold text-gray-900 dark:text-gray-100 mb-1">Simplify Your IT, Security &amp; Compliance</h3>
          <p class="text-sm text-gray-600 dark:text-gray-400">Espresso Labs delivers AI-powered IT management, cybersecurity monitoring, and compliance automation — all in one platform. 24/7 protection backed by real experts.</p>
        </div>
        <a href="https://espressolabs.com/" target="_blank" rel="noopener" class="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap">
          Discover Espresso Labs
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
        </a>
      </div>
    </div>`;
}

function buildPostHtmlPage(post) {
  log.info('buildPostHtmlPage', `Building HTML page for: "${post.title?.slice(0, 60)}"`);

  const readTime = estimateReadTime(post.wordCount);
  const categoryColors = {
    'AI': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    'Security': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    'Compliance': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    'IT Ops': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  };
  const primaryCategory = (post.categories && post.categories[0]) || 'AI';
  const catClass = categoryColors[primaryCategory] || 'bg-gray-100 text-gray-700';

  log.info('buildPostHtmlPage', `Page config: category=${primaryCategory}, readTime=${readTime}min, CTA=${post.hasCTA ? 'YES' : 'NO'}, tags=[${(post.tags || []).join(', ')}]`);

  const tagsHtml = (post.tags || [])
    .map((t) => `<span class="inline-block px-2.5 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full">${escapeHtml(t)}</span>`)
    .join('\n            ');

  const ctaHtml = post.hasCTA ? buildCtaBanner() : '';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.metaDescription,
    datePublished: post.date,
    dateModified: post.date,
    author: { '@type': 'Person', name: 'AI Security & Compliance Desk' },
    publisher: { '@type': 'Organization', name: SITE_NAME },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE_URL}/posts/${post.slug}.html` },
    keywords: (post.tags || []).join(', '),
  };

  log.debug('buildPostHtmlPage', 'JSON-LD structured data prepared');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(post.title)} — ${SITE_NAME}</title>
  <meta name="description" content="${escapeAttr(post.metaDescription)}">
  <meta name="keywords" content="${escapeAttr((post.tags || []).join(', '))}">
  <meta name="author" content="AI Security &amp; Compliance Desk">

  <!-- Open Graph -->
  <meta property="og:title" content="${escapeAttr(post.title)}">
  <meta property="og:description" content="${escapeAttr(post.metaDescription)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${SITE_URL}/posts/${post.slug}.html">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="article:published_time" content="${post.date}">
  <meta property="article:author" content="AI Security &amp; Compliance Desk">
${(post.tags || []).map((t) => `  <meta property="article:tag" content="${escapeAttr(t)}">`).join('\n')}

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeAttr(post.title)}">
  <meta name="twitter:description" content="${escapeAttr(post.metaDescription)}">

  <!-- JSON-LD -->
  <script type="application/ld+json">
  ${JSON.stringify(jsonLd, null, 2)}
  </script>

  <link rel="canonical" href="${SITE_URL}/posts/${post.slug}.html">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Merriweather:wght@400;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', 'system-ui', 'sans-serif'],
            serif: ['Merriweather', 'Georgia', 'serif'],
          },
          colors: {
            brand: { 50:'#eff6ff',100:'#dbeafe',200:'#bfdbfe',500:'#3b82f6',600:'#2563eb',700:'#1d4ed8',800:'#1e40af',900:'#1e3a5f' }
          }
        }
      }
    }
  </script>
  <link rel="stylesheet" href="../css/custom.css">
</head>
<body class="bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 transition-colors duration-300">

  <!-- Header -->
  <header class="sticky top-0 z-50 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16">
        <a href="../index.html" class="flex items-center gap-3 group">
          <div class="w-9 h-9 bg-brand-600 rounded-lg flex items-center justify-center text-white font-bold text-sm group-hover:bg-brand-700 transition-colors">AI</div>
          <span class="text-lg font-bold tracking-tight">AI Security &amp; Compliance <span class="text-brand-600">News</span></span>
        </a>
        <nav class="flex items-center gap-6">
          <a href="../index.html" class="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">Blog</a>
          <a href="../about.html" class="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">About</a>
          <button id="theme-toggle" class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" aria-label="Toggle dark mode">
            <svg id="sun-icon" class="w-5 h-5 hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
            <svg id="moon-icon" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>
          </button>
        </nav>
      </div>
    </div>
  </header>

  <!-- Article -->
  <main class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
    <a href="../index.html" class="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors mb-8">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
      Back to all posts
    </a>

    <article>
      <header class="mb-8">
        <div class="flex items-center gap-3 mb-4">
          <span class="inline-block px-2.5 py-0.5 text-xs font-semibold rounded-full ${catClass}">${escapeHtml(primaryCategory)}</span>
          <span class="text-sm text-gray-400">${readTime} min read</span>
        </div>
        <h1 class="text-3xl sm:text-4xl font-bold tracking-tight leading-tight mb-4">${escapeHtml(post.title)}</h1>
        <div class="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
          <span>By <strong class="text-gray-700 dark:text-gray-300">AI Security &amp; Compliance Desk</strong></span>
          <time datetime="${post.date}">${formatDate(post.date)}</time>
        </div>
        ${post.sourceUrl ? `<p class="mt-3 text-xs text-gray-400">Source: <a href="${escapeAttr(post.sourceUrl)}" target="_blank" rel="noopener" class="hover:underline">${escapeHtml(post.sourceName || 'Original Article')}</a></p>` : ''}
      </header>

      <div class="post-content font-serif text-lg text-gray-800 dark:text-gray-200">
        ${post.content}
        ${ctaHtml}
      </div>

      <!-- Tags -->
      <div class="mt-10 pt-6 border-t border-gray-200 dark:border-gray-800">
        <div class="flex flex-wrap gap-2">
            ${tagsHtml}
        </div>
      </div>

      <!-- Share -->
      <div class="mt-6 pt-6 border-t border-gray-200 dark:border-gray-800">
        <p class="text-sm font-semibold mb-3">Share this article</p>
        <div class="flex gap-3">
          <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(SITE_URL + '/posts/' + post.slug + '.html')}" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            Post
          </a>
          <button id="linkedin-share" class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            <span class="li-label">Share on LinkedIn</span>
          </button>
          <button onclick="navigator.clipboard.writeText(window.location.href).then(()=>this.textContent='Copied!')" class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            Copy link
          </button>
        </div>
      </div>
    </article>
  </main>

  <!-- Footer -->
  <footer class="border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div class="grid gap-8 sm:grid-cols-3">
        <div>
          <div class="flex items-center gap-2 mb-3">
            <div class="w-7 h-7 bg-brand-600 rounded-md flex items-center justify-center text-white font-bold text-xs">AI</div>
            <span class="font-bold text-sm">AI Security &amp; Compliance News</span>
          </div>
          <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">AI-powered news and analysis on cybersecurity, compliance, and IT operations.</p>
        </div>
        <div>
          <h4 class="font-semibold text-sm mb-3">Navigation</h4>
          <ul class="space-y-2 text-sm text-gray-500 dark:text-gray-400">
            <li><a href="../index.html" class="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">Blog</a></li>
            <li><a href="../about.html" class="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">About</a></li>
            <li><a href="https://ido-green.appspot.com/contact.html" target="_blank" rel="noopener" class="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">Contact Ido</a></li>
            <li><a href="https://greenido.wordpress.com" target="_blank" rel="noopener" class="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">Ido's Blog</a></li>
            <li><a href="https://espressolabs.com" target="_blank" rel="noopener" class="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">EspressoLabs.com</a></li>
          </ul>
        </div>
        <div>
          <h4 class="font-semibold text-sm mb-3">Powered By</h4>
          <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">Content generated by Google AI with people - so it's the best of both worlds. IT &amp; Security solutions by <a href="https://espressolabs.com/" target="_blank" rel="noopener" class="text-brand-600 dark:text-brand-400 hover:underline">Espresso Labs</a>.</p>
        </div>
      </div>
      <div class="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800 text-center text-xs text-gray-400">
        &copy; <span id="year"></span> AI Security and Compliance News. Posts are AI-generated and may not reflect the latest information.
      </div>
    </div>
  </footer>

  <script src="../js/app.js"></script>
  <script>
  (function() {
    var btn = document.getElementById('linkedin-share');
    if (!btn) return;
    var shareText = ${JSON.stringify(post.title + '\n\n' + (post.metaDescription || '') + '\n\nRead more: ' + SITE_URL + '/posts/' + post.slug + '.html')};
    var shareUrl = ${JSON.stringify(SITE_URL + '/posts/' + post.slug + '.html')};
    btn.addEventListener('click', function() {
      navigator.clipboard.writeText(shareText).then(function() {
        var label = btn.querySelector('.li-label');
        if (label) { label.textContent = 'Copied! Paste in LinkedIn'; }
        setTimeout(function() { if (label) label.textContent = 'Share on LinkedIn'; }, 3000);
      });
      window.open('https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(shareUrl), '_blank');
    });
  })();
  </script>
</body>
</html>`;

  log.success('buildPostHtmlPage', `HTML page built — ${html.length} chars`);
  return html;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function updateIndex(post) {
  log.info('updateIndex', `Updating posts index for slug="${post.slug}"`);

  let index = [];
  if (existsSync(INDEX_PATH)) {
    try {
      index = JSON.parse(readFileSync(INDEX_PATH, 'utf-8'));
      log.info('updateIndex', `Loaded existing index with ${index.length} posts`);
    } catch (err) {
      log.warn('updateIndex', `Failed to read existing index: ${err.message} — starting fresh`);
      index = [];
    }
  } else {
    log.info('updateIndex', 'No existing index.json found — creating new one');
  }

  const entry = {
    title: post.title,
    slug: post.slug,
    date: post.date,
    excerpt: post.excerpt || post.metaDescription,
    tags: post.tags,
    categories: post.categories,
    hasCTA: post.hasCTA || false,
    wordCount: post.wordCount || 650,
  };

  const prevCount = index.length;
  index = index.filter((p) => p.slug !== post.slug);
  if (index.length < prevCount) {
    log.info('updateIndex', `Removed existing entry for slug="${post.slug}" (was duplicate)`);
  }
  index.unshift(entry);

  writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
  log.success('updateIndex', `Saved index.json — ${index.length} posts total`);
}

function updateSitemap(post) {
  log.info('updateSitemap', `Updating sitemap for slug="${post.slug}"`);

  let xml = '';
  if (existsSync(SITEMAP_PATH)) {
    xml = readFileSync(SITEMAP_PATH, 'utf-8');
    log.info('updateSitemap', `Loaded existing sitemap (${xml.length} chars)`);
  } else {
    log.info('updateSitemap', 'No existing sitemap.xml — will create new one');
  }

  const postUrl = `${SITE_URL}/posts/${post.slug}.html`;
  if (xml.includes(postUrl)) {
    log.info('updateSitemap', `URL already in sitemap — skipping: ${postUrl}`);
    return;
  }

  const newEntry = `  <url>\n    <loc>${postUrl}</loc>\n    <lastmod>${post.date}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`;

  if (xml.includes('</urlset>')) {
    xml = xml.replace('</urlset>', newEntry + '\n</urlset>');
    log.info('updateSitemap', 'Appended new URL entry to existing sitemap');
  } else {
    xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${newEntry}\n</urlset>`;
    log.info('updateSitemap', 'Created new sitemap from scratch');
  }

  writeFileSync(SITEMAP_PATH, xml);
  log.success('updateSitemap', `Saved sitemap.xml — added ${postUrl}`);
}

export { escapeHtml, escapeAttr, formatDate, estimateReadTime, buildPostHtmlPage, buildCtaBanner };

export async function buildPost(post) {
  const timer = log.time('buildPost');

  log.dump('buildPost', 'Post to build', {
    title: post.title,
    slug: post.slug,
    date: post.date,
    categories: (post.categories || []).join(', '),
    hasCTA: post.hasCTA,
    contentLength: `${post.content?.length || 0} chars`,
  });

  if (!existsSync(POSTS_DIR)) {
    log.info('buildPost', `Creating posts directory: ${POSTS_DIR}`);
    mkdirSync(POSTS_DIR, { recursive: true });
  }

  const html = buildPostHtmlPage(post);
  const filePath = join(POSTS_DIR, `${post.slug}.html`);
  writeFileSync(filePath, html);
  log.success('buildPost', `Wrote post HTML: ${filePath} (${html.length} chars)`);

  updateIndex(post);
  updateSitemap(post);

  timer.end(`build complete for "${post.slug}"`);
  return filePath;
}
